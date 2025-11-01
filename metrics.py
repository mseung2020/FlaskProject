# metrics.py — four psychology axes (no legacy names)
from __future__ import annotations
import time
from typing import List, Optional

import numpy as np
import pandas as pd
import requests

# optional yahoo
try:
    import yfinance as yf
except Exception:
    yf = None

# ------------------------ config ------------------------
LOOKBACK_DAYS_DEFAULT = 400   # fetch length for OHLC
ROLL_WIN_DAYS         = 30    # 30d window
RANK_WIN              = 252   # 1y percentile window
MINP                  = 5     # min points for percentile

# ------------------------ utils -------------------------
def _sym_krx(code: str) -> str:
    """KRX code -> Yahoo symbol guess (.KS then .KQ)."""
    c = str(code).zfill(6)
    return f"{c}.KS"

def _download_yahoo(symbol: str, days: int = LOOKBACK_DAYS_DEFAULT) -> pd.DataFrame:
    if yf is None:
        return pd.DataFrame()
    try:
        df = yf.download(symbol, period=f"{max(30, days)}d", interval="1d",
                         auto_adjust=False, progress=False)
        if not isinstance(df, pd.DataFrame) or df.empty:
            return pd.DataFrame()
        if isinstance(df.columns, pd.MultiIndex):
            # normalize multiindex to single columns
            df = pd.DataFrame({
                "open":      df["Open"].iloc[:, 0],
                "high":      df["High"].iloc[:, 0],
                "low":       df["Low"].iloc[:, 0],
                "close":     df["Close"].iloc[:, 0],
                "adj_close": df["Adj Close"].iloc[:, 0],
                "volume":    df["Volume"].iloc[:, 0],
            }, index=df.index)
        else:
            df = df.rename(columns={
                "Open": "open", "High": "high", "Low": "low", "Close": "close",
                "Adj Close": "adj_close", "Volume": "volume"
            })
        if "adj_close" not in df:
            df["adj_close"] = df["close"]
        out = df.reset_index().rename(columns={"Date": "date"})
        out["date"] = pd.to_datetime(out["date"]).dt.strftime("%Y.%m.%d")
        return out[["date", "open", "high", "low", "close", "adj_close", "volume"]]
    except Exception:
        return pd.DataFrame()

def _fetch_ohlcv(code: str, lookback_days: int = LOOKBACK_DAYS_DEFAULT) -> pd.DataFrame:
    """Try Yahoo .KS then .KQ."""
    sym = _sym_krx(code)
    df = _download_yahoo(sym, lookback_days)
    if df.empty:
        df = _download_yahoo(sym.replace(".KS", ".KQ"), lookback_days)
    return df

def _rolling_percentile(values: pd.Series, win: int = RANK_WIN, minp: int = MINP) -> pd.Series:
    arr = pd.to_numeric(values, errors="coerce").to_numpy(dtype=float)
    n = len(arr)
    out = np.full(n, np.nan)
    for i in range(n):
        lo = max(0, i - win + 1)
        w = arr[lo:i+1]
        v = w[-1]
        w = w[~np.isnan(w)]
        if w.size < minp or np.isnan(v):
            continue
        ww = np.sort(w)
        idx = np.searchsorted(ww, v, side="right")
        out[i] = idx / ww.size * 100.0
    return pd.Series(out, index=values.index)

def _ema(s: pd.Series, span=3) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").ewm(span=span, adjust=False, min_periods=1).mean()

def _payload(dates: pd.Series, series: pd.Series, tail_n: int) -> list[dict]:
    x = pd.DataFrame({"date": dates, "value": series}).tail(tail_n).copy()
    x["value"] = x["value"].round(1)
    return [{"date": str(d), "value": (None if pd.isna(v) else float(v))}
            for d, v in x[["date", "value"]].itertuples(index=False)]

def _logret(close: pd.Series) -> pd.Series:
    c = pd.to_numeric(close, errors="coerce")
    return np.log(c).diff()

# ------------------------ axis A: momentum ----------------
def _ratio_momentum(df: pd.DataFrame, ma_win: int = 125) -> pd.Series:
    px = pd.to_numeric(df["adj_close"] if "adj_close" in df else df["close"], errors="coerce")
    ma = px.rolling(ma_win, min_periods=max(5, ma_win//5)).mean()
    mom = (px / ma) - 1.0
    return _ema(mom, span=3)

def series_momentum(code: str, days: int = 30, lookback: int = RANK_WIN, minp: int = MINP):
    df = _fetch_ohlcv(code, LOOKBACK_DAYS_DEFAULT)
    if df.empty: return []
    s = _ratio_momentum(df, 125)
    rank = _rolling_percentile(s, win=lookback, minp=minp)   # 0~100 (higher = greed)
    return _payload(df["date"], rank, days)

# ------------------------ axis B: breadth -----------------
def _ratio_up_vs_down_volume(df: pd.DataFrame, win: int = ROLL_WIN_DAYS) -> pd.Series:
    close = pd.to_numeric(df["close"], errors="coerce")
    vol   = pd.to_numeric(df["volume"], errors="coerce").fillna(0.0)
    up    = (close.diff() >= 0).astype(int)
    down  = (close.diff() <  0).astype(int)
    upv   = (vol * up  ).rolling(win, min_periods=1).sum()
    dnv   = (vol * down).rolling(win, min_periods=1).sum()
    ratio = (upv + 1.0) / (dnv + 1.0)   # higher = more buying pressure
    ratio = ratio.replace([np.inf, -np.inf], np.nan)
    return _ema(ratio, span=3)

def series_breadth(code: str, days: int = 30, lookback: int = RANK_WIN, minp: int = MINP):
    df = _fetch_ohlcv(code, LOOKBACK_DAYS_DEFAULT)
    if df.empty: return []
    s = _ratio_up_vs_down_volume(df, 30)
    rank = _rolling_percentile(s, win=lookback, minp=minp)   # 0~100 (higher = greed)
    return _payload(df["date"], rank, days)

# ------------------------ axis C: low-vol -----------------
def _rv30_annualized(df: pd.DataFrame) -> pd.Series:
    r  = _logret(df["close"])
    rv = r.rolling(ROLL_WIN_DAYS, min_periods=2).std(ddof=0) * np.sqrt(252.0) * 100.0
    return _ema(rv, span=3)

def series_lowvol(code: str, days: int = 30, lookback: int = RANK_WIN, minp: int = MINP):
    df = _fetch_ohlcv(code, LOOKBACK_DAYS_DEFAULT)
    if df.empty: return []
    rv  = _rv30_annualized(df)
    pct = _rolling_percentile(rv, win=lookback, minp=minp)
    lvg = 100.0 - pct                                  # lower vol => higher greed
    return _payload(df["date"], lvg, days)

# ------------------------ axis D: eq-bond -----------------
_NAVER_UA = {"User-Agent": "Mozilla/5.0"}

def _naver_hist_close(code6: str, pages: int = 40, pause: float = 0.12) -> pd.DataFrame:
    out = []
    for p in range(1, pages + 1):
        url  = f"https://finance.naver.com/item/sise_day.naver?code={code6}&page={p}"
        html = requests.get(url, headers=_NAVER_UA, timeout=8).text
        dfs  = pd.read_html(html, header=0)
        if not dfs: break
        df = dfs[0].dropna(subset=["날짜"])
        df["종가"] = df["종가"].astype(str).str.replace(",", "").astype(float)
        df["날짜"] = pd.to_datetime(df["날짜"])
        out.append(df[["날짜", "종가"]])
        time.sleep(pause)
    if not out:
        return pd.DataFrame()
    d = pd.concat(out, ignore_index=True).sort_values("날짜")
    return pd.DataFrame({"date": d["날짜"].dt.strftime("%Y.%m.%d"), "close": d["종가"].astype(float)})

def _etf_close_series(candidates_krx: List[str]) -> Optional[pd.DataFrame]:
    # 1) try Yahoo
    for raw in candidates_krx:
        if yf is None: break
        df = _download_yahoo(f"{raw}.KS", LOOKBACK_DAYS_DEFAULT)
        if not df.empty:
            return df[["date", "close"]].copy()
    # 2) fallback to Naver
    for raw in candidates_krx:
        d = _naver_hist_close(raw, pages=40)
        if not d.empty:
            return d
    return None

# you can replace these codes if you prefer different pair
EQ_CODES   = ["069500"]          # KODEX200
BOND_CODES = ["305080", "148070"]  # KODEX 국고채선물10년, KOSEF 국고채10년

def series_eqbond(code: str, days: int = 30, lookback: int = RANK_WIN, minp: int = MINP):
    eq = _etf_close_series(EQ_CODES)
    bd = _etf_close_series(BOND_CODES)
    if eq is None or bd is None or eq.empty or bd.empty:
        return []
    df = eq.merge(bd, on="date", how="inner", suffixes=("_eq", "_bd")).sort_values("date")
    # 20d log-return
    r_eq = np.log(pd.to_numeric(df["close_eq"], errors="coerce")).diff(20)
    r_bd = np.log(pd.to_numeric(df["close_bd"], errors="coerce")).diff(20)
    spread = r_eq - r_bd
    rank = _rolling_percentile(spread, win=lookback, minp=minp)  # 0~100 (higher = risk-on)
    return _payload(df["date"], rank, days)

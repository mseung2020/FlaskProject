# candle.py
# KOSPI50 크롤러 + 멀티캔들 패턴 20종 탐지 (상승/하락 반전·지속)

from dataclasses import dataclass
from typing import List, Dict
import pandas as pd
import numpy as np
import re
import requests

# ===================== 튜닝 상수 =====================
EPS = 1e-9
BODY_LARGE = 0.60     # 장대 캔들: 몸통 / (고저폭)
BODY_SMALL = 0.30     # 작은 몸통
UPPER_WICK_MAX = 0.25 # 병정/까마귀에서 윗꼬리 허용폭
GAP_EPS = 0.0015      # 갭 판단 허용 오차(0.15%)
OPEN_EQ_K = 0.20      # Separating Lines: 동일시가 허용(ATR*k)
COUNTER_K = 0.20      # Counter-attack: 종가 근접 허용(ATR*k)
NECK_K = 0.15         # In-Neck: 저가 근접 허용(몸통*k)
ATR_WIN = 14          # ATR 기간
MA_WIN = 20           # 추세 판단용 MA

# ===================== 유틸/지표 =====================
def _atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, win: int = ATR_WIN) -> np.ndarray:
    prev_close = np.concatenate(([close[0]], close[:-1]))
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev_close), np.abs(low - prev_close)))
    # 단순이동평균(EMA로 바꿔도 무방)
    atr = pd.Series(tr).rolling(win, min_periods=1).mean().to_numpy()
    return atr

def _ma(arr: np.ndarray, win: int = MA_WIN) -> np.ndarray:
    return pd.Series(arr).rolling(win, min_periods=1).mean().to_numpy()

def _body(o, c): return abs(c - o)
def _range(h, l): return (h - l) + EPS
def _body_pct(o, h, l, c): return _body(o, c) / _range(h, l)

def _is_bull(o, c): return c > o
def _is_bear(o, c): return c < o

def _gap_up(o2, h1):    return o2 > h1 * (1 + GAP_EPS)
def _gap_down(o2, l1):  return o2 < l1 * (1 - GAP_EPS)

def _near(a, b, tol):   return abs(a - b) <= tol

# 추세 판단: MA20 위/아래 + MA 기울기
def _trend_up(i, close_ma, close):   return (close[i] > close_ma[i]) and (close_ma[i] > (close_ma[i-1] if i>0 else close_ma[i]))
def _trend_down(i, close_ma, close): return (close[i] < close_ma[i]) and (close_ma[i] < (close_ma[i-1] if i>0 else close_ma[i]))

# ===================== KOSPI 시총 TOP =====================
def get_kospi_marketcap_top(n: int = 50) -> pd.DataFrame:
    """
    네이버 금융 KOSPI 시가총액 순위 페이지에서 상위 n개 추출.
    파서 의존성 없이 정규식으로 종목코드/종목명만 수집.
    반환: ['회사명','종목코드'] DataFrame
    """
    rows = []
    page = 1
    headers = {'User-Agent': 'Mozilla/5.0'}
    while len(rows) < n and page <= 5:
        url = f"https://finance.naver.com/sise/sise_market_sum.naver?sosok=0&page={page}"
        html = requests.get(url, headers=headers, timeout=6).text
        for code, name in re.findall(
            r'href="/item/main\.naver\?code=(\d{6})"[^>]*class="tltle"[^>]*>([^<]+)</a>',
            html
        ):
            rows.append({"회사명": name.strip(), "종목코드": code})
            if len(rows) >= n:
                break
        page += 1
    if not rows:
        return pd.DataFrame(columns=["회사명", "종목코드"])
    return pd.DataFrame(rows)

# ===================== 결과 구조 =====================
@dataclass
class Match:
    start_idx: int
    end_idx: int
    start_date: str
    end_date: str
    direction: str     # "up" | "down"
    clazz: str         # "reversal" | "trend"
    name: str
    explain: str

# ===================== 패턴 체크 함수들 =====================
def _long_bull(o,h,l,c): return _is_bull(o,c) and (_body_pct(o,h,l,c) >= BODY_LARGE)
def _long_bear(o,h,l,c): return _is_bear(o,c) and (_body_pct(o,h,l,c) >= BODY_LARGE)
def _small_body(o,h,l,c): return _body_pct(o,h,l,c) <= BODY_SMALL

def _morning_star(i, o,h,l,c, close_ma, close):
    # i: 3번째 캔들 인덱스
    if i < 2: return False
    if not _trend_down(i-1, close_ma, close): return False
    o1,h1,l1,c1 = o[i-2],h[i-2],l[i-2],c[i-2]
    o2,h2,l2,c2 = o[i-1],h[i-1],l[i-1],c[i-1]
    o3,h3,l3,c3 = o[i],h[i],l[i],c[i]
    if not _long_bear(o1,h1,l1,c1): return False
    if not _small_body(o2,h2,l2,c2): return False
    # 이상적: 갭다운
    if not (_gap_down(o2, l1) or True): pass
    mid = (o1 + c1) / 2
    return _is_bull(o3,c3) and (c3 >= mid)

def _evening_star(i, o,h,l,c, close_ma, close):
    if i < 2: return False
    if not _trend_up(i-1, close_ma, close): return False
    o1,h1,l1,c1 = o[i-2],h[i-2],l[i-2],c[i-2]
    o2,h2,l2,c2 = o[i-1],h[i-1],l[i-1],c[i-1]
    o3,h3,l3,c3 = o[i],h[i],l[i],c[i]
    if not _long_bull(o1,h1,l1,c1): return False
    if not _small_body(o2,h2,l2,c2): return False
    if not (_gap_up(o2, h1) or True): pass
    mid = (o1 + c1) / 2
    return _is_bear(o3,c3) and (c3 <= mid)

def _bull_engulf(i, o,h,l,c, close_ma, close):
    if i < 1: return False
    if not _trend_down(i-1, close_ma, close): return False
    # 2번째가 양봉이며 몸통이 1번째 몸통을 감쌈
    o1,c1 = o[i-1], c[i-1]
    o2,c2 = o[i],   c[i]
    return _is_bull(o2,c2) and _is_bear(o1,c1) and (o2 <= c1) and (c2 >= o1)

def _bear_engulf(i, o,h,l,c, close_ma, close):
    if i < 1: return False
    if not _trend_up(i-1, close_ma, close): return False
    o1,c1 = o[i-1], c[i-1]
    o2,c2 = o[i],   c[i]
    return _is_bear(o2,c2) and _is_bull(o1,c1) and (o2 >= c1) and (c2 <= o1)

def _bull_harami(i, o,h,l,c, close_ma, close):
    if i < 1: return False
    if not _trend_down(i-1, close_ma, close): return False
    o1,c1 = o[i-1], c[i-1]
    o2,c2 = o[i],   c[i]
    return _is_bear(o1,c1) and _is_bull(o2,c2) and (o2 >= c1) and (c2 <= o1)

def _bear_harami(i, o,h,l,c, close_ma, close):
    if i < 1: return False
    if not _trend_up(i-1, close_ma, close): return False
    o1,c1 = o[i-1], c[i-1]
    o2,c2 = o[i],   c[i]
    return _is_bull(o1,c1) and _is_bear(o2,c2) and (o2 <= c1) and (c2 >= o1)

def _piercing(i, o,h,l,c, close_ma, close):
    if i < 1: return False
    if not _trend_down(i-1, close_ma, close): return False
    o1,h1,l1,c1 = o[i-1],h[i-1],l[i-1],c[i-1]
    o2,h2,l2,c2 = o[i],h[i],l[i],c[i]
    if not _long_bear(o1,h1,l1,c1): return False
    if not _gap_down(o2, l1): return False
    mid = (o1 + c1) / 2
    return _is_bull(o2,c2) and (c2 >= mid) and (c2 < o1)

def _dark_cloud(i, o,h,l,c, close_ma, close):
    if i < 1: return False
    if not _trend_up(i-1, close_ma, close): return False
    o1,h1,l1,c1 = o[i-1],h[i-1],l[i-1],c[i-1]
    o2,h2,l2,c2 = o[i],h[i],l[i],c[i]
    if not _long_bull(o1,h1,l1,c1): return False
    if not _gap_up(o2, h1): return False
    mid = (o1 + c1) / 2
    return _is_bear(o2,c2) and (c2 <= mid) and (c2 > o1)

def _bull_counter(i, o,h,l,c, atr, close_ma, close):
    if i < 1: return False
    if not _trend_down(i-1, close_ma, close): return False
    o1,c1 = o[i-1], c[i-1]
    o2,c2 = o[i],   c[i]
    # 갭다운 후 전일 종가 부근에서 양봉 마감
    if not _gap_down(o2, l[i-1]): return False
    return _is_bull(o2,c2) and _near(c2, c1, COUNTER_K * atr[i])

def _bear_counter(i, o,h,l,c, atr, close_ma, close):
    if i < 1: return False
    if not _trend_up(i-1, close_ma, close): return False
    o1,c1 = o[i-1], c[i-1]
    o2,c2 = o[i],   c[i]
    if not _gap_up(o2, h[i-1]): return False
    return _is_bear(o2,c2) and _near(c2, c1, COUNTER_K * atr[i])

def _rising_three_methods(i, o,h,l,c, close_ma, close):
    if i < 4: return False
    if not _trend_up(i-1, close_ma, close): return False
    o1,h1,l1,c1 = o[i-4],h[i-4],l[i-4],c[i-4]
    if not _long_bull(o1,h1,l1,c1): return False
    # 2~4 캔들이 모두 1번 캔들 범위 안
    for k in (i-3, i-2, i-1):
        if not (l[k] >= l1 and h[k] <= h1): return False
        if _body_pct(o[k],h[k],l[k],c[k]) > BODY_SMALL: return False
    # 5번째 양봉이 H1 돌파
    return _is_bull(o[i],c[i]) and (c[i] > h1)

def _falling_three_methods(i, o,h,l,c, close_ma, close):
    if i < 4: return False
    if not _trend_down(i-1, close_ma, close): return False
    o1,h1,l1,c1 = o[i-4],h[i-4],l[i-4],c[i-4]
    if not _long_bear(o1,h1,l1,c1): return False
    for k in (i-3, i-2, i-1):
        if not (l[k] >= l1 and h[k] <= h1): return False
        if _body_pct(o[k],h[k],l[k],c[k]) > BODY_SMALL: return False
    return _is_bear(o[i],c[i]) and (c[i] < l1)

def _upside_tasuki_gap(i, o,h,l,c, close_ma, close):
    if i < 2: return False
    if not _trend_up(i-1, close_ma, close): return False
    # 1,2 연속 양봉 + 갭업
    if not (_is_bull(o[i-2],c[i-2]) and _is_bull(o[i-1],c[i-1]) and _gap_up(o[i-1], h[i-2])): return False
    # 3번째는 음봉, 2번 몸통 내부에서 시작, 갭을 전부 메우지 않음
    o3,c3 = o[i], c[i]
    return _is_bear(o[i],c[i]) and (min(o[i-1],c[i-1]) <= o3 <= max(o[i-1],c[i-1])) and (c3 > h[i-2])

def _downside_tasuki_gap(i, o,h,l,c, close_ma, close):
    if i < 2: return False
    if not _trend_down(i-1, close_ma, close): return False
    if not (_is_bear(o[i-2],c[i-2]) and _is_bear(o[i-1],c[i-1]) and _gap_down(o[i-1], l[i-2])): return False
    o3,c3 = o[i], c[i]
    return _is_bull(o[i],c[i]) and (min(o[i-1],c[i-1]) <= o3 <= max(o[i-1],c[i-1])) and (c3 < l[i-2])

def _bull_separating_lines(i, o,h,l,c, atr, close_ma, close):
    if i < 1: return False
    if not _trend_up(i-1, close_ma, close): return False
    # 1 음봉, 2 양봉, 동일시가
    return _is_bear(o[i-1],c[i-1]) and _is_bull(o[i],c[i]) and _near(o[i], o[i-1], OPEN_EQ_K * atr[i])

def _bear_separating_lines(i, o,h,l,c, atr, close_ma, close):
    if i < 1: return False
    if not _trend_down(i-1, close_ma, close): return False
    return _is_bull(o[i-1],c[i-1]) and _is_bear(o[i],c[i]) and _near(o[i], o[i-1], OPEN_EQ_K * atr[i])

def _bull_three_line_strike(i, o,h,l,c, close_ma, close):
    if i < 3: return False
    if not _trend_up(i-1, close_ma, close): return False
    # 1~3 연속 양봉 & 고저/종가 상승
    if not (_is_bull(o[i-3],c[i-3]) and _is_bull(o[i-2],c[i-2]) and _is_bull(o[i-1],c[i-1])): return False
    if not (c[i-3] < c[i-2] < c[i-1]): return False
    # 4번째 장대 음봉이 1~3을 감쌈
    return _long_bear(o[i],h[i],l[i],c[i]) and (c[i] < o[i-3])

def _three_white_soldiers(i, o,h,l,c):
    if i < 2: return False
    ok = True
    for k in (i-2, i-1, i):
        if not _is_bull(o[k], c[k]): ok = False
    if not ok: return False
    if not (c[i-2] < c[i-1] < c[i]): return False
    # 각 봉의 시가가 이전 몸통 안에서 시작 & 윗꼬리 제한
    for k in (i-1, i):
        prev_lo = min(o[k-1], c[k-1]); prev_hi = max(o[k-1], c[k-1])
        if not (prev_lo <= o[k] <= prev_hi): return False
    # 윗꼬리 제한
    for k in (i-2, i-1, i):
        top_wick = h[k] - max(o[k], c[k])
        if top_wick / _range(h[k], l[k]) > UPPER_WICK_MAX: return False
    return True

def _three_black_crows(i, o,h,l,c):
    if i < 2: return False
    ok = True
    for k in (i-2, i-1, i):
        if not _is_bear(o[k], c[k]): ok = False
    if not ok: return False
    if not (c[i-2] > c[i-1] > c[i]): return False
    for k in (i-1, i):
        prev_lo = min(o[k-1], c[k-1]); prev_hi = max(o[k-1], c[k-1])
        if not (prev_lo <= o[k] <= prev_hi): return False
    return True

def _in_neck(i, o,h,l,c, close_ma, close):
    if i < 1: return False
    if not _trend_down(i-1, close_ma, close): return False
    # 1: 장대 음봉 + 갭다운, 2: 작은 양봉, 종가는 1의 저가 부근
    if not _long_bear(o[i-1],h[i-1],l[i-1],c[i-1]): return False
    if not _gap_down(o[i], l[i-1]): return False
    body1 = _body(o[i-1], c[i-1])
    return _is_bull(o[i],c[i]) and _near(c[i], l[i-1], NECK_K * body1)

def _thrusting(i, o,h,l,c, close_ma, close):
    if i < 1: return False
    if not _trend_down(i-1, close_ma, close): return False
    if not _long_bear(o[i-1],h[i-1],l[i-1],c[i-1]): return False
    if not _gap_down(o[i], l[i-1]): return False
    mid = (o[i-1] + c[i-1]) / 2
    # 종가는 1의 몸통 내부지만 중간선 미달, 그리고 전일 종가보다는 위
    return _is_bull(o[i],c[i]) and (c[i] > c[i-1]) and (c[i] < mid)

# ===================== 메인 탐지 =====================
def find_patterns(df: pd.DataFrame, enabled: List[str]) -> List[Dict]:
    """
    df columns: date(YYYY.MM.DD), open, high, low, close, volume
    enabled: ["bullish_reversal","bullish_trend","bearish_reversal","bearish_trend"]
    """
    matches: List[Match] = []
    N = len(df)
    if N < 5:
        return []

    df = df.reset_index(drop=True)
    o = df["open"].to_numpy(dtype=float)
    h = df["high"].to_numpy(dtype=float)
    l = df["low"].to_numpy(dtype=float)
    c = df["close"].to_numpy(dtype=float)

    atr = _atr(h,l,c, ATR_WIN)
    ma = _ma(c, MA_WIN)

    def add(start, end, direction, clazz, name, explain):
        matches.append(Match(
            start_idx=start, end_idx=end,
            start_date=df.loc[start,"date"], end_date=df.loc[end,"date"],
            direction=direction, clazz=clazz, name=name, explain=explain
        ))

    for i in range(N):
        # ===== 상승 반전 =====
        if "bullish_reversal" in enabled:
            if _morning_star(i,o,h,l,c, ma, c):
                add(i-2, i, "up", "reversal", "Morning Star", "하락 추세에서의 3캔들 반전")
            if _bull_engulf(i,o,h,l,c, ma, c):
                add(i-1, i, "up", "reversal", "Bullish Engulfing", "전일 몸통을 완전히 감싸는 양봉")
            if _bull_harami(i,o,h,l,c, ma, c):
                add(i-1, i, "up", "reversal", "Bullish Harami", "작은 양봉이 이전 음봉 몸통 안쪽")
            if _piercing(i,o,h,l,c, ma, c):
                add(i-1, i, "up", "reversal", "Piercing Line", "갭다운 후 전일 몸통 중간선 이상으로 반등")
            if _bull_counter(i,o,h,l,c, atr, ma, c):
                add(i-1, i, "up", "reversal", "Bullish Counter-attack", "갭다운 후 전일 종가 부근에서 반등 마감")

        # ===== 상승 지속 =====
        if "bullish_trend" in enabled:
            if _rising_three_methods(i,o,h,l,c, ma, c):
                add(i-4, i, "up", "trend", "Rising Three Methods", "장대양봉 후 조정 삼캔들, 돌파로 지속")
            if _upside_tasuki_gap(i,o,h,l,c, ma, c):
                add(i-2, i, "up", "trend", "Upside Tasuki Gap", "연속 양봉 갭업 후 부분 메우기")
            if _bull_separating_lines(i,o,h,l,c, atr, ma, c):
                add(i-1, i, "up", "trend", "Bullish Separating Lines", "동일시가 양봉으로 추세 분리")
            if _bull_three_line_strike(i,o,h,l,c, ma, c):
                add(i-3, i, "up", "trend", "Bullish Three-Line Strike", "3양봉 뒤 장대음봉 지속")
            if _three_white_soldiers(i,o,h,l,c):
                add(i-2, i, "up", "trend", "Three White Soldiers", "상승 병정 3개로 추세 강화")

        # ===== 하락 반전 =====
        if "bearish_reversal" in enabled:
            if _evening_star(i,o,h,l,c, ma, c):
                add(i-2, i, "down", "reversal", "Evening Star", "상승 추세에서의 3캔들 반전")
            if _bear_engulf(i,o,h,l,c, ma, c):
                add(i-1, i, "down", "reversal", "Bearish Engulfing", "전일 몸통을 감싸는 음봉")
            if _bear_harami(i,o,h,l,c, ma, c):
                add(i-1, i, "down", "reversal", "Bearish Harami", "작은 음봉이 이전 양봉 몸통 안쪽")
            if _dark_cloud(i,o,h,l,c, ma, c):
                add(i-1, i, "down", "reversal", "Dark Cloud Cover", "갭업 후 전일 몸통 중간선 이하로 하락")
            if _bear_counter(i,o,h,l,c, atr, ma, c):
                add(i-1, i, "down", "reversal", "Bearish Counter-attack", "갭업 후 전일 종가 부근에서 하락 마감")

        # ===== 하락 지속 =====
        if "bearish_trend" in enabled:
            if _falling_three_methods(i,o,h,l,c, ma, c):
                add(i-4, i, "down", "trend", "Falling Three Methods", "장대음봉 후 반등 3캔들, 이탈로 지속")
            if _downside_tasuki_gap(i,o,h,l,c, ma, c):
                add(i-2, i, "down", "trend", "Downside Tasuki Gap", "연속 음봉 갭다운 후 부분 메우기")
            if _bear_separating_lines(i,o,h,l,c, atr, ma, c):
                add(i-1, i, "down", "trend", "Bearish Separating Lines", "동일시가 음봉으로 추세 분리")
            if _three_black_crows(i,o,h,l,c):
                add(i-2, i, "down", "trend", "Three Black Crows", "하락 까마귀 3개로 추세 강화")
            if _in_neck(i,o,h,l,c, ma, c):
                add(i-1, i, "down", "trend", "In-Neck", "갭다운 후 저가 부근에서 약한 되돌림")
            if _thrusting(i,o,h,l,c, ma, c):
                add(i-1, i, "down", "trend", "Thrusting Line", "갭다운 후 몸통 하단만 진입하는 반등")

    # 중복(같은 구간의 다중 탐지) 정리: 시작/끝/이름 기준으로 정렬만
    matches.sort(key=lambda m: (m.start_idx, m.end_idx, m.name))
    return [m.__dict__ for m in matches]


def detect_on_base_and_remap(df_base: pd.DataFrame, enabled: List[str], visible_days: int) -> List[Dict]:
    """
    베이스 전체(df_base)에서 패턴을 찾고 → 마지막 visible_days 구간으로만 필터 + 인덱스 재매핑.
    반환: [{ start_idx, end_idx, start_date, end_date, direction, clazz, name, explain }, ...]
    """
    all_matches = find_patterns(df_base, enabled) or []

    N = len(df_base)
    start_idx = max(0, N - int(visible_days))
    vis_dates = [str(d) for d in df_base.loc[start_idx:, "date"].tolist()]
    if not vis_dates:
        return []

    vis_start, vis_end = vis_dates[0], vis_dates[-1]
    date_to_local = {d: i for i, d in enumerate(vis_dates)}  # 가시구간: 0..visible_days-1

    out = []
    for m in all_matches:
        ed = str(m.get("end_date", ""))
        if not (vis_start <= ed <= vis_end):
            continue
        sd = str(m.get("start_date", ""))
        out.append({
            **m,
            "start_idx": date_to_local.get(sd, 0),
            "end_idx":   date_to_local.get(ed, len(vis_dates)-1),
        })
    return out

import logging
from flask import Flask, render_template, request, jsonify, send_file, abort
from flask_caching import Cache
import pandas as pd
import os
import asyncio
import aiohttp
from io import StringIO
import threading
import time
import datetime
import math
from indicators import (
    calculate_ma, calculate_macd, calculate_rsi, calculate_stoch,
    calculate_stochrsi, calculate_williams, calculate_cci, calculate_atr,
    calculate_roc, calculate_uo, calculate_adx, calculate_bollinger,
    calculate_tradingvalue, calculate_envelope, calculate_ichimoku,
    calculate_psar, prepare_df
    )
from finance import get_financial_indicators, make_retry_session
from wordclouds import get_word_frequencies
from hasuindex import get_sentiment_index
from gosuindex import get_gosu_index
from cashflow import get_cashflow_data
from factor import process_factor_data
from candle import find_patterns, get_kospi_marketcap_top
from metrics import get_series_bundle, start_metrics_snapshot_daemon
from theme import get_theme_calendar, get_current_week_top_themes, get_future_forecast, start_theme_snapshot_daemon
import requests
import lxml 

# ------------------ 설정 및 로깅 ------------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
app = Flask(__name__)
cache = Cache(app, config={'CACHE_TYPE': 'simple'})
shared_session = make_retry_session()

# ------------------ 전역 상수 및 경로 ------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FOLDER = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_FOLDER, exist_ok=True)
STOCK_CACHE_FILE = os.path.join(DATA_FOLDER, "stock_list.csv")
STOCK_LIST_URL = 'http://kind.krx.co.kr/corpgeneral/corpList.do?method=download'
BUFFER_DAYS = 120
MIN_DAYS_LIMIT = 1
MAX_DAYS_LIMIT = 365
MAX_PAGES = 37
PRECOMPUTE_DAYS = 370
ROWS_PER_PAGE = 10
INDICATOR_WARMUP_MAX = 120  # MA120 때문에 기본 워밍업
MAX_RAW_DAYS = 370          # 기존 PRECOMPUTE_DAYS와 같은 의미(최대 확보치)
raw_ohlc_cache = {}         # code -> {"pages_fetched": int, "ohlc_map": dict}
raw_ohlc_cache_lock = threading.Lock()

# ------------------ 일일 캐시 리셋(KST 기준) 설정 ------------------
KST = datetime.timezone(datetime.timedelta(hours=9))
DAILY_RESET_HOUR_KST = 4  # 새벽 4시
last_cache_reset_date_kst = None
cache_reset_lock = threading.Lock()


def ensure_daily_cache_reset_kst():
    """
    한국 시간(KST) 기준으로 하루에 한 번, 새벽 4시 이후 처음 호출 시
    OHLC 관련 전역 캐시를 초기화한다.
    - precomputed_stock_data: 종목별 미리 계산된 지표 포함 데이터프레임
    - raw_ohlc_cache: 네이버에서 크롤링한 원시 OHLC 캐시
    """
    global last_cache_reset_date_kst

    # UTC 기준 현재 시각 → KST로 변환
    now_utc = datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc)
    now_kst = now_utc.astimezone(KST)

    # 아직 리셋 시간이 안 됐으면 그대로 사용
    if now_kst.hour < DAILY_RESET_HOUR_KST:
        return

    with cache_reset_lock:
        # 다른 스레드가 먼저 갱신했는지 다시 검사
        if last_cache_reset_date_kst is not None and last_cache_reset_date_kst == now_kst.date():
            return

        # 전역 캐시 비우기
        precomputed_stock_data.clear()
        raw_ohlc_cache.clear()

        last_cache_reset_date_kst = now_kst.date()
        logging.info("일일 캐시 리셋 완료 (KST 기준 날짜: %s)", last_cache_reset_date_kst)

# ------------------ 백그라운드 데몬 시작 ------------------
start_metrics_snapshot_daemon(days=100)
start_theme_snapshot_daemon()  # 테마 갱신 활성화

# ------------------ 종목 리스트 로드 (캐싱 및 다운로드) ------------------
def load_stock_list():
    """
    KRX 종목 리스트를 로컬 캐시에서 읽거나 웹에서 다운로드해
    [{'회사명': ..., '종목코드': ...}, ...] 형태로 반환한다.
    숫자가 아닌 코드(예: '0004Y0')는 자동으로 제거한다.
    """
    try:
        if os.path.exists(STOCK_CACHE_FILE):
            # ── 1) 캐시가 있으면 바로 사용 ─────────────
            df = pd.read_csv(STOCK_CACHE_FILE, dtype={'종목코드': str})
        else:
            # ── 2) 없으면 웹에서 새로 다운로드 ────────
            logging.info("캐시 파일이 없으므로 종목 리스트 다운로드 시작.")
            df = pd.read_html(STOCK_LIST_URL, encoding='euc-kr')[0]

            # (1) 숫자로만 구성된 코드만 남기기
            df = df[df['종목코드'].astype(str).str.isdigit()].copy()

            # (2) 6자리 0‑패딩 문자열로 변환
            df['종목코드'] = (
                df['종목코드']
                  .astype(int)      # int → 오류 방지용
                  .astype(str)
                  .str.zfill(6)
            )

            # (3) 회사명 순 정렬 & 캐시 저장
            df = df.sort_values(by='회사명', ascending=True)
            df.to_csv(STOCK_CACHE_FILE, index=False)
            logging.info("종목 리스트 다운로드 및 저장 완료.")

        # ── 3) 딕셔너리 리스트로 변환 ────────────────
        stock_list = [
            {"회사명": row["회사명"], "종목코드": row["종목코드"]}
            for _, row in df.iterrows()
        ]
        return stock_list

    except Exception as e:
        logging.error("종목 리스트 로드 중 오류: %s", e)
        return []


# 전역 변수로 종목 리스트 로드 (서버 시작 시 미리 로드)
all_stocks = load_stock_list()
stock_name_by_code = {s["종목코드"]: s["회사명"] for s in all_stocks}

# ------------------ 전역 데이터 캐시 (종목별 미리 계산된 전체 데이터) ------------------
precomputed_stock_data = {}

# ------------------ 기본 페이지 라우트 ------------------
@app.route('/')
def main():
    return render_template('main.html')

@app.route('/index')
def index():
    return render_template('index.html')

@app.route('/page2')
def page2():
    return render_template('page2.html')

@app.route('/page3')
def page3():
    return render_template('page3.html')

@app.route('/factor')
def factor():
    return render_template('factor.html')

@app.route('/candle')
def candle_page():
    return render_template('candle.html')

@app.route('/theme')
def theme_page():
    return render_template('theme.html')

# ------------------ 종목 리스트 API ------------------
@cache.cached(timeout=3600, query_string=True)
@app.route('/get_stock_list', methods=['GET'])
def get_stock_list():
    logging.info("종목 리스트 API 호출.")
    return jsonify(all_stocks)

# ------------------ 헬퍼 함수: 네이버 금융 페이지 데이터 가져오기 (비동기) ------------------
async def fetch_page_data_async(session, page, code, retries=3):
    url = f'https://finance.naver.com/item/sise_day.nhn?code={code}&page={page}'
    headers = {'User-Agent': 'Mozilla/5.0'}
    for attempt in range(retries):
        try:
            async with session.get(url, headers=headers, timeout=10) as resp:
                if resp.status == 200:
                    text = await resp.text(encoding='cp949')
                    dfs = pd.read_html(StringIO(text), encoding='cp949')
                    if dfs and not dfs[0].dropna().empty:
                        return dfs[0].dropna()
                else:
                    logging.warning("페이지 %d, 코드 %s: HTTP 상태 코드 %d", page, code, resp.status)
        except Exception as e:
            logging.warning("페이지 %d, 코드 %s: 요청 중 오류 발생: %s", page, code, e)
    return None

async def fetch_ohlc_pages_async(code, pages):
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_page_data_async(session, p, code) for p in pages]
        return await asyncio.gather(*tasks)

def fetch_ohlc_pages(code, pages):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(fetch_ohlc_pages_async(code, pages))
    finally:
        loop.close()

def _merge_results_into_ohlc_map(ohlc_map, results):
    for df_day in results:
        if df_day is None:
            continue
        for _, row in df_day.iterrows():
            date_str = str(row['날짜']).strip()
            try:
                close_val = float(str(row['종가']).replace(',', '').strip())
                open_val  = float(str(row['시가']).replace(',', '').strip())
                high_val  = float(str(row['고가']).replace(',', '').strip())
                low_val   = float(str(row['저가']).replace(',', '').strip())
                volume_val= float(str(row['거래량']).replace(',', '').strip())
            except Exception:
                continue

            # 날짜 중복은 무시(이미 들어있으면 유지)
            if date_str not in ohlc_map:
                ohlc_map[date_str] = {
                    "open": open_val, "close": close_val,
                    "high": high_val, "low": low_val,
                    "volume": volume_val
                }

def ensure_latest_ohlc_data(code, needed_days):
    """
    needed_days 만큼의 '최신 거래일' OHLC를 만들기 위해
    필요한 페이지만(=ceil(needed_days/10)) 가져오고,
    기존에 가져온 페이지가 있으면 추가 페이지만 더 가져온다.
    """
    pages_needed = max(1, min(MAX_PAGES, math.ceil(needed_days / ROWS_PER_PAGE)))

    with raw_ohlc_cache_lock:
        entry = raw_ohlc_cache.get(code)
        if entry is None:
            entry = {"pages_fetched": 0, "ohlc_map": {}}
            raw_ohlc_cache[code] = entry

        already = entry["pages_fetched"]
        missing_pages = list(range(already + 1, pages_needed + 1))

    # 필요한 추가 페이지가 있으면 그 페이지만 수집
    if missing_pages:
        results = fetch_ohlc_pages(code, missing_pages)
        with raw_ohlc_cache_lock:
            _merge_results_into_ohlc_map(entry["ohlc_map"], results)
            entry["pages_fetched"] = pages_needed

    with raw_ohlc_cache_lock:
        ohlc_map = raw_ohlc_cache[code]["ohlc_map"]

    # 날짜 정렬 후 최신 needed_days만
    all_dates = sorted(ohlc_map.keys())  # 'YYYY.MM.DD' 형태면 문자열 정렬 OK
    if not all_dates:
        raise ValueError("데이터가 없습니다.")

    latest_dates = all_dates[-needed_days:]
    final_dates, final_opens, final_closes, final_highs, final_lows, final_volumes = [], [], [], [], [], []
    for d in latest_dates:
        data = ohlc_map[d]
        final_dates.append(d)
        final_opens.append(str(data['open']))
        final_closes.append(str(data['close']))
        final_highs.append(str(data['high']))
        final_lows.append(str(data['low']))
        final_volumes.append(str(data['volume']))

    return final_dates, final_opens, final_closes, final_highs, final_lows, final_volumes

# (기존 get_latest_ohlc_data는 최신 거래일 API에서 쓰니까 유지하되,
#  이제는 "필요한 만큼만" 가져오게 ensure_latest_ohlc_data를 사용)
def get_latest_ohlc_data(code, num_days):
    return ensure_latest_ohlc_data(code, num_days)


# ------------------ 새로운 함수: 전체 OHLC 데이터 및 지표 미리 계산 ------------------
from concurrent.futures import ThreadPoolExecutor  # 파일 상단에 추가

def prepare_full_ohlc_data(code, needed_raw_days):
    dates, opens, closes, highs, lows, volumes = ensure_latest_ohlc_data(code, needed_raw_days)

    df = pd.DataFrame({
        '날짜': dates,
        '시가': list(map(float, opens)),
        '종가': list(map(float, closes)),
        '고가': list(map(float, highs)),
        '저가': list(map(float, lows)),
        '거래량': list(map(float, volumes))
    })

    
    df = prepare_df(df)
    try:
        # [변경된 부분] 여러 지표 계산을 병렬로 실행하여 처리 속도를 단축합니다.
        with ThreadPoolExecutor(max_workers=7) as executor:
            future_ma          = executor.submit(calculate_ma, df.copy(), prepared=True)
            future_macd        = executor.submit(calculate_macd, df.copy(), prepared=True)
            future_rsi         = executor.submit(calculate_rsi, df.copy(), prepared=True)
            future_stoch       = executor.submit(calculate_stoch, df.copy(), prepared=True)
            future_stochrsi    = executor.submit(calculate_stochrsi, df.copy(), prepared=True)
            future_williams    = executor.submit(calculate_williams, df.copy(), prepared=True)
            future_cci         = executor.submit(calculate_cci, df.copy(), prepared=True)
            future_atr         = executor.submit(calculate_atr, df.copy(), prepared=True)
            future_roc         = executor.submit(calculate_roc, df.copy(), prepared=True)
            future_uo          = executor.submit(calculate_uo, df.copy(), prepared=True)
            future_adx         = executor.submit(calculate_adx, df.copy(), prepared=True)
            future_bollinger   = executor.submit(calculate_bollinger, df.copy(), prepared=True)
            future_tradingvalue= executor.submit(calculate_tradingvalue, df.copy(), prepared=True)
            future_envelope    = executor.submit(calculate_envelope, df.copy(), prepared=True)
            future_ichimoku    = executor.submit(calculate_ichimoku, df.copy(), prepared=True)
            future_psar        = executor.submit(calculate_psar, df.copy(), prepared=True)
            
            # 각 지표 계산 결과를 받습니다.
            df_ma          = future_ma.result()
            df_macd        = future_macd.result()
            df_rsi         = future_rsi.result()
            df_stoch       = future_stoch.result()
            df_stochrsi    = future_stochrsi.result()
            df_williams    = future_williams.result()
            df_cci         = future_cci.result()
            df_atr         = future_atr.result()
            df_roc         = future_roc.result()
            df_uo          = future_uo.result()
            df_adx         = future_adx.result()
            df_bollinger   = future_bollinger.result()
            df_tradingvalue= future_tradingvalue.result()
            df_envelope    = future_envelope.result()
            df_ichimoku    = future_ichimoku.result()
            df_psar        = future_psar.result()
        
        # 반환 변수 명칭은 그대로 유지하여, JS와 연동에 문제가 없도록 합니다.
        df['ma5']         = df_ma['ma5']
        df['ma20']        = df_ma['ma20']
        df['ma60']        = df_ma['ma60']
        df['ma120']       = df_ma['ma120']
        df['macd']        = df_macd['macd']
        df['signal']      = df_macd['signal']
        df['oscillator']  = df_macd['oscillator']
        df['rsi']         = df_rsi['rsi']
        df['stoch_K']     = df_stoch['%K']
        df['stoch_D']     = df_stoch['%D']
        df['stochrsi_K']  = df_stochrsi['%K']
        df['stochrsi_D']  = df_stochrsi['%D']
        df['williams']    = df_williams['%R']
        df['CCI']         = df_cci['CCI']
        df['ATR']         = df_atr['ATR']
        df['ROC']         = df_roc['ROC']
        df['UO']          = df_uo['UO']
        df['DI']          = df_adx['+DI']
        df['DIM']         = df_adx['-DI']
        df['ADX']         = df_adx['ADX']
        df['BB_upper']    = df_bollinger['BU']
        df['BB_lower']    = df_bollinger['BL']
        df['tradingvalue']= df_tradingvalue['tradingvalue']
        df['E_upper']     = df_envelope['EU']
        df['E_lower']     = df_envelope['EL']
        df['ichimoku1']   = df_ichimoku['기준선']
        df['ichimoku2']   = df_ichimoku['전환선']
        df['ichimoku3']   = df_ichimoku['선행스팬1']
        df['ichimoku4']   = df_ichimoku['선행스팬2']
        df['ichimoku5']   = df_ichimoku['후행스팬']
        df['psar']        = df_psar['psar']
    except Exception as e:
        logging.error("전체 보조지표 계산 중 오류: %s", e)
    return df

# ------------------ 주가 데이터 및 보조지표 API ------------------
@cache.cached(timeout=3600, query_string=True)
@app.route('/get_ohlc_history', methods=['POST'])
def get_ohlc_history():
    # 매일 KST 새벽 4시 이후 첫 호출에서 전역 캐시 초기화
    ensure_daily_cache_reset_kst()

    # 파라미터 파싱 및 검증
    code = request.form.get('code', '').strip()
    days_str = request.form.get('days', '242').strip()
    indicators_flags = {
        'ma': request.form.get('ma', 'false').strip().lower() == 'true',
        'macd': request.form.get('macd', 'false').strip().lower() == 'true',
        'rsi': request.form.get('rsi', 'false').strip().lower() == 'true',
        'stoch': request.form.get('stoch', 'false').strip().lower() == 'true',
        'stochrsi': request.form.get('stochrsi', 'false').strip().lower() == 'true',
        'williams': request.form.get('williams', 'false').strip().lower() == 'true',
        'cci': request.form.get('cci', 'false').strip().lower() == 'true',
        'atr': request.form.get('atr', 'false').strip().lower() == 'true',
        'roc': request.form.get('roc', 'false').strip().lower() == 'true',
        'uo': request.form.get('uo', 'false').strip().lower() == 'true',
        'adx': request.form.get('adx', 'false').strip().lower() == 'true',
        'bollinger': request.form.get('bollinger', 'false').strip().lower() == 'true',
        'tradingvalue': request.form.get('tradingvalue', 'false').strip().lower() == 'true',
        'envelope': request.form.get('envelope', 'false').strip().lower() == 'true',
        'ichimoku': request.form.get('ichimoku', 'false').strip().lower() == 'true',
        'psar': request.form.get('psar', 'false').strip().lower() == 'true'        
    }
    if not code:
        return jsonify({'error': '종목코드가 없습니다.'}), 400
    try:
        days = int(days_str)
        if days < MIN_DAYS_LIMIT or days > MAX_DAYS_LIMIT:
            return jsonify({'error': f'일수는 {MIN_DAYS_LIMIT}~{MAX_DAYS_LIMIT} 사이여야 합니다.'}), 400
    except ValueError:
        return jsonify({'error': '유효한 숫자를 입력하세요.'}), 400
    
    # warmup 계산(최소 구현: MA120 기준으로만 잡아도 네 목표엔 충분)
    warmup = INDICATOR_WARMUP_MAX if indicators_flags.get('ma', False) else 0

    # (조금 더 정교하게 하고 싶으면: ichimoku면 52, macd면 35, bollinger/cci/envelope면 20, 나머지 14… 이런 식으로 max 잡으면 됨)

    raw_needed = min(MAX_RAW_DAYS, days + warmup)

    need_rebuild = False
    if code not in precomputed_stock_data:
        need_rebuild = True
    else:
        df_full = precomputed_stock_data[code]
        if len(df_full) < raw_needed:
            need_rebuild = True

    if need_rebuild:
        try:
            df_full = prepare_full_ohlc_data(code, raw_needed)
            precomputed_stock_data[code] = df_full
        except Exception as e:
            logging.error("전체 데이터 준비 중 오류: %s", e)
            return jsonify({'error': '데이터 준비 중 오류가 발생했습니다.'}), 500
    else:
        df_full = precomputed_stock_data[code]

    df_slice = df_full.tail(days)

    
    response_data = {
        'dates': list(df_slice['날짜']),
        'opens': list(df_slice['시가']),
        'closes': list(df_slice['종가']),
        'highs': list(df_slice['고가']),
        'lows': list(df_slice['저가']),
        'volumes': list(df_slice['거래량'])
    }
    
    if indicators_flags['ma']:
        response_data.update({
            'ma5': list(df_slice['ma5']),
            'ma20': list(df_slice['ma20']),
            'ma60': list(df_slice['ma60']),
            'ma120': list(df_slice['ma120'])
        })
    else:
        response_data.update({
            'ma5': [None]*days,
            'ma20': [None]*days,
            'ma60': [None]*days,
            'ma120': [None]*days
        })
    
    if indicators_flags['macd']:
        response_data.update({
            'macd': list(df_slice['macd']),
            'signal': list(df_slice['signal']),
            'oscillator': list(df_slice['oscillator'])
        })
    else:
        response_data.update({
            'macd': [None]*days,
            'signal': [None]*days,
            'oscillator': [None]*days
        })
    
    if indicators_flags['rsi']:
        response_data.update({
            'rsi': list(df_slice['rsi'])
        })
    else:
        response_data.update({
            'rsi': [None]*days
        })
    
    if indicators_flags['stoch']:
        response_data.update({
            'K': list(df_slice['stoch_K']),
            'D': list(df_slice['stoch_D'])
        })
    else:
        response_data.update({
            'K': [None]*days,
            'D': [None]*days
        })
    
    if indicators_flags['stochrsi']:
        response_data.update({
            'KK': list(df_slice['stochrsi_K']),
            'DD': list(df_slice['stochrsi_D'])
        })
    else:
        response_data.update({
            'KK': [None]*days,
            'DD': [None]*days
        })
    
    if indicators_flags['williams']:
        response_data.update({
            'R': list(df_slice['williams'])
        })
    else:
        response_data.update({
            'R': [None]*days
        })
    
    if indicators_flags['cci']:
        response_data.update({
            'CCI': list(df_slice['CCI'])
        })
    else:
        response_data.update({
            'CCI': [None]*days
        })
    
    if indicators_flags['atr']:
        response_data.update({
            'ATR': list(df_slice['ATR'])
        })
    else:
        response_data.update({
            'ATR': [None]*days
        })
    
    if indicators_flags['roc']:
        response_data.update({
            'ROC': list(df_slice['ROC'])
        })
    else:
        response_data.update({
            'ROC': [None]*days
        })
    
    if indicators_flags['uo']:
        response_data.update({
            'UO': list(df_slice['UO'])
        })
    else:
        response_data.update({
            'UO': [None]*days
        })
    
    if indicators_flags['adx']:
        response_data.update({
            'DI': list(df_slice['DI']),
            'DIM': list(df_slice['DIM']),
            'ADX': list(df_slice['ADX'])
            # 필요시 DI, DIM 등 추가 가능
        })
    else:
        response_data.update({
            'DI': [None]*days,
            'DIM': [None]*days,
            'ADX': [None]*days
        })
    
    if indicators_flags['bollinger']:
        response_data.update({
            'BB_upper': list(df_slice['BB_upper']),
            'BB_lower': list(df_slice['BB_lower'])
        })
    else:
        response_data.update({
            'BB_upper': [None]*days,
            'BB_lower': [None]*days
        })
    
    if indicators_flags['tradingvalue']:
        response_data.update({
            'tradingvalue': list(df_slice['tradingvalue'])
        })
    else:
        response_data.update({
            'tradingvalue': [None]*days
        })
        
    if indicators_flags['envelope']:
        response_data.update({
            'E_upper': list(df_slice['E_upper']),
            'E_lower': list(df_slice['E_lower'])
        })
    else:
        response_data.update({
            'E_upper': [None]*days,
            'E_lower': [None]*days
        })    
        
    if indicators_flags['ichimoku']:
        response_data.update({
            'ichimoku1': list(df_slice['ichimoku1']),
            'ichimoku2': list(df_slice['ichimoku2']),
            'ichimoku3': list(df_slice['ichimoku3']),
            'ichimoku4': list(df_slice['ichimoku4']),            
            'ichimoku5': list(df_slice['ichimoku5'])            
        })
    else:
        response_data.update({
            'ichimoku1': [None]*days,
            'ichimoku2': [None]*days,
            'ichimoku3': [None]*days,
            'ichimoku4': [None]*days,
            'ichimoku5': [None]*days
        })
    
    if indicators_flags['psar']:
        response_data.update({
            'psar': list(df_slice['psar'])          
        })
    else:
        response_data.update({
            'psar': [None]*days,
        })
       
        
    return jsonify(response_data)

# ------------------ 최신 거래일 API ------------------
@app.route('/get_latest_trading_date', methods=['GET'])
def get_latest_trading_date():
    try:
        if not all_stocks:
            return jsonify({"error": "종목 리스트가 로드되지 않았습니다."}), 500
        code = all_stocks[0]["종목코드"]
        dates, _, _, _, _, _ = get_latest_ohlc_data(code, num_days=1)
        latest_date = dates[-1] if dates else "데이터 없음"
        return jsonify({"latest_date": latest_date})
    except Exception as e:
        logging.exception("최신 개장일 조회 중 오류:")
        return jsonify({"error": f"최신 개장일을 가져오는 중 오류가 발생했습니다: {str(e)}"}), 500

# ------------------ 재무 데이터 ------------------
@cache.cached(timeout=3600, query_string=True)
@app.route('/get_financial_data', methods=['GET'])
def get_financial_data():
    code = request.args.get('code', '').strip()
    if not code:
        return jsonify({'error': '종목코드가 없습니다.'}), 400
    try:
        data = get_financial_indicators(code, session=shared_session)
        return jsonify(data)
    except Exception as e:
        logging.error("재무 데이터 로드 중 오류: %s", e)
        return jsonify({'error': '재무 데이터 로드 중 오류가 발생했습니다.'}), 500

# ------------------ 워드 클라우드 API ------------------
@cache.cached(timeout=3600, query_string=True)  
@app.route('/get_wordcloud_data', methods=['GET'])
def get_wordcloud_data():
    code = request.args.get('code', '').strip()
    if not code:
        return jsonify({'error': '종목코드가 필요합니다.'}), 400
    try:
        stock_name = stock_name_by_code.get(code)  # 없으면 None
        frequencies = get_word_frequencies(code, num_pages=10, stock_name=stock_name)
        return jsonify(frequencies)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
# ------------------ 종목 토론실 점수 API ------------------
@cache.cached(timeout=3600, query_string=True)
@app.route('/get_sentiment_data', methods=['GET'])
def sentiment_data_route():
    code = request.args.get('code', '').strip()
    if not code:
        return jsonify({'error': '종목코드가 필요합니다.'}), 400
    sentiment = get_sentiment_index(code)
    return jsonify(sentiment)

# ------------------ 기관 및 외인 점수 API ------------------
@cache.cached(timeout=3600, query_string=True)
@app.route('/get_gosu_index', methods=['GET'])
def api_get_gosu_index():
    stock_code = request.args.get('code', type=str)
    if not stock_code:
        return jsonify({"error": "종목 코드를 입력해주세요."}), 400
    try:
        data = get_gosu_index(stock_code)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
# ------------------ 현금흐름 API ------------------    
@cache.cached(timeout=3600, query_string=True)
@app.route('/get_cashflow', methods=['GET'])
def get_cashflow():
    code = request.args.get('code')
    if not code:
        return jsonify(error="code 파라미터가 필요합니다."), 400
    # 호출 중 예외가 터져도 빈 데이터로 방어
    try:
        data = get_cashflow_data(code, session=shared_session)
    except Exception as e:
        app.logger.error(f"get_cashflow 실패: {code} → {e}")
        data = {}  # 빈 dict로 두면 아래 .get()이 default로 동작

    result = {
        "labels": ['21년', '22년', '23년', '24년'],
        "operating": data.get('영업활동으로인한현금흐름', [None]*4)[:4],
        "investing": data.get('투자활동으로인한현금흐름', [None]*4)[:4],
        "financing": data.get('재무활동으로인한현금흐름', [None]*4)[:4]
    }

    return jsonify(result)

# ------------------ 팩터 연구 ------------------
@cache.cached(timeout=3600, query_string=True)
@app.route('/factor_result', methods=['POST'])
def factor_result():

    data = request.get_json()
    selected_factors = data.get('selectedFactors', [])
    
    condition_type = data.get('mode', 'AND').upper()
    slider_value = data.get('months', 3)

    # factor.py 함수 실행
    stock_data = process_factor_data(
        selected_factors, condition_type, slider_value
    )
    
    avg_return = stock_data["average_return"]
    condition_text = stock_data["condition_text"]
    company_names = stock_data["companies"]

    # 데이터 부족 처리  
    if not stock_data:
        return jsonify({'error': '데이터 부족'}), 400

    return jsonify({
        "condition_text": condition_text,
        "average_return": avg_return,
        "companies": company_names,
        "company_returns": stock_data.get("company_returns", []),
        "selected_names": stock_data.get("selected_names", []),
        "months": stock_data.get("months", None),                
        "mode": stock_data.get("mode", "AND")                    
    })
    
# ------------------ 캔들 연구 ------------------
@cache.cached(timeout=3600, query_string=True)
@app.route('/get_kospi50', methods=['GET'])
def get_kospi50():
    try:
        df = get_kospi_marketcap_top(50)
        # 화면 요구사항: '이름순 정렬'로 전달
        out = df.sort_values('회사명')[['회사명', '종목코드']].to_dict('records')
        return jsonify(out)
    except Exception as e:
        app.logger.exception("KOSPI50 로드 실패")
        # 안전망: 기존 전체 리스트 일부라도 반환 (원하면 변경)
        return jsonify([]), 500

@app.route('/detect_patterns', methods=['POST'])
def detect_patterns_api():
    data = request.get_json(force=True)
    code = data.get("code")
    days = int(data.get("days", 30))
    enabled = data.get("patterns", ["bullish_reversal","bullish_trend","bearish_reversal","bearish_trend"])

    # 1) 충분한 베이스 확보(워밍업 여유 +60일)
    base_days = max(days, 30) + 60
    ohlc = request_ohlc_like_get_history(code, base_days)

    # 2) 베이스 DF 구성
    df_base = pd.DataFrame({
        "date":   ohlc["dates"],
        "open":   ohlc["opens"],
        "high":   ohlc["highs"],
        "low":    ohlc["lows"],
        "close":  ohlc["closes"],
        "volume": ohlc["volumes"],
    }).reset_index(drop=True)

    # 3) 전체에서 탐지 → 마지막 days로만 필터/재매핑 (candle.py로 위임)
    from candle import detect_on_base_and_remap
    matches = detect_on_base_and_remap(df_base, enabled, days)

    return jsonify({ "matches": matches })

def request_ohlc_like_get_history(code: str, days: int):
    from flask import current_app
    with current_app.test_request_context('/get_ohlc_history', method='POST', data={"code": code, "days": days, "ma":"false", "bollinger":"false", "psar":"false"}):
        resp = current_app.full_dispatch_request()
        return resp.get_json()

@app.route('/get_metrics', methods=['GET'])
def get_metrics_api():
    code = (request.args.get('code') or '').strip()
    days = int(request.args.get('days', '30'))
    minp = int(request.args.get('minp', '5'))
    latest = (request.args.get('latest') or '').strip().replace('.', '-')
    if not code:
        return jsonify({"series": {}})
    return jsonify({"series": get_series_bundle(code, days=days, minp=minp, latest=latest)})



# ------------------ 서버 실행 ------------------
@app.route('/ping')
def ping():
    return 'pong', 200 

# ------------------ 테마랩 API ------------------
@app.route('/api/theme/calendar')
def api_theme_calendar():
    """과거 1년 테마 달력 데이터 반환"""
    try:
        data = get_theme_calendar()
        if data:
            return jsonify(data)
        else:
            return jsonify({'error': '데이터 준비 중입니다. 잠시 후 다시 시도해주세요.'}), 202
    except Exception as e:
        logging.error(f"테마 달력 API 에러: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/theme/current')
def api_theme_current():
    """금주 테마 TOP 5 반환"""
    try:
        data = get_current_week_top_themes(num_top=5)
        return jsonify(data)
    except Exception as e:
        logging.error(f"현재 트렌드 API 에러: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/theme/forecast')
def api_theme_forecast():
    """미래 예측 반환"""
    try:
        data = get_future_forecast()
        return jsonify(data)
    except Exception as e:
        logging.error(f"미래 예측 API 에러: {e}")
        return jsonify({'error': str(e)}), 500

def console_heartbeat():
    """5분마다 콘솔에 '서버 유지 중...' 로그를 찍는 데몬 스레드"""
    while True:
        now = datetime.datetime.now()
        print("서버 유지 중... " + now.strftime("%y%m%d %H:%M"))
        time.sleep(300) 

if __name__ == '__main__':
    threading.Thread(target=console_heartbeat, daemon=True).start()
    app.run(host='0.0.0.0', port=8080, debug=True)

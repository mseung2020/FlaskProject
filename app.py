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

async def get_latest_ohlc_data_async(code, num_days):
    ohlc_map = {}
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_page_data_async(session, page, code) for page in range(1, MAX_PAGES + 1)]
        results = await asyncio.gather(*tasks)
    for df_day in results:
        if df_day is None:
            continue
        for _, row in df_day.iterrows():
            date_str = str(row['날짜']).strip()
            try:
                close_val = float(str(row['종가']).replace(',', '').strip())
                open_val = float(str(row['시가']).replace(',', '').strip())
                high_val = float(str(row['고가']).replace(',', '').strip())
                low_val = float(str(row['저가']).replace(',', '').strip())
                volume_val = float(str(row['거래량']).replace(',', '').strip())
            except Exception as e:
                logging.debug("데이터 파싱 오류: %s", e)
                continue
            if date_str not in ohlc_map:
                ohlc_map[date_str] = {
                    'open': open_val,
                    'close': close_val,
                    'high': high_val,
                    'low': low_val,
                    'volume': volume_val
                }
    try:
        all_dates_sorted = sorted(ohlc_map.keys(), key=lambda d: pd.to_datetime(d, format='%Y.%m.%d'))
    except Exception as e:
        logging.error("날짜 정렬 중 오류: %s", e)
        all_dates_sorted = list(ohlc_map.keys())
    if not all_dates_sorted:
        raise ValueError("데이터가 없습니다.")
    latest_dates = all_dates_sorted[-num_days:]
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

# 기존 동기식 함수를 비동기 호출로 대체
def get_latest_ohlc_data(code, num_days):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(get_latest_ohlc_data_async(code, num_days))
    finally:
        loop.close()
    return result

# ------------------ 새로운 함수: 전체 OHLC 데이터 및 지표 미리 계산 ------------------
from concurrent.futures import ThreadPoolExecutor  # 파일 상단에 추가

def prepare_full_ohlc_data(code):
    dates, opens, closes, highs, lows, volumes = get_latest_ohlc_data(code, PRECOMPUTE_DAYS)
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
    
    if code not in precomputed_stock_data:
        try:
            df_full = prepare_full_ohlc_data(code)
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
        frequencies = get_word_frequencies(code, num_pages=10)
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

    data = get_cashflow_data(code, session=shared_session)
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

       
# ------------------ 서버 실행 ------------------
@app.route('/ping')
def ping():
    return 'pong', 200 

def console_heartbeat():
    """5분마다 콘솔에 '서버 유지 중...' 로그를 찍는 데몬 스레드"""
    while True:
        now = datetime.datetime.now()
        print("서버 유지 중... " + now.strftime("%y%m%d %H:%M"))
        time.sleep(300) 

if __name__ == '__main__':
    threading.Thread(target=console_heartbeat, daemon=True).start()
    app.run(host='0.0.0.0', port=8080, debug=True)

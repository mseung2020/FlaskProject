import logging
from flask import Flask, render_template, request, jsonify
from flask_caching import Cache
import pandas as pd
import os
import asyncio 
import aiohttp
from io import StringIO
from indicators import (
    calculate_ma, calculate_macd, calculate_rsi, calculate_stoch,
    calculate_stochrsi, calculate_williams, calculate_cci, calculate_atr,
    calculate_roc, calculate_uo, calculate_adx, calculate_bollinger,
    calculate_tradingvalue
)

# ------------------ 설정 및 로깅 ------------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

# ------------------ 전역 상수 및 경로 ------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FOLDER = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_FOLDER, exist_ok=True)
STOCK_CACHE_FILE = os.path.join(DATA_FOLDER, "stock_list.csv")
STOCK_LIST_URL = 'http://kind.krx.co.kr/corpgeneral/corpList.do?method=download'
BUFFER_DAYS = 120
MIN_DAYS_LIMIT = 1
MAX_DAYS_LIMIT = 365
MAX_PAGES = 49

# ------------------ 종목 리스트 로드 (캐싱 및 다운로드) ------------------
def load_stock_list():
    try:
        if os.path.exists(STOCK_CACHE_FILE):
            logging.info("로컬 캐시 파일에서 종목 리스트 로드: %s", STOCK_CACHE_FILE)
            df = pd.read_csv(STOCK_CACHE_FILE, dtype={'종목코드': str})
        else:
            logging.info("캐시 파일이 없으므로 종목 리스트 다운로드 시작.")
            df = pd.read_html(STOCK_LIST_URL, encoding='euc-kr')[0]
            # 종목코드를 6자리 문자열로 포맷
            df['종목코드'] = df['종목코드'].apply(lambda x: f"{int(x):06d}")
            df = df.sort_values(by='회사명', ascending=True)
            df.to_csv(STOCK_CACHE_FILE, index=False)
            logging.info("종목 리스트 다운로드 및 저장 완료.")
        # 리스트 형식으로 변환
        stock_list = [{"회사명": row['회사명'], "종목코드": row['종목코드']} for _, row in df.iterrows()]
        return stock_list
    except Exception as e:
        logging.error("종목 리스트 로드 중 오류: %s", e)
        return []

# 전역 변수로 종목 리스트 로드 (서버 시작 시 미리 로드)
all_stocks = load_stock_list()

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

# ------------------ 주가 데이터 및 보조지표 API ------------------
@cache.cached(timeout=3600, query_string=True)
@app.route('/get_ohlc_history', methods=['POST'])
def get_ohlc_history():
    # 파라미터 파싱 및 검증
    code = request.form.get('code', '').strip()
    days_str = request.form.get('days', '10').strip()
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
        'tradingvalue': request.form.get('tradingvalue', 'false').strip().lower() == 'true'
    }
    if not code:
        return jsonify({'error': '종목코드가 없습니다.'}), 400
    try:
        days = int(days_str)
        if days < MIN_DAYS_LIMIT or days > MAX_DAYS_LIMIT:
            return jsonify({'error': f'일수는 {MIN_DAYS_LIMIT}~{MAX_DAYS_LIMIT} 사이여야 합니다.'}), 400
    except ValueError:
        return jsonify({'error': '유효한 숫자를 입력하세요.'}), 400

    try:
        total_days = days + BUFFER_DAYS
        dates, opens, closes, highs, lows, volumes = get_latest_ohlc_data(code, total_days)
        # 클라이언트에 최신 days 데이터만 전달
        response_data = {
            'dates': dates[-days:],
            'opens': opens[-days:],
            'closes': closes[-days:],
            'highs': highs[-days:],
            'lows': lows[-days:],
            'volumes': volumes[-days:]
        }

        # 보조지표 계산 (각 계산 함수는 데이터프레임을 복사하여 사용)
        df_full = pd.DataFrame({'날짜': dates, '종가': list(map(float, closes))})
        if indicators_flags['ma']:
            ma_df = calculate_ma(df_full.copy())
        else:
            ma_df = pd.DataFrame({'날짜': dates, 'ma5': [None]*len(dates), 'ma20': [None]*len(dates),
                                  'ma60': [None]*len(dates), 'ma120': [None]*len(dates)})
        response_data.update({
            'ma5': [ma_df.loc[ma_df['날짜'] == d, 'ma5'].values[0] if d in ma_df['날짜'].values else None for d in dates[-days:]],
            'ma20': [ma_df.loc[ma_df['날짜'] == d, 'ma20'].values[0] if d in ma_df['날짜'].values else None for d in dates[-days:]],
            'ma60': [ma_df.loc[ma_df['날짜'] == d, 'ma60'].values[0] if d in ma_df['날짜'].values else None for d in dates[-days:]],
            'ma120': [ma_df.loc[ma_df['날짜'] == d, 'ma120'].values[0] if d in ma_df['날짜'].values else None for d in dates[-days:]]
        })

        if indicators_flags['macd']:
            macd_df = calculate_macd(df_full.copy())
        else:
            macd_df = pd.DataFrame({'날짜': dates, 'macd': [None]*len(dates),
                                    'signal': [None]*len(dates), 'oscillator': [None]*len(dates)})
        response_data.update({
            'macd': [macd_df.loc[macd_df['날짜'] == d, 'macd'].values[0] if d in macd_df['날짜'].values else None for d in dates[-days:]],
            'signal': [macd_df.loc[macd_df['날짜'] == d, 'signal'].values[0] if d in macd_df['날짜'].values else None for d in dates[-days:]],
            'oscillator': [macd_df.loc[macd_df['날짜'] == d, 'oscillator'].values[0] if d in macd_df['날짜'].values else None for d in dates[-days:]]
        })

        if indicators_flags['rsi']:
            rsi_df = calculate_rsi(df_full.copy())
        else:
            rsi_df = pd.DataFrame({'날짜': dates, 'rsi': [None]*len(dates)})
        response_data.update({
            'rsi': [rsi_df.loc[rsi_df['날짜'] == d, 'rsi'].values[0] if d in rsi_df['날짜'].values else None for d in dates[-days:]]
        })

        if indicators_flags['stoch']:
            df_stoch = pd.DataFrame({
                '날짜': dates,
                '종가': list(map(float, closes)),
                '저가': list(map(float, lows)),
                '고가': list(map(float, highs))
            })
            stoch_df = calculate_stoch(df_stoch.copy())
        else:
            stoch_df = pd.DataFrame({'날짜': dates, '%K': [None]*len(dates), '%D': [None]*len(dates)})
        response_data.update({
            'K': [stoch_df.loc[stoch_df['날짜'] == d, '%K'].values[0] if d in stoch_df['날짜'].values else None for d in dates[-days:]],
            'D': [stoch_df.loc[stoch_df['날짜'] == d, '%D'].values[0] if d in stoch_df['날짜'].values else None for d in dates[-days:]]
        })

        if indicators_flags['stochrsi']:
            stochrsi_df = calculate_stochrsi(df_full.copy())
        else:
            stochrsi_df = pd.DataFrame({'날짜': dates, '%K': [None]*len(dates), '%D': [None]*len(dates)})
        response_data.update({
            'KK': [stochrsi_df.loc[stochrsi_df['날짜'] == d, '%K'].values[0] if d in stochrsi_df['날짜'].values else None for d in dates[-days:]],
            'DD': [stochrsi_df.loc[stochrsi_df['날짜'] == d, '%D'].values[0] if d in stochrsi_df['날짜'].values else None for d in dates[-days:]]
        })

        if indicators_flags['williams']:
            df_williams = pd.DataFrame({
                '날짜': dates,
                '종가': list(map(float, closes)),
                '저가': list(map(float, lows)),
                '고가': list(map(float, highs))
            })
            williams_df = calculate_williams(df_williams.copy())
        else:
            williams_df = pd.DataFrame({'날짜': dates, '%R': [None]*len(dates)})
        response_data.update({
            'R': [williams_df.loc[williams_df['날짜'] == d, '%R'].values[0] if d in williams_df['날짜'].values else None for d in dates[-days:]]
        })

        if indicators_flags['cci']:
            df_cci = pd.DataFrame({
                '날짜': dates,
                '종가': list(map(float, closes)),
                '저가': list(map(float, lows)),
                '고가': list(map(float, highs))
            })
            cci_df = calculate_cci(df_cci.copy())
        else:
            cci_df = pd.DataFrame({'날짜': dates, 'CCI': [None]*len(dates)})
        response_data.update({
            'CCI': [cci_df.loc[cci_df['날짜'] == d, 'CCI'].values[0] if d in cci_df['날짜'].values else None for d in dates[-days:]]
        })

        if indicators_flags['atr']:
            df_atr = pd.DataFrame({
                '날짜': dates,
                '종가': list(map(float, closes)),
                '저가': list(map(float, lows)),
                '고가': list(map(float, highs))
            })
            atr_df = calculate_atr(df_atr.copy())
        else:
            atr_df = pd.DataFrame({'날짜': dates, 'ATR': [None]*len(dates)})
        response_data.update({
            'ATR': [atr_df.loc[atr_df['날짜'] == d, 'ATR'].values[0] if d in atr_df['날짜'].values else None for d in dates[-days:]]
        })

        if indicators_flags['roc']:
            df_roc = pd.DataFrame({
                '날짜': dates,
                '종가': list(map(float, closes)),
                '저가': list(map(float, lows)),
                '고가': list(map(float, highs))
            })
            roc_df = calculate_roc(df_roc.copy())
        else:
            roc_df = pd.DataFrame({'날짜': dates, 'ROC': [None]*len(dates)})
        response_data.update({
            'ROC': [roc_df.loc[roc_df['날짜'] == d, 'ROC'].values[0] if d in roc_df['날짜'].values else None for d in dates[-days:]]
        })

        if indicators_flags['uo']:
            df_uo = pd.DataFrame({
                '날짜': dates,
                '종가': list(map(float, closes)),
                '저가': list(map(float, lows)),
                '고가': list(map(float, highs))
            })
            uo_df = calculate_uo(df_uo.copy())
        else:
            uo_df = pd.DataFrame({'날짜': dates, 'UO': [None]*len(dates)})
        response_data.update({
            'UO': [uo_df.loc[uo_df['날짜'] == d, 'UO'].values[0] if d in uo_df['날짜'].values else None for d in dates[-days:]]
        })

        if indicators_flags['adx']:
            df_adx = pd.DataFrame({
                '날짜': dates,
                '종가': list(map(float, closes)),
                '저가': list(map(float, lows)),
                '고가': list(map(float, highs))
            })
            adx_df = calculate_adx(df_adx.copy())
        else:
            adx_df = pd.DataFrame({'날짜': dates, 'ADX': [None]*len(dates), '+DI': [None]*len(dates), '-DI': [None]*len(dates)})
        response_data.update({
            'ADX': [adx_df.loc[adx_df['날짜'] == d, 'ADX'].values[0] if d in adx_df['날짜'].values else None for d in dates[-days:]],
            'DI': [adx_df.loc[adx_df['날짜'] == d, '+DI'].values[0] if d in adx_df['날짜'].values else None for d in dates[-days:]],
            'DIM': [adx_df.loc[adx_df['날짜'] == d, '-DI'].values[0] if d in adx_df['날짜'].values else None for d in dates[-days:]]
        })
        
        if indicators_flags['bollinger']:
            df_bollinger = pd.DataFrame({
                '날짜': dates,
                '종가': list(map(float, closes))
            })
            bollinger_df = calculate_bollinger(df_bollinger.copy())
        else:
            bollinger_df = pd.DataFrame({'날짜': dates, 'BU': [None]*len(dates), 'BL': [None]*len(dates)})
        response_data.update({
            'BU': [bollinger_df.loc[bollinger_df['날짜'] == d, 'BU'].values[0] if d in bollinger_df['날짜'].values else None for d in dates[-days:]],
            'BL': [bollinger_df.loc[bollinger_df['날짜'] == d, 'BL'].values[0] if d in bollinger_df['날짜'].values else None for d in dates[-days:]]
        })
        
        if indicators_flags['tradingvalue']:
            df_tradingvalue = pd.DataFrame({
                '날짜': dates,
                '시가': list(map(float, opens)),
                '종가': list(map(float, closes)),
                '저가': list(map(float, lows)),
                '고가': list(map(float, highs)),
                '거래량': list(map(float, volumes))
            })
            tradingvalue_df = calculate_tradingvalue(df_tradingvalue.copy())
        else:
            tradingvalue_df = pd.DataFrame({'날짜': dates, 'tradingvalue': [None]*len(dates)})
        response_data.update({
            'tradingvalue': [tradingvalue_df.loc[tradingvalue_df['날짜'] == d, 'tradingvalue'].values[0] if d in tradingvalue_df['날짜'].values else None for d in dates[-days:]]
        })

        return jsonify(response_data)
    except Exception as e:
        logging.exception("데이터 처리 중 에러 발생:")
        return jsonify({'error': f'데이터를 가져오는 중 에러가 발생했습니다: {str(e)}'}), 500

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

# ------------------ 서버 실행 ------------------
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

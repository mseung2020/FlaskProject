from flask import Flask, render_template, request, jsonify
from flask_caching import Cache
import pandas as pd
import requests
from concurrent.futures import ThreadPoolExecutor
from io import StringIO
import os

#0 ------------------ 시작 ------------------
app = Flask(__name__)
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

#1 ------------------ KRX 종목 리스트 로드 ------------------
cache_file = 'stock_list.csv'

if os.path.exists(cache_file):
    # 캐싱된 파일이 존재하면 로컬에서 읽기
    df = pd.read_csv(cache_file, dtype={'종목코드': str})
else:
    # 캐싱된 파일이 없으면 다운로드 후 저장
    url_stockcode = 'http://kind.krx.co.kr/corpgeneral/corpList.do?method=download'
    df = pd.read_html(url_stockcode, encoding='euc-kr')[0]
    df['종목코드'] = df['종목코드'].apply(lambda x: f"{x:06d}")
    df = df.sort_values(by='회사명', ascending=True)
    df.to_csv(cache_file, index=False)

stock_list = [
    {"회사명": row['회사명'], "종목코드": row['종목코드']}
    for _, row in df.iterrows()
]

#2 ------------------ index.html 연결 ------------------
@app.route('/')
def index():
    return render_template('index.html')

#3 ------------------ 종목 리스트 보내기 ------------------
@app.route('/get_stock_list', methods=['GET'])
def get_stock_list():
    print("종목 리스트 데이터:", stock_list)
    return jsonify(stock_list)

#4 ------------------ 일수 입력 보내기 ------------------
@cache.cached(timeout=3600, query_string=True)
@app.route('/get_ohlc_history', methods=['POST'])
def get_ohlc_history():
    # 클라이언트에서 요청받은 code와 days 값 처리
    code = request.form.get('code', '').strip()
    days = request.form.get('days', '10').strip()

    if not code:
        return jsonify({'error': '종목코드가 없습니다.'}), 400

    try:
        # days 값을 검증
        days = int(days)
        if days < 1 or days > 365:
            return jsonify({'error': '일수는 1~365 사이여야 합니다.'}), 400
    except ValueError:
        return jsonify({'error': '유효한 숫자를 입력하세요.'}), 400

    try:
        # 데이터 가져오기
        dates, opens, closes, highs, lows, volumes = get_latest_ohlc_data(code, days)
        # 디버깅용 출력
        """
        print("OHLC Data:", {
            'dates': dates,
            'opens': opens,
            'closes': closes,
            'highs': highs,
            'lows': lows,
            'volumes': volumes
        })"""
        # JSON 데이터 반환
        return jsonify({
            'dates': dates,
            'opens': opens,
            'closes': closes,
            'highs': highs,
            'lows': lows,
            'volumes': volumes
        })
    except Exception as e:
        return jsonify({'error': f'데이터를 가져오는 중 에러가 발생했습니다: {str(e)}'}), 500

#5 ------------------ naver 주가 데이터 로드 ------------------
def fetch_page_data(page, code):
    url = f'https://finance.naver.com/item/sise_day.nhn?code={code}&page={page}'
    resp = requests.get(url, headers={'user-agent': 'Mozilla/5.0'})
    resp = StringIO(resp.text)
    df_list = pd.read_html(resp, encoding='cp949')
    if not df_list or df_list[0].dropna().empty:
        return None
    return df_list[0].dropna()

#6 ------------------ naver 주가 데이터 정리 ------------------
def get_latest_ohlc_data(code, num_days=10):
    ohlc_map = {}
    max_pages = 37

    with ThreadPoolExecutor(max_workers=5) as executor:  # 동시 요청 수 제한 (5)
        futures = [executor.submit(fetch_page_data, page, code) for page in range(1, max_pages + 1)]
        for future in futures:
            df_day = future.result()
            if df_day is None:
                continue
            for i in range(len(df_day)):
                date_str = str(df_day.iloc[i]['날짜']).strip()
                close_str = str(df_day.iloc[i]['종가']).replace(',', '').strip()
                open_str = str(df_day.iloc[i]['시가']).replace(',', '').strip()
                high_str = str(df_day.iloc[i]['고가']).replace(',', '').strip()
                low_str = str(df_day.iloc[i]['저가']).replace(',', '').strip()
                vol_str = str(df_day.iloc[i]['거래량']).replace(',', '').strip()

                if not (date_str and close_str and open_str and high_str and low_str and vol_str):
                    continue

                try:
                    c_val = float(close_str)
                    o_val = float(open_str)
                    h_val = float(high_str)
                    l_val = float(low_str)
                    v_val = float(vol_str)
                except ValueError:
                    continue

                if date_str not in ohlc_map:
                    ohlc_map[date_str] = {
                        'open': o_val,
                        'close': c_val,
                        'high': h_val,
                        'low': l_val,
                        'volume': v_val
                    }

    all_dates_sorted = sorted(ohlc_map.keys())
    if len(all_dates_sorted) == 0:
        raise ValueError("데이터가 없습니다.")

    latest_dates = all_dates_sorted[-num_days:]
    final_dates = []
    final_opens = []
    final_closes = []
    final_highs = []
    final_lows = []
    final_volumes = []
    for d in latest_dates:
        final_dates.append(d)
        final_opens.append(str(ohlc_map[d]['open']))
        final_closes.append(str(ohlc_map[d]['close']))
        final_highs.append(str(ohlc_map[d]['high']))
        final_lows.append(str(ohlc_map[d]['low']))
        final_volumes.append(str(ohlc_map[d]['volume']))

    return final_dates, final_opens, final_closes, final_highs, final_lows, final_volumes

if __name__ == '__main__':
    app.run(debug=True)

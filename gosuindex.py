import requests
from bs4 import BeautifulSoup
import re
from datetime import datetime

shared_session = requests.Session()   
def get_gosu_index(stock_code, session=shared_session):
    """
    주어진 종목 코드(stock_code)에 대해 네이버 금융의 외국인·기관 순매매 페이지를 크롤링하여,
    오늘을 포함한 최근 5영업일의 데이터를 바탕으로 기관과 외국인의 순매매강도를 계산합니다.
    
    순매매강도는 (|순매매량| / 거래량) × 100 으로 계산합니다.
    
    반환 예시:
    {
        "dates": ["2025.03.24", "2025.03.25", "2025.03.26", "2025.03.27", "2025.03.28"],
        "institution": {
            "net_volume": [ -314517, -300605, 522082, -1084964, -1340029 ],
            "strength_percent": [ 2.23, 1.74, 3.18, 5.32, 8.23 ]
        },
        "foreign": {
            "net_volume": [ -651766, -49438, 2340577, 5218284, -1586729 ],
            "strength_percent": [ 4.63, 0.29, 14.24, 25.59, 9.74 ]
        }
    }
    """
    url = f'https://finance.naver.com/item/frgn.naver?code={stock_code}'
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    try:
        response = session.get(url, headers=headers, timeout=10)
        response.encoding = 'cp949'  # 네이버 금융 페이지는 cp949 인코딩 사용
    except Exception as e:
        raise Exception(f"데이터 요청 실패: {e}")
    
    soup = BeautifulSoup(response.text, 'html.parser')
    table = soup.find('table', summary=re.compile("외국인 기관 순매매 거래량"))
    if not table:
        raise Exception("순매매 데이터를 담은 테이블을 찾을 수 없습니다.")
    
    rows = table.find_all('tr')
    data_list = []
    for row in rows:
        cols = row.find_all('td')
        if len(cols) < 7:
            continue
        try:
            date_text = cols[0].get_text(strip=True)
            if not re.match(r'\d{4}\.\d{2}\.\d{2}', date_text):
                continue
            date_obj = datetime.strptime(date_text, "%Y.%m.%d")
            
            volume_text = cols[4].get_text(strip=True).replace(',', '')
            institution_text = cols[5].get_text(strip=True).replace(',', '')
            foreign_text = cols[6].get_text(strip=True).replace(',', '')
            
            # '+' 기호 제거 후 정수 변환
            trading_volume = int(volume_text) if volume_text.isdigit() else 0
            institution_net = int(institution_text.replace('+','')) if re.match(r'^[+-]?\d+$', institution_text) else 0
            foreign_net = int(foreign_text.replace('+','')) if re.match(r'^[+-]?\d+$', foreign_text) else 0

            if trading_volume > 0:
                inst_strength = round((abs(institution_net) / trading_volume) * 100, 2)
                foreign_strength = round((abs(foreign_net) / trading_volume) * 100, 2)
            else:
                inst_strength = 0.0
                foreign_strength = 0.0

            data_list.append({
                'date': date_obj,
                'date_str': date_text,
                'trading_volume': trading_volume,
                'institution_net': institution_net,
                'institution_strength': inst_strength,
                'foreign_net': foreign_net,
                'foreign_strength': foreign_strength
            })
        except Exception as e:
            continue

    if not data_list:
        raise Exception("유효한 데이터를 찾지 못했습니다.")
    
    data_list.sort(key=lambda x: x['date'])
    recent_data = data_list[-5:]
    
    dates = [entry['date_str'] for entry in recent_data]
    institution_net_volumes = [entry['institution_net'] for entry in recent_data]
    institution_strengths = [entry['institution_strength'] for entry in recent_data]
    foreign_net_volumes = [entry['foreign_net'] for entry in recent_data]
    foreign_strengths = [entry['foreign_strength'] for entry in recent_data]
    
    result = {
        'dates': dates,
        'institution': {
            'net_volume': institution_net_volumes,
            'strength_percent': institution_strengths
        },
        'foreign': {
            'net_volume': foreign_net_volumes,
            'strength_percent': foreign_strengths
        }
    }
    
    return result

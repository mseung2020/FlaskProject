# theme.py
import pandas as pd
import os
import json
import logging
import threading
import time
import datetime
from zoneinfo import ZoneInfo
import requests
from io import StringIO
from typing import Dict, List, Tuple, Optional
import numpy as np
from collections import Counter
import statistics

# ================= 설정 =================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
THEME_FOLDER = os.path.join(BASE_DIR, "data", "theme")
THEME_365_FILE = os.path.join(BASE_DIR, "data", "theme", "theme_365.json")
KST = ZoneInfo("Asia/Seoul")

TRADING_DAYS_PER_YEAR = 250  # 1년 평일 거래일
LOOKBACK_WEEKS = 52  # 52주
STRENGTH_THRESHOLD = 2.0  # 평균 주간 수익률 N% 이상이면 강세

# 전역 세션
shared_session = requests.Session()
shared_session.headers.update({'User-Agent': 'Mozilla/5.0'})

# ================= 유틸리티 =================

def get_trading_days(end_date: str, num_days: int = 260) -> List[str]:
    """
    end_date 기준 과거 num_days개 평일 거래일 생성 (대략 52주 × 5일)
    실제로는 네이버에서 크롤링한 날짜 기준으로 해야 하지만,
    여기서는 단순히 평일만 추출
    """
    end = pd.to_datetime(end_date)
    dates = pd.bdate_range(end=end, periods=num_days, freq='B')
    return [d.strftime('%Y.%m.%d') for d in dates]


def load_stock_name_to_code_map() -> Dict[str, str]:
    """stock_list.csv에서 종목명 → 종목코드 매핑 생성"""
    stock_list_path = os.path.join(BASE_DIR, "data", "stock_list.csv")
    
    if not os.path.exists(stock_list_path):
        logging.warning("stock_list.csv가 없습니다.")
        return {}
    
    try:
        df = pd.read_csv(stock_list_path, dtype={'종목코드': str})
        return dict(zip(df['회사명'], df['종목코드'].str.zfill(6)))
    except Exception as e:
        logging.error(f"stock_list.csv 로드 실패: {e}")
        return {}


def load_theme_stocks() -> Dict[str, List[Tuple[str, str]]]:
    """
    data/theme/*.xlsx 파일들을 읽어서 테마별 종목 리스트 반환
    반환: {'반도체장비': [('한미반도체', '042700'), ...], ...}
    """
    themes = {}
    
    if not os.path.exists(THEME_FOLDER):
        logging.warning(f"테마 폴더가 없습니다: {THEME_FOLDER}")
        return themes
    
    # stock_list.csv에서 종목명 → 코드 매핑 로드
    stock_map = load_stock_name_to_code_map()
    
    # _backup 파일 제외
    files = [f for f in os.listdir(THEME_FOLDER) if f.endswith('.xlsx') and '_backup' not in f]
    
    for file_name in files:
        try:
            file_path = os.path.join(THEME_FOLDER, file_name)
            df = pd.read_excel(file_path, header=None)
            
            # 1행: 테마명 (또는 파일명에서 추출)
            if len(df) > 0 and pd.notna(df.iloc[0, 0]):
                theme_name = str(df.iloc[0, 0]).strip()
            else:
                theme_name = file_name.replace('.xlsx', '')
            
            # 2행부터: [종목명, 종목코드] 또는 [종목명]만
            stocks = []
            for i in range(1, len(df)):
                if pd.notna(df.iloc[i, 0]):
                    name = str(df.iloc[i, 0]).strip()
                    code = None
                    
                    # 종목코드 열이 있으면 사용
                    if len(df.columns) >= 2 and pd.notna(df.iloc[i, 1]):
                        code = str(df.iloc[i, 1]).strip().zfill(6)
                    
                    # 코드 없으면 stock_list.csv에서 찾기
                    if not code and stock_map:
                        code = stock_map.get(name)
                        if code:
                            logging.debug(f"{name} → {code} (stock_list.csv에서 매핑)")
                    
                    # 그래도 없으면 스킵
                    if not code:
                        logging.warning(f"{file_name}의 {name}: 종목코드 찾을 수 없음, 스킵")
                        continue
                    
                    stocks.append((name, code))
            
            if stocks:
                themes[theme_name] = stocks
            else:
                logging.warning(f"{file_name}: 유효한 종목 없음, 스킵")
        
        except Exception as e:
            logging.error(f"테마 파일 로드 실패 ({file_name}): {e}")
            import traceback
            logging.error(traceback.format_exc())
    
    return themes


def fetch_stock_closes_for_period(code: str, start_date: str, end_date: str, session=None) -> Dict[str, float]:
    """
    특정 종목의 start_date ~ end_date 구간 종가 크롤링
    반환: {'2025.03.03': 12500, '2025.03.04': 12600, ...}
    """
    if session is None:
        session = shared_session
    
    closes = {}
    
    try:
        # 네이버 금융 일별 시세 (최대 30페이지 = 300일, 충분)
        for page in range(1, 31):
            url = f"https://finance.naver.com/item/sise_day.naver?code={code}&page={page}"
            response = session.get(url, timeout=5)
            
            # HTML 파싱
            tables = pd.read_html(StringIO(response.text), header=0)
            if not tables:
                break
            
            df = tables[0]
            df = df.dropna(subset=['날짜'])
            
            if df.empty:
                break
            
            for _, row in df.iterrows():
                try:
                    date_str = str(row['날짜']).strip()
                    close_val = float(str(row['종가']).replace(',', '').strip())
                    
                    # 날짜 형식 통일 (YYYY.MM.DD)
                    dt = pd.to_datetime(date_str)
                    date_formatted = dt.strftime('%Y.%m.%d')
                    closes[date_formatted] = close_val
                except Exception as parse_err:
                    # 개별 행 파싱 실패는 무시
                    continue
            
            # 충분히 모았으면 중단
            if len(closes) >= 280:
                break
            
            time.sleep(0.08)  # 차단 방지 (조금 더 느리게)
    
    except Exception as e:
        logging.error(f"종목 {code} 크롤링 실패: {e}")
        import traceback
        logging.error(traceback.format_exc())
    
    return closes


def calculate_theme_strength_by_week(themes: Dict[str, List[Tuple[str, str]]], 
                                      trading_days: List[str]) -> Dict[str, Dict]:
    """
    각 테마의 주별 평균 수익률 계산
    반환: {
        '반도체장비': {
            'week_0': {'dates': ['2025.03.03', ...], 'return': 2.5, 'stocks': [...]},
            'week_1': {...},
            ...
        },
        ...
    }
    """
    logging.info("테마별 주간 수익률 계산 시작...")
    
    # 1. 모든 종목 중복 제거
    all_codes = set()
    for stocks in themes.values():
        for _, code in stocks:
            all_codes.add(code)
    
    logging.info(f"총 {len(all_codes)}개 유니크 종목 크롤링 시작...")
    
    # 2. 종목별 종가 데이터 크롤링
    stock_prices = {}
    for idx, code in enumerate(all_codes, 1):
        if idx % 10 == 0:
            logging.info(f"크롤링 진행: {idx}/{len(all_codes)}...")
        
        closes = fetch_stock_closes_for_period(code, trading_days[0], trading_days[-1])
        if closes:
            stock_prices[code] = closes
        
        time.sleep(0.1)  # 차단 방지
    
    logging.info(f"크롤링 완료: {len(stock_prices)}개 종목")
    
    # 3. 주별로 그룹핑 (5일 = 1주)
    weeks = []
    for i in range(0, len(trading_days), 5):
        week_dates = trading_days[i:i+5]
        weeks.append(week_dates)
    
    # 4. 테마별 주간 수익률 계산
    theme_strengths = {}
    
    for theme_name, stocks in themes.items():
        theme_strengths[theme_name] = {}
        
        for week_idx, week_dates in enumerate(weeks):
            weekly_returns = []
            
            for stock_name, code in stocks:
                if code not in stock_prices:
                    continue
                
                prices = stock_prices[code]
                
                # 주초가와 주말가 구하기
                week_prices = [prices.get(d) for d in week_dates if d in prices]
                
                if len(week_prices) >= 2:
                    start_price = week_prices[0]
                    end_price = week_prices[-1]
                    
                    if start_price and end_price and start_price > 0:
                        ret = ((end_price - start_price) / start_price) * 100
                        weekly_returns.append(ret)
            
            # 평균 수익률
            if weekly_returns:
                avg_return = sum(weekly_returns) / len(weekly_returns)
            else:
                avg_return = 0.0
            
            theme_strengths[theme_name][f'week_{week_idx}'] = {
                'dates': week_dates,
                'return': round(avg_return, 2),
                'count': len(weekly_returns)
            }
    
    return theme_strengths


def build_calendar_snapshot(theme_strengths: Dict) -> Dict:
    """
    주간 강세 데이터를 달력 형태로 변환
    반환: {
        'calendar': [
            {'date': '2025.03.03', 'theme': '반도체장비', 'return': 2.5, 'day_of_month': 3},
            ...
        ],
        'updated_at': '2026-02-12T04:00:00+09:00'
    }
    """
    calendar = []
    
    for theme_name, weeks in theme_strengths.items():
        for week_key, week_data in weeks.items():
            # 강세 기준 이상이면 달력에 추가
            if week_data['return'] >= STRENGTH_THRESHOLD:
                for date_str in week_data['dates']:
                    dt = pd.to_datetime(date_str, format='%Y.%m.%d')
                    
                    calendar.append({
                        'date': date_str,
                        'theme': theme_name,
                        'return': week_data['return'],
                        'day_of_month': dt.day,
                        'month': dt.month,
                        'year': dt.year
                    })
    
    return {
        'calendar': calendar,
        'updated_at': datetime.datetime.now(tz=KST).isoformat()
    }


# save_snapshot, load_snapshot 함수는 더 이상 사용 안 함 (theme_365.json 직접 사용)


def is_snapshot_fresh(snapshot: Dict, max_age_hours: int = 24) -> bool:
    """스냅샷이 최신인지 확인 (24시간 이내)"""
    if not snapshot or 'updated_at' not in snapshot:
        return False
    
    try:
        updated = datetime.datetime.fromisoformat(snapshot['updated_at'])
        now = datetime.datetime.now(tz=KST)
        age = (now - updated).total_seconds() / 3600
        return age < max_age_hours
    except:
        return False


def generate_full_snapshot():
    """전체 테마 달력 스냅샷 생성 (최초 1회 또는 매일 업데이트)"""
    logging.info("=== 테마 달력 스냅샷 생성 시작 ===")
    
    # 1. 테마별 종목 로드
    themes = load_theme_stocks()
    if not themes:
        logging.error("테마 데이터가 없습니다.")
        return None
    
    # 테마 로드 완료 (로그 생략)
    
    # 2. 최근 260거래일 생성
    today = datetime.datetime.now(tz=KST).strftime('%Y.%m.%d')
    trading_days = get_trading_days(today, 260)
    
    # 3. 테마별 주간 강세 계산
    theme_strengths = calculate_theme_strength_by_week(themes, trading_days)
    
    # 4. 달력 형태로 변환
    snapshot = build_calendar_snapshot(theme_strengths)
    
    logging.info("=== 테마 달력 스냅샷 생성 완료 ===")
    return snapshot


def get_theme_calendar() -> Dict:
    """
    테마 달력 데이터 반환 (theme_365.json 사용)
    """
    if os.path.exists(THEME_365_FILE):
        try:
            with open(THEME_365_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # calendar 형태로 변환 (trading_days 포함)
            return {
                'calendar': data.get('strong_days', []),
                'trading_days': data.get('trading_days', []),
                'updated_at': datetime.datetime.now(tz=KST).isoformat(),
                'period': data.get('period', {})
            }
        except Exception as e:
            logging.error(f"테마 데이터 로드 실패: {e}")
    
    # 데이터 없으면 빈 결과
    return {
        'calendar': [],
        'trading_days': [],
        'updated_at': datetime.datetime.now(tz=KST).isoformat()
    }


def _next_kst_4am(now=None):
    """다음 KST 새벽 4시 시각 계산"""
    now = now or datetime.datetime.now(tz=KST)
    tgt = now.replace(hour=4, minute=0, second=0, microsecond=0)
    if now >= tgt:
        tgt = tgt + datetime.timedelta(days=1)
    return tgt


def start_theme_snapshot_daemon():
    """매일 KST 새벽 4시에 테마 달력 업데이트"""
    def _job():
        while True:
            try:
                # 대기
                target = _next_kst_4am()
                sleep_seconds = max(1, (target - datetime.datetime.now(tz=KST)).total_seconds())
                logging.info(f"테마 달력 데몬: 다음 업데이트까지 {sleep_seconds/3600:.1f}시간 대기")
                time.sleep(sleep_seconds)
                
                # 실행
                logging.info("테마 달력 일일 업데이트 시작 (KST 04:00)")
                generate_full_snapshot()
                
            except Exception as e:
                logging.error(f"테마 달력 데몬 에러: {e}")
                time.sleep(3600)  # 에러 시 1시간 후 재시도
    
    t = threading.Thread(target=_job, daemon=True)
    t.start()
    logging.info("테마 달력 데몬 시작됨 (매일 KST 04:00 업데이트)")


# ================= 현재 트렌드 (금주 TOP 5) =================

def get_current_week_top_themes(num_top: int = 3) -> List[Dict]:
    """
    현재 진행 중인 테마 TOP 반환
    """
    calendar_data = get_theme_calendar()
    if not calendar_data or not calendar_data.get('calendar'):
        return []
    
    strong_days = calendar_data['calendar']
    trading_days = calendar_data.get('trading_days', [])
    
    if not trading_days:
        return []
    
    # 최근 5일 데이터 (현재 진행 중)
    recent_dates = trading_days[-5:]
    recent_strong = [s for s in strong_days if s['date'] in recent_dates]
    
    # 테마별 집계
    theme_data = {}
    themes_dict = load_theme_stocks()
    
    for item in recent_strong:
        theme = item['theme']
        if theme not in theme_data:
            theme_data[theme] = {
                'dates': [],
                'returns': []
            }
        theme_data[theme]['dates'].append(item['date'])
        theme_data[theme]['returns'].append(item['avg_return'])
    
    # TOP N 계산
    result = []
    
    for theme, info in theme_data.items():
        # 연속 강세 일수 (전체 strong_days에서 계산)
        all_theme_dates = sorted([s['date'] for s in strong_days if s['theme'] == theme])
        
        streak = 0
        for date in reversed(trading_days):
            if date in all_theme_dates:
                streak += 1
            else:
                break
        
        # 진행 중인 테마만 (streak > 0)
        if streak == 0:
            continue
        
        avg_ret = sum(info['returns']) / len(info['returns'])
        stocks_list = [name for name, _ in themes_dict.get(theme, [])]  # 전체 종목
        
        result.append({
            'theme': theme,
            'streak': streak,
            'streak_return': round(avg_ret, 2),
            'stocks': stocks_list
        })
    
    # 연속 일수 순 정렬 (현재 가장 뜨거운 순)
    result.sort(key=lambda x: x['streak'], reverse=True)
    
    # TOP N + 순위 추가
    for i, item in enumerate(result[:num_top], 1):
        item['rank'] = i
    
    return result[:num_top]


# ================= 미래 예측 (단순 회귀) =================

def get_future_forecast() -> Dict:
    """
    미래 예측 (단기 앙상블 + 장기 계절성)
    """
    try:
        from theme_forecast import get_forecast
        return get_forecast()
    except Exception as e:
        logging.error(f"예측 로드 실패: {e}")
        return {
            'near': {
                'theme': '분석 중',
                'period': '준비 중',
                'confidence': 0,
                'model': 'Loading...'
            },
            'seasonal': []
        }


# ================= 일일/주간 갱신 데몬 =================

def daily_theme_update():
    """매일 새벽 4시: 최신 거래일 데이터 갱신"""
    logging.info("=== 테마 일일 갱신 시작 ===")
    
    try:
        # 1. JSON 로드
        with open(THEME_365_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        stock_prices = data['stock_prices']
        themes = {k: [(t[0], t[1]) for t in v] for k, v in data['themes'].items()}
        trading_days = data['trading_days']
        
        # 2. 주말이면 스킵 (토·일에는 전일 데이터도 이미 금요일 것이므로)
        today = datetime.datetime.now(tz=KST)
        if today.weekday() >= 5:
            logging.info("주말이라 크롤링 스킵")
            return
        
        # 3. 대표 종목 1개로 최신 거래일 탐지 (네이버에서 실제 최신 날짜 확인)
        all_codes = list(set(
            code for stocks in themes.values() for _, code in stocks
        ))
        
        latest_trading_date = None
        for probe_code in all_codes[:5]:  # 최대 5개까지 시도
            try:
                url = f"https://finance.naver.com/item/sise_day.nhn?code={probe_code}&page=1"
                response = shared_session.get(url, timeout=5)
                response.encoding = 'cp949'
                tables = pd.read_html(StringIO(response.text), encoding='cp949')
                if tables:
                    df = tables[0].dropna()
                    if not df.empty:
                        dt = pd.to_datetime(str(df.iloc[0]['날짜']).strip())
                        latest_trading_date = dt.strftime('%Y.%m.%d')
                        break
            except:
                continue
        
        if not latest_trading_date:
            logging.warning("최신 거래일 탐지 실패. 스킵")
            return
        
        logging.info(f"네이버 최신 거래일: {latest_trading_date}")
        
        # 4. 이미 수집된 날짜면 스킵
        if latest_trading_date in trading_days:
            logging.info(f"{latest_trading_date} 이미 존재, 스킵")
            return
        
        # 5. 모든 종목의 최신 거래일 종가 크롤링
        logging.info(f"{latest_trading_date} 크롤링 시작...")
        
        updated_count = 0
        for code in all_codes:
            try:
                url = f"https://finance.naver.com/item/sise_day.nhn?code={code}&page=1"
                response = shared_session.get(url, timeout=5)
                response.encoding = 'cp949'
                
                tables = pd.read_html(StringIO(response.text), encoding='cp949')
                if tables:
                    df = tables[0].dropna()
                    if not df.empty:
                        latest = df.iloc[0]
                        date_str = str(latest['날짜']).strip()
                        close = float(str(latest['종가']).replace(',', ''))
                        
                        dt = pd.to_datetime(date_str)
                        date_key = dt.strftime('%Y.%m.%d')
                        
                        if date_key == latest_trading_date:
                            if code not in stock_prices:
                                stock_prices[code] = {}
                            stock_prices[code][latest_trading_date] = close
                            updated_count += 1
                
                time.sleep(0.05)
            except:
                continue
        
        logging.info(f"크롤링 완료: {updated_count}개 종목")
        
        # 6. 실제 수집 성공 시에만 trading_days에 추가
        if updated_count == 0:
            logging.warning(f"{latest_trading_date} 가격 데이터 미수집. trading_days 추가 스킵")
            return
        
        trading_days.append(latest_trading_date)
        
        # 7. 290일 초과 시 오래된 데이터 삭제
        if len(trading_days) > 290:
            remove_date = trading_days.pop(0)
            logging.info(f"290일 초과: {remove_date} 삭제")
            
            for code in stock_prices:
                if remove_date in stock_prices[code]:
                    del stock_prices[code][remove_date]
        
        # 8. 슬라이딩 윈도우 재계산
        try:
            from theme_forecast import calculate_strong_days
            strong_days = calculate_strong_days(data)
            data['strong_days'] = strong_days
        except Exception as calc_err:
            logging.error(f"강세 재계산 실패: {calc_err}")
        
        # 9. 저장
        with open(THEME_365_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        logging.info(f"=== 테마 일일 갱신 완료 ({latest_trading_date}, {updated_count}종목) ===")
    
    except Exception as e:
        logging.error(f"일일 갱신 실패: {e}")
        import traceback
        logging.error(traceback.format_exc())


def weekly_theme_update():
    """매주 월요일 새벽 4시: 예측 재계산"""
    logging.info("=== 테마 주간 갱신 시작 ===")
    
    try:
        # 예측만 재계산 (데이터는 일일 갱신에서 처리됨)
        from theme_forecast import get_forecast
        forecast = get_forecast()
        
        logging.info(f"예측 업데이트: {forecast['near']['theme']} ({forecast['near']['confidence']}%)")
        logging.info("=== 테마 주간 갱신 완료 ===")
    
    except Exception as e:
        logging.error(f"주간 갱신 실패: {e}")


def _next_kst_4am_weekday(now=None):
    """다음 평일 새벽 4시"""
    now = now or datetime.datetime.now(tz=KST)
    target = now.replace(hour=4, minute=0, second=0, microsecond=0)
    
    if now >= target:
        target += datetime.timedelta(days=1)
    
    # 주말이면 월요일로
    while target.weekday() >= 5:
        target += datetime.timedelta(days=1)
    
    return target


def start_theme_snapshot_daemon():
    """테마 갱신 데몬 (매일 새벽 4시)"""
    def _job():
        while True:
            try:
                target = _next_kst_4am_weekday()
                sleep_seconds = max(1, (target - datetime.datetime.now(tz=KST)).total_seconds())
                logging.info(f"테마 갱신 대기: {sleep_seconds/3600:.1f}시간")
                time.sleep(sleep_seconds)
                
                # 일일 갱신
                daily_theme_update()
                
                # 월요일이면 주간 갱신도
                if datetime.datetime.now(tz=KST).weekday() == 0:
                    weekly_theme_update()
                
            except Exception as e:
                logging.error(f"테마 데몬 에러: {e}")
                time.sleep(3600)
    
    t = threading.Thread(target=_job, daemon=True)
    t.start()
    logging.info("테마 갱신 데몬 시작 (매일 새벽 4시)")


if __name__ == "__main__":
    # 테스트 실행
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
    
    print("테마 달력 생성 테스트...")
    snapshot = generate_full_snapshot()
    
    if snapshot:
        print(f"\n총 {len(snapshot['calendar'])}개 강세 구간 발견")
        print(f"업데이트 시각: {snapshot['updated_at']}")

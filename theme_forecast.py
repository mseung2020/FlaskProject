# theme_forecast_ensemble.py
# 앙상블 방식 단기 예측 (3가지 시그널 조합)

import json
import os
from datetime import datetime, timedelta
import numpy as np
from collections import Counter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_JSON = os.path.join(BASE_DIR, "data", "theme", "theme_365.json")

def load_data():
    """데이터 로드"""
    with open(DATA_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data['strong_days'], data['trading_days']

def calculate_strong_days(data):
    """슬라이딩 윈도우로 strong_days 재계산"""
    import statistics
    
    stock_prices = data['stock_prices']
    themes = {k: [(t[0], t[1]) for t in v] for k, v in data['themes'].items()}
    trading_days = data['trading_days']
    
    WINDOW_SIZE = 5
    AVG_RETURN_THRESHOLD = 2.0
    UP_RATIO_THRESHOLD = 0.75
    STD_DEV_THRESHOLD = 8.0
    MEDIAN_THRESHOLD = 1.2
    MIN_STOCKS = 5
    
    date_candidates = {}
    
    for i in range(len(trading_days) - WINDOW_SIZE + 1):
        window = trading_days[i:i+WINDOW_SIZE]
        start_date = window[0]
        end_date = window[-1]
        
        for theme_name, theme_stocks in themes.items():
            returns = []
            up_count = 0
            
            for name, code in theme_stocks:
                if code not in stock_prices:
                    continue
                
                start_price = stock_prices[code].get(start_date)
                end_price = stock_prices[code].get(end_date)
                
                if start_price and end_price and start_price > 0:
                    ret = (end_price - start_price) / start_price * 100
                    returns.append(ret)
                    if ret > 0:
                        up_count += 1
            
            if len(returns) < MIN_STOCKS:
                continue
            
            avg = statistics.mean(returns)
            up_ratio = up_count / len(returns)
            std_dev = statistics.stdev(returns) if len(returns) > 1 else 0
            median = statistics.median(returns)
            
            if (avg >= AVG_RETURN_THRESHOLD and
                up_ratio >= UP_RATIO_THRESHOLD and
                std_dev <= STD_DEV_THRESHOLD and
                median >= MEDIAN_THRESHOLD):
                
                for date in window:
                    if date not in date_candidates:
                        date_candidates[date] = []
                    date_candidates[date].append((theme_name, avg))
    
    # 겹침 해결
    strong_days = []
    for date, candidates in date_candidates.items():
        candidates.sort(key=lambda x: x[1], reverse=True)
        best_theme, best_return = candidates[0]
        
        strong_days.append({
            'date': date,
            'theme': best_theme,
            'avg_return': round(best_return, 2),
            'up_ratio': 80.0,
            'stocks_count': len(themes[best_theme])
        })
    
    return strong_days

# ================= 시그널 A: 사이클 간격 =================
def signal_cycle_interval(theme, theme_dates, today):
    """평균 사이클 간격 기반 예측"""
    if len(theme_dates) < 3:
        return None
    
    # 블록 찾기
    blocks = []
    current = [theme_dates[0]]
    
    for i in range(1, len(theme_dates)):
        prev = datetime.strptime(theme_dates[i-1], '%Y.%m.%d')
        curr = datetime.strptime(theme_dates[i], '%Y.%m.%d')
        
        if (curr - prev).days <= 3:
            current.append(theme_dates[i])
        else:
            blocks.append(current)
            current = [theme_dates[i]]
    blocks.append(current)
    
    if len(blocks) < 2:
        return None
    
    # 블록 간 간격
    gaps = []
    for i in range(1, len(blocks)):
        prev_end = datetime.strptime(blocks[i-1][-1], '%Y.%m.%d')
        curr_start = datetime.strptime(blocks[i][0], '%Y.%m.%d')
        gaps.append((curr_start - prev_end).days)
    
    avg_gap = np.mean(gaps)
    std_gap = np.std(gaps)
    
    # 마지막 블록 이후 경과
    last_end = datetime.strptime(blocks[-1][-1], '%Y.%m.%d')
    days_since = (today - last_end).days
    
    # 다음 예상
    next_expected = last_end + timedelta(days=int(avg_gap))
    days_until = (next_expected - today).days
    
    # 신뢰도 (변동계수)
    cv = std_gap / avg_gap if avg_gap > 0 else 999
    score = max(0, min(100, 100 - cv * 100))
    
    return {
        'days_until': days_until,
        'score': score,
        'reason': f'{int(avg_gap)}일 사이클'
    }

# ================= 시그널 B: 최근 모멘텀 =================
def signal_recent_momentum(theme, theme_dates, today, window=30):
    """최근 30일 강세 빈도 증가 추세"""
    
    # 최근 60일을 30일씩 나눠서 비교
    recent_60 = [d for d in theme_dates 
                 if (today - datetime.strptime(d, '%Y.%m.%d')).days <= 60]
    recent_30 = [d for d in theme_dates 
                 if (today - datetime.strptime(d, '%Y.%m.%d')).days <= 30]
    
    if len(recent_60) == 0:
        return None
    
    # 빈도 비교
    freq_60 = len(recent_60) / 60
    freq_30 = len(recent_30) / 30 if len(recent_30) > 0 else 0
    
    # 증가율
    if freq_60 == 0:
        return None
    
    momentum = (freq_30 / freq_60 - 1) * 100
    
    # 점수 (증가 중이면 높음)
    score = max(0, min(100, 50 + momentum * 2))
    
    return {
        'score': score,
        'momentum': momentum,
        'reason': f'최근 빈도 {"증가" if momentum > 0 else "감소"}'
    }

# ================= 시그널 C: 작년 동기 =================
def signal_year_ago(theme, theme_dates, today):
    """작년 이맘때 패턴"""
    
    # 작년 이맘때 (전후 15일)
    year_ago = today - timedelta(days=365)
    
    same_period_dates = []
    for d in theme_dates:
        dt = datetime.strptime(d, '%Y.%m.%d')
        diff = abs((dt - year_ago).days)
        
        if diff <= 15:
            same_period_dates.append(d)
    
    if len(same_period_dates) == 0:
        return None
    
    # 작년에 강세였으면 올해도 가능성
    score = min(100, len(same_period_dates) * 20)
    
    return {
        'score': score,
        'count': len(same_period_dates),
        'reason': f'작년 동기 {len(same_period_dates)}일 강세'
    }

# ================= 앙상블 =================
def ensemble_forecast(strong_days, top_n=3):
    """3가지 시그널 앙상블"""
    
    today = datetime.now()
    
    # 테마별 날짜 수집
    theme_dates = {}
    for item in strong_days:
        theme = item['theme']
        if theme not in theme_dates:
            theme_dates[theme] = []
        theme_dates[theme].append(item['date'])
    
    # 각 테마 점수 계산
    theme_scores = []
    
    for theme, dates in theme_dates.items():
        sorted_dates = sorted(dates)
        
        # 3가지 시그널
        sig_a = signal_cycle_interval(theme, sorted_dates, today)
        sig_b = signal_recent_momentum(theme, sorted_dates, today)
        sig_c = signal_year_ago(theme, sorted_dates, today)
        
        # 유효한 시그널만 앙상블
        signals = []
        weights = []
        reasons = []
        
        if sig_a and 0 < sig_a['days_until'] < 90:
            signals.append(sig_a['score'])
            weights.append(0.4)
            reasons.append(sig_a['reason'])
            days_until = sig_a['days_until']
        else:
            continue  # 사이클 기본 필수
        
        if sig_b:
            signals.append(sig_b['score'])
            weights.append(0.3)
            reasons.append(sig_b['reason'])
        
        if sig_c:
            signals.append(sig_c['score'])
            weights.append(0.3)
            reasons.append(sig_c['reason'])
        
        # 가중 평균
        total_weight = sum(weights)
        final_score = sum(s * w for s, w in zip(signals, weights)) / total_weight
        
        theme_scores.append({
            'theme': theme,
            'days_until': days_until,
            'confidence': int(final_score),
            'signals': len(signals),
            'reasons': reasons
        })
    
    # 신뢰도 높은 순
    theme_scores.sort(key=lambda x: x['confidence'], reverse=True)
    
    return theme_scores[:top_n]

# ================= 메인 =================
def get_forecast():
    """최종 예측"""
    strong_days, trading_days = load_data()
    
    # 단기 앙상블
    near_predictions = ensemble_forecast(strong_days, top_n=3)
    
    if near_predictions:
        best = near_predictions[0]
        days = best['days_until']
        
        # 시작 시점 (오늘)
        today = datetime.now()
        start_month = today.month
        start_week = (today.day - 1) // 7 + 1
        
        # 종료 시점 (예측일)
        end_date = today + timedelta(days=days)
        end_month = end_date.month
        end_week = (end_date.day - 1) // 7 + 1
        
        # 기간 표현
        period = f"{start_month}월 {start_week}주 ~ {end_month}월 {end_week}주"
        
        # 학술적 모델명
        if best['signals'] == 3:
            model_name = 'Multi-Signal Time Series'
        elif best['signals'] == 2:
            model_name = 'Recurrence Pattern Analysis'
        else:
            model_name = 'Periodicity Analysis'
        
        near_result = {
            'theme': best['theme'],
            'period': period,
            'confidence': best['confidence'],
            'model': model_name
        }
    else:
        near_result = {
            'theme': '예측 불가',
            'period': '데이터 부족',
            'confidence': 0,
            'model': 'Ensemble Analysis'
        }
    
    # 장기 계절성
    monthly_themes = {}
    for item in strong_days:
        month = datetime.strptime(item['date'], '%Y.%m.%d').month
        theme = item['theme']
        
        if month not in monthly_themes:
            monthly_themes[month] = Counter()
        monthly_themes[month][theme] += 1
    
    seasonal_result = []
    for i in range(1, 4):
        future_month = (datetime.now().month + i - 1) % 12 + 1
        
        if future_month in monthly_themes:
            top_theme = monthly_themes[future_month].most_common(1)[0]
            if top_theme[1] >= 2:
                seasonal_result.append({
                    'month': f'{future_month}월',
                    'theme': top_theme[0],
                    'color': '#74b9ff'
                })
                continue
        
        seasonal_result.append({
            'month': f'{future_month}월',
            'theme': '?',
            'color': '#ddd'
        })
    
    return {
        'near': near_result,
        'seasonal': seasonal_result
    }

if __name__ == "__main__":
    result = get_forecast()
    
    print("="*60)
    print("[단기 앙상블 예측]")
    print("="*60)
    print(f"테마: {result['near']['theme']}")
    print(f"시점: {result['near']['period']}")
    print(f"신뢰도: {result['near']['confidence']}%")
    print(f"모델: {result['near']['model']}")
    
    print("\n[장기 계절성]")
    for s in result['seasonal']:
        print(f"{s['month']}: {s['theme']}")
    
    # 저장
    with open('forecast_result.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print("\n✅ 저장 완료: forecast_result.json")

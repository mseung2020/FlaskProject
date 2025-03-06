import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# 절대 기준 점수 변환 함수
def apply_absolute_scoring(value, thresholds):
    """
    value: 입력 값 (재무 비율)
    thresholds: [(기준값, 점수), ...] 형태의 리스트
    """
    for threshold, score in thresholds:
        if value <= threshold:
            return score
    return thresholds[-1][1]  # 마지막 점수 반환

# 백분위 기준 점수 변환 함수
def apply_percentile_scoring(value, dataset):
    """
    value: 평가할 값
    dataset: 해당 재무비율의 전체 데이터 리스트
    """
    percentile = np.percentile(dataset, [10, 30, 50, 70, 90])
    scores = [0, 20, 40, 60, 80, 100]
    for i, p in enumerate(percentile):
        if value <= p:
            return scores[i]
    return 100

# 재무 데이터 입력 및 점수 계산 함수
def calculate_financial_scores(data):
    """
    data: Pandas DataFrame (기업별 재무 비율 포함)
    """
    scores = pd.DataFrame(index=data.index)
    
    # 안정성 점수 계산 (절대 기준 적용)
    scores['안정성'] = (
        apply_absolute_scoring(data['유동비율'], [(100, 0), (150, 50), (float('inf'), 100)]) +
        apply_absolute_scoring(data['당좌비율'], [(100, 0), (120, 50), (float('inf'), 100)]) +
        apply_absolute_scoring(data['부채비율'], [(200, 0), (150, 30), (100, 50), (50, 80), (float('-inf'), 100)]) +
        apply_absolute_scoring(data['이자보상배율'], [(1, 0), (3, 30), (5, 60), (float('inf'), 100)]) +
        apply_absolute_scoring(data['현금흐름이자보상배율'], [(1, 0), (3, 30), (5, 60), (float('inf'), 100)])
    ) / 5
    
    # 수익성 점수 계산 (절대 기준 적용)
    scores['수익성'] = (
        apply_absolute_scoring(data['ROE'], [(5, 0), (10, 20), (15, 40), (20, 60), (25, 80), (float('inf'), 100)]) +
        apply_absolute_scoring(data['ROA'], [(2, 0), (5, 40), (10, 70), (float('inf'), 100)]) +
        apply_absolute_scoring(data['매출총이익률'], [(10, 0), (20, 30), (30, 60), (float('inf'), 100)]) +
        apply_absolute_scoring(data['영업이익률'], [(5, 0), (10, 40), (15, 70), (float('inf'), 100)])
    ) / 4
    
    # 성장성 점수 계산 (백분위 기준 적용)
    scores['성장성'] = (
        apply_percentile_scoring(data['매출액증가율'], data['매출액증가율']) +
        apply_percentile_scoring(data['영업이익증가율'], data['영업이익증가율']) +
        apply_percentile_scoring(data['총자산증가율'], data['총자산증가율'])
    ) / 3
    
    # 활동성 점수 계산 (백분위 기준 적용)
    scores['활동성'] = (
        apply_percentile_scoring(data['총자산회전율'], data['총자산회전율']) +
        apply_percentile_scoring(data['순운전자본회전율'], data['순운전자본회전율']) +
        apply_percentile_scoring(data['매출채권회전율'], data['매출채권회전율']) +
        apply_percentile_scoring(data['재고자산회전율'], data['재고자산회전율'])
    ) / 4
    
    # 시장성 점수 계산 (절대 기준 적용)
    scores['시장성'] = (
        apply_absolute_scoring(data['PER'], [(5, 100), (10, 80), (20, 60), (30, 40), (float('inf'), 0)]) +
        apply_absolute_scoring(data['PBR'], [(1, 100), (2, 80), (3, 50), (float('inf'), 0)]) +
        apply_absolute_scoring(data['EV/EBITDA'], [(5, 100), (10, 70), (15, 40), (float('inf'), 0)])
    ) / 3
    
    return scores

# 5각형 차트 그리기 함수
def plot_radar_chart(scores, company_name):
    labels = scores.columns
    values = scores.loc[company_name].tolist()
    values += values[:1]  # 데이터 닫기
    
    angles = np.linspace(0, 2 * np.pi, len(labels) + 1)
    
    fig, ax = plt.subplots(figsize=(6, 6), subplot_kw={'projection': 'polar'})
    ax.fill(angles, values, color='blue', alpha=0.25)
    ax.plot(angles, values, color='blue', linewidth=2)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, fontsize=12)
    ax.set_ylim(0, 100)
    ax.set_title(f"{company_name} 재무비율 분석", fontsize=14, fontweight='bold')
    plt.show()

# 사용 예시 (데이터는 직접 추가 필요)
# df = pd.read_csv('your_financial_data.csv')
# scores = calculate_financial_scores(df)
# plot_radar_chart(scores, '기업명')

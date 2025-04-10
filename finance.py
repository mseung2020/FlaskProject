import os
import pandas as pd
import requests
import numpy as np
from bs4 import BeautifulSoup
import io
from concurrent.futures import ThreadPoolExecutor

def get_financial_indicators(code):
    # 세션을 사용하면 여러 요청 간 연결을 재사용할 수 있어 효율적입니다.
    session = requests.Session()
    
    # 내부 함수: URL에서 해당 table_index의 표를 불러와 필요한 열만 선택
    def get_dataframe(url, table_index, col_start, num_cols=3, soup_cache=None):
        # 이미 가져온 BeautifulSoup 객체가 있다면 재사용
        if soup_cache is None:
            res = session.get(url)
            soup = BeautifulSoup(res.content, 'lxml')
        else:
            soup = soup_cache
        
        tables = soup.find_all('table')
        df = pd.read_html(io.StringIO(str(tables[table_index])))[0]
        
        # 첫 번째 열(항목)과 지정된 범위의 열 선택
        start = df.shape[1] + col_start if col_start < 0 else col_start
        selected_cols = [0] + list(range(start, start + num_cols))
        # 중복 제거: 순서를 유지하면서 처리
        seen = set()
        unique_selected_cols = [col for col in selected_cols if not (col in seen or seen.add(col))]
        
        df = df.iloc[:, unique_selected_cols]
        df.columns = ['항목'] + [f'값{i}' for i in range(1, len(unique_selected_cols))]
        # 항목 열에서 불필요한 문자열 제거
        df['항목'] = df['항목'].str.replace('계산에 참여한 계정 펼치기', '', regex=False)\
                                .str.replace('(원)', '', regex=False)\
                                .str.strip()
        return df

    # 종목코드를 "A" 접두어와 함께 사용
    gicode = "A" + code

    # 첫 번째 URL('finance')를 제거하고 나머지 URL만 관리합니다.
    urls = {
        'finance_ratio': f"https://comp.fnguide.com/SVO2/ASP/SVD_FinanceRatio.asp?pGB=1&gicode={gicode}&cID=&MenuYn=Y&ReportGB=&NewMenuID=104&stkGb=701",
        'invest': f"https://comp.fnguide.com/SVO2/ASP/SVD_Invest.asp?pGB=1&gicode={gicode}&cID=&MenuYn=Y&ReportGB=&NewMenuID=105&stkGb=701"
    }
    
    # 각 URL에 대해 BeautifulSoup 객체를 미리 가져와 캐시합니다.
    from concurrent.futures import ThreadPoolExecutor  # 파일 상단에 추가

    with ThreadPoolExecutor(max_workers=7) as executor:
        futures = { key: executor.submit(session.get, url, timeout=10) for key, url in urls.items() }
        responses = { key: future.result() for key, future in futures.items() }
    soups = { key: BeautifulSoup(response.content, 'lxml') for key, response in responses.items() }

    
    # 각 표를 가져올 때 캐시한 soup를 전달하여 중복 요청을 줄입니다.
    df_finance_ratio = get_dataframe(urls['finance_ratio'], 0, -3, soup_cache=soups['finance_ratio'])
    df_invest = get_dataframe(urls['invest'], 1, -3, soup_cache=soups['invest'])
    
    # 두 데이터프레임을 합칩니다.
    df_final = pd.concat([df_finance_ratio, df_invest], ignore_index=True)
    df_final = df_final.replace({np.nan: None, np.inf: None, -np.inf: None})
    
    # 관심 있는 11개 지표 순서대로 필터링
    indicators = ['부채비율', '유보율', '매출액증가율', 'EPS증가율', 'ROA', 'ROE', 'EPS', 'BPS', 'PER', 'PBR', 'EV/EBITDA']
    df_filtered = df_final[df_final['항목'].isin(indicators)]
    
    result = {}
    for indicator in indicators:
        row = df_filtered[df_filtered['항목'] == indicator]
        if not row.empty:
            # '값1', '값2', '값3'의 값을 리스트로 반환
            values = [row.iloc[0].get(col, None) for col in ['값1', '값2', '값3']]
            result[indicator] = values
        else:
            result[indicator] = [None, None, None]

    return result

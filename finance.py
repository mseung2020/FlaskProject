import os
import pandas as pd
import requests
import numpy as np
from bs4 import BeautifulSoup
import io
from concurrent.futures import ThreadPoolExecutor


from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def make_retry_session(
    retries=3,
    backoff_factor=0.3,
    status_forcelist=(500, 502, 503, 504),
):
    session = requests.Session()
    retry = Retry(
        total=retries,
        read=retries,
        connect=retries,
        backoff_factor=backoff_factor,
        status_forcelist=status_forcelist,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

def get_financial_indicators(code, session=None):
    # 세션이 없으면 새로 생성
    session = session or make_retry_session()

    # 내부 함수: URL에서 해당 table_index의 표를 불러와 필요한 열만 선택
    def get_dataframe(url, table_index, col_start, num_cols=3, soup_cache=None):
        if soup_cache is None:
            res = session.get(url, timeout=10)
            soup = BeautifulSoup(res.content, 'lxml')
        else:
            soup = soup_cache

        tables = soup.find_all('table')
        df = pd.read_html(io.StringIO(str(tables[table_index])))[0]

        start = df.shape[1] + col_start if col_start < 0 else col_start
        selected_cols = [0] + list(range(start, start + num_cols))
        seen = set()
        unique_selected_cols = [col for col in selected_cols if not (col in seen or seen.add(col))]

        df = df.iloc[:, unique_selected_cols]
        df.columns = ['항목'] + [f'값{i}' for i in range(1, len(unique_selected_cols))]
        df['항목'] = df['항목'].str.replace('계산에 참여한 계정 펼치기', '', regex=False)\
                                .str.replace('(원)', '', regex=False)\
                                .str.strip()
        return df

    gicode = "A" + code
    urls = {
        'finance_ratio': f"https://comp.fnguide.com/SVO2/ASP/SVD_FinanceRatio.asp?pGB=1&gicode={gicode}&cID=&MenuYn=Y&ReportGB=&NewMenuID=104&stkGb=701",
        'invest': f"https://comp.fnguide.com/SVO2/ASP/SVD_Invest.asp?pGB=1&gicode={gicode}&cID=&MenuYn=Y&ReportGB=&NewMenuID=105&stkGb=701"
    }

    with ThreadPoolExecutor(max_workers=7) as executor:
        futures = { key: executor.submit(session.get, url, timeout=10) for key, url in urls.items() }
        responses = { key: future.result() for key, future in futures.items() }
    soups = { key: BeautifulSoup(response.content, 'lxml') for key, response in responses.items() }

    df_finance_ratio = get_dataframe(urls['finance_ratio'], 0, -3, soup_cache=soups['finance_ratio'])
    df_invest = get_dataframe(urls['invest'], 1, -3, soup_cache=soups['invest'])

    df_final = pd.concat([df_finance_ratio, df_invest], ignore_index=True)
    df_final = df_final.replace({np.nan: None, np.inf: None, -np.inf: None})

    ratio_indicators = ['부채비율', '유보율', '매출액증가율', 'EPS증가율', 'ROA', 'ROE', 'EPS', 'BPS', 'PER', 'PBR', 'EV/EBITDA']
    result = {key: [None, None, None] for key in ratio_indicators}

    # 한 번만 필터링하여 result에 채움
    for _, row in df_final.iterrows():
        항목 = row['항목']
        if 항목 in result:
            result[항목] = [row.get(f'값{i}', None) for i in range(1, 4)]

    return result
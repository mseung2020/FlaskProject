import os
import pandas as pd
import requests
import numpy as np
from bs4 import BeautifulSoup
import io
from concurrent.futures import ThreadPoolExecutor

def get_cashflow_data(code, session=None):
    # 세션이 없으면 새로 생성
    session = session or requests.Session()

    def get_dataframe(url, table_index, col_start, num_cols=4, soup_cache=None):
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
    url = f"https://comp.fnguide.com/SVO2/asp/SVD_Finance.asp?pGB=1&gicode={gicode}&cID=&MenuYn=Y&ReportGB=&NewMenuID=103&stkGb=701"

    try:
        res = session.get(url, timeout=10)
        res.raise_for_status()  # 4xx/5xx 에러도 예외로 만들기
    except requests.exceptions.RequestException:
        return {
            "영업활동으로인한현금흐름": [None]*4,
            "투자활동으로인한현금흐름": [None]*4,
            "재무활동으로인한현금흐름": [None]*4
        }

    soup = BeautifulSoup(res.content, 'lxml')
    df_cashflow = get_dataframe(url, 4, -4, num_cols=4, soup_cache=soup)

    cashflow_indicators = ['영업활동으로인한현금흐름', '투자활동으로인한현금흐름', '재무활동으로인한현금흐름']
    result = {key: [None] * 4 for key in cashflow_indicators}

    for _, row in df_cashflow.iterrows():
        항목 = row['항목']
        if 항목 in result:
            result[항목] = [row.get(f'값{i}', None) for i in range(1, 5)]

    return result
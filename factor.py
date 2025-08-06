import os
import pandas as pd
import datetime
import requests
from bs4 import BeautifulSoup
from collections import defaultdict
from io import StringIO
from concurrent.futures import ThreadPoolExecutor
from functools import partial

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FACTOR_DIR = os.path.join(SCRIPT_DIR, 'data', 'factors')
STOCK_LIST_FILE = os.path.join(SCRIPT_DIR, 'data', 'stock_list.csv')

def load_stock_list():
    df = pd.read_csv(STOCK_LIST_FILE)
    stock_dict = dict(zip(df['회사명'], df['종목코드'].astype(str).str.zfill(6)))
    return stock_dict

def get_selected_companies(file_indices, condition_type):
    condition_type = condition_type.upper()
    
    company_sets = []
    for index in file_indices:
        file_path = os.path.join(FACTOR_DIR, f'factor{index}.xlsx')
        if os.path.exists(file_path):
            df = pd.read_excel(file_path)
            companies = set(df.iloc[:, 0].dropna().astype(str).str.strip())
            company_sets.append(companies)

    if not company_sets:
        return set()

    if condition_type == "AND":
        return set.intersection(*company_sets)
    else:
        return set.union(*company_sets)

session = requests.Session()
session.headers.update({'User-Agent': 'Mozilla/5.0'})

def fetch_prices(code, months_ago, session):
    page_dict = {3: 7, 6: 13, 9: 19, 12: 25}
    page = page_dict.get(months_ago, 7)

    try:
        url_current = f"https://finance.naver.com/item/sise.naver?code={code}"
        response_current = session.get(url_current, timeout=5)
        soup = BeautifulSoup(response_current.text, 'html.parser')
        price_tag = soup.select_one("strong#_nowVal")
        current_price = int(price_tag.text.replace(',', '')) if price_tag else None

        url_past = f"https://finance.naver.com/item/sise_day.naver?code={code}&page={page}"
        response_past = session.get(url_past, timeout=5)
        df_past = pd.read_html(StringIO(response_past.text), header=0)[0]
        df_past = df_past.dropna()
        past_price = int(df_past.iloc[0]['종가']) if not df_past.empty else None

        return (code, current_price, past_price)
    except Exception as e:
        print(f"[ERROR] {code}: {e}")
        return (code, None, None)
    
def get_stock_prices(codes, months_ago):
    results = []
    session = requests.Session()
    session.headers.update({'User-Agent': 'Mozilla/5.0'})

    fetch_fn = partial(fetch_prices, months_ago=months_ago, session=session)

    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(fetch_fn, codes))
    
    session.close()
    return results


def calculate_avg_return(prices):
    returns = []
    for code, current, past in prices:
        if current is not None and past is not None and past != 0:
            rate = ((current - past) / past) * 100
            returns.append(rate)
    if returns:
        return round(sum(returns) / len(returns), 2), returns
    else:
        return None, []

def generate_condition_text(selected_names, duration, mode):
    quoted_names = [f'"{name}"' for name in selected_names]
    joined = "이고" if mode == "AND" else "또는"
    label = f'{duration}개월 동안 ' + f' {joined} '.join(quoted_names) + " 기업의 평균 수익률은?"
    return label

def process_factor_data(file_indices, condition_mode, duration_months):
    # 기업명 수집
    selected_companies = get_selected_companies(file_indices, condition_mode)

    # 종목코드 매칭
    stock_dict = load_stock_list()
    matched = {name: stock_dict.get(name) for name in selected_companies}
    matched = {k: v for k, v in matched.items() if v}

    # 가격 데이터 크롤링
    price_data = get_stock_prices(matched.values(), duration_months)

    # 평균 수익률 계산
    avg_return, all_returns = calculate_avg_return(price_data)
    
    # 기업별 수익률 정리
    code_to_name = {v: k for k, v in matched.items()}
    company_returns = []
    for (code, current, past) in price_data:
        if current is not None and past is not None and past != 0:
            name = code_to_name.get(code)
            if name:
                rate = ((current - past) / past) * 100
                company_returns.append({"name": name, "return": round(rate, 2)})
                
    factor_names_full = [
        "젊은 CEO·대표",
        "연세대 졸업 CEO·대표",
        "고려대 졸업 CEO·대표",
        "대학생 선호 상위",
        "브랜드 평판 상위",
        "환경 점수 A이상",
        "사회 점수 A이상",
        "지배구조 점수 A이상",
        "특허자산지수 상위",
        "임·직원수 상위",
        "서울시 소재",
        "상장 연도 오래된순",
        "사내 카페 보유",
        "외국인 보유비율 상위",
        "자사주 보유비율 상위"
    ]
    
    selected_names = [factor_names_full[i - 1] for i in file_indices]

    # 설명 텍스트 생성
    condition_text = generate_condition_text(selected_names, duration_months, condition_mode)

    return {
        "average_return": avg_return,
        "condition_text": condition_text,
        "companies": sorted(matched.keys()),
        "company_returns": company_returns,
        "selected_names": selected_names,
        "months": duration_months,
        "mode": condition_mode.upper()
    }

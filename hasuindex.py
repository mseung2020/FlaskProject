import os
import pandas as pd
import requests
import datetime
import re
import logging
from bs4 import BeautifulSoup
from soynlp.tokenizer import LTokenizer
from concurrent.futures import ThreadPoolExecutor

# ------------------ 전역 설정 ------------------
MAX_PAGES = 10
# MIN_DATE: 최근 7일간의 댓글만 크롤링
MIN_DATE = datetime.datetime.now() - datetime.timedelta(days=7)

# 데이터 저장 경로 설정 및 디렉토리 생성
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

# 감성 어휘 파일 경로
POS_WORDS_FILE = os.path.join(SCRIPT_DIR, 'data', 'pos_pol_word.txt')
NEG_WORDS_FILE = os.path.join(SCRIPT_DIR, 'data', 'neg_pol_word.txt')

# ------------------ 정규표현식 미리 컴파일 ------------------
PATTERN_DELETED = re.compile(r'\[삭제된 게시물의 답글\]')
PATTERN_NON_KOREAN = re.compile(r'[^가-힣\s]')
PATTERN_MULTISPACE = re.compile(r'\s+')

# ------------------ 감성 어휘 목록 로드 (헤더, 설명 줄 필터링 적용) ------------------
def load_sentiment_words():
    try:
        with open(POS_WORDS_FILE, 'r', encoding='utf8') as f:
            pos_words = set(line.strip() for line in f if line.strip() and not line.startswith("극성") and ':' not in line)
        with open(NEG_WORDS_FILE, 'r', encoding='utf8') as f:
            neg_words = set(line.strip() for line in f if line.strip() and not line.startswith("극성") and ':' not in line)
        return pos_words, neg_words
    except Exception as e:
        logging.error(f"감성 단어 파일 로드 오류: {e}")
        return set(), set()

# ------------------ 간단한 토크나이저 설정 (soynlp의 LTokenizer 사용) ------------------
tokenizer = LTokenizer()

# ------------------ 댓글 크롤링 ------------------
def get_comment_page(code, page, min_date):
    url = f'https://finance.naver.com/item/board.naver?code={code}&page={page}'
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    try:
        res = requests.get(url, headers=headers, timeout=10)
        res.raise_for_status()
    except Exception as e:
        logging.error(f"페이지 요청 오류 (code: {code}, page: {page}): {e}")
        return pd.DataFrame(), False

    soup = BeautifulSoup(res.text, 'html.parser')
    rows = soup.find_all('tr', {'onmouseover': 'mouseOver(this)'})
    
    date_list, comment_list, view_list, good_list, bad_list = [], [], [], [], []
    stop_flag = False

    for row in rows:
        try:
            cells = row.find_all('td')
            if len(cells) < 6:
                continue
            date_str = cells[0].get_text(strip=True)
            comment_date = datetime.datetime.strptime(date_str, "%Y.%m.%d %H:%M")
            if comment_date < min_date:
                stop_flag = True
                break
            date_list.append(date_str)
            comment_list.append(cells[1].get_text(strip=True))
            view_list.append(cells[3].get_text(strip=True))
            good_list.append(cells[4].get_text(strip=True))
            bad_list.append(cells[5].get_text(strip=True))
        except Exception as e:
            logging.error(f"댓글 처리 중 오류: {e}")
            continue

    df = pd.DataFrame({
        '날짜': date_list,
        '댓글': comment_list,
        '조회수': view_list,
        '좋아요': good_list,
        '싫어요': bad_list
    })
    return df, stop_flag

def get_all_comments(code, max_pages, min_date):
    with ThreadPoolExecutor(max_workers=7) as executor:
        futures = [executor.submit(get_comment_page, code, page, min_date) for page in range(1, max_pages + 1)]
        results = [f.result() for f in futures]
    
    all_comments = []
    for df_page, stop_flag in results:
        if not df_page.empty:
            all_comments.append(df_page)
        if stop_flag:
            break
    return pd.concat(all_comments, ignore_index=True) if all_comments else pd.DataFrame()

# ------------------ 댓글 정제 ------------------
def clean_comments(df):
    def clean_text(x):
        # 삭제 문구, 한글 이외 문자 제거, 다중 공백 정리 순차 적용
        text = PATTERN_DELETED.sub(' ', x)
        text = PATTERN_NON_KOREAN.sub(' ', text)
        text = PATTERN_MULTISPACE.sub(' ', text).strip()
        return text
    df['정제된 댓글'] = df['댓글'].apply(clean_text)
    return df[df['정제된 댓글'].str.len() > 1]

# ------------------ 간단한 명사 추출 (토큰화) ------------------
def extract_nouns_simple(comment):
    # LTokenizer를 사용하여 토큰화 후 길이가 2 이상인 토큰만 반환
    tokens = tokenizer.tokenize(comment)
    return [token for token in tokens if len(token) > 1]

# ------------------ 감성 어휘 목록에서 정규표현식 패턴 생성 ------------------
def compile_vocab_regex(vocab):
    sorted_vocab = sorted(vocab, key=len, reverse=True)
    pattern = r'\b(' + '|'.join(re.escape(word) + r'\w*' for word in sorted_vocab) + r')\b'
    return re.compile(pattern)

# ------------------ 감성 분석 및 라벨링 (정규표현식 방식) ------------------
def label_comments(df, pos_words, neg_words):
    pos_regex = compile_vocab_regex(pos_words)
    neg_regex = compile_vocab_regex(neg_words)
    
    labels = []
    matched_tokens_list = []  # 각 댓글별 매칭된 토큰 저장
    
    for comment in df['정제된 댓글']:
        pos_matches = pos_regex.findall(comment)
        neg_matches = neg_regex.findall(comment)
        score = len(pos_matches) - len(neg_matches)
        
        if score > 0:
            labels.append(2)  # 긍정
        elif score < 0:
            labels.append(0)  # 부정
        else:
            labels.append(1)  # 중립
        
        matched_tokens_list.append({
            'positive': pos_matches,
            'negative': neg_matches
        })
    
    df['label'] = labels
    df['매칭된 토큰'] = matched_tokens_list
    return df

# ------------------ 가중치 적용 감성 계산 (댓글별 좋아요/싫어요 반영) ------------------
def calculate_weighted_sentiment(df):
    # '좋아요'와 '싫어요'를 정수로 변환 (콤마 제거)
    df['좋아요'] = df['좋아요'].apply(lambda x: int(x.replace(',', '')) if x.replace(',', '').isdigit() else 0)
    df['싫어요'] = df['싫어요'].apply(lambda x: int(x.replace(',', '')) if x.replace(',', '').isdigit() else 0)
    
    pos_score = 0
    neg_score = 0
    neutral_count = 0
    for _, row in df.iterrows():
        if row['label'] == 2:  # 긍정
            pos_score += row['좋아요'] + 1
        elif row['label'] == 0:  # 부정
            neg_score += row['싫어요'] + 1
        elif row['label'] == 1:  # 중립
            neutral_count += 1
            
    total = pos_score + neg_score + neutral_count
    if total == 0:
        return {'positive': 0, 'negative': 0, 'neutral': 0}
    
    return {
        'positive': round((pos_score / total) * 100, 2),
        'negative': round((neg_score / total) * 100, 2),
        'neutral': round((neutral_count / total) * 100, 2)
    }

# ------------------ 감성 지수 계산 함수 ------------------
def get_sentiment_index(code):
    try:
        df_comments = get_all_comments(code, MAX_PAGES, MIN_DATE)
        if df_comments.empty:
            raise ValueError("댓글 데이터가 없습니다.")
        
        pos_words, neg_words = load_sentiment_words()
        df_comments = clean_comments(df_comments)
        df_comments = label_comments(df_comments, pos_words, neg_words)
        
        # 디버깅용: 토큰과 라벨 정보를 CSV로 저장
        df_comments[['정제된 댓글', '매칭된 토큰', 'label']].to_csv(os.path.join(DATA_DIR, 'tokens.csv'), index=False, encoding='utf-8-sig')
        
        sentiment_result = calculate_weighted_sentiment(df_comments)
        return sentiment_result
    except Exception as e:
        logging.error(f"감성 지수 처리 중 오류 (code: {code}): {e}")
        return {'error': str(e)}

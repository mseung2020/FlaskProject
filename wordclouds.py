import concurrent.futures
import requests
from bs4 import BeautifulSoup
from collections import Counter
import re
from io import BytesIO
from wordcloud import WordCloud
import matplotlib
import matplotlib.pyplot as plt

# matplotlib 한글 및 마이너스 기호 설정
matplotlib.rcParams['font.family'] = 'Malgun Gothic'
matplotlib.rcParams['axes.unicode_minus'] = False

def get_stock_name(code: str) -> str:
    """
    종목 메인 페이지(https://finance.naver.com/item/main.naver?code=...)에서
    해당 종목의 이름을 파싱해 반환한다.
    """
    main_url = "https://finance.naver.com/item/main.naver"
    params = {"code": code}
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/115.0.0.0 Safari/537.36"
        )
    }
    
    try:
        resp = requests.get(main_url, headers=headers, params=params, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        wrap_company = soup.find("div", class_="wrap_company")
        if wrap_company:
            h2_tag = wrap_company.find("h2")
            if h2_tag and h2_tag.text.strip():
                return h2_tag.get_text(strip=True)
        return "종목명_불명"
    except Exception as e:
        print(f"[get_stock_name] 오류 발생: {e}")
        return "종목명_오류"

def fetch_news_text(code: str, page: int) -> str:
    """
    https://finance.naver.com/item/news_news.naver 에서
    'td.title'(기사제목)와 'td.date'(날짜)만 추출.
    """
    url = "https://finance.naver.com/item/news_news.naver"
    params = {
        "code": code,
        "page": page,
        "clusterId": "",
        "listType": "L"
    }
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/115.0.0.0 Safari/537.36"
        ),
        "Referer": f"https://finance.naver.com/item/news.naver?code={code}&page=1"
    }
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        news_table = soup.find("table", {"class": "type5", "summary": "종목뉴스의 제목, 정보제공, 날짜"})
        if not news_table:
            print(f"[페이지 {page}] 뉴스 테이블을 찾지 못했습니다.")
            return ""
        
        rows = news_table.find("tbody").find_all("tr")
        collected_texts = []
        for row in rows:
            title_td = row.find("td", class_="title")
            date_td = row.find("td", class_="date")
            if not title_td:
                continue
            title_text = title_td.get_text(separator=" ", strip=True)
            date_text = date_td.get_text(separator=" ", strip=True) if date_td else ""
            combined = f"{title_text} {date_text}"
            collected_texts.append(combined)
        
        page_text = " ".join(collected_texts)
        print(f"[페이지 {page}] 크롤링 완료.")
        return page_text
    
    except Exception as e:
        print(f"[페이지 {page}] 오류 발생: {e}")
        return ""

def is_korean_or_english(word):
    """한글과 영어로만 구성된 단어인지 확인."""
    return bool(re.fullmatch(r'[a-zA-Z\uac00-\ud7a3]+', word))

def generate_wordcloud(stock_code: str, num_pages: int = 10) -> tuple[str, BytesIO]:
    stock_name = get_stock_name(stock_code)

    # 동시성(멀티스레드) 조정: 기존 max_workers=10 -> 5
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        texts = list(executor.map(lambda p: fetch_news_text(stock_code, p), range(1, num_pages + 1)))

    all_text = " ".join(texts)
    words = re.findall(r'\b\w+\b', all_text)
    
    # 기존 stop_words + stock_name 등
    stop_words = { "종목뉴스", "제목", "정보제공", "날짜", "최근", "1년", "내", "검색된", "뉴스가", "없습니다", 
                    "더보기", "연관기사", "목록", "관련뉴스", "연합뉴스", "헤럴드경제", "서울경제", "뉴시스", "뉴스",
                    "이데일리", "코스피", "코스닥", "동영상기사", "매일경제", "이벤트", "머니투데이", "파이낸셜뉴스",
                    "아시아경제", "발행", "결정", "연간", "등록", "규모", "건", "뉴스1", "더", "동아일보", "한국경제",
                    "첫", "데일리안", "조선비즈", "기술", "기관", "외인", "외국인", "상승", "하락", "보합", "마감",
                    "회복", "출발", "반환", "개발", "개인", "장중", "가", "각", "간", "것", "결국", "경우", "그", "그것", "그대로", "그동안", "그런", "그러나", "그리고", "그에", "그의", "그저", "그중", "기자", "기준", "기타", "까지", "나", "나름", "내", "너", "는", "다", "다른", "다만", "단", "당시", "대", "대한", "더", "더욱", "도", "또", "또는", "때", "때문", "라", "로", "를", "만", "만약", "매우", "먼저", "몇", "모든", "무엇", "및", "바로", "반면", "별로", "보다", "본", "부", "부터", "뿐", "사실", "상대", "새", "생각", "소위", "수", "순간", "시", "실제", "아", "아니", "아래", "아이", "아주", "안", "앞", "약간", "양", "어느", "어떤", "어떻게", "언제", "얼마나", "여기", "여러", "여보세요", "여부", "역시", "연", "영", "예", "오", "오히려", "와", "왜", "외", "요", "요즘", "우리", "원", "위", "유", "으로", "을", "의", "이", "이것", "이곳", "이날", "이대로", "이런", "이렇게", "이후", "인", "일", "일부", "자", "자기", "잘", "저", "전", "전부", "전혀", "절대", "점", "정도", "제", "조", "조차", "좀", "주", "줄", "중", "즉", "지", "지금", "지속", "진짜", "쪽", "참", "참고", "채", "처음", "체", "초", "총", "최", "최고", "최근", "추가", "추진", "측", "치", "친구", "카", "코", "타", "타인", "터", "테", "토", "통해", "특히", "팀", "파", "퍼", "편", "평균", "포", "표", "프로", "하", "하나", "하더라도", "하도", "하루", "하마터면", "하물며", "하지만", "한", "한데", "한마디", "한번", "한순간", "한편", "할", "함", "합", "항상", "해", "해도", "해서", "해야", "행", "향", "허", "헉", "헐", "형", "혹", "혹시", "혼자", "후", "후보", "훨씬", "휴", "흐", "흑", "흥", "힘", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
                    }
    stop_words.add(stock_name)

    # 필터링
    filtered_words = [
        w for w in words
        if w not in stop_words
        and not w.isdigit()
        and is_korean_or_english(w)
    ]
    word_counts = Counter(filtered_words)

    # 극저빈도(예: 2회 미만) 제거해 그릴 단어만 추린다
    # ==> '불필요한 기능 제한'의 연장선: 최종 렌더링 단어 줄이기
    min_freq = 2
    filtered_counts = {word: cnt for word, cnt in word_counts.items() if cnt >= min_freq}
    if not filtered_counts:
        # (fallback 이미지 생성 로직 등 기존과 동일)
        ...

    try:
        font_path = r"C:\WINDOWS\FONTS\MALGUNSL.TTF"

        # 불필요한 기능 제한: collocations=False, max_words=200 (원하는 숫자로)
        wc = WordCloud(
            font_path=font_path,
            background_color="white",
            width=1200,
            height=400,
            collocations=False,  # 'New York' 등의 연결어 한 덩어리 처리 X
            max_words=100        # 너무 많은 단어 제한
        )
        wc.generate_from_frequencies(filtered_counts)

        img_io = BytesIO()
        wc.to_image().save(img_io, format='PNG')
        img_io.seek(0)
        return stock_name, img_io

    except Exception as e:
        print(f"[generate_wordcloud] 워드클라우드 생성 오류: {e}")
        raise e
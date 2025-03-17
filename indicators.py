import numpy as np
import pandas as pd
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def _prepare_df(df):
    """
    입력된 DataFrame을 '날짜' 기준으로 오름차순 정렬한 후 복사본을 반환합니다.
    """
    try:
        df_sorted = df.sort_values(by='날짜', ascending=True).copy()
        
        # (1) 종가가 0이면 np.nan으로 바꾸고, 그걸 이전 유효값으로 채움
        df_sorted['종가'].replace(0, np.nan, inplace=True)
        df_sorted['종가'].ffill(inplace=True)  # forward fill

        # (2) 시가/고가/저가가 0이면, 그 날짜의 종가로 대체
        #     (이미 종가가 0이었던 경우는 위에서 직전 유효 종가로 바뀌었을 것)
        mask_open = (df_sorted['시가'] == 0)
        df_sorted.loc[mask_open, '시가'] = df_sorted.loc[mask_open, '종가']

        mask_high = (df_sorted['고가'] == 0)
        df_sorted.loc[mask_high, '고가'] = df_sorted.loc[mask_high, '종가']

        mask_low = (df_sorted['저가'] == 0)
        df_sorted.loc[mask_low, '저가'] = df_sorted.loc[mask_low, '종가']
        
        return df_sorted
    except Exception as e:
        logging.error("데이터프레임 정렬 오류: %s", e)
        raise

def calculate_ma(df, p1=5, p2=20, p3=60, p4=120):
    """
    이동평균선(MA)을 계산합니다.
    - p1: 단기 (5일)
    - p2: 중기 (20일)
    - p3: 장기 (60일)
    - p4: 장기 (120일)
    """
    df = _prepare_df(df)
    try:
        df['ma5'] = df['종가'].rolling(window=p1, min_periods=p1).mean()
        df['ma20'] = df['종가'].rolling(window=p2, min_periods=p2).mean()
        df['ma60'] = df['종가'].rolling(window=p3, min_periods=p3).mean()
        df['ma120'] = df['종가'].rolling(window=p4, min_periods=p4).mean()
    except Exception as e:
        logging.error("이동평균 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_macd(df, p1=12, p2=26, signal=9):
    """
    MACD, Signal 및 Oscillator를 계산합니다.
    """
    df = _prepare_df(df)
    try:
        df['ema12'] = df['종가'].ewm(span=p1, min_periods=p1, adjust=False).mean()
        df['ema26'] = df['종가'].ewm(span=p2, min_periods=p2, adjust=False).mean()
        df['macd'] = df['ema12'] - df['ema26']
        df['signal'] = df['macd'].rolling(window=signal, min_periods=signal).mean()
        df['oscillator'] = df['macd'] - df['signal']
    except Exception as e:
        logging.error("MACD 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_rsi(df, p=14):
    """
    RSI(Relative Strength Index)를 계산합니다.
    """
    df = _prepare_df(df)
    try:
        delta = df['종가'].diff()
        Au = delta.where(delta > 0, 0).ewm(com=p-1, min_periods=p, adjust=False).mean()
        # 하락폭 계산 시 0으로 나누지 않도록 처리
        Ad = (-delta.where(delta < 0, 0)).ewm(com=p-1, min_periods=p, adjust=False).mean()
        rs = Au / Ad.replace(0, np.nan)
        df['rsi'] = 100 - (100 / (1 + rs))
    except Exception as e:
        logging.error("RSI 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_stoch(df, p1=14, p2=3):
    """
    Stochastic Oscillator (%K, %D)를 계산합니다.
    """
    df = _prepare_df(df)
    try:
        df['L'] = df['저가'].rolling(window=p1, min_periods=p1).min()
        df['H'] = df['고가'].rolling(window=p1, min_periods=p1).max()
        # 분모가 0이 되는 경우 np.nan 처리
        denom = (df['H'] - df['L']).replace(0, np.nan)
        df['%K'] = (df['종가'] - df['L']) / denom * 100
        df['%D'] = df['%K'].rolling(window=p2, min_periods=1).mean()
    except Exception as e:
        logging.error("Stoch 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    df.replace([np.inf, -np.inf], 0, inplace=True)
    return df

def calculate_stochrsi(df, p1=14, p2=14, p3=3):
    """
    Stochastic RSI (%K, %D)를 계산합니다.
    """
    df = _prepare_df(df)
    try:
        delta = df['종가'].diff()
        Au = delta.where(delta > 0, 0).ewm(com=p1-1, min_periods=p1, adjust=False).mean()
        Ad = (-delta.where(delta < 0, 0)).ewm(com=p1-1, min_periods=p1, adjust=False).mean()
        rs = Au / Ad.replace(0, np.nan)
        df['rsi'] = 100 - (100 / (1 + rs))
        df['L'] = df['rsi'].rolling(window=p2, min_periods=p2).min()
        df['H'] = df['rsi'].rolling(window=p2, min_periods=p2).max()
        denom = (df['H'] - df['L']).replace(0, np.nan)
        df['%K'] = (df['rsi'] - df['L']) / denom * 100
        df['%K'] = df['%K'].rolling(window=p3, min_periods=1).mean()
        df['%D'] = df['%K'].rolling(window=p3, min_periods=1).mean()
    except Exception as e:
        logging.error("StochRSI 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_williams(df, p1=14):
    """
    Williams %R을 계산합니다.
    """
    df = _prepare_df(df)
    try:
        df['L'] = df['저가'].rolling(window=p1, min_periods=p1).min()
        df['H'] = df['고가'].rolling(window=p1, min_periods=p1).max()
        denom = (df['H'] - df['L']).replace(0, np.nan)
        df['%R'] = (df['H'] - df['종가']) / denom * -100
    except Exception as e:
        logging.error("Williams %R 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    df.replace([np.inf, -np.inf], 0, inplace=True)
    return df

def calculate_cci(df, p1=20):
    """
    Commodity Channel Index (CCI)를 계산합니다.
    """
    df = _prepare_df(df)
    try:
        df['M'] = (df['고가'] + df['저가'] + df['종가']) / 3
        df['N'] = df['M'].rolling(window=p1, min_periods=p1).mean()
        df['D'] = df['M'].rolling(window=p1, min_periods=p1).apply(
            lambda x: np.mean(np.abs(x - np.mean(x))), raw=True
        )
        denominator = (df['D'] * 0.015).replace(0, np.nan)
        df['CCI'] = (df['M'] - df['N']) / denominator
    except Exception as e:
        logging.error("CCI 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_atr(df, p1=14):
    """
    Average True Range (ATR)를 계산합니다.
    """
    df = _prepare_df(df)
    try:
        df['전일 종가'] = df['종가'].shift(1)
        df['TH'] = df[['고가', '전일 종가']].max(axis=1)
        df['TL'] = df[['저가', '전일 종가']].min(axis=1)
        df['TR'] = df['TH'] - df['TL']
        df['ATR'] = df['TR'].ewm(com=p1-1, min_periods=p1, adjust=False).mean()
    except Exception as e:
        logging.error("ATR 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_roc(df, p1=9):
    """
    Rate of Change (ROC)를 계산합니다.
    """
    df = _prepare_df(df)
    try:
        col_name = f'{p1}일전 종가'
        df[col_name] = df['종가'].shift(p1)
        df['ROC'] = (df['종가'] - df[col_name]) / df[col_name] * 100
    except Exception as e:
        logging.error("ROC 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_uo(df, p1=7, p2=14, p3=28):
    """
    Ultimate Oscillator (UO)를 계산합니다.
    """
    df = _prepare_df(df)
    try:
        df['전일 종가'] = df['종가'].shift(1)
        df['BP'] = df['종가'] - df[['저가', '전일 종가']].min(axis=1)
        df['TH'] = df[['고가', '전일 종가']].max(axis=1)
        df['TL'] = df[['저가', '전일 종가']].min(axis=1)
        df['TR'] = df['TH'] - df['TL']
        avg_p1 = df['BP'].rolling(window=p1, min_periods=p1).mean() / df['TR'].rolling(window=p1, min_periods=p1).mean()
        avg_p2 = df['BP'].rolling(window=p2, min_periods=p2).mean() / df['TR'].rolling(window=p2, min_periods=p2).mean()
        avg_p3 = df['BP'].rolling(window=p3, min_periods=p3).mean() / df['TR'].rolling(window=p3, min_periods=p3).mean()
        df['UO'] = ((4 * avg_p1 + 2 * avg_p2 + avg_p3) / 7) * 100
    except Exception as e:
        logging.error("UO 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_adx(df, p1=14):
    """
    Average Directional Index (ADX)를 계산합니다.
    """
    df = _prepare_df(df)
    try:
        df['전일 종가'] = df['종가'].shift(1)
        df['전일 고가'] = df['고가'].shift(1)
        df['전일 저가'] = df['저가'].shift(1)
        
        df['high_low'] = df['고가'] - df['저가']
        df['high_prev_close'] = (df['고가'] - df['전일 종가']).abs()
        df['low_prev_close'] = (df['저가'] - df['전일 종가']).abs()
        df['TR'] = df[['high_low', 'high_prev_close', 'low_prev_close']].max(axis=1)
        
        df['up_move'] = df['고가'] - df['전일 고가']
        df['down_move'] = df['전일 저가'] - df['저가']
        
        df['+DM'] = 0.0
        df['-DM'] = 0.0
        df.loc[(df['up_move'] > df['down_move']) & (df['up_move'] > 0), '+DM'] = df['up_move']
        df.loc[(df['down_move'] > df['up_move']) & (df['down_move'] > 0), '-DM'] = df['down_move']
        
        df['TR_smoothed'] = df['TR'].ewm(alpha=1/p1, min_periods=p1, adjust=False).mean()
        df['+DM_smoothed'] = df['+DM'].ewm(alpha=1/p1, min_periods=p1, adjust=False).mean()
        df['-DM_smoothed'] = df['-DM'].ewm(alpha=1/p1, min_periods=p1, adjust=False).mean()
        
        df['+DI'] = 100 * (df['+DM_smoothed'] / df['TR_smoothed'])
        df['-DI'] = 100 * (df['-DM_smoothed'] / df['TR_smoothed'])
        
        # (df['+DI'] + df['-DI'])가 0인 경우 NaN 처리
        denom = (df['+DI'] + df['-DI']).replace(0, np.nan)
        df['DX'] = 100 * (abs(df['+DI'] - df['-DI']) / denom)
        df['ADX'] = df['DX'].ewm(alpha=1/p1, min_periods=p1, adjust=False).mean()
    except Exception as e:
        logging.error("ADX 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_bollinger(df, p1=20, k=2):
    """
    Bollinger Band를 계산합니다.
    - p1: 이동평균 기간 (기본 20일)
    - k: 표준편차 배수 (기본 2배)
    """
    df = _prepare_df(df)
    try:
        df['ma20'] = df['종가'].rolling(window=p1, min_periods=p1).mean()
        df['std'] = df['종가'].rolling(window=p1, min_periods=p1).std()
        
        df['BU'] = df['ma20'] + k * df['std']
        df['BL'] = df['ma20'] - k * df['std']
    except Exception as e:
        logging.error("볼린저밴드 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_tradingvalue(df):
    """
    거래대금을 계산합니다.
    거래량 x 평균주가
    """
    df = _prepare_df(df)
    try:
        df['평균주가'] = (df['시가'] + df['고가'] + df['저가'] + df['종가']) / 4
        df['tradingvalue'] = df['평균주가']*df['거래량']
    except Exception as e:
        logging.error("거래대금 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_envelope(df, p1=20, k=0.1):
    """
    envelope를 계산합니다.
    - p1: 이동평균 기간 (기본 20일)
    - k: 승수 (기본 0.1)
    """
    df = _prepare_df(df)
    try:
        df['ma20'] = df['종가'].rolling(window=p1, min_periods=p1).mean()
        
        df['EU'] = df['ma20'] * (1+k)
        df['EL'] = df['ma20'] * (1-k)
    except Exception as e:
        logging.error("envelope 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

def calculate_ichimoku(df, p1=26, p2=9):
    """
    ichimoku를 계산합니다.
    반환되는 컬럼:
    - 전환선 (conversion_line)
    - 기준선 (base_line)
    - 선행스팬1 (leading_span1)
    - 선행스팬2 (leading_span2)
    - 후행스팬 (chikou_span)
    """
    df = _prepare_df(df)
    try:         
        # 1) 전환선 (Conversion Line)
        df['전환선'] = (
            df['고가'].rolling(window=p2, min_periods=p2).max() +
            df['저가'].rolling(window=p2, min_periods=p2).min()
            ) / 2

        # 2) 기준선 (Base Line)
        df['기준선'] = (
            df['고가'].rolling(window=p1, min_periods=p1).max() +
            df['저가'].rolling(window=p1, min_periods=p1).min()
            ) / 2

        # 3) 선행스팬1 (Leading Span A) = (전환선 + 기준선) / 2
        df['선행스팬1'] = (df['전환선'] + df['기준선']) / 2
        df['선행스팬1'] = df['선행스팬1'].shift(p1-1)

        # 4) 선행스팬2 (Leading Span B) = (52일간 최고 + 52일간 최저) / 2
        df['선행스팬2'] = (
                df['고가'].rolling(window=p1*2, min_periods=p1*2).max() +
                df['저가'].rolling(window=p1*2, min_periods=p1*2).min()
            ) / 2
        df['선행스팬2'] = df['선행스팬2'].shift(p1-1)        
            
        # 5) 후행스팬 (Chikou Span) = 현재 종가를 26일 전으로 그려줌 -> shift(-p1)
        df['후행스팬'] = df['종가'].shift(-p1)
        

    except Exception as e:
        logging.error("ichimoku 계산 오류: %s", e)
        raise
    df.fillna(0, inplace=True)
    return df

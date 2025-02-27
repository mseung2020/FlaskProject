/* --------------------- JavaScript 시작 --------------------- */
// 보조지표 항목 클릭 시 호출되는 함수
// indicator: 보조지표 이름, elem: 클릭된 요소(this)
function showIndicatorContent(indicator, elem) {
// 좌측 목록에서 모든 항목의 선택 효과 제거
var items = document.querySelectorAll('.stockItem');
items.forEach(function(item) {
    item.classList.remove('selectedStockItem');
});
// 클릭된 항목에 선택 효과 추가
if (elem) {
    elem.classList.add('selectedStockItem');
}

// 우측 차트 영역의 캔버스는 숨김 처리
var canvas = document.getElementById('myChart');
if (canvas) {
    canvas.style.display = 'none';
}

// 우측 차트 영역 내의 contentBox를 표시하고 내용 채움
var contentBox = document.getElementById('contentBox');
if (contentBox) {
    contentBox.style.display = 'block';
    if (indicator === 'ATR') {
    contentBox.innerHTML =
        '<h2 style="margin:0; padding:0; font-size: 40px;">ATR이란?</h2>' +
        '<p>ATR(Average True Range, 평균 실제 범위)은 주가의 변동성을 측정하는 기술적 지표입니다.<br>' +
        '쉽게 말해, <strong>"최근 일정 기간 동안 주가가 얼마나 크게 움직였는가?"</strong>를 분석하는 도구입니다.</p>' +
        '<p><strong>💡 ATR 값이 높으면 시장 변동성이 크고, ATR 값이 낮으면 시장 변동성이 작다는 의미입니다.</strong></p>' +
        '<p> <br></p>' +

        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 ATR의 핵심 요소!</h2>' +
        '<p>👉 <strong>ATR 산출법</strong><br>' +
        '✔️ <strong>TR(True Range)</strong> = (당일 고가 - 당일 저가), (당일 고가 - 전일 종가), (전일 종가 - 당일 저가) 중 가장 큰 값<br>' +
        '✔️ <strong>ATR</strong> = TR의 이동평균<br>' +
        '✔️ 기본적으로 14일(기본값) 기간을 사용하지만, 투자 스타일에 따라 조정 가능</p>' +
        '<p> <br></p>' +

        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 ATR 활용법 찾기!</h2>' +
        '<p>📈 <strong>ATR을 활용한 매매 전략</strong><br>' +
        '✔️ ATR이 상승하면 변동성이 증가 → 신중한 매매 필요<br>' +
        '✔️ ATR이 하락하면 변동성이 감소 → 시장이 안정적<br>' +
        '✔️ 단독으로 매매 신호를 제공하지 않으므로 다른 보조지표와 함께 사용하는 것이 효과적</p>' +
        '<p><strong>💡 추가 팁! ATR 활용 손절 전략</strong><br>' +
        '✔️ 손절 가격 = 매수가 - (ATR × 2)<br>' +
        '✔️ 시장 변동성이 클수록 손절 폭을 넓게 설정하여 불필요한 손실 방지</p>' +
        '<p> <br></p>' +

        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 ATR의 장점과 한계점!</h2>' +
        '<p>✅ <strong>장점</strong><br>' +
        '✔️ 주가 변동성을 측정하여 시장의 리스크 수준을 파악 가능<br>' +
        '✔️ 손절 가격 및 매매 수량 결정에 유용<br>' +
        '✔️ 변동성이 증가하는 구간에서 신중한 매매 전략을 세울 수 있음</p>' +
        '<p><strong>❌ 한계점</strong><br>' +
        '⚠️ 매수·매도 신호를 직접 제공하지 않음 → 단독 활용 어려움<br>' +
        '⚠️ 절대적 기준이 없으므로 상대적 비교 필요</p>' +
        '<p> <br></p>' +

        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 ATR 세 줄 요약!</h2>' +
        '<p>✔️ ATR은 특정 기간 동안 주가 변동성을 측정하여 시장의 리스크 수준을 분석하는 지표입니다.<br>' +
        '✔️ ATR 값이 높으면 변동성이 크고, 낮으면 변동성이 작아지며, 손절 가격 및 매매 수량 결정에 활용할 수 있습니다.<br>' +
        '✔️ 다른 보조지표(RSI, 이동평균선)와 함께 보면 더 정확합니다.</p>' +
        '<p><strong>ATR</strong>은 <strong>변동성을 측정하는 강력한 지표</strong>이므로, 직접 차트에서 적용해보며 익숙해지는 것이 중요합니다!</p>';
    }
    
    else if (indicator === 'ROC') {
    contentBox.innerHTML =
        '<h2 style="margin:0; padding:0; font-size: 40px;">ROC란?</h2>' +
        '<p>ROC(Rate of Change, 변동률 지수)는 과거 특정 시점의 가격과 현재 가격을 비교하여 주가 변동 속도를 측정하는 모멘텀 지표입니다.<br>' +
        '쉽게 말해, <strong>"최근 일정 기간 동안 주가가 얼마나 빠르게 상승 또는 하락했는가?"</strong>를 확인하는 도구입니다.</p>' +
        '<p>💡 <strong>ROC가 0보다 크면 상승 추세, 0보다 작으면 하락 추세로 해석합니다.</strong></p>' +
        '<p><br></p>' +
    
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 ROC의 핵심 요소!</h2>' +
        '<p>👉 <strong>ROC 산출법</strong><br>' +
        '✔️ <strong>ROC</strong> = ((금일 종가 - N일 전 종가) ÷ N일 전 종가) × 100<br>' +
        '✔️ N은 기본적으로 10일을 사용하지만, 투자 스타일에 따라 조정 가능<br>' +
        '✔️ 0선을 기준으로 플러스(+)이면 상승 모멘텀, 마이너스(-)이면 하락 모멘텀을 의미하며, 주가의 상승폭에는 제한이 없지만 하한선은 -100%로 고정됩니다.</p>' +
        '<p> <br></p>' +
    
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 ROC 매매 타이밍 찾기!</h2>' +
        '<p>📈 <strong>매수 타이밍 (BUY SIGNAL)</strong><br>' +
        '✔️ ROC가 0선을 상향 돌파할 때 → 상승 추세 시작 가능성<br>' +
        '✔️ ROC 값이 플러스(+)로 유지될 때 → 상승세 지속 가능성</p>' +
        '<p>📉 <strong>매도 타이밍 (SELL SIGNAL)</strong><br>' +
        '❌ ROC가 0선을 하향 돌파할 때 → 하락 추세 시작 가능성<br>' +
        '❌ ROC 값이 마이너스(-)로 유지될 때 → 하락세 지속 가능성</p>' +
        '<p><strong>💡 추가 팁! 0선 교차 매매 전략</strong><br>' +
        '✔️ ROC가 0선을 상향 돌파하면 매수,❌ 0선을 하향 돌파하면 매도<br>' +
        '✔️ 장기적으로 0선 위에서 머물면 상승 추세,❌ 0선 아래에서 머물면 하락 추세로 판단할 수 있습니다.</p>' +
        '<p> <br></p>' +
    
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 ROC의 장점과 한계점!</h2>' +
        '<p>✅ <strong>장점</strong><br>' +
        '✔️ 주가 변동 속도를 빠르게 감지하여 추세 확인에 용이<br>' +
        '✔️ 0선을 기준으로 상승·하락 추세를 명확하게 분석 가능<br>' +
        '✔️ 다른 지표(RSI, MACD)와 함께 사용하면 신뢰도가 상승합니다.</p>' +
        '<p><strong>❌ 한계점</strong><br>' +
        '⚠️ 횡보장에서 거짓 신호가 발생할 수 있음 (0선 부근에서 자주 오르내리면 신뢰도가 낮아짐)<br>' +
        '⚠️ 다이버전스 신뢰도가 낮아 신호가 너무 일찍 발생할 위험이 있습니다.</p>' +
        '<p> <br></p>' +
    
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 ROC 세 줄 요약!</h2>' +
        '<p>✔️ ROC는 과거 특정 시점의 가격과 현재 가격을 비교하여 상승(0 이상)과 하락(0 이하) 모멘텀을 측정하는 지표입니다.<br>' +
        '✔️ ROC가 0선을 상향 돌파하면 매수, 하향 돌파하면 매도 신호로 해석할 수 있습니다.<br>' +
        '✔️ 다른 보조지표(MACD, 이동평균선)와 함께 보면 더 정확합니다.</p>' +
        '<p><strong>ROC</strong>는 <strong>주가 변동 속도를 측정하는 강력한 지표</strong>이므로, 직접 차트에서 적용해보며 익숙해지는 것이 중요합니다!</p>';
    }
    
    else if (indicator === 'Ultimate Oscillator') {
    contentBox.innerHTML =
        '<h2 style="margin:0; padding:0; font-size: 40px;">Ultimate Oscillator(UO)란?</h2>' +
        '<p>Ultimate Oscillator(UO)는 단기·중기·장기 매수 압력을 모두 고려하여 <strong>현재 시장의 매수 압력이 얼마나 강한지</strong>를 측정하는 모멘텀 지표입니다.<br>' +
        '기존의 모멘텀 지표들은 하나의 기간만을 반영하여 다이버전스가 자주 발생하는 단점이 있었지만, UO는 3가지 기간(단기·중기·장기)을 조합하여 보다 안정적인 신호를 제공합니다.</p>' +
        '<p><strong>💡 UO 값이 30 이하면 과매도, 70 이상이면 과매수로 해석합니다.</strong></p>' +
        '<p><br></p>' +

        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 Ultimate Oscillator의 핵심 요소!</h2>' +
        '<p>👉 <strong>UO 산출법</strong><br>' +
        '✔️ <strong>UO</strong> = (단기 매수 압력 비율 × 4 + 중기 매수 압력 비율 × 2 + 장기 매수 압력 비율 × 1) ÷ (총 가중치 합)<br>' +
        '✔️ 기본적으로 7일(단기), 14일(중기), 28일(장기) 기간을 사용하여 계산하지만, 투자 스타일에 따라 조정 가능</p>' +
        '<p><br></p>' +

        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 Ultimate Oscillator 매매 타이밍 찾기!</h2>' +
        '<p>📈 <strong>매수 타이밍 (BUY SIGNAL)</strong><br>' +
        '✔️ UO가 30 이하에서 상승할 때 → 과매도 상태 해소, 매수 신호 가능<br>' +
        '✔️ UO가 이전 저점을 넘어서 상승할 때 → 매수 압력 증가, 상승 가능성<br>' +
        '✔️ Bullish 다이버전스 → 주가는 하락하는데 UO 저점이 올라가면, 상승 가능성</p>' +
        '<p>📉 <strong>매도 타이밍 (SELL SIGNAL)</strong><br>' +
        '❌ UO가 70 이상에서 하락할 때 → 과매수 상태 해소, 매도 신호 가능<br>' +
        '❌ UO가 이전 고점을 넘어서 하락할 때 → 매도 압력 증가, 하락 가능성<br>' +
        '❌ Bearish 다이버전스 → 주가는 상승하는데 UO 고점이 낮아지면, 하락 가능성</p>' +
        '<p><strong>💡 추가 팁! 윌리엄스 매매 전략</strong><br>' +
        '✔️ Bullish 다이버전스 + UO가 이전 고점을 돌파하면 매수<br>' +
        '❌ Bearish 다이버전스 + UO가 이전 저점을 돌파하면 매도<br>' +
        '✔️ UO가 50선을 기준으로 상승하면 강한 매수 신호,❌ 50선을 기준으로 하락하면 강한 매도 신호</p>' +
        '<p><br></p>' +

        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 Ultimate Oscillator의 장점과 한계점!</h2>' +
        '<p>✅ <strong>장점</strong><br>' +
        '✔️ 단기·중기·장기 매수 압력을 반영하여 신뢰도 높은 신호 제공<br>' +
        '✔️ 기존 오실레이터보다 안정적인 신호를 보이며 다이버전스 오류를 줄임<br>' +
        '✔️ 과매수·과매도 상태를 판단하는 데 유용</p>' +
        '<p><strong>❌ 한계점</strong><br>' +
        '⚠️ 시장 변동성이 작은 경우 신호가 늦어질 수 있음<br>' +
        '⚠️ 단기 트레이딩에는 적합하지 않을 수 있음</p>' +
        '<p><br></p>' +

        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 Ultimate Oscillator 세 줄 요약!</h2>' +
        '<p>✔️ Ultimate Oscillator는 단기·중기·장기 매수 압력을 종합하여 과매수(70 이상), 과매도(30 이하) 상태를 분석하는 지표입니다.<br>' +
        '✔️ Bullish 다이버전스와 과매도 탈출 시 매수, Bearish 다이버전스와 과매수 탈출 시 매도 신호로 해석할 수 있습니다.<br>' +
        '✔️ 다른 보조지표(MACD, 이동평균선)와 함께 보면 더 정확합니다.</p>' +
        '<p><strong>Ultimate Oscillator</strong>는 <strong>매수·매도 압력을 종합적으로 분석하는 강력한 지표</strong>이므로, 직접 차트에서 적용해보면서 익숙해지는 것이 중요합니다!</p>';
    }

    else if (indicator === 'CCI') {
    contentBox.innerHTML =
        '<h2 style="margin:0; padding:0; font-size: 40px;">CCI란?</h2>' +
        '<p>CCI(Commodity Channel Index, 상품 채널 지수)는 현재 주가가 이동평균으로부터 얼마나 떨어져 있는지를 측정하는 지표입니다.<br>' +
        '쉽게 말해, <strong>주가가 평균보다 너무 높거나 낮다면 다시 평균으로 회귀하려는 속성을 활용하여 과매수·과매도를 판단</strong>하는 데 사용됩니다.</p>' +
        '<p><strong>💡 CCI 값이 +100 이상이면 과매수, -100 이하면 과매도로 해석합니다.</strong></p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 CCI의 핵심 요소!</h2>' +
        '<p>👉 <strong>CCI 산출법</strong><br>' +
        '✔️ <strong>CCI</strong> = (현재 가격 - N일 이동평균) ÷ (N일 이동평균의 평균 편차 × 0.015)<br>' +
        '✔️ N은 기본적으로 20일을 사용하지만, 투자 스타일에 따라 조정 가능<br>' +
        '✔️ 0.015는 CCI 값이 일반적으로 -100에서 +100 사이에 머무르도록 설정한 상수입니다.</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 CCI 매매 타이밍 찾기!</h2>' +
        '<p>📈 <strong>매수 타이밍 (BUY SIGNAL)</strong><br>' +
        '✔️ CCI가 -100 이하에서 상승할 때 → 과매도 상태 해소, 매수 신호 가능<br>' +
        '✔️ CCI가 0선을 상향 돌파할 때 → 상승 추세 시작 가능성<br>' +
        '✔️ CCI 다이버전스 → 주가는 하락하는데 CCI 저점이 올라가면, 상승 가능성</p>' +
        '<p>📉 <strong>매도 타이밍 (SELL SIGNAL)</strong><br>' +
        '❌ CCI가 +100 이상에서 하락할 때 → 과매수 상태 해소, 매도 신호 가능<br>' +
        '❌ CCI가 0선을 하향 돌파할 때 → 하락 추세 시작 가능성<br>' +
        '❌ CCI 다이버전스 → 주가는 상승하는데 CCI 고점이 낮아지면, 하락 가능성</p>' +
        '<p><strong>💡 추가 팁! 기준선(0선) 활용 전략</strong><br>' +
        '✔️ CCI가 0선을 상향 돌파하면 상승 추세 가능성, 매수 고려<br>' +
        '❌ CCI가 0선을 하향 돌파하면 하락 추세 가능성, 매도 고려</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 CCI의 장점과 한계점!</h2>' +
        '<p>✅ <strong>장점</strong><br>' +
        '✔️ 과매수·과매도 상태를 판단하는 데 유용<br>' +
        '✔️ 다이버전스 활용 시 신뢰도 높은 매매 신호 가능<br>' +
        '✔️ 추세 전환을 빠르게 감지 가능</p>' +
        '<p><strong>❌ 한계점</strong><br>' +
        '⚠️ 각 종목마다 적절한 기준값이 다를 수 있음 → 특정 종목에 맞춰 조정 필요<br>' +
        '⚠️ 강한 추세에서는 과매수·과매도 신호가 무용지물이 될 수 있음</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 CCI 세 줄 요약!</h2>' +
        '<p>✔️ CCI는 현재 주가가 이동평균 대비 얼마나 떨어져 있는지를 측정하여 과매수(+100 이상)와 과매도(-100 이하) 상태를 분석하는 지표입니다.<br>' +
        '✔️ CCI가 -100 이하에서 상승하면 매수, +100 이상에서 하락하면 매도 신호로 해석할 수 있습니다.<br>' +
        '✔️ 다른 보조지표(MACD, 이동평균선)와 함께 보면 더 정확합니다.</p>' +
        '<p><strong>CCI</strong>는 <strong>추세 및 과매수·과매도를 판단하는 강력한 지표</strong>이므로, 직접 차트에서 적용해보면서 익숙해지는 것이 중요합니다!</p>';
    }  

    else if (indicator === 'Williams %R') {
    contentBox.innerHTML =
        '<h2 style="margin:0; padding:0; font-size: 40px;">Williams %R(윌리엄스 %R)란?</h2>' +
        '<p>Williams %R은 현재 종가가 최근 일정 기간 동안의 최고가와 최저가 중 어디에 위치하는지를 백분율로 나타내는 기술적 지표입니다.<br>' +
        '쉽게 말해, <strong>"최근 일정 기간 동안 주가가 상대적으로 높은 수준인가? 낮은 수준인가?"</strong>를 확인하여 과매수·과매도 상태를 판단하는 데 도움을 주는 지표입니다.</p>' +
        '<p><strong>💡 Williams %R 값이 -20 이상이면 과매수, -80 이하면 과매도로 해석합니다.</strong></p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 Williams %R의 핵심 요소!</h2>' +
        '<p>👉 <strong>Williams %R 산출법</strong><br>' +
        '✔️ <strong>%R</strong> = (최고가 - 종가) ÷ (최고가 - 최저가) × (-100)<br>' +
        '✔️ 0과 -100 사이의 값으로 표시됨<br>' +
        '✔️ 0에 가까울수록 최근 최고가에 가까우며, -100에 가까울수록 최근 최저가에 가까움<br>' +
        '✔️ 기본적으로 14일(기본값) 기간을 사용하여 계산하지만, 투자 스타일에 따라 조정 가능</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 Williams %R 매매 타이밍 찾기!</h2>' +
        '<p>📈 <strong>매수 타이밍 (BUY SIGNAL)</strong><br>' +
        '✔️ %R이 -80 이하에서 상승할 때 → 과매도 상태 해소, 매수 신호 가능<br>' +
        '✔️ Momentum Failure (과매도 돌파 실패 후 상승) → 하락세 둔화 후 반등 가능성<br>' +
        '✔️ Williams %R 다이버전스 → 주가는 하락하는데 %R 저점이 올라가면, 상승 가능성</p>' +
        '<p>📉 <strong>매도 타이밍 (SELL SIGNAL)</strong><br>' +
        '❌ %R이 -20 이상에서 하락할 때 → 과매수 상태 해소, 매도 신호 가능<br>' +
        '❌ Momentum Failure (과매수 돌파 실패 후 하락) → 상승세 둔화 후 하락 가능성<br>' +
        '❌ Williams %R 다이버전스 → 주가는 상승하는데 %R 고점이 낮아지면, 하락 가능성</p>' +
        '<p><strong>💡 추가 팁! 래리 윌리엄스 매매 전략</strong><br>' +
        '✔️ %R이 -100% 도달 후 5일 내 -95% 이상으로 상승하면 매수<br>' +
        '❌ %R이 0% 도달 후 5일 내 -5% 이하로 하락하면 매도</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 Williams %R의 장점과 한계점!</h2>' +
        '<p>✅ <strong>장점</strong><br>' +
        '✔️ RSI, 스토캐스틱과 유사하지만 더 빠르게 반응하여 민감한 매매 신호 제공<br>' +
        '✔️ 과매수·과매도 구간을 쉽게 확인 가능<br>' +
        '✔️ 단기 트레이딩에 적합</p>' +
        '<p><strong>❌ 한계점</strong><br>' +
        '⚠️ 너무 민감하여 오신호가 많음 → 추세 지표(MACD, 이동평균선)와 함께 활용하는 것이 좋음<br>' +
        '⚠️ 강한 추세에서는 과매수·과매도 신호가 무용지물이 될 수 있음</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 Williams %R 세 줄 요약!</h2>' +
        '<p>✔️ Williams %R은 일정 기간 동안 주가의 상대적 위치를 백분율로 나타내어 과매수(-20 이상), 과매도(-80 이하) 상태를 분석하는 지표입니다.<br>' +
        '✔️ %R이 -80 이하에서 상승하면 매수, -20 이상에서 하락하면 매도 신호로 해석할 수 있습니다.<br>' +
        '✔️ 다른 보조지표(MACD, 이동평균선)와 함께 보면 더 정확합니다.</p>' +
        '<p><strong>Williams %R</strong>은 <strong>매우 민감한 모멘텀 지표</strong>이므로, 직접 차트에서 적용해보면서 익숙해지는 것이 중요합니다!</p>';
    }

    else if (indicator === 'STOCH RSI') {
    contentBox.innerHTML =
        '<h2 style="margin:0; padding:0; font-size: 40px;">Stochastic RSI란?</h2>' +
        '<p>Stochastic RSI는 <strong>RSI 값을 활용하여 과매수·과매도 상태를 더욱 민감하게 분석</strong>하는 기술적 지표입니다.<br>' +
        '쉽게 말해, RSI를 Stochastic 방식으로 변환하여 RSI의 상대적 위치를 백분율로 나타내는 것입니다.<br>' +
        'RSI보다 더 빠르게 변동하며, 단기 매매에 적합하지만, 그만큼 잦은 신호와 오신호가 발생할 가능성이 높기 때문에 주의가 필요합니다.</p>' +
        '<p><strong>💡 Stochastic RSI 값이 80 이상이면 과매수, 20 이하면 과매도로 해석합니다.</strong></p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 Stochastic RSI의 핵심 요소!</h2>' +
        '<p><strong>Stochastic RSI는 세 가지 주요 지표로 구성됩니다.</strong></p>' +
        '<p>1️⃣ <strong>RSI (Relative Strength Index, 상대강도지수</strong>)<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;주가의 평균 상승·하락폭을 비교하여 시장 상태가 과매수인지, 과매도인지 판단하는 지표</p>' +
        '<p>2️⃣ <strong>%K (빠른 선)</strong><br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(현재 RSI - N일간 최저 RSI) ÷ (N일간 최고 RSI - 최저 RSI) × 100<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;0~100 범위에서 움직이며, 100에 가까울수록 최근 RSI 고점에, 0에 가까울수록 RSI 저점에 가까움<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;변동성이 크므로 단독으로 사용하기보다 %D와 함께 분석하는 것이 중요합니다.</p>' +
        '<p>3️⃣ <strong>%D (느린 선)</strong><br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;%K의 3~5일 이동평균선<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;부드럽게 움직이며 오신호를 줄이는 역할을 하여 매매 신호를 보다 명확하게 판단하는 데 사용됩니다.</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 Stochastic RSI 매매 타이밍 찾기!</h2>' +
        '<p>📈 <strong>매수 타이밍 (BUY SIGNAL)</strong><br>' +
        '✔️ %K가 20 이하에서 상승할 때 → 과매도 상태 해소, 매수 신호 가능<br>' +
        '✔️ 골든 크로스: %K가 %D를 아래에서 위로 돌파하면 매수 신호<br>' +
        '✔️ Stochastic RSI 다이버전스: 주가는 하락하는데 %K 저점이 올라가면 상승 가능성</p>' +
        '<p>📉 <strong>매도 타이밍 (SELL SIGNAL)</strong><br>' +
        '❌ %K가 80 이상에서 하락할 때 → 과매수 상태 해소, 매도 신호 가능<br>' +
        '❌ 데드 크로스: %K가 %D를 위에서 아래로 돌파하면 매도 신호<br>' +
        '❌ Stochastic RSI 다이버전스: 주가는 상승하는데 %K 고점이 낮아지면 하락 가능성</p>' +
        '<p><strong>💡 추가 팁! 50선 돌파 전략</strong><br>' +
        '✔️ 50선 상향 돌파 → 상승 추세 진입 가능성, 매수 고려<br>' +
        '❌ 50선 하향 돌파 → 하락 추세 진입 가능성, 매도 고려</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 Stochastic RSI의 장점과 한계점!</h2>' +
        '<p>✅ <strong>장점</strong><br>' +
        '✔️ RSI보다 민감하게 반응하여 빠른 매매 신호 포착 가능<br>' +
        '✔️ 단기 트레이딩에 유용<br>' +
        '✔️ 횡보장에서 효과적</p>' +
        '<p><strong>❌ 한계점</strong><br>' +
        '⚠️ 너무 민감하여 오신호가 많음 → 추세 지표(MACD, 이동평균선)와 함께 활용하는 것이 좋음<br>' +
        '⚠️ 강한 추세에서는 과매수·과매도 신호가 무용지물이 될 수 있음</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 스토캐스틱 RSI 세 줄 요약!</h2>' +
        '<p>✔️ Stochastic RSI는 RSI 값을 스토캐스틱 방식으로 변환하여 과매수(80 이상), 과매도(20 이하) 상태를 분석하는 지표입니다.<br>' +
        '✔️ %K가 %D를 돌파하는 순간이 중요하며, 골든 크로스(매수)와 데드 크로스(매도)로 해석할 수 있습니다.<br>' +
        '✔️ 다른 보조지표(MACD, 이동평균선)와 함께 보면 더 정확합니다.</p>' +
        '<p><strong>Stochastic RSI</strong>는 <strong>매우 민감한 모멘텀 지표</strong>이므로, 직접 차트에서 적용해보며 익숙해지는 것이 중요합니다!</p>';
    }

    else if (indicator === 'STOCH') {
    contentBox.innerHTML =
        '<h2 style="margin:0; padding:0; font-size: 40px;">Stochastic Oscillator란?</h2>' +
        '<p>Stochastic Oscillator는 일정 기간 동안 최고가와 최저가의 범위에서 현재 가격이 어디에 위치하는지 백분율로 나타내는 기술적 지표입니다.<br>' +
        '쉽게 말해, <strong>"최근 일정 기간 동안 주가가 얼마나 높은 수준에 있는가?"</strong>를 파악하는 도구로, 과매수·과매도 구간을 판단하는 데 유용합니다.<br>' +
        'STOCH(스토캐스틱)은 RSI와 비슷하지만, 주가의 상대적 위치를 좀 더 빠르게 반영한다는 특징이 있습니다.</p>' +
        '<p><strong>💡 스토캐스틱 값이 80 이상이면 과매수, 20 이하면 과매도로 해석합니다.</strong></p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 스토캐스틱의 핵심 요소!</h2>' +
        '<p><strong>스토캐스틱은 두 가지 주요 지표로 구성됩니다.</strong></p>' +
        '<p>1️⃣ <strong>%K (빠른 선)</strong><br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(현재 가격 - N일간 최저가) ÷ (N일간 최고가 - 최저가) × 100<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;0~100 범위에서 움직이며, 100에 가까울수록 최근 고점에, 0에 가까울수록 최근 저점에 가까움.<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;변동성이 크기 때문에 단독으로 사용하기보다는 %D와 함께 분석하는 것이 중요합니다.</p>' +
        '<p>2️⃣ <strong>%D (느린 선)</strong><br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;%K의 3일 이동평균선<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;이 선은 %K보다 부드럽게 움직여 노이즈를 줄이고 매매 신호를 보다 명확하게 판단하는 데 도움을 줍니다.</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 스토캐스틱 매매 타이밍 찾기!</h2>' +
        '<p>📈 <strong>매수 타이밍 (BUY SIGNAL)</strong><br>' +
        '✔️ %K가 20 이하에서 상승할 때 → 과매도 상태 해소, 매수 신호 가능<br>' +
        '✔️ 골든 크로스: %K가 %D를 아래에서 위로 돌파하면 매수 신호<br>' +
        '✔️ 스토캐스틱 다이버전스: 주가는 하락하는데 %K 저점이 올라가면 상승 가능성</p>' +
        '<p>📉 <strong>매도 타이밍 (SELL SIGNAL)</strong><br>' +
        '❌ %K가 80 이상에서 하락할 때 → 과매수 상태 해소, 매도 신호 가능<br>' +
        '❌ 데드 크로스: %K가 %D를 위에서 아래로 돌파하면 매도 신호<br>' +
        '❌ 스토캐스틱 다이버전스: 주가는 상승하는데 %K 고점이 낮아지면 하락 가능성</p>' +
        '<p><strong>💡 추가 팁! Stochastic Pop 전략</strong><br>' +
        '✔️ %K가 80을 돌파하면 매수,❌ %K가 20을 돌파하면 매도하는 전략<br>' +
        '✔️ 단기 트레이딩에서 많이 활용되며, 청산 조건은 반대 방향으로 %K가 돌파하거나 %K-%D가 교차할 때 결정됩니다.</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 스토캐스틱의 장점과 한계점!</h2>' +
        '<p>✅ <strong>장점</strong><br>' +
        '✔️ RSI보다 변동성이 커서 빠른 매매 신호를 포착할 수 있음<br>' +
        '✔️ 과매수·과매도 구간을 쉽게 확인 가능<br>' +
        '✔️ 단기 트레이딩에 유용</p>' +
        '<p><strong>❌ 한계점</strong><br>' +
        '⚠️ 너무 민감하여 잦은 오신호가 발생할 수 있음 → 추세 지표(MACD, 이동평균선)와 함께 활용하는 것이 좋음<br>' +
        '⚠️ 강한 추세에서는 과매수·과매도 신호가 무용지물이 될 수 있음</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 스토캐스틱 세 줄 요약!</h2>' +
        '<p>✔️ 스토캐스틱은 일정 기간 동안 주가의 상대적 위치를 백분율로 나타내어 과매수(80 이상), 과매도(20 이하) 상태를 분석하는 지표입니다.<br>' +
        '✔️ %K가 %D를 돌파하는 순간이 중요하며, 골든 크로스(매수)와 데드 크로스(매도)로 해석할 수 있습니다.<br>' +
        '✔️ 다른 보조지표(MACD, 이동평균선)와 함께 보면 더 정확합니다.</p>' +
        '<p><strong>스토캐스틱</strong>은 <strong>민감하게 반응하는 모멘텀 지표</strong>이므로, 직접 차트에서 적용해보며 익숙해지는 것이 중요합니다!</p>';
    }

    else if (indicator === 'RSI') {
    contentBox.innerHTML =
        '<h2 style="margin:0; padding:0; font-size: 40px;">RSI란?</h2>' +
        '<p>RSI(Relative Strength Index, 상대강도지수)는 주가의 평균 상승폭과 하락폭을 비교하여 현재 시장이 과매수 상태인지, 과매도 상태인지를 판단하는 기술적 지표입니다.<br>' +
        '쉽게 말해, <strong>"지금 주가가 너무 많이 올랐나? 너무 많이 떨어졌나?"</strong>를 확인하는 데 도움을 주는 도구입니다.</p>' +
        '<p><strong>💡 RSI 값이 70 이상이면 과매수, 30 이하면 과매도로 해석합니다.</strong></p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 RSI의 핵심 요소!</h2>' +
        '<p>👉 <strong>RSI 산출법</strong><br>' +
        '✔️ <strong>RSI</strong> = (AU ÷ (AU + AD)) × 100<br>' +
        '✔️ <strong>AU (Average Up)</strong>: 일정 기간 동안 평균 상승폭<br>' +
        '✔️ <strong>AD (Average Down)</strong>: 일정 기간 동안 평균 하락폭<br>' +
        '✔️ 즉, RSI 값이 높으면 최근 상승폭이 크고, 낮으면 하락폭이 크다는 의미입니다.<br>' +
        '✔️ 기본적으로 14일(기본값) 기간을 사용하여 계산하지만, 단기·장기 투자에 따라 조정 가능</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 RSI 매매 타이밍 찾기!</h2>' +
        '<p>📈 <strong>매수 타이밍 (BUY SIGNAL)</strong><br>' +
        '✔️ RSI가 30 이하에서 반등하면 → 과매도 상태 해소, 매수 신호 가능<br>' +
        '✔️ RSI 다이버전스: 주가는 하락하는데 RSI 저점이 올라가면 상승 가능성<br>' +
        '✔️ Failure Swing: RSI가 30 이하에서 저점을 형성한 후 고점을 돌파하면 매수</p>' +
        '<p>📉 <strong>매도 타이밍 (SELL SIGNAL)</strong><br>' +
        '❌ RSI가 70 이상에서 하락하면 → 과매수 상태 해소, 매도 신호 가능<br>' +
        '❌ RSI 다이버전스: 주가는 상승하는데 RSI 고점이 낮아지면 하락 가능성<br>' +
        '❌ Failure Swing: RSI가 70 이상에서 고점을 형성한 후 저점을 하향 돌파하면 매도</p>' +
        '<p><strong>💡 추가 팁! RSI 다이버전스 활용</strong><br>' +
        '✔️ 양의 다이버전스: 주가는 하락하는데 RSI 저점이 올라가면 → 상승 가능성<br>' +
        '❌ 음의 다이버전스: 주가는 상승하는데 RSI 고점이 낮아지면 → 하락 가능성</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 RSI의 장점과 한계점!</h2>' +
        '<p>✅ <strong>장점</strong><br>' +
        '✔️ 주가가 과매수·과매도 상태인지 쉽게 파악 가능<br>' +
        '✔️ MACD, 거래량 등과 함께 사용하면 신뢰도 상승<br>' +
        '✔️ 천정과 바닥을 찾는 데 유용</p>' +
        '<p><strong>❌ 한계점</strong><br>' +
        '⚠️ 강한 추세에서는 신뢰도가 떨어질 수 있음 (예: 상승장에서는 RSI가 70 이상이어도 계속 상승할 수 있음)<br>' +
        '⚠️ 횡보장에서는 유용하지만 추세장에서 단독으로 활용하기 어려움</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size: 25px;">📌 RSI 세 줄 요약!</h2>' +
        '<p>✔️ RSI는 주가의 평균 상승·하락폭을 비교하여 과매수(70 이상), 과매도(30 이하) 상태를 분석하는 지표입니다.<br>' +
        '✔️ RSI가 30 이하에서 반등하면 매수, 70 이상에서 하락하면 매도 신호로 해석할 수 있습니다.<br>' +
        '✔️ 다른 보조지표(MACD, 거래량)와 함께 보면 더 정확합니다.</p>' +
        '<p><strong>RSI</strong>는 <strong>가격 변동의 강도를 측정하는 강력한 지표</strong>이므로, 직접 차트에서 적용해보면서 익숙해지는 것이 중요합니다!</p>';
    }
    
    else if (indicator === 'ADX') {
    contentBox.innerHTML =
        '<h2 style="margin:0; padding:0; font-size:40px;">ADX란?</h2>' +
        '<p>ADX(Average Directional Movement Index, 평균 방향성 지수)는 현재 시장이 강한 추세를 형성하고 있는지를 확인하는 데 사용되는 기술적 지표입니다.<br>' +
        '쉽게 말해, <strong>"지금 시장이 뚜렷한 상승 또는 하락 추세를 보이고 있는가?"</strong>를 파악하는 도구라고 볼 수 있습니다.</p>' +
        '<p><strong>💡 ADX는 추세의 방향을 알려주지 않으며, 단순히 추세가 강한지 약한지만 측정합니다. 따라서 보통 +DI, -DI와 함께 사용됩니다.</strong></p>' +
        '<p><br></p>' +
    
        '<h2 style="margin:0; padding:0; font-size:25px;">📌 ADX의 핵심 요소 3가지!</h2>' +
        '<p><strong>ADX는 세 가지 주요 지표로 구성됩니다.</strong></p>' +
        '<p>1️⃣ <strong>+DI (Positive Directional Indicator)</strong><br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;최근 일정 기간 동안 고점 상승률을 나타내며, +DI가 크면 상승 압력이 강한 상태입니다.</p>' +
        '<p>2️⃣ <strong>-DI (Negative Directional Indicator)</strong><br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;최근 일정 기간 동안 저점 하락률을 나타내며, -DI가 크면 하락 압력이 강한 상태입니다.</p>' +
        '<p>3️⃣ <strong>ADX (Average Directional Index)</strong><br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+DI와 -DI를 비교하여 추세의 강도를 수치화한 지표입니다.<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ADX가 높을수록 현재 추세가 강하지만, 방향은 알려주지 않습니다.<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ADX는 +DI, -DI와 함께 해석해야 합니다.</p>' +
        '<p><br></p>' +
    
        '<h2 style="margin:0; padding:0; font-size:25px;">📌 ADX 매매 타이밍 찾기!</h2>' +
        '<p>📈 <strong>매수 타이밍 (BUY SIGNAL)</strong><br>' +
        '✔️ ADX가 25 이상이고 +DI가 -DI를 위로 돌파하면 → 상승 추세 형성<br>' +
        '✔️ ADX가 상승 중이면 → 현재 추세가 강해지고 있다는 의미<br>' +
        '✔️ 거래량 증가 시 상승 신호의 신뢰도를 확인</p>' +
        '<p>📉 <strong>매도 타이밍 (SELL SIGNAL)</strong><br>' +
        '❌ ADX가 25 이상이고 -DI가 +DI를 위로 돌파하면 → 하락 추세 형성<br>' +
        '❌ ADX가 하락 중이면 → 현재 추세가 약해질 가능성<br>' +
        '❌ 거래량 감소 시 하락 신호가 더 강할 수 있음</p>' +
        '<p><strong>💡 추가 팁! 추세 강도 확인</strong><br>' +
        '✔️ ADX 20 이하 → 약한 추세 (횡보 가능성 높음)<br>' +
        '✔️ ADX 25~50 → 강한 추세 (추세 매매 가능)<br>' +
        '✔️ ADX 50 이상 → 매우 강한 추세 (과열 가능성 고려!)</p>' +
        '<p><br></p>' +
    
        '<h2 style="margin:0; padding:0; font-size:25px;">📌 ADX의 장점과 한계점!</h2>' +
        '<p>✅ <strong>장점</strong><br>' +
        '✔️ 추세의 강도를 확인할 수 있음<br>' +
        '✔️ RSI, MACD 등과 함께 사용하면 신뢰도 상승<br>' +
        '✔️ 횡보장과 추세장을 구별하는 데 유용</p>' +
        '<p><strong>❌ 한계점</strong><br>' +
        '⚠️ 추세 방향을 알려주지 않음 → +DI, -DI와 함께 봐야 함<br>' +
        '⚠️ 후행성이 있어 추세를 확인하는 데 시간이 걸릴 수 있음</p>' +
        '<p><br></p>' +
    
        '<h2 style="margin:0; padding:0; font-size:25px;">📌 ADX 세 줄 요약!</h2>' +
        '<p>✔️ ADX는 추세의 강도를 측정하는 지표이며, 단독으로는 방향을 알 수 없습니다.<br>' +
        '✔️ ADX가 25 이상이면 강한 추세, 20 이하이면 약한 추세로 판단하며, 방향성은 +DI와 -DI를 활용하여 분석해야 합니다.<br>' +
        '✔️ 다른 보조지표(MACD, 이동평균선, RSI)와 함께 보면 더 정확합니다.</p>' +
        '<p><strong>ADX</strong>는 <strong>추세 판단에 중요한 지표</strong>이므로, 직접 차트에서 적용해보며 익숙해지는 것이 중요합니다!</p>';
    }
    
    else if (indicator === 'MACD') {
    contentBox.innerHTML =
        '<h2 style="margin:0; padding:0; font-size:40px;">MACD란?</h2>' +
        '<p>MACD(이동평균 수렴·확산 지수, Moving Average Convergence Divergence)는 현재 시장이 상승 추세인지, 하락 추세인지를 분석하는 대표적인 기술적 지표입니다.<br>' +
        '쉽게 말해, 두 개의 이동평균선을 비교하여<strong>"지금이 매수 타이밍인가? 매도 타이밍인가?"를 판단</strong>하는 데 도움을 주는 도구라고 볼 수 있습니다.</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size:25px;">📌 MACD의 핵심 요소 3가지!</h2>' +
        '<p><strong>MACD는 세 가지 주요 지표로 구성됩니다.</strong></p>' +
        '<p>1️⃣ <strong>MACD선 (빠른 선)</strong><br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;단기(12일) 이동평균선 - 장기(26일) 이동평균선<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;단기 이동평균이 장기 이동평균보다 크면 상승세(매수 가능), 작으면 하락세(매도 가능)</p>' +
        '<p>2️⃣ <strong>시그널선 (느린 선)</strong><br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;MACD선의 9일 이동평균선<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;MACD선이 시그널선을 위로 돌파하면 매수 신호, 아래로 돌파하면 매도 신호</p>' +
        '<p>3️⃣ <strong>히스토그램 (Histogram)</strong><br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;MACD선과 시그널선의 차이를 막대그래프로 표현<br>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;양수는 상승 추세, 음수는 하락 추세를 의미하며, 막대의 길이 변화는 모멘텀이 강해지거나 약해짐을 나타냅니다.</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size:25px;">📌 MACD 매매 타이밍 찾기!</h2>' +
        '<p>📈 <strong>매수 타이밍 (BUY SIGNAL)</strong><br>' +
        '✔️ 골든 크로스: MACD선이 시그널선을 아래에서 위로 돌파<br>' +
        '✔️ 히스토그램 양수 전환: 막대그래프가 음수에서 양수로 변할 때<br>' +
        '✔️ MACD선이 0선을 돌파하면 상승 모멘텀이 강해질 가능성이 있음<br>' +
        '✔️ 거래량 증가로 상승 신호의 신뢰도를 확인</p>' +
        '<p>📉 <strong>매도 타이밍 (SELL SIGNAL)</strong><br>' +
        '❌ 데드 크로스: MACD선이 시그널선을 위에서 아래로 돌파<br>' +
        '❌ 히스토그램 음수 전환: 막대그래프가 양수에서 음수로 변할 때<br>' +
        '❌ MACD선이 0선을 하향 돌파하면 하락 모멘텀이 강해질 가능성이 있음<br>' +
        '❌ 거래량 감소 시 하락 신호의 신뢰도가 높아짐</p>' +
        '<p><strong>💡 추가 팁! MACD 다이버전스</strong><br>' +
        '✔️ 양의 다이버전스: 주가는 하락하는데 MACD 저점이 올라간다면 → 상승 가능성<br>' +
        '❌ 음의 다이버전스: 주가는 상승하는데 MACD 고점이 낮아진다면 → 하락 가능성</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size:25px;">📌 MACD의 장점과 한계점!</h2>' +
        '<p>✅ <strong>장점</strong><br>' +
        '✔️ 추세를 쉽게 파악할 수 있음<br>' +
        '✔️ RSI, 거래량 등 다른 보조지표와 함께 사용하면 신뢰도 상승<br>' +
        '✔️ 초보자도 쉽게 배울 수 있는 지표</p>' +
        '<p><strong>❌ 한계점</strong><br>' +
        '⚠️ 반응이 느릴 수 있음 (후행성이 있음)<br>' +
        '⚠️ 횡보장에서 오신호가 발생할 수 있음</p>' +
        '<p><br></p>' +
        
        '<h2 style="margin:0; padding:0; font-size:25px;">📌 MACD 세 줄 요약!</h2>' +
        '<p>✔️ MACD는 단기·장기 이동평균선을 비교하여 추세의 방향과 모멘텀을 분석하는 지표입니다.<br>' +
        '✔️ MACD선이 시그널선을 돌파하는 순간이 중요하며, 골든 크로스는 매수 타이밍, 데드 크로스는 매도 타이밍으로 해석할 수 있습니다.<br>' +
        '✔️ 다른 보조지표(RSI, 거래량)와 함께 보면 더 정확합니다.</p>' +
        '<p><strong>MACD</strong>는 <strong>트레이딩에 매우 유용한 지표</strong>이므로, 직접 차트에서 적용해보며 익숙해지는 것이 중요합니다!</p>';
    }
    

    else {
    // 다른 보조지표일 경우 기본 placeholder 내용
    contentBox.innerHTML =
        '<h2>' + indicator + ' 관련 내용</h2>' +
        '<p>여기에 ' + indicator + '에 관한 설명 및 내용을 추가하세요.</p>';
    }
}
}
/* --------------------- JavaScript 끝 --------------------- */
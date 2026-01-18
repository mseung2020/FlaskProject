/* --------------------- JavaScript 시작 --------------------- */

// 1. 페이지 로드 시 초기화
document.addEventListener("DOMContentLoaded", function() {
    // 초기에는 아무것도 선택하지 않거나, 필요시 특정 버튼 클릭 트리거
    // var adxBtn = document.getElementById("adxBtn");
    // if (adxBtn) showIndicatorContent('ADX', adxBtn);
});

// 2. 보조지표 내용 표시 함수
function showIndicatorContent(indicator, elem) {
    
    // 좌측 목록 선택 효과 초기화 (기존 로직 유지)
    var items = document.querySelectorAll('.stockItem');
    items.forEach(function(item) {
        item.classList.remove('selectedStockItem');
    });

    // 클릭된 항목에 선택 효과 추가
    if (elem) {
        elem.classList.add('selectedStockItem');
    }

    // 우측 캔버스 숨김 (기존 로직 유지)
    var canvas = document.getElementById('myChart');
    if (canvas) {
        canvas.style.display = 'none';
    }

    // 우측 콘텐츠 박스 표시
    var contentBox = document.getElementById('contentBox');
    if (contentBox) {
        contentBox.style.display = 'block';

        // ★ 벤토 스타일 헤더 생성 헬퍼 함수
        function makeHeader(title, subtitle) {
            return `
                <div class="content-header-styled">
                    <span class="content-badge">${subtitle}</span>
                    <h1 class="content-title">${title}</h1>
                </div>
                <div class="content-body">
            `;
        }

        // ★ 핵심 포인트 박스 생성 헬퍼 함수 (노란색/회색 박스)
        function makeKeyPoint(title, content) {
            return `
                <div class="key-point-box">
                    <h3>${title}</h3>
                    ${content}
                </div>
            `;
        }

        let htmlContent = "";

        // ============================================================
        // [내용 통합 시작] 기존 텍스트를 벤토 디자인 태그로 감싸기
        // ============================================================

        if (indicator === 'ATR') {
            htmlContent = makeHeader('ATR', 'VOLATILITY') + `
                <h2>ATR이란?</h2>
                <p>ATR(Average True Range, 평균 실질 변동 범위)은 주가의 변동성을 측정하는 기술적 지표입니다.<br>
                쉽게 말해, <strong>"최근 일정 기간 동안 주가가 얼마나 크게 움직였는가?"</strong>를 분석하는 도구입니다.</p>
                <p><strong>💡 ATR 값이 높으면 시장 변동성이 크고, ATR 값이 낮으면 시장 변동성이 작다는 의미입니다.</strong></p>

                ${makeKeyPoint('📌 ATR의 핵심 요소', `
                    <p>👉 <strong>ATR 산출법</strong><br>
                    ✔️ <strong>TR(True Range)</strong> = (당일 고가 - 당일 저가), (당일 고가 - 전일 종가), (전일 종가 - 당일 저가) 중 가장 큰 값<br>
                    ✔️ <strong>ATR</strong> = TR의 이동평균<br>
                    ✔️ 기본적으로 14일(기본값) 기간을 사용하지만, 투자 스타일에 따라 조정 가능</p>
                `)}

                <h2>📌 ATR 활용법 찾기!</h2>
                <p>📈 <strong>ATR을 활용한 매매 전략</strong><br>
                ✔️ ATR이 상승하면 변동성이 증가 → 신중한 매매 필요<br>
                ✔️ ATR이 하락하면 변동성이 감소 → 시장이 안정적<br>
                ✔️ 단독으로 매매 신호를 제공하지 않으므로 다른 보조지표와 함께 사용하는 것이 효과적</p>
                
                <div class="key-point-box" style="background:#fff3cd; border-color:#ffeeba;">
                    <h3>💡 추가 팁! ATR 활용 손절 전략</h3>
                    <p>✔️ <strong>손절 가격 = 매수가 - (ATR × 2)</strong><br>
                    ✔️ 시장 변동성이 클수록 손절 폭을 넓게 설정하여 불필요한 손실 방지</p>
                </div>

                <h2>📌 ATR의 장점과 한계점</h2>
                <p>✅ <strong>장점</strong>: 리스크 수준 파악 가능, 손절 가격 결정에 유용<br>
                ❌ <strong>한계점</strong>: 매수·매도 신호 직접 제공 안 함, 상대적 비교 필요</p>

                <h2>📌 ATR 세 줄 요약</h2>
                <ul>
                    <li>특정 기간 동안 주가 변동성을 측정하여 리스크를 분석합니다.</li>
                    <li>값이 높으면 변동성이 크고, 낮으면 작습니다.</li>
                    <li>다른 보조지표(RSI 등)와 함께 봐야 정확합니다.</li>
                </ul>
            </div>`;
        }

        else if (indicator === 'ROC') {
            htmlContent = makeHeader('ROC', 'MOMENTUM') + `
                <h2>ROC란?</h2>
                <p>ROC(Rate of Change, 변동률 지수)는 과거 특정 시점의 가격과 현재 가격을 비교하여 주가 변동 속도를 측정하는 모멘텀 지표입니다.<br>
                쉽게 말해, <strong>"주가가 얼마나 빠르게 상승 또는 하락했는가?"</strong>를 확인하는 도구입니다.</p>
                <p>💡 <strong>ROC가 0보다 크면 상승 추세, 0보다 작으면 하락 추세로 해석합니다.</strong></p>

                ${makeKeyPoint('📌 ROC 산출법', `
                    <p>✔️ <strong>ROC</strong> = ((금일 종가 - N일 전 종가) ÷ N일 전 종가) × 100<br>
                    ✔️ N은 기본 10일 사용<br>
                    ✔️ 0선을 기준으로 플러스(+)면 상승 모멘텀, 마이너스(-)면 하락 모멘텀</p>
                `)}

                <h2>📌 ROC 매매 타이밍</h2>
                <p>📈 <strong>매수 (BUY)</strong>: ROC가 0선을 상향 돌파할 때<br>
                📉 <strong>매도 (SELL)</strong>: ROC가 0선을 하향 돌파할 때</p>

                <h2>📌 ROC 세 줄 요약</h2>
                <ul>
                    <li>상승(0 이상)과 하락(0 이하) 모멘텀을 측정합니다.</li>
                    <li>0선 상향 돌파 시 매수, 하향 돌파 시 매도 신호입니다.</li>
                    <li>MACD 등과 함께 보면 더 정확합니다.</li>
                </ul>
            </div>`;
        }

        else if (indicator === 'Ultimate Oscillator') {
            htmlContent = makeHeader('Ultimate Oscillator', 'PRESSURE') + `
                <h2>Ultimate Oscillator(UO)란?</h2>
                <p>단기·중기·장기 매수 압력을 모두 고려하여 <strong>현재 시장의 매수 압력이 얼마나 강한지</strong>를 측정합니다.<br>
                3가지 기간을 조합하여 기존 오실레이터보다 안정적인 신호를 제공합니다.</p>
                <p><strong>💡 UO 값이 30 이하면 과매도, 70 이상이면 과매도로 해석합니다.</strong></p>

                ${makeKeyPoint('📌 핵심 요소', `
                    <p>✔️ <strong>UO 산출</strong> = 단기(7일), 중기(14일), 장기(28일) 가중치 합산<br>
                    ✔️ 다양한 기간을 반영해 다이버전스 오류를 줄임</p>
                `)}

                <h2>📌 매매 타이밍</h2>
                <p>📈 <strong>매수</strong>: UO 30 이하에서 상승, Bullish 다이버전스 발생 시<br>
                📉 <strong>매도</strong>: UO 70 이상에서 하락, Bearish 다이버전스 발생 시</p>

                <div class="key-point-box" style="background:#e3f2fd; border-color:#bbdefb;">
                    <h3>💡 윌리엄스 매매 전략</h3>
                    <p>✔️ Bullish 다이버전스 + 이전 고점 돌파 = <strong>강력 매수</strong><br>
                    ❌ Bearish 다이버전스 + 이전 저점 돌파 = <strong>강력 매도</strong></p>
                </div>
            </div>`;
        }

        else if (indicator === 'CCI') {
            htmlContent = makeHeader('CCI', 'CHANNEL INDEX') + `
                <h2>CCI란?</h2>
                <p>CCI(Commodity Channel Index)는 현재 주가가 이동평균으로부터 얼마나 떨어져 있는지를 측정합니다.<br>
                <strong>"주가가 평균보다 너무 높거나 낮으면 다시 돌아오려는 성질"</strong>을 이용합니다.</p>
                <p><strong>💡 +100 이상이면 과매수, -100 이하면 과매도입니다.</strong></p>

                ${makeKeyPoint('📌 매매 타이밍', `
                    <p>📈 <strong>매수</strong>: -100 이하에서 올라올 때, 0선 상향 돌파<br>
                    📉 <strong>매도</strong>: +100 이상에서 내려올 때, 0선 하향 돌파</p>
                `)}

                <h2>📌 CCI 세 줄 요약</h2>
                <ul>
                    <li>이동평균 대비 이격도를 측정합니다.</li>
                    <li>-100 이하 상승 시 매수, +100 이상 하락 시 매도가 정석입니다.</li>
                    <li>추세 전환을 빠르게 감지할 수 있습니다.</li>
                </ul>
            </div>`;
        }

        else if (indicator === 'Williams %R') {
            htmlContent = makeHeader('Williams %R', 'MOMENTUM') + `
                <h2>Williams %R이란?</h2>
                <p>현재 종가가 최근 일정 기간의 가격 범위 중 어디에 위치하는지 백분율로 나타냅니다.<br>
                <strong>"최근 주가가 상대적으로 높은가? 낮은가?"</strong>를 확인합니다.</p>
                <p><strong>💡 -20 이상이면 과매수, -80 이하면 과매도로 해석합니다.</strong> (0 ~ -100 범위)</p>

                ${makeKeyPoint('📌 매매 타이밍', `
                    <p>📈 <strong>매수</strong>: -80 이하에서 상승할 때<br>
                    📉 <strong>매도</strong>: -20 이상에서 하락할 때</p>
                `)}
                
                <h2>📌 장점과 한계</h2>
                <p>RSI보다 더 빠르게 반응하지만, 그만큼 오신호가 많을 수 있으니 추세 지표와 함께 보세요.</p>
            </div>`;
        }

        else if (indicator === 'STOCH RSI') {
            htmlContent = makeHeader('Stochastic RSI', 'SENSITIVE') + `
                <h2>Stochastic RSI란?</h2>
                <p><strong>RSI 값을 활용하여</strong> 과매수·과매도를 더욱 민감하게 분석하는 지표입니다.<br>
                RSI보다 빠르지만, 잦은 신호와 오신호에 주의해야 합니다.</p>
                <p><strong>💡 80 이상 과매수, 20 이하 과매도입니다.</strong></p>

                ${makeKeyPoint('📌 핵심 요소', `
                    <p>1️⃣ <strong>RSI</strong>: 기반이 되는 데이터<br>
                    2️⃣ <strong>%K (빠른 선)</strong>: 현재 RSI의 위치<br>
                    3️⃣ <strong>%D (느린 선)</strong>: %K의 이동평균 (신호 필터링)</p>
                `)}

                <h2>📌 매매 타이밍</h2>
                <p>📈 <strong>매수</strong>: %K가 20 이하에서 상승, 골든 크로스<br>
                📉 <strong>매도</strong>: %K가 80 이상에서 하락, 데드 크로스</p>
            </div>`;
        }

        else if (indicator === 'STOCH') {
            htmlContent = makeHeader('Stochastic', 'OSCILLATOR') + `
                <h2>Stochastic Oscillator란?</h2>
                <p>최근 일정 기간 동안의 최고가/최저가 범위 내에서 현재 가격의 위치를 백분율로 나타냅니다.<br>
                <strong>"현재 주가가 바닥권인가? 천정권인가?"</strong>를 파악합니다.</p>
                <p><strong>💡 80 이상 과매수, 20 이하 과매도입니다.</strong></p>

                ${makeKeyPoint('📌 매매 타이밍', `
                    <p>📈 <strong>매수</strong>: %K가 20 이하에서 상승하거나, %D를 상향 돌파(골든 크로스)<br>
                    📉 <strong>매도</strong>: %K가 80 이상에서 하락하거나, %D를 하향 돌파(데드 크로스)</p>
                `)}

                <div class="key-point-box">
                    <h3>💡 Stochastic Pop 전략</h3>
                    <p>단기 매매에서 80 돌파 시 매수, 20 이탈 시 매도하는 전략도 있습니다.</p>
                </div>
            </div>`;
        }

        else if (indicator === 'RSI') {
            htmlContent = makeHeader('RSI', 'RELATIVE STRENGTH') + `
                <h2>RSI란?</h2>
                <p>주가의 상승폭과 하락폭을 비교하여 시장의 과열/침체를 판단합니다.<br>
                <strong>"지금 너무 많이 올랐나? 너무 많이 내렸나?"</strong>를 알려줍니다.</p>
                <p><strong>💡 70 이상 과매수, 30 이하 과매도입니다.</strong></p>

                ${makeKeyPoint('📌 핵심 포인트', `
                    <p>📈 <strong>매수</strong>: 30 이하 침체 구간에서 반등 시<br>
                    📉 <strong>매도</strong>: 70 이상 과열 구간에서 하락 시<br>
                    ✨ <strong>다이버전스</strong>: 주가는 가는데 지표가 반대로 가면 강력한 반전 신호!</p>
                `)}

                <h2>📌 세 줄 요약</h2>
                <ul>
                    <li>가장 대중적이고 신뢰도 높은 지표 중 하나입니다.</li>
                    <li>30/70 법칙만 기억해도 큰 도움이 됩니다.</li>
                    <li>횡보장에서 특히 유용합니다.</li>
                </ul>
            </div>`;
        }

        else if (indicator === 'ADX') {
            htmlContent = makeHeader('ADX', 'TREND STRENGTH') + `
                <h2>ADX란?</h2>
                <p>추세의 <strong>방향이 아닌 "강도"</strong>를 측정하는 지표입니다.<br>
                "지금 추세가 진짜인가? 아니면 그냥 횡보인가?"를 알려줍니다.</p>
                <p><strong>💡 ADX 25 이상이면 강한 추세, 20 이하면 횡보장입니다.</strong></p>

                ${makeKeyPoint('📌 구성 요소', `
                    <p>1️⃣ <strong>+DI</strong>: 상승 압력<br>
                    2️⃣ <strong>-DI</strong>: 하락 압력<br>
                    3️⃣ <strong>ADX</strong>: 추세의 강도 (높을수록 강함)</p>
                `)}

                <h2>📌 매매 타이밍</h2>
                <p>📈 <strong>매수</strong>: ADX 25 이상 + (+DI가 -DI 상향 돌파)<br>
                📉 <strong>매도</strong>: ADX 25 이상 + (-DI가 +DI 상향 돌파)</p>
            </div>`;
        }

        else if (indicator === 'MACD') {
            htmlContent = makeHeader('MACD', 'TREND FOLLOWER') + `
                <h2>MACD란?</h2>
                <p>이동평균선의 수렴과 확산을 이용해 추세의 방향과 모멘텀을 분석합니다.<br>
                <strong>"지금이 상승 추세인가? 하락 추세인가?"</strong>를 판단하는 최고의 도구입니다.</p>

                ${makeKeyPoint('📌 핵심 요소', `
                    <p>1️⃣ <strong>MACD선</strong>: 단기 - 장기 이평선 차이<br>
                    2️⃣ <strong>시그널선</strong>: MACD의 이평선<br>
                    3️⃣ <strong>히스토그램</strong>: 두 선의 차이 (에너지의 크기)</p>
                `)}

                <h2>📌 매매 타이밍 (골든/데드 크로스)</h2>
                <p>📈 <strong>골든 크로스 (매수)</strong>: MACD선이 시그널선을 뚫고 올라갈 때<br>
                📉 <strong>데드 크로스 (매도)</strong>: MACD선이 시그널선을 뚫고 내려갈 때</p>

                <div class="key-point-box" style="background:#e3f2fd; border-color:#90caf9;">
                    <h3>💡 MACD 0선 활용</h3>
                    <p>MACD선이 0선 위로 올라가면 <strong>본격적인 상승장</strong>의 시작일 수 있습니다.</p>
                </div>
            </div>`;
        }

        else {
            // 예외 처리 (만약 목록에 없는 지표가 눌렸을 때)
            htmlContent = makeHeader(indicator, 'INDICATOR') + `
                <h2>${indicator}</h2>
                <p>해당 지표에 대한 상세 정보를 불러오는 중입니다.</p>
            </div>`;
        }

        // 최종 HTML 주입
        contentBox.innerHTML = htmlContent;
    }
}
/* --------------------- JavaScript 끝 --------------------- */
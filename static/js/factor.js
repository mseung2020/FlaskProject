/* =========================================
   [FACTOR JS] Logic Restoration + Bug Fix
========================================= */

// 1. 버튼 토글 로직 (버그 수정 포함)
document.addEventListener('DOMContentLoaded', function () {
    const buttons = document.querySelectorAll('.factor-toggle');

    buttons.forEach(btn => {
        btn.addEventListener('click', function () {
            // [버그 수정] 이미 3개가 꽉 찼고, 내가 활성 상태가 아니라면 클릭 무시
            const activeCount = document.querySelectorAll('.factor-toggle.active').length;
            if (!this.classList.contains('active') && activeCount >= 3) {
                return; // 강제 종료
            }

            this.classList.toggle('active');
            updateButtonStates();
        });
    });

    function updateButtonStates() {
        const activeButtons = document.querySelectorAll('.factor-toggle.active');
        const isLimitReached = activeButtons.length >= 3;

        buttons.forEach(btn => {
            if (!btn.classList.contains('active')) {
                if (isLimitReached) {
                    btn.classList.add('disabled');
                } else {
                    btn.classList.remove('disabled');
                }
            }
        });
    }
});

// 2. AND/OR 선택 로직
document.addEventListener('DOMContentLoaded', function () {
    const selectorBtns = document.querySelectorAll('.selector-btn');
    selectorBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            selectorBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
});

// 3. 슬라이더 로직 (부드러운 이동 기능 복구)
document.addEventListener('DOMContentLoaded', () => {
    const knob = document.getElementById("sliderKnob");
    const track = document.getElementById("sliderTrack");
    const positions = [0, 33.33, 66.66, 100];
    let isDragging = false;

    // 위치 설정 함수
    function setLeftByClientX(clientX) {
        const rect = track.getBoundingClientRect();
        let x = clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        knob.style.left = `${(x / rect.width) * 100}%`;
    }

    // 자석 효과 (가장 가까운 눈금으로 이동)
    function snapToClosest() {
        // 자석효과는 무조건 부드럽게 이동해야 함
        knob.classList.add('smooth-transition');
        
        const currentLeft = parseFloat(knob.style.left || '0');
        let closest = positions[0];
        let minDiff = Math.abs(currentLeft - closest);
        positions.forEach(pos => {
            const diff = Math.abs(currentLeft - pos);
            if (diff < minDiff) {
                minDiff = diff;
                closest = pos;
            }
        });
        knob.style.left = `${closest}%`;
    }

    // 드래그 시작: 애니메이션을 꺼야 마우스를 1:1로 따라옴 (렉 없음)
    function startDrag() { 
        isDragging = true; 
        knob.classList.remove('smooth-transition'); 
        document.body.style.userSelect = "none"; 
    }

    // 드래그 끝: 놓는 순간 부드럽게 눈금으로 이동
    function endDrag() { 
        if (!isDragging) return; 
        isDragging = false; 
        snapToClosest(); 
        document.body.style.userSelect = ""; 
    }

    // --- 이벤트 리스너 ---

    // 1. 노브 드래그
    knob.addEventListener("mousedown", (e) => { startDrag(); e.preventDefault(); });
    document.addEventListener("mousemove", (e) => { if (!isDragging) return; setLeftByClientX(e.clientX); });
    document.addEventListener("mouseup", endDrag);

    // 모바일 터치 (노브)
    knob.addEventListener("touchstart", (e) => { startDrag(); setLeftByClientX(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
    document.addEventListener("touchmove", (e) => { if (!isDragging) return; setLeftByClientX(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
    document.addEventListener("touchend", endDrag);

    // 2. 트랙 클릭 (여기가 중요: 클릭 시 부드럽게 이동)
    track.addEventListener("mousedown", (e) => { 
        // 클릭하는 순간 부드럽게 이동하도록 클래스 추가
        knob.classList.add('smooth-transition');
        setLeftByClientX(e.clientX); 
        snapToClosest(); 
    });
    
    track.addEventListener("touchstart", (e) => { 
        knob.classList.add('smooth-transition');
        setLeftByClientX(e.touches[0].clientX); 
        snapToClosest(); 
        e.preventDefault(); 
    }, { passive: false });

    // 초기값 설정
    knob.style.left = `${positions[0]}%`;
});

// 4. 차트 중간선 그리기
function drawMidDividerLine(chart) {
    const meta = chart.getDatasetMeta(0);
    if (meta.data.length <= 10) return;

    const bar5 = meta.data[4];
    const bar6 = meta.data[5];
    const midY = (bar5.y + bar6.y) / 2;
    const { ctx, chartArea } = chart;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(chartArea.left, midY);
    ctx.lineTo(chartArea.right, midY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#333';
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.restore();
}

// 5. 실행 버튼 클릭 (버그 완벽 수정 버전)
document.querySelector('.box4-right-btn').addEventListener('click', async () => {
    const button = document.querySelector('.box4-right-btn');

    if (button.disabled || button.classList.contains('loading')) return;
    button.disabled = true;

    const emptyState = document.getElementById('chartEmptyState');
    const emptyStateText = document.getElementById('emptyStateText');
    const rightResult = document.getElementById('right-result');
    
    // [1] 초기화: 에러 메시지가 남아있을 수 있으므로 소나 숨김
    if(emptyState) emptyState.classList.add('hidden'); 
    
    const originalText = button.innerHTML;
    button.classList.add('loading');
    button.innerHTML = 'RUNNING...';

    // 로더 표시
    document.getElementById('loader-1').classList.remove('hidden');
    document.getElementById('loader-left').classList.remove('hidden');
    document.getElementById('loader-right').classList.remove('hidden');
    
    // 차트 캔버스 투명화
    const chartCanvas = document.getElementById('returnChart');
    if(chartCanvas) chartCanvas.style.opacity = '0';
    
    // 결과창 비우기
    document.getElementById('left-result').innerHTML = '';
    if(rightResult) rightResult.innerHTML = '';

    try {
        const allButtons = document.querySelectorAll('.factor-btn.factor-toggle');
        const selectedButtons = document.querySelectorAll('.factor-btn.factor-toggle.active');
        
        if (selectedButtons.length === 0) {
            alert("팩터를 하나 이상 선택해주세요.");
            throw new Error("No selection");
        }

        const selectedIndices = Array.from(selectedButtons).map(btn => Array.from(allButtons).indexOf(btn) + 1);
        const activeModeBtn = document.querySelector('.selector-btn.active');
        const mode = activeModeBtn && activeModeBtn.id === "selector-btn-1" ? "AND" : "OR";
        
        // 슬라이더 값 읽기
        const knob = document.getElementById("sliderKnob");
        const labels = ["3개월", "6개월", "9개월", "12개월"];
        const leftPercentStr = knob.style.left || '0%';
        const index = Math.round(parseFloat(leftPercentStr) / 33.33);
        const months = parseInt(labels[index].replace('개월', ''));

        // API 호출
        const response = await fetch('/factor_result', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                selectedFactors: selectedIndices,
                mode: mode,
                months: months
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        // -------------------------------------------------
        // [결과 처리 로직] - 안전장치 추가
        // -------------------------------------------------

        // 1. 왼쪽 박스 (태그 & 수익률)
        const leftResult = document.getElementById('left-result');
        if(result.selected_names && Array.isArray(result.selected_names)) {
            leftResult.appendChild(renderConditionText(result.selected_names, result.months, result.mode));
        }
        
        const returnDiv = document.createElement('div');
        returnDiv.className = 'final-return';
        
        // [핵심 수정] 값이 숫자일 때만 toFixed 실행 (undefined 방지)
        const rawReturn = result.average_return;
        let displayReturn = 'N/A';
        let colorClass = 'text-minus'; // 기본값

        if (typeof rawReturn === 'number') {
            displayReturn = rawReturn.toFixed(2) + '%';
            if (rawReturn >= 0) colorClass = 'text-plus';
        }
        
        returnDiv.innerHTML = `평균 수익률 <span class="${colorClass}">${displayReturn}</span>`;
        leftResult.appendChild(returnDiv);


        // 2. 차트 & 소나 처리
        // 배열이 없으면 빈 배열로 처리
        const returns = Array.isArray(result.company_returns) ? result.company_returns : [];
        
        if (returns.length === 0) {
             // 데이터 없음: 차트 안전하게 삭제 후 소나 표시
             if (window.returnChart instanceof Chart) {
                 window.returnChart.destroy();
                 window.returnChart = null; // 참조 제거
             }
             
             if(emptyState) {
                 emptyState.classList.remove('hidden');
                 if(emptyStateText) emptyStateText.innerHTML = 'NO DATA FOUND<br><span>조건에 맞는 기업이 없습니다</span>';
             }
        } else {
             // 데이터 있음: 소나 숨김
             if(emptyState) emptyState.classList.add('hidden');
             
             // 차트 그리기
             const ctx = chartCanvas.getContext('2d');
             
             // 기존 차트가 있으면 삭제
             if (window.returnChart instanceof Chart) {
                 window.returnChart.destroy();
             }
             
             returns.sort((a, b) => b.return - a.return);
             let displayList = returns.length > 10 ? [...returns.slice(0, 5), ...returns.slice(-5)] : returns;
             const chartLabels = displayList.map(item => item.name);
             const data = displayList.map(item => item.return);
             const colors = data.map(val => val >= 0 ? '#ff7675' : '#74b9ff');

             window.returnChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderColor: '#111', borderWidth: 2, borderRadius: 4, barPercentage: 0.7
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#111', titleColor:'#ffeb3b', padding:10 } },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { family:'Space Grotesk', weight:'bold' }, color:'#111' } },
                        y: { grid: { display: false }, ticks: { font: { family:'Noto Sans KR', weight:'bold' }, color:'#111' } }
                    },
                    animation: { onComplete: () => { if(returns.length > 10) drawMidDividerLine(window.returnChart); } }
                }
            });
            chartCanvas.style.opacity = '1';
        }

        // 3. 오른쪽 박스 (기업 리스트)
        // result.companies가 undefined여도 빈 배열로 처리
        renderCompanyList(result.companies || []);

    } catch (err) {
        console.error("Error details:", err); // 에러 내용을 콘솔에 출력 (디버깅용)
        
        // 에러 발생 시 상태 복구 (시스템 에러 메시지 표시)
        if(emptyState) {
            emptyState.classList.remove('hidden');
            if(emptyStateText) emptyStateText.innerHTML = 'SYSTEM ERROR<br><span>다시 시도해주세요</span>';
        }
        
        // 하단 박스에도 에러 표시
        if(rightResult && (!rightResult.innerHTML || rightResult.innerHTML === '')) {
            rightResult.innerHTML = '<div class="placeholder-msg">오류가 발생했습니다.<br>다시 시도해주세요.</div>';
        }
        
    } finally {
        button.classList.remove('loading');
        button.innerHTML = originalText;
        button.disabled = false;
        document.querySelectorAll('.loader').forEach(el => el.classList.add('hidden'));
    }
});

// [수정됨] 결과 텍스트 렌더링 함수
function renderConditionText(names, months, mode) {
    const container = document.createElement('div');
    container.className = 'bento-result-text';
    
    // 1. 제목 (N개월 동안)
    const h3 = document.createElement('h3');
    h3.innerHTML = `${months}개월 동안`;
    container.appendChild(h3);

    // 2. 태그 리스트 컨테이너
    const list = document.createElement('div');
    list.className = 'factor-tag-list'; // CSS에서 세로 정렬로 변경 예정
    
    names.forEach((name, i) => {
        // 태그 생성
        const tag = document.createElement('div'); // 줄바꿈을 위해 div 사용
        tag.className = 'result-tag';
        
        // [핵심 로직] 마지막 요소인지 확인
        if (i === names.length - 1) {
            // 마지막 태그라면 뒤에 ' 기업의' 붙이기
            tag.textContent = name + " 기업의";
            
            // (옵션) 마지막 태그만 강조하고 싶다면 클래스 추가
            tag.classList.add('last-tag'); 
        } else {
            // 아니라면 그냥 이름만
            tag.textContent = name;
        }
        
        list.appendChild(tag);
        
        // 주의: 더 이상 connector(&)를 생성하지 않음
    });

    container.appendChild(list);
    return container;
}

function renderCompanyList(companies) {
    const rightResult = document.getElementById('right-result');
    rightResult.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'bento-list';
    
    if(!companies || companies.length === 0) {
        rightResult.innerHTML = '<div class="placeholder-msg">조건에 맞는<br>기업이 없습니다.</div>';
        return;
    }

    companies.forEach(name => {
        const li = document.createElement('li');
        li.className = 'bento-item';
        li.textContent = name;
        li.addEventListener('click', () => {
            document.querySelectorAll('.bento-item').forEach(i => i.classList.remove('selected'));
            li.classList.add('selected');
        });
        ul.appendChild(li);
    });
    rightResult.appendChild(ul);
}   
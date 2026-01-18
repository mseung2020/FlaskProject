document.addEventListener('DOMContentLoaded', initCandlePage);

let candleChart = null;
let currentCode = null;
let currentName = null; // 종목명 저장용
let patternBoxes = [];
let selectedPatternUid = null;
let latestTradingDate = '-';
let activeMetrics = new Set();
let lastMatches = [];

// [초기화] 페이지 로드 시 실행
async function initCandlePage() {
  bindBasicEvents();
  await loadLatestTradingDate();
  await loadStockList();
  
  // 초기 상태: 소나(대기화면) 표시, 로더 숨김
  toggleChartLoader(false);
  toggleInsightLoader(false);
}

function currentLatestISO(){
  const lastLabel = candleChart?.data?.labels?.at(-1) || latestTradingDate || '';
  return String(lastLabel).replace(/\./g, '-');
}

// [이벤트 바인딩] 버튼 클릭 등
function bindBasicEvents() {
  // 1. 검색 & 조회
  document.getElementById('searchBtn').addEventListener('click', filterStockList);
  document.getElementById('searchInput').addEventListener('input', filterStockList);
  
  // 2. 조회 기간 변경 (SET 버튼)
  document.getElementById('refreshBtn').addEventListener('click', () => {
    const d = getDaysValidated();
    if (d == null) return;
    if (currentCode) {
        // [추가] 일수가 바뀌면 기존 분석 결과(패턴, 지표) 초기화
        resetPatternUI();
        resetMetricsUI();
        loadAndRender(currentCode, currentName, d);
    }
  });
  
  // 엔터키 지원
  document.getElementById('daysInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const d = getDaysValidated();
      if (d == null) return;
      if (currentCode) {
          // [추가] 일수가 바뀌면 기존 분석 결과(패턴, 지표) 초기화
          resetPatternUI();
          resetMetricsUI();
          loadAndRender(currentCode, currentName, d);
      }
    }
  });

  // 3. 패턴 필터 버튼 (토글 스타일)
  document.getElementById('patternGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.pattern-btn');
    if (!btn) return;
    btn.classList.toggle('active'); // active 클래스로 스타일 변경
  });

  // 4. 패턴 탐지 버튼 (DETECT)
  document.getElementById('detectBtn').addEventListener('click', onDetectPatterns);

  // 5. 점수 패널 닫기
  document.getElementById('scoreClose').addEventListener('click', () => {
    document.getElementById('scorePanel').classList.add('hidden');
  });
  
  // 6. 패턴 리스트 클릭 (선택 및 점수 보기)
  const patternListEl = document.getElementById('patternList');
  patternListEl.addEventListener('click', handlePatternListClick);
}

// [유틸] 로더 & 대기화면 제어 함수
function toggleChartLoader(show) {
    const loader = document.getElementById('loader-chart');
    const sonar = document.getElementById('chartEmptyState');
    const canvas = document.getElementById('candleChart');
    
    if (show) {
        loader.classList.remove('hidden');
        sonar.classList.add('hidden'); // 로딩 중엔 소나 숨김
        canvas.style.opacity = '0.3';  // 차트는 흐릿하게
    } else {
        loader.classList.add('hidden');
        canvas.style.opacity = '1';
        // 차트 데이터가 없으면 소나를 다시 보여줘야 함 (별도 로직에서 처리)
    }
}

function toggleInsightLoader(show) {
    const loader = document.getElementById('loader-insight');
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
}


// [유효성 검사] 조회 일수
function getDaysValidated() {
  const raw = document.getElementById('daysInput').value;
  const days = parseInt(raw, 10);
  if (!Number.isFinite(days) || days < 10 || days > 100) {
    alert('조회 일자는 10~100일 사이에서 선택해 주세요.');
    return null;
  }
  return days;
}

// [API] 최근 거래일 조회
async function loadLatestTradingDate() {
  try {
    const r = await fetch('/get_latest_trading_date');
    const j = await r.json();
    latestTradingDate = j.latest_trading_date ?? j.latest_date ?? '-';
  } catch(e) { latestTradingDate = '-'; }
}

// [API] 종목 리스트 로드 (좌측 패널)
async function loadStockList() {
  const listEl = document.getElementById('stockList');
  // listEl.innerHTML = '<div class="placeholder-msg sm">Loading...</div>'; (HTML에 이미 있음)

  try {
   const res = await fetch('/get_kospi50');
   const top50 = await res.json();

    // 정렬: 한글 > 영문
    top50.sort((a, b) => {
      const ak = (a['회사명'] || '');
      const bk = (b['회사명'] || '');
      return ak.localeCompare(bk, 'ko') || ak.localeCompare(bk);
    });

    listEl.innerHTML = '';
    top50.forEach(item => {
      const li = document.createElement('div');
      li.className = 'stock-item'; // CSS 클래스 매칭
      li.dataset.code = item['종목코드'];
      li.dataset.name = item['회사명'];
      
      // HTML 구조 생성
      li.innerHTML = `<span>${item['회사명']}</span>
                      <span>${item['종목코드']}</span>`;
      
      li.addEventListener('click', () => onSelectStock(li));
      listEl.appendChild(li);
    });

  } catch (e) {
    listEl.innerHTML = '<div class="placeholder-msg sm">목록 로드 실패</div>';
    console.error(e);
  }
}

function filterStockList() {
  const q = (document.getElementById('searchInput').value || '').trim().toUpperCase();
  document.querySelectorAll('.stock-item').forEach(el => {
    const name = el.querySelector('span:first-child').textContent;
    const code = el.querySelector('span:last-child').textContent;
    // 검색 로직
    el.style.display = (name.includes(q) || code.includes(q)) ? '' : 'none';
  });
}

// [로직] 종목 선택 시
function onSelectStock(el) {
  // 스타일 활성화
  document.querySelectorAll('.stock-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  
  currentCode = el.dataset.code;
  currentName = el.dataset.name;
  
  // UI 초기화
  resetPatternUI();      
  resetMetricsUI();
  
  // 데이터 로드 시작
  const d0 = getDaysValidated() ?? 30;
  loadAndRender(currentCode, currentName, d0);
}

function resetPatternUI() {
  const ul = document.getElementById('patternList');
  if (ul) ul.innerHTML = '<li class="placeholder-msg">패턴 탐지 버튼을 눌러<br>분석을 시작하세요.</li>';
  
  document.getElementById('patternCountBadge').textContent = '0';
  document.getElementById('scorePanel').classList.add('hidden');
  
  selectedPatternUid = null;
  patternBoxes = [];

  // 차트 오버레이 제거
  if (candleChart) {
    candleChart.data.datasets = candleChart.data.datasets.filter(ds => ds._pattern !== true);
    candleChart.update('none');
  }
}

function resetMetricsUI() {
  activeMetrics.clear();
  document.querySelectorAll('.metric-btn').forEach(btn => btn.classList.remove('active'));
  
  if (candleChart) {
    candleChart.data.datasets.forEach(ds => {
      if (ds._metricKey) { ds.hidden = true; ds.data = []; }
    });
    candleChart.update('none');
  }
}

// [핵심] 차트 데이터 로드 및 렌더링
async function loadAndRender(code, name, daysParam) {
  const days = (daysParam ?? getDaysValidated());
  if (days == null) return;

  // 1. 로더 시작
  toggleChartLoader(true);
  
  // 헤더 업데이트
  const headerTitle = document.getElementById('chartStockName');
  headerTitle.textContent = `${name} (${code}) · ${days} DAYS`;
  headerTitle.style.color = 'var(--accent-yellow)'; // 강조색

  const fd = new FormData();
  fd.append('code', code);
  fd.append('days', String(days));
  fd.append('ma', 'true');
  fd.append('bollinger', 'true');
  fd.append('psar', 'true');

  try {
    const res = await fetch('/get_ohlc_history', { method:'POST', body:fd });
    const j = await res.json();
    
    // 차트 그리기
    renderChart(j, code);
    
    // 소나 숨기기 (데이터가 있으므로)
    document.getElementById('chartEmptyState').classList.add('hidden');
    
    // 지표 데이터 미리 받기 (프리페치)
    prefetchMetrics(code, days);

  } catch (e) {
    console.error(e);
    alert('차트 데이터를 불러오지 못했습니다.');
    // 실패 시 소나 복구? 혹은 에러 메시지
  } finally {
    // 로더 종료
    toggleChartLoader(false);
  }
}

// --- 차트 렌더링 관련 (Chart.js) ---
function renderChart(j, code){
  const canvasEl = document.getElementById('candleChart');
  const prev = Chart.getChart(canvasEl);
  if (prev) prev.destroy();
  
  const ctx = canvasEl.getContext('2d');
  const labels = j.dates.slice();
  
  // 데이터 변환
  const barData = [];
  const barColors = [];
  const extraData = [];
  
  for (let i=0; i<labels.length; i++){
    const o = j.opens[i], c = j.closes[i], h = j.highs[i], l = j.lows[i], v = j.volumes[i];
    barData.push([o, c]);
    // 상승: 빨강, 하락: 파랑 (테마 색상 활용)
    const color = c > o ? '#ff7675' : (c < o ? '#74b9ff' : '#111111');
    barColors.push(color);
    extraData.push({ open:o, close:c, high:h, low:l, volume:v, color });
  }

  // 플러그인: 고저 라인 그리기
  const highLowLinePlugin = {
    id: 'highLowLinePlugin',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta) return;
      const y = chart.scales.y;
      const ctx = chart.ctx;
      const ex = chart.data.datasets[0].extraData || [];
      
      meta.data.forEach((bar, idx) => {
        const it = ex[idx]; if (!bar || !it) return;
        const x = bar.x;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = it.color; 
        ctx.lineWidth = 1.5; // 선 두께 살짝 키움
        ctx.moveTo(x, y.getPixelForValue(it.high));
        ctx.lineTo(x, y.getPixelForValue(it.low));
        ctx.stroke();
        ctx.restore();
      });
    }
  };

  // 플러그인: 패턴 박스 그리기
  const patternBoxPlugin = {
    id: 'patternBoxPlugin',
    afterDatasetsDraw(chart) {
      if (!patternBoxes.length) return;
      const meta = chart.getDatasetMeta(0);
      if (!meta.data.length) return;
      const y = chart.scales.y;
      const ctx = chart.ctx;
      
      patternBoxes.forEach(box => {
        const s = Math.max(0, box.start_idx);
        const e = Math.min(meta.data.length-1, box.end_idx);
        if(s > e) return;
        
        const startEl = meta.data[s];
        const endEl = meta.data[e];
        if(!startEl || !endEl) return;

        const left = startEl.x - startEl.width;
        const right = endEl.x + endEl.width;
        
        // 해당 구간 고/저 계산
        // (간단화를 위해 Y축 전체 범위 사용하지 않고 박스만 그릴 수도 있음)
        // 여기서는 box.start_idx ~ end_idx 사이의 minL, maxH를 구해야 정확함
        // 일단 편의상 캔들 데이터셋에서 추출
        // ... (좌표 계산 로직 기존 유지) ...
        
        // [디자인 수정] 박스 스타일
        const top = y.getPixelForValue(box.maxH); 
        const bottom = y.getPixelForValue(box.minL);
        
        ctx.save();
        ctx.lineWidth = 2;
        const isSelected = (box.uid === selectedPatternUid);
        
        // 선택되면 노랑+검정, 아니면 흐린 회색
        ctx.strokeStyle = isSelected ? '#111' : 'rgba(0,0,0,0.2)';
        ctx.setLineDash(isSelected ? [] : [5, 5]);
        
        const w = right - left;
        const h = bottom - top;
        ctx.strokeRect(left, top, w, h);
        
        if(isSelected) {
            // 선택 시 배경 하이라이트
            ctx.fillStyle = 'rgba(255, 235, 59, 0.15)'; // 연한 노랑
            ctx.fillRect(left, top, w, h);
        }
        
        ctx.restore();
      });
    }
  };

  // 차트 옵션 (폰트 등 테마 적용)
  const options = {
    responsive: true, maintainAspectRatio: false,
    layout: { padding: 10 },
    scales: {
      x: { 
        grid: { display: false },
        ticks: { 
            font: { family: 'Space Grotesk', weight: 'bold' }, 
            color: '#888',
            maxTicksLimit: 8,  // [추가] 날짜를 최대 8개까지만 표시 (나머지는 자동 생략)
            autoSkip: true     // [추가] 공간이 부족하면 자동으로 건너뜀
        }
      },
      y: {
        position: 'right',
        beginAtZero: false,  // [추가] 0부터 시작하지 않음 (데이터 최소값 기준)
        grace: '10%',        // [추가] 위아래 여백 10% 추가 (캔들이 천장/바닥에 닿지 않게 함)
        grid: { color: '#f1f3f5' },
        ticks: { font: { family: 'Space Grotesk' }, color: '#888' }
      },
      y2: { display: false, min: 0, max: 100 } // 지표용
    },
    plugins: {
      legend: { display: false },
      tooltip: { 
        backgroundColor: '#111', 
        titleColor: '#ffeb3b', // 툴팁 제목 노란색
        bodyColor: '#fff',
        titleFont: { family: 'Space Grotesk' },
        padding: 10,
        cornerRadius: 8,
        displayColors: false
      },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
      }
    }
  };

  candleChart = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: labels,
        datasets: [{
            data: barData,
            backgroundColor: barColors,
            barPercentage: 0.8,
            categoryPercentage: 0.9,
            extraData: extraData
        }]
    },
    options: options,
    plugins: [highLowLinePlugin, patternBoxPlugin]
  });
  
  // 지표 데이터셋 자리 만들어두기
  ensureMetricDatasetsPrimed(candleChart);
}


// [핵심] 패턴 탐지 요청
async function onDetectPatterns(){
  // 1. 유효성 검사
  if(!currentCode){ alert('먼저 종목을 선택해주세요.'); return; }
  
  const enabledBtns = document.querySelectorAll('.pattern-btn.active');
  if(enabledBtns.length === 0) { alert('탐지할 패턴 유형을 하나 이상 선택해주세요.'); return; }
  
  const patterns = Array.from(enabledBtns).map(b => b.dataset.value);
  const days = getDaysValidated();
  
  // 2. 인사이트 로더 시작
  toggleInsightLoader(true);
  
  // 리스트 초기화
  document.getElementById('patternList').innerHTML = '';
  document.getElementById('scorePanel').classList.add('hidden');

  try{
    const res = await fetch('/detect_patterns', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ code: currentCode, days, patterns })
    });
    const j = await res.json();
    
    // 3. 결과 렌더링
    renderPatternList(j.matches || []);
    drawPatternMarkers(j.matches || []); // 차트에 박스 그리기 데이터 주입
    
  } catch(e){
    console.error(e);
    document.getElementById('patternList').innerHTML = '<li class="placeholder-msg">분석 중 오류가 발생했습니다.</li>';
  } finally {
    // 로더 종료
    toggleInsightLoader(false);
  }
}

// [UI] 패턴 리스트 렌더링 (카드 형태)
function renderPatternList(matches){
  const ul = document.getElementById('patternList');
  ul.innerHTML = '';
  lastMatches = matches.slice(); // 저장
  
  document.getElementById('patternCountBadge').textContent = matches.length;

  if(!matches.length){
    ul.innerHTML = '<li class="placeholder-msg">탐지된 패턴이 없습니다.<br>다른 유형을 선택해보세요.</li>';
    return;
  }

  matches.forEach((m, i) => {
    const li = document.createElement('li');
    li.className = 'pattern-item'; // CSS 클래스
    li.dataset.index = i;
    li.dataset.uid = `${m.start_idx}-${m.end_idx}-${m.name}`;
    
    // 아이콘 색상 결정
    const iconColor = m.direction === 'up' ? '#ff7675' : '#74b9ff';
    
    li.innerHTML = `
      <div class="pattern-thumb" style="border-color:${iconColor}">
         <svg viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2">
           ${m.direction === 'up' 
             ? '<path d="M12 19V5M5 12l7-7 7 7"/>' // 화살표 위
             : '<path d="M12 5v14M5 12l7 7 7-7"/>' // 화살표 아래
           }
         </svg>
      </div>
      <div class="pattern-info">
        <div class="pattern-name">${m.name}</div>
        <div class="pattern-date">${m.start_date} ~ ${m.end_date}</div>
        <div class="pattern-desc">${m.explain}</div>
        <button class="score-btn bento-btn" style="margin-top:8px; height:30px; width: 100%; font-size:0.75rem;">분석 점수 보기</button>
      </div>
    `;
    ul.appendChild(li);
  });
}

// [UI] 패턴 리스트 클릭 핸들러 (점수 보기 or 선택)
async function handlePatternListClick(e) {
    const btn = e.target.closest('.score-btn');
    const item = e.target.closest('.pattern-item');
    if (!item) return;

    // A. 점수 버튼 클릭 시
    if (btn) {
        e.stopPropagation();
        // [추가된 로직 1] 기존에 켜져있던 다른 버튼들의 빨간불 끄기 (초기화)
        document.querySelectorAll('.score-btn').forEach(b => b.classList.remove('active'));
        // [추가된 로직 2] 지금 누른 버튼에 빨간불 켜기 ('active' 클래스 부착)
        btn.classList.add('active');
        const idx = Number(item.dataset.index);
        const match = lastMatches[idx];
        await calculateAndShowScore(match); // 점수 계산 로직 실행
        return;
    }

    // B. 카드 자체 클릭 시 (차트 하이라이트)
    document.querySelectorAll('.pattern-item').forEach(x => x.classList.remove('active'));
    item.classList.add('active');
    
    selectedPatternUid = item.dataset.uid;
    if (candleChart) candleChart.update('none'); // 차트 다시 그려서 박스 강조
}

// [차트] 패턴 박스 데이터 준비
// [복원] 차트 패턴 박스 데이터 준비 (좌표 계산 포함)
function drawPatternMarkers(matches){
    if(!candleChart) return;
    
    // 캔들 데이터셋(0번)의 메타데이터와 원본 데이터(extraData) 가져오기
    const meta = candleChart.getDatasetMeta(0);
    const ex = candleChart.data.datasets[0].extraData;

    // 매칭된 패턴들을 순회하며 박스 좌표(minL, maxH) 계산
    patternBoxes = matches.map(m => {
        let maxH = -Infinity;
        let minL = Infinity;
        
        // 데이터셋 범위 내에서 안전하게 인덱스 클램핑
        const s = Math.max(0, m.start_idx);
        const e = Math.min(ex.length-1, m.end_idx);
        
        // 해당 패턴 구간(시작~끝)을 돌면서 가장 높은 고가와 낮은 저가를 찾음
        for(let i=s; i<=e; i++) {
            if(ex[i].high > maxH) maxH = ex[i].high;
            if(ex[i].low < minL) minL = ex[i].low;
        }
        
        // 박스가 캔들에 너무 딱 붙지 않게 위아래로 약간의 여유(Padding) 주기
        const padding = (maxH - minL) * 0.15; // 높이의 15% 정도 여유

        return {
            start_idx: m.start_idx,
            end_idx: m.end_idx,
            uid: `${m.start_idx}-${m.end_idx}-${m.name}`,
            maxH: maxH + padding,
            minL: minL - padding,
            direction: m.direction, // 방향 정보 저장 (스타일링용)
            name: m.name
        };
    });
    
    // 차트 업데이트 (애니메이션 없이 즉시 반영)
    candleChart.update('none');
}

// [로직] 점수 계산 및 표시 (기존 로직 유지하되 UI만 연결)
async function calculateAndShowScore(match) {
    const scorePanel = document.getElementById('scorePanel');
    const scoreValue = document.getElementById('scoreValue');
    const scoreBand = document.getElementById('scoreBand');
    
    // UI 표시 (로딩 중)
    scorePanel.classList.remove('hidden');
    scoreValue.textContent = '...';
    scoreBand.textContent = 'Calculating';
    
    // 지표 데이터 가져오기 (캐시된 것 활용)
    const days = getDaysValidated() ?? 30;
    const series = await getMetricsSeries(currentCode, days);
    
    // 해당 날짜의 지표 값 추출
    const endISO = match.end_date.replace(/\./g, '-');
    const snap = {
      breadth : pickMetricAt(series.breadth, endISO),
      lowvol  : pickMetricAt(series.lowvol,  endISO),
      momentum: pickMetricAt(series.momentum,endISO),
      eqbond  : pickMetricAt(series.eqbond,  endISO),
    };

    // 점수 계산 (기존 함수 활용)
    const result = scorePattern(match, snap);
    
    // 결과 표시
    scoreValue.textContent = result.score;
    scoreBand.textContent = result.band;
    
    // 밴드 색상 (우세하면 노랑, 불리하면 회색 등)
    scoreBand.style.color = result.score >= 50 ? '#ffeb3b' : '#aaa';
}


// --- 아래는 기존 지표(Metrics) 관련 로직 (그대로 유지하거나 필요 시 수정) ---
const METRIC_KEYS = ['breadth','lowvol','momentum','eqbond'];
const metricsCache = new Map();
const metricsPending = new Map();

async function getMetricsSeries(code, days) {
  const latestISO = currentLatestISO();
  const k = `${code}-${latestISO}-${days}`;
  if (metricsCache.has(k)) return metricsCache.get(k);
  
  // API 호출
  const url = `/get_metrics?code=${code}&days=${days}&minp=5&latest=${encodeURIComponent(latestISO)}`;
  const res = await fetch(url);
  const json = await res.json();
  const series = json?.series || {};
  
  metricsCache.set(k, series);
  return series;
}

async function prefetchMetrics(code, days){
    try { await getMetricsSeries(code, days); } catch(e){}
}

function pickMetricAt(rows, isoDate){
    if (!Array.isArray(rows) || !rows.length) return null;
    const target = new Date(isoDate);
    let best = null;
    for (const r of rows){
      if (!r || r.value == null) continue;
      const d = new Date(String(r.date));
      if (d <= target) {
        if (!best || d > best._d) best = { v: Math.max(0, Math.min(100, Number(r.value))), _d: d };
      }
    }
    return best ? best.v : null;
}

// [복원] 패턴 점수 계산 (0~100점)
function scorePattern(match, snap){
    // 0) 방향/유형 부호 설정
    const d = (match.direction === 'up') ? +1 : -1;       // 상승:+1, 하락:-1
    const m = (match.clazz === 'trend') ? +1 : -1;        // 추세지속:+1, 반전:-1

    // 1) z-score 정규화: (값-50)/50 -> -1 ~ 1 범위로 변환
    // snap 값이 없으면 0(중립)으로 처리
    const z = k => (snap[k] == null ? 0 : ((snap[k]-50)/50));

    // 2) 지표별 기여도 계산
    // - Momentum: '추세지속'이면 방향과 같아야 좋고, '반전'이면 방향과 반대(과열/침체)여야 좋음
    const s_mom  = (m === +1 ? d : -d) * z('momentum');
    
    // - 나머지(Breadth, LowVol, EQ-Bond): 리스크 온(Risk-On)일수록 상승에 유리 (+d)
    const s_br   = d * z('breadth');
    const s_lv   = d * z('lowvol');
    const s_eqb  = d * z('eqbond');

    // 3) 가중치 합산 (모멘텀 35%, 브레드스 30%, 로볼 20%, 채권 15%)
    const S = 0.35*s_mom + 0.30*s_br + 0.20*s_lv + 0.15*s_eqb; 

    // 4) 신뢰도 보정 (반전 패턴은 조금 더 보수적으로 판정)
    const kappa = (m === +1 ? 0.90 : 0.75);

    // 5) 최종 확률 변환 (0.5를 기준으로 ±변동)
    let p = 0.5 + kappa * S * 0.45; 
    p = Math.max(0.05, Math.min(0.95, p)); // 5% ~ 95%로 제한

    const score = Math.round(p * 100);
    const band  = bandFor(score);
    
    return { score, band };
}

// 점수 구간별 텍스트
function bandFor(s){
    if (s < 45) return '비추천 (Weak)';
    if (s < 55) return '중립 (Neutral)';
    if (s < 65) return '매수 우위 (Good)';
    if (s < 75) return '강력 매수 (Strong)';
    if (s < 85) return '최고 등급 (Top Pick)';
    return '매우 강력 (Extreme)';
}

// 점수별 색상 코드 (테마에 맞춘 노랑/회색/빨강)
function colorForScore(score){
    if(score >= 80) return { text: '#111', bg: '#ffeb3b', border: '#111' }; // 강한 노랑 (슈퍼노바)
    if(score >= 60) return { text: '#fff', bg: '#ff7675', border: '#111' }; // 빨강 (긍정)
    if(score <= 40) return { text: '#fff', bg: '#74b9ff', border: '#111' }; // 파랑 (부정)
    return { text: '#aaa', bg: '#333', border: '#555' }; // 중립 (회색)
}

// 지표 버튼 클릭 이벤트
document.querySelectorAll('.metric-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const key = btn.dataset.key;
        if(!key || !candleChart) return;
        
        const isActive = btn.classList.toggle('active');
        const datasetIdx = candleChart.data.datasets.findIndex(d => d._metricKey === key);
        
        if(datasetIdx >= 0) {
            const ds = candleChart.data.datasets[datasetIdx];
            ds.hidden = !isActive;
            
            if(isActive && (!ds.data || !ds.data.length)) {
                // 데이터 채우기
                const days = getDaysValidated() ?? 30;
                const series = await getMetricsSeries(currentCode, days);
                const rows = series[key] || [];
                // 차트 라벨(날짜)에 맞춰 데이터 매핑
                const labels = candleChart.data.labels;
                ds.data = labels.map(lbl => {
                    const val = pickMetricAt(rows, lbl.replace(/\./g, '-'));
                    return val !== null ? val : null;
                });
            }
            candleChart.update();
        }
    });
});

// 지표용 빈 데이터셋 생성
function ensureMetricDatasetsPrimed(chart){
    METRIC_KEYS.forEach(key => {
        if(!chart.data.datasets.find(d => d._metricKey === key)){
            chart.data.datasets.push({
                type: 'line',
                label: key.toUpperCase(),
                _metricKey: key,
                data: [],
                hidden: true,
                yAxisID: 'y2',
                borderColor: getMetricColor(key),
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.1
            });
        }
    });
}

function getMetricColor(key) {
    const map = { breadth:'#7e57c2', lowvol:'#26a69a', momentum:'#ff7043', eqbond:'#546e7a' };
    return map[key] || '#333';
}
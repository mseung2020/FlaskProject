document.addEventListener('DOMContentLoaded', initCandlePage);

let candleChart = null;
let currentCode = null;
let patternBoxes = [];
let selectedPatternUid = null;
let latestTradingDate = '-';
let activeMetrics = new Set();
let lastMatches = [];

async function initCandlePage() {
  bindBasicEvents();
  await loadLatestTradingDate();
  await loadStockList();
}

function currentLatestISO(){
  const lastLabel = candleChart?.data?.labels?.at(-1) || latestTradingDate || '';
  return String(lastLabel).replace(/\./g, '-');
}

function bindBasicEvents() {
  // 검색/조회
  document.getElementById('searchBtn').addEventListener('click', filterStockList);
  document.getElementById('searchInput').addEventListener('input', filterStockList);
  document.getElementById('refreshBtn').addEventListener('click', () => {
    const d = getDaysValidated();
    if (d == null) return;
    resetPatternUI(); 
    resetMetricsUI(); 
    if (currentCode) loadAndRender(currentCode, d);
  });
  // 엔터키로 조회 (조회 일수 입력창)
  document.getElementById('daysInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();                 // 폼 제출/포커스 이동 방지
      const d = getDaysValidated();       // 10~100 검사
      if (d == null) return;
      resetPatternUI();   
      resetMetricsUI(); 
      if (currentCode) loadAndRender(currentCode, d);
    }
  });

  document.getElementById('patternGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.pattern-btn');
    if (!btn) return;
    const isActive = btn.classList.toggle('active');
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  document.getElementById('detectBtn').addEventListener('click', onDetectPatterns);

  // 점수 버튼 클릭 → 버튼을 점수 뱃지로 치환
  document.getElementById('patternList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.score-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const li = btn.closest('.pattern-item');
    if (!li) return;

    // 1) 패턴/컨텍스트 준비
    const idx = Number(li.dataset.index ?? -1);
    const match = (idx >= 0 ? lastMatches[idx] : null);
    if (!match) return;

    const code = currentCode;
    const days = getDaysValidated() ?? 30;

    // 2) 메트릭 시리즈 확보 (이미 프리페치한 캐시 사용)
    const latestISO = currentLatestISO();
    const series = await getMetricsSeries(code, days, latestISO);
    // 시계열에서 해당 패턴 종료일자(또는 그 이전 최근 값)를 추출
    const endKR = (match.end_date || '').trim();       // 예: '2025.10.22'
    const endAPI = endKR.replace(/\./g, '-');          // '2025-10-22'

    const snap = {
      breadth : pickMetricAt(series.breadth, endAPI),
      lowvol  : pickMetricAt(series.lowvol,  endAPI),
      momentum: pickMetricAt(series.momentum,endAPI),
      eqbond  : pickMetricAt(series.eqbond,  endAPI),
    };

    // 3) 점수 계산 (0~100) + 밴드/색상
    const result = scorePattern(match, snap);
    // 4) 버튼 → 점수 뱃지 치환
    const pill = document.createElement('div');
    pill.className = 'score-pill';
    const colors = colorForScore(result.score);
    pill.style.color = colors.fg;
    pill.style.background = colors.bg;
    pill.style.borderColor = colors.bd;
    pill.innerHTML = `<span><strong>${result.score}점</strong> : <span class="band">${result.band}</span></span>`;
    btn.replaceWith(pill);
  });
  // 패턴 아이템 클릭 → 선택 토글 + 리스트 디밍 + 차트 오버레이 리드로우
  document.getElementById('patternList').addEventListener('click', (e) => {
    // 점수 버튼 클릭은 이 핸들러에서 무시(위의 점수 핸들러가 처리함)
    if (e.target.closest('.score-btn')) return;

    const item = e.target.closest('.pattern-item');
    if (!item) return;

    const uid = item.dataset.uid;
    if (selectedPatternUid === uid) {
      // 같은 걸 다시 누르면 해제
      selectedPatternUid = null;
      item.classList.remove('active');
    } else {
      // 다른 선택으로 교체
      selectedPatternUid = uid;
      document.querySelectorAll('#patternList .pattern-item.active')
        .forEach(x => x.classList.remove('active'));
      item.classList.add('active');
    }

    // 리스트에 has-selection 플래그 토글 → CSS 디밍 발동
    const listEl = document.getElementById('patternList');
    const someoneActive = !!listEl.querySelector('.pattern-item.active');
    listEl.classList.toggle('has-selection', someoneActive);

    // 차트의 패턴 박스도 선택 상태 반영해서 다시 그리기
    if (candleChart) candleChart.update('none');
  });


  // 시계열에서 해당 날짜(또는 그 이전 가장 가까운 값) 선택, 없으면 null
  function pickMetricAt(rows, isoDate){
    if (!Array.isArray(rows) || !rows.length) return null;
    // rows: [{date:'YYYY-MM-DD', value:0~100}, ...]  (getMetricsSeries 반환 구조)
    const target = new Date(isoDate);
    let best = null;
    for (const r of rows){
      if (!r || r.value == null) continue;
      const d = new Date(String(r.date));
      if (d <= target) {
        if (!best || d > best._d) best = { v: clamp01(r.value), _d: d };
      }
    }
    return best ? best.v : null;
  }
  const clamp01 = v => Math.max(0, Math.min(100, Number(v) || 0));

  // 패턴 점수: 0~100 (패턴 방향이 "다음 날" 맞을 확률로 해석)
  function scorePattern(match, snap){
    // 0) 방향/유형 부호
    const d = (match.direction === 'up') ? +1 : -1;       // up:+1, down:-1
    const m = (match.clazz === 'trend') ? +1 : -1;        // trend:+1, reversal:-1

    // 1) z 정규화: z = (s-50)/50 ∈ [-1,1]
    const z = k => (snap[k]==null ? 0 : ((snap[k]-50)/50));

    // 2) 기여 부호/가중치
    // - momentum: 추세지속은 d와 동부호, 반전은 -d 쪽이 유리
    const s_mom  = (m === +1 ? d : -d) * z('momentum');
    // - breadth, lowvol, eqbond: 리스크온/참여확대 → 상승에 유리, 하락에 불리  → 부호 = d
    const s_br   = d * z('breadth');
    const s_lv   = d * z('lowvol');
    const s_eqb  = d * z('eqbond');

    // 가중치 (모멘텀 0.35, 브레드스 0.30, 로볼 0.20, 주식/채권 0.15)
    const S = 0.35*s_mom + 0.30*s_br + 0.20*s_lv + 0.15*s_eqb; // ∈ [-1,1] 근사

    // 3) 신뢰 수축 (반전은 보수적으로)
    const kappa = (m === +1 ? 0.90 : 0.75);

    // 4) 선형 맵핑 → 확률
    let p = 0.5 + kappa * S * 0.45; // 최대 ±0.405 이동
    p = Math.max(0.05, Math.min(0.95, p)); // 과신 컷

    const score = Math.round(p * 100);
    const band  = bandFor(score);
    return { score, band };
  }

  // 점수 밴드 라벨
  function bandFor(s){
    if (s < 45) return '불리';
    if (s < 55) return '중립';
    if (s < 65) return '약 우세';
    if (s < 75) return '우세';
    if (s < 85) return '강 우세';
    return '매우 강함';
  }

  // 점수 색상 (파랑→보라→적)
  function colorForScore(score){
    // Hue: 210(파랑) → 0(적)로 선형 보간
    const h = 210 - (210 * (score/100));
    const fg = `hsl(${h}, 85%, 40%)`;
    const bd = `hsl(${h}, 70%, 70%)`;
    const bg = `hsl(${h}, 90%, 96%)`;
    return { fg, bd, bg };
  }



  async function onDetectPatterns(){
    selectedPatternUid = null;
    const listEl = document.getElementById('patternList');
    if (listEl) {
      listEl.classList.remove('has-selection');
      listEl.querySelectorAll('.pattern-item.active').forEach(x => x.classList.remove('active'));
    }
    if (candleChart) candleChart.update('none');

    if(!currentCode){ alert('종목을 먼저 선택하세요.'); return; }
    const enabled = Array.from(document.querySelectorAll('.pattern-btn.active'))
    .map(b => b.dataset.value);
    if (enabled.length === 0) { alert('패턴 유형을 하나 이상 선택하세요.'); return; }
    const days = getDaysValidated();
    if (days == null) return;

    try{
      const res = await fetch('/detect_patterns', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ code: currentCode, days, patterns: enabled })
      });
      const j = await res.json();
      renderPatternList(j.matches || []);
      drawPatternMarkers(j.matches || []);
    }catch(e){
      console.error(e);
      alert('패턴 탐지에 실패했습니다.');
    }
  }


  // 점수 패널 닫기
  document.getElementById('scoreClose').addEventListener('click', () => {
    document.getElementById('scorePanel').classList.add('hidden');
  });
}

function getDaysValidated() {
  const raw = document.getElementById('daysInput').value;
  const days = parseInt(raw, 10);
  if (!Number.isFinite(days) || days < 10 || days > 100) {
    alert('조회 일자는 10~100일 사이에서 선택해 주세요.');
    return null;
  }
  return days;
}

async function loadLatestTradingDate() {
  try {
    const r = await fetch('/get_latest_trading_date');
    const j = await r.json();
    latestTradingDate = j.latest_trading_date ?? j.latest_date ?? '-';
  } catch(e) { latestTradingDate = '-'; }
  document.getElementById('latestDate').textContent = `조회 기준: ${latestTradingDate}`;
}

async function loadStockList() {
  const listEl = document.getElementById('stockList');
  listEl.innerHTML = '로딩중...';

  try {
   const res = await fetch('/get_kospi50');
   const top50 = await res.json();

    top50.sort((a, b) => {
      const ak = (a['회사명'] || '');
      const bk = (b['회사명'] || '');
      const c = ak.localeCompare(bk, 'ko', { sensitivity: 'base' });
      if (c !== 0) return c;

      const ae = (a['영문명'] || a['종목코드'] || '');
      const be = (b['영문명'] || b['종목코드'] || '');
      return ae.localeCompare(be, 'en', { numeric: true, sensitivity: 'base' });
    });

    listEl.innerHTML = '';
    top50.forEach(item => {
      const li = document.createElement('div');
      li.className = 'stock-item';
      li.dataset.code = item['종목코드'];
      li.innerHTML = `<span>${item['회사명']}</span>
                      <span style="color:#666">${item['영문명'] ?? item['종목코드']}</span>`;
      li.addEventListener('click', () => onSelectStock(li));
      listEl.appendChild(li);
    });

    // 첫 종목 자동 로드
    if (top50.length) {
      const first = listEl.querySelector('.stock-item');
      first.classList.add('active');
      onSelectStock(first);
    }
  } catch (e) {
    listEl.innerHTML = '종목 리스트를 불러오지 못했습니다.';
    console.error(e);
  }
}

function filterStockList() {
  const q = (document.getElementById('searchInput').value || '').trim();
  document.querySelectorAll('.stock-item').forEach(el => {
    const name = el.querySelector('span').textContent;
    el.style.display = name.includes(q) ? '' : 'none';
  });
}

function resetMetricsUI() {
  activeMetrics.clear();
  // 버튼 off
  document.querySelectorAll('.metric-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  });
  // 차트에서 지표 레이어 제거
  if (candleChart) {
    candleChart.data.datasets.forEach(ds => {
      if (ds._metricKey) { ds.hidden = true; ds.data = []; }
    });
    candleChart.update('none');
  }
}

function onSelectStock(el) {
  document.querySelectorAll('.stock-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  currentCode = el.dataset.code;
  const d0 = getDaysValidated() ?? 30;
  prefetchMetrics(currentCode, d0);
  resetPatternUI();      
  resetMetricsUI();
  loadAndRender(currentCode);
}

function resetPatternUI() {
  // 리스트/카운트
  const ul = document.getElementById('patternList');
  if (ul) { ul.classList.remove('has-selection'); ul.innerHTML = ''; }
  const badge = document.getElementById('patternCount');
  if (badge) badge.textContent = '0';
  selectedPatternUid = null;

  // 점수 패널 숨김
  const pnl = document.getElementById('scorePanel');
  if (pnl) pnl.classList.add('hidden');

  // 차트의 패턴 오버레이 제거
  if (candleChart) {
    candleChart.data.datasets = candleChart.data.datasets.filter(ds => ds._pattern !== true);
    candleChart.update('none');
  }
  patternBoxes = [];
}


async function loadAndRender(code, daysParam) {
  const days = (daysParam ?? getDaysValidated());
  if (days == null) return;
  const fd = new FormData();
  fd.append('code', code);
  fd.append('days', String(days));
  fd.append('ma', 'true');
  fd.append('bollinger', 'true');
  fd.append('psar', 'true');

  try {
    const res = await fetch('/get_ohlc_history', { method:'POST', body:fd });
    const j = await res.json();
    renderChart(j, code);
    // const hint = document.getElementById('emptyHint'); if (hint) hint.textContent = '패턴 검색을 눌러 결과를 확인하세요.';
  } catch (e) {
    console.error(e);
    alert('차트 데이터를 불러오지 못했습니다.');
  }
  prefetchMetrics(code, days);
}

function parseKRDate(s){
  return (s || '').trim().replace(/\./g, '-');
}

function num(x){ return (x==null) ? null : (typeof x==='number' ? x : parseFloat(String(x).replace(/,/g,''))); }

function lockYAxisFromMain() {
  if (!candleChart) return;
  const ex = candleChart.data?.datasets?.[0]?.extraData || [];
  const lows  = ex.map(d=>d.low).filter(Number.isFinite);
  const highs = ex.map(d=>d.high).filter(Number.isFinite);
  if (!lows.length || !highs.length) return;
  const lo = Math.min(...lows);
  const hi = Math.max(...highs);
  const pad = Math.max((hi - lo) * 0.06, lo * 0.03);
  const y = candleChart.options.scales.y;
  y.beginAtZero = false;
  y.min = lo - pad;
  y.max = hi + pad;
}


function toCandlePoints(j){
  const arr = [];
  for(let i=0;i<j.dates.length;i++){
    arr.push({ x: j.dates[i], o: j.opens[i], h: j.highs[i], l: j.lows[i], c: j.closes[i] });
  }
  return arr;
}
function toLineSeries(dates, series){
  const out = [];
  for(let i=0;i<dates.length;i++){
    const v = num(series[i]);
    if(v==null || Number.isNaN(v)) continue;
    out.push({ x: dates[i], y: v });
  }
  return out;
}

function renderChart(j, code){
  const canvasEl = document.getElementById('candleChart');
  // 이미 사용 중인 캔버스가 있으면 파괴
  const prev = Chart.getChart(canvasEl);
  if (prev) prev.destroy();
  const ctx = canvasEl.getContext('2d');
  const labels = j.dates.slice();
  const barData = [];
  const barColors = [];
  const extraData = [];
  for (let i=0; i<labels.length; i++){
    const o = num(j.opens[i]),  c = num(j.closes[i]),
          h = num(j.highs[i]),  l = num(j.lows[i]),
          v = num(j.volumes[i]);
    barData.push([o, c]);                                   // [open, close]
    const color = c > o ? '#ff4f4f' : (c < o ? '#4f4fff' : 'black');
    barColors.push(color);
    extraData.push({ open:o, close:c, high:h, low:l, volume:v, color });
  }

  const highLowLinePlugin = {
    id: 'highLowLinePlugin',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta) return;
      const y = chart.scales.y;
      const ctx = chart.ctx;
      const ds = chart.data.datasets[0];
      const ex = ds.extraData || [];
      meta.data.forEach((bar, idx) => {
        const it = ex[idx]; if (!bar || !it) return;
        const x = bar.x;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = it.color; ctx.lineWidth = 0.7;
        ctx.moveTo(x, y.getPixelForValue(it.high));
        ctx.lineTo(x, y.getPixelForValue(it.low));
        ctx.stroke();
        // 시가==종가이면 작은 가로선
        if (it.open === it.close) {
          ctx.beginPath();
          ctx.moveTo(x - bar.width/2, y.getPixelForValue(it.open));
          ctx.lineTo(x + bar.width/2, y.getPixelForValue(it.open));
          ctx.stroke();
        }
        ctx.restore();
      });
    }
  };

  const patternBoxPlugin = {
    id: 'patternBoxPlugin',
    afterDatasetsDraw(chart) {
      if (!patternBoxes.length) return;
      const meta = chart.getDatasetMeta(0); // 메인 바 데이터셋
      if (!meta || !meta.data || !meta.data.length) return;
      const y = chart.scales.y;
      const ctx = chart.ctx;
      const ex = chart.data.datasets[0].extraData || [];

      patternBoxes.forEach(box => {
        const s = Math.max(0, Math.min(box.start_idx, box.end_idx));
        const e = Math.max(0, Math.max(box.start_idx, box.end_idx));
        const startEl = meta.data[s];
        const endEl   = meta.data[e];
        if (!startEl || !endEl) return;

        // x 범위(양 끝 바의 외곽)
        const left  = Math.min(startEl.x - startEl.width/2, endEl.x - endEl.width/2);
        const right = Math.max(startEl.x + startEl.width/2, endEl.x + endEl.width/2);

        // y 범위(해당 구간의 고/저 범위)
        const span = ex.slice(s, e + 1);
        if (!span.length) return;
        const maxHigh = Math.max(...span.map(d => d.high));
        const minLow  = Math.min(...span.map(d => d.low));
        const top    = y.getPixelForValue(maxHigh);
        const bottom = y.getPixelForValue(minLow);

        // 패딩 & 그리기
        const pad = 4; // px
        const x = left - pad, w = (right - left) + pad*2;
        const yTop = top - pad, h = (bottom - top) + pad*2;

        ctx.save();
        ctx.setLineDash([5,3]);
        ctx.lineWidth = 1.2;
        const isSelected = !selectedPatternUid || (box.uid === selectedPatternUid);
        // 선택된 것만 진하게, 나머지는 연한 회색+흰 기운
        const strong = box.direction === 'up' ? 'rgba(0,150,0,0.9)' : 'rgba(200,0,0,0.9)';
        const dim    = 'rgba(220,220,220,0.85)';
        ctx.strokeStyle = isSelected ? strong : dim;
        ctx.strokeRect(x, yTop, w, h);

        // 라벨(우상단)
        if (box.name) {
          ctx.font = '12px Arial';
          ctx.fillStyle = isSelected ? strong : dim;
          const tw = ctx.measureText(box.name).width;
          const tx = x + w - tw - 6;
          const ty = (box.direction === 'down')
            ? (yTop + h + 12)   // 하락: 네모 아래쪽
            : (yTop - 6);       // 상승: 네모 위쪽(기존)
          ctx.fillText(box.name, tx, ty);
        }
        ctx.restore();
      });
    }
  };


  const datasets = [
    {
      type:'bar',
      label:'일봉',
      data: barData,                  // [open, close]
      backgroundColor: barColors,
      borderSkipped: false,
      barPercentage: 0.9,
      categoryPercentage: 0.9,
      extraData: extraData            // 위크(고저) 그릴 때 사용
    },
  ];

  const lows  = extraData.map(d=>d.low).filter(Number.isFinite);
  const highs = extraData.map(d=>d.high).filter(Number.isFinite);
  let yMin, yMax;
  if (lows.length && highs.length) {
    const lo = Math.min(...lows);
    const hi = Math.max(...highs);
    const pad = Math.max((hi - lo) * 0.06, lo * 0.03); // 6%(+플랫 대비 3%) 패딩
    yMin = lo - pad;
    yMax = hi + pad;
  }

  const options = {
    responsive:true, maintainAspectRatio:false,
    animation:{ duration: 600 },
    animations:{
      x: { type:'number', duration: 300, delay: (ctx)=> ctx.dataIndex * 10 },
      y: { type:'number', duration: 300, delay: (ctx)=> ctx.dataIndex * 10, easing:'easeOutQuart' }
    },
    scales:{
      x:{ type:'category', ticks:{ maxRotation:0 }, grid:{ display:false }},
      y:{
        position:'right',
        grid:{ color:'rgba(0,0,0,.06)' },
        beginAtZero:false,
        min: yMin, max: yMax,
        ticks:{
          // 첫 번째(맨 아래)와 마지막(맨 위) 라벨은 숨김
          callback: (value, index, ticks) =>
            (index === 0 || index === ticks.length - 1)
              ? ''
              : new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value),
          padding: 4,
          maxTicksLimit: 8
        }
      },
      y2:{
        position:'right',
        min:0, max:100,
        grid:{ drawOnChartArea:false },
        display:false            // 눈금은 숨기고 선만 겹치게
      }
    },
    plugins:{
      legend:{ display:false },
      tooltip:{
        mode:'index', intersect:false, displayColors:false, padding:8,
        bodySpacing:4, titleSpacing:6
      },
      zoom:{ pan:{enabled:true,mode:'x'}, zoom:{wheel:{enabled:true}, pinch:{enabled:true}, mode:'x'} }
    }
  };

  const isMobile = window.matchMedia('(max-width:1080px)').matches;
  options.plugins = options.plugins || {};
  options.plugins.tooltip = Object.assign({ enabled: true }, options.plugins.tooltip);
  if (isMobile) options.plugins.tooltip.enabled = false;

  candleChart = new Chart(ctx, { type:'bar', data:{ labels, datasets }, options, plugins:[highLowLinePlugin, patternBoxPlugin] });
  ensureMetricDatasetsPrimed(candleChart);
  lockYAxisFromMain();
  candleChart.update('none');

  // 라벨
  document.getElementById('chartLabel').style.visibility='visible';
  document.getElementById('chartLabel').textContent = `${code} · 최근 ${j.dates.length}일`;
  document.getElementById('maLabel').style.visibility='visible';
  document.getElementById('maLabel').textContent = `종가: ${j.closes.at(-1)} · 거래량: ${j.volumes.at(-1)}`;
}



function toggleOverlay(){
  if(!candleChart) return;
  const showMA  = document.getElementById('toggleMA').checked;
  const showBB  = document.getElementById('toggleBB').checked;
  const showPS  = document.getElementById('togglePSAR').checked;
  candleChart.data.datasets[1].hidden = candleChart.data.datasets[2].hidden = candleChart.data.datasets[3].hidden = !showMA;
  candleChart.data.datasets[4].hidden = candleChart.data.datasets[5].hidden = candleChart.data.datasets[6].hidden = !showBB;
  candleChart.data.datasets[7].hidden = !showPS;
  candleChart.update();
}



// ===== Metrics (new clean keys only) =========================================

const METRIC_KEYS   = ['breadth','lowvol','momentum','eqbond'];
const METRIC_LABELS = {
  breadth:  'Breadth (Up/Down Vol %ile)',
  lowvol:   'Low-Vol Greed (100 − RV %ile)',
  momentum: 'Momentum vs MA125 %ile',
  eqbond:   'EQ–BOND 20D Spread %ile',
};
const METRIC_COLOR  = {
  breadth:  '#7e57c2',
  lowvol:   '#26a69a',
  momentum: '#ff7043',
  eqbond:   '#546e7a',
};

// 결과/진행중 캐시 (중복 요청 합치기)
const metricsCache   = new Map(); // key: `${code}-${days}` -> { breadth:[], ... }
const metricsPending = new Map();


// 이 함수 전체 교체
async function getMetricsSeries(code, days, latestISO) {
  if (!latestISO) latestISO = currentLatestISO();
  const k = `${code}-${latestISO}-${days}`;
  if (metricsCache.has(k))   return metricsCache.get(k);
  if (metricsPending.has(k)) return metricsPending.get(k);

  const url = `/get_metrics?code=${code}&days=${days}&minp=5&latest=${encodeURIComponent(latestISO)}`;
  const label = `[METRICS fetch] ${k}`;
  console.time(label);

  const p = (async () => {
    try {
      const res   = await fetch(url);
      const json  = await res.json();
      const series = json?.series || {};
      metricsCache.set(k, series);
      return series;
    } finally {
      console.timeEnd(label);
      metricsPending.delete(k);
    }
  })();

  metricsPending.set(k, p);
  return p;
}

async function prefetchMetrics(code, days){
  const latestISO = currentLatestISO();
  try { await getMetricsSeries(code, days, latestISO); } catch(e){}
}


const _normDate = s => String(s).replace(/-/g,'.');
const _clamp01  = v => Math.max(0, Math.min(100, v));

// 차트 라벨과 교집합(존재하는 x만)으로 포인트 정규화
function normalizeMetricPoints(rows, labelSet){
  return (Array.isArray(rows) ? rows : [])
    .filter(r => r && r.value != null)
    .map(r => ({ x: _normDate(r.date), y: _clamp01(r.value) }))
    .filter(p => labelSet.has(p.x));
}

// 해당 키의 데이터셋 index 찾기 (없으면 -1)
function metricIndexOf(key){
  if (!candleChart) return -1;
  return candleChart.data.datasets.findIndex(d => d._metricKey === key);
}

// 데이터셋 템플릿 (빈 데이터 + 숨김 + 전용 트랜지션)
function metricTemplate(key){
  return {
    type: 'line',
    label: METRIC_LABELS[key] || key.toUpperCase(),
    _metricKey: key,
    data: [],
    hidden: true,
    yAxisID: 'y2',
    parsing: false,
    borderColor: METRIC_COLOR[key] || '#333',
    pointRadius: 0,
    borderWidth: 1.6,
    tension: 0.15,
    spanGaps: false,
    // ★ show/hide 전용 트랜지션(전역/타 데이터셋은 건드리지 않음)
    transitions: {
      show: { animations: {
        x: { type:'number', duration:600, easing:'easeOutCubic' },
        y: { type:'number', duration:600, easing:'easeOutCubic',
             from: (ctx) => {
               const s = ctx.chart.scales.y2 || ctx.chart.scales.y;
               return s ? s.getPixelForValue(0) : ctx.chart.chartArea.bottom;
             } }
      }},
      hide: { animations: {
        x: { type:'number', duration:250, easing:'easeOutQuad' },
        y: { type:'number', duration:250, easing:'easeOutQuad',
             to: (ctx) => ctx.chart.chartArea.bottom }
      }}
    }
  };
}

// 차트 생성 직후 4개 메트릭 데이터셋을 항상 미리 올려둠(빈+hidden)
function ensureMetricDatasetsPrimed(chart){
  const have = new Set(chart.data.datasets.filter(d => d._metricKey).map(d => d._metricKey));
  METRIC_KEYS.forEach(k => {
    if (!have.has(k)) chart.data.datasets.push(metricTemplate(k));
  });
}

// --- 버튼 바인딩(토글은 visibility만 변경) ------------------------------------
function bindMetricButtons(){
  document.querySelectorAll('.metric-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key; // breadth | lowvol | momentum | eqbond
      if (!key || !METRIC_KEYS.includes(key) || !candleChart) return;

      const code = currentCode;
      const days = getDaysValidated() ?? 30;

      // 토글 상태
      const isOn = !activeMetrics.has(key);

      // 켤 때는 데이터가 비어 있으면 채움, 그 외엔 바로 보이기만
      if (isOn) {
        btn.disabled = true;
        try {
          const series = await getMetricsSeries(code, days);
          const rows   = Array.isArray(series[key]) ? series[key] : [];
          const labels = candleChart.data.labels.map(String);
          const pts    = normalizeMetricPoints(rows, new Set(labels));

          // 데이터셋 보장
          let idx = metricIndexOf(key);
          if (idx < 0) {
            ensureMetricDatasetsPrimed(candleChart);
            idx = metricIndexOf(key);
          }
          const ds = candleChart.data.datasets[idx];
          if (!ds.data || ds.data.length === 0) ds.data = pts; // 최초 1회만 세팅

          // 보이기 (이 데이터셋만 애니메이션; 전역/타 데이터셋 건드리지 않음)
          ds.hidden = false;
          candleChart.update();

          activeMetrics.add(key);
          btn.classList.add('active');
          btn.setAttribute('aria-pressed','true');
        } finally {
          btn.disabled = false;
        }
      } else {
        // 끄기: 숨김만 하고 데이터셋은 보존(항상 존재)
        const idx = metricIndexOf(key);
        if (idx >= 0) {
          candleChart.data.datasets[idx].hidden = true;
          candleChart.update();
        }
        activeMetrics.delete(key);
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed','false');
      }
    });
  });
}

// call once during page init
bindMetricButtons();


function renderPatternList(matches){
  const ul = document.getElementById('patternList');
  ul.innerHTML = '';
  lastMatches = matches.slice();
  if(!matches.length){
    ul.innerHTML = '<li class="pattern-item">탐지된 패턴이 없습니다.</li>';
    { const badge = document.getElementById('patternCount'); if (badge) badge.textContent = '0'; }
    return;
  }
  matches.forEach((m, i) => {
    const li = document.createElement('li');
    li.className = 'pattern-item';
    li.dataset.index = String(i);
    li.dataset.start = m.start_date;
    li.dataset.end = m.end_date;
    li.dataset.direction = m.direction;
    li.dataset.mode = m.clazz;
    li.dataset.uid = `${m.start_idx}-${m.end_idx}-${m.name}`;
    li.style.setProperty('--stagger', i);
    li.innerHTML = `
    <div class="pattern-info">
      <div class="range">${m.start_date} ~ ${m.end_date}</div>
      <div class="name">${m.name}</div>
      <div class="desc">${m.explain}</div>
      <button class="score-btn">점수 보기</button>
    </div>
    <div class="pattern-thumb">${patternIconSVG(m.name, m.direction)}</div>
    `;
    ul.appendChild(li);
  });
   { const badge = document.getElementById('patternCount'); if (badge) badge.textContent = String(matches.length); }
}

function drawPatternMarkers(matches){
  if(!candleChart) return;
  // 기존 패턴 레이어 제거
  candleChart.data.datasets = candleChart.data.datasets.filter(ds => ds._pattern !== true);

  patternBoxes = matches.map(m => ({
    start_idx: m.start_idx,
    end_idx: m.end_idx,
    direction: m.direction,
    name: m.name,
    uid: `${m.start_idx}-${m.end_idx}-${m.name}`
  }));
  lockYAxisFromMain();
  candleChart.update('none');
  patternLayer = true;
}

// 미니 캔들 아이콘: normalized(0~1) 값으로 간단한 2~5개 봉을 그립니다.
function _miniCandleSVG(candles, {w=52, h=32, bar=8, gap=6}={}){
  const up   = '#ff4f4f';  // 상승(네가 쓰는 빨강)
  const down = '#4f4fff';  // 하락(네가 쓰는 파랑)
  const midY = 4, spanY = 34; // 안쪽 패딩
  const y = v => midY + (1 - v) * spanY; // 0=바닥, 1=천장

  const pick = k => (k === 'up' ? up : (k === 'down' ? down : '#999'));
  let x = 2, svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;

  for (const c of candles){
    const color = pick(c.color);
    const yO=y(c.o), yC=y(c.c), yH=y(c.h), yL=y(c.l);
    const top = Math.min(yO,yC), bot=Math.max(yO,yC), bw=bar, cx=x+bw/2;

    svg += `<line x1="${cx}" y1="${yH}" x2="${cx}" y2="${yL}" stroke="${color}" stroke-width="1"/>`;
    svg += `<rect x="${x}" y="${top}" width="${bw}" height="${Math.max(1, bot-top)}" fill="${color}"/>`;
    x += bar + gap;
  }
  return svg + `</svg>`;
}

// 패턴명 → 미니 아이콘 모델(간단화된 2~5개 봉) 매핑
function patternIconSVG(name, direction){
  // 편의: 약어 키
  const U='up', D='down', N='neutral';

  // 각 패턴을 상징하는 간단한 배열(0~1 정규화)
  // [ {o,c,h,l,color}, ... ]
  const ICONS = {
    // 상승 반전
    'Morning Star': [
      {o:.80, c:.28, h:.92, l:.24, color:D},          // 긴 음봉
      {o:.56, c:.56, h:.62, l:.52, color:N},          // 작은 몸통
      {o:.42, c:.90, h:.95, l:.40, color:U}           // 강한 양봉(중간선 돌파)
    ],
    'Bullish Engulfing': [
      {o:.78, c:.32, h:.86, l:.28, color:D},
      {o:.40, c:.90, h:.95, l:.38, color:U}
    ],
    'Bullish Harami': [
      {o:.80, c:.34, h:.88, l:.30, color:D},
      {o:.58, c:.70, h:.74, l:.56, color:U}           // 작은 양봉(안쪽)
    ],
    'Piercing Line': [
      {o:.86, c:.30, h:.92, l:.26, color:D},
      {o:.36, c:.66, h:.74, l:.34, color:U}           // 중간선 위, 갭다운 느낌
    ],
    'Bullish Counter-attack': [
      {o:.78, c:.36, h:.86, l:.30, color:D},
      {o:.40, c:.36, h:.74, l:.34, color:U}           // 종가 근접
    ],

    // 상승 지속
    'Rising Three Methods': [
      {o:.42, c:.88, h:.94, l:.40, color:U},          // 장대 양봉
      {o:.72, c:.54, h:.66, l:.52, color:D},          // 작은 조정들(안쪽)
      {o:.71, c:.56, h:.65, l:.54, color:D},
      {o:.70, c:.57, h:.64, l:.55, color:D},
      {o:.58, c:.94, h:.97, l:.58, color:U}           // 돌파 양봉
    ],
    'Upside Tasuki Gap': [
      {o:.44, c:.84, h:.90, l:.42, color:U},
      {o:.56, c:.92, h:.97, l:.54, color:U},          // 갭업
      {o:.70, c:.60, h:.68, l:.58, color:D}           // 일부 메움
    ],
    'Bullish Separating Lines': [
      {o:.66, c:.46, h:.70, l:.44, color:D},
      {o:.66, c:.90, h:.96, l:.64, color:U}           // 동일시가
    ],
    'Bullish Three-Line Strike': [
      {o:.48, c:.76, h:.82, l:.46, color:U},
      {o:.54, c:.84, h:.90, l:.52, color:U},
      {o:.60, c:.92, h:.97, l:.58, color:U},
      {o:.96, c:.32, h:.98, l:.30, color:D}           // 장대 음봉이 모두 감쌈
    ],
    'Three White Soldiers': [
      {o:.48, c:.78, h:.82, l:.46, color:U},
      {o:.54, c:.86, h:.90, l:.52, color:U},
      {o:.60, c:.94, h:.98, l:.58, color:U}
    ],

    // 하락 반전
    'Evening Star': [
      {o:.36, c:.90, h:.96, l:.34, color:U},
      {o:.58, c:.58, h:.64, l:.54, color:N},
      {o:.88, c:.34, h:.92, l:.30, color:D}
    ],
    'Bearish Engulfing': [
      {o:.42, c:.86, h:.92, l:.40, color:U},
      {o:.92, c:.36, h:.96, l:.34, color:D}
    ],
    'Bearish Harami': [
      {o:.44, c:.88, h:.94, l:.42, color:U},
      {o:.62, c:.50, h:.66, l:.48, color:D}
    ],
    'Dark Cloud Cover': [
      {o:.38, c:.90, h:.96, l:.36, color:U},
      {o:.94, c:.52, h:.98, l:.48, color:D}           // 중간선 아래
    ],
    'Bearish Counter-attack': [
      {o:.40, c:.86, h:.92, l:.38, color:U},
      {o:.40, c:.86, h:.92, l:.38, color:D}           // 종가 근접
    ],

    // 하락 지속
    'Falling Three Methods': [
      {o:.92, c:.34, h:.96, l:.32, color:D},
      {o:.62, c:.70, h:.74, l:.60, color:U},
      {o:.63, c:.68, h:.72, l:.61, color:U},
      {o:.64, c:.66, h:.70, l:.62, color:U},
      {o:.58, c:.26, h:.60, l:.24, color:D}
    ],
    'Downside Tasuki Gap': [
      {o:.92, c:.44, h:.96, l:.42, color:D},
      {o:.84, c:.34, h:.86, l:.30, color:D},          // 갭다운
      {o:.72, c:.50, h:.56, l:.48, color:U}           // 일부 메움
    ],
    'Bearish Separating Lines': [
      {o:.58, c:.86, h:.92, l:.56, color:U},
      {o:.58, c:.34, h:.62, l:.30, color:D}           // 동일시가
    ],
    'Three Black Crows': [
      {o:.74, c:.50, h:.78, l:.46, color:D},
      {o:.70, c:.40, h:.74, l:.36, color:D},
      {o:.66, c:.30, h:.70, l:.26, color:D}
    ],
    'In-Neck': [
      {o:.96, c:.34, h:.98, l:.30, color:D},
      {o:.28, c:.34, h:.40, l:.26, color:U}           // 저가 근접
    ],
    'Thrusting Line': [
      {o:.96, c:.34, h:.98, l:.30, color:D},
      {o:.28, c:.52, h:.60, l:.26, color:U}           // 몸통 내부, 중간선 미달
    ]
  };

  const model = ICONS[name] || [{o:.5,c:.5,h:.6,l:.4,color:'neutral'}];
  return _miniCandleSVG(model);
}

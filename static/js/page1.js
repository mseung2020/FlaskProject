// page1.js
// IIFE (즉시 실행 함수)로 전체 스크립트를 캡슐화하여 전역 변수 충돌을 방지합니다.
(function() {
  'use strict';

  // ========== App State ==========
  const AppState = {
    allStocks: [],
    currentCode: null,
    selectedItemElement: null,
    charts: {
      main: null,       // 캔들 차트
      volume: null,     // 거래량 차트
      tradingvalue: null,
      macd: null,
      rsi: null,
      stoch: null,
      stochrsi: null,
      williams: null,
      cci: null,
      atr: null,
      roc: null,
      uo: null,
      adx: null
    }
  };

  // ========== Helper Functions ==========
  function formatNumber(num) {
    return Number(num).toLocaleString('en-US');
  }
  function formatDate(str) {
    return str.replace(/\./g, '/');
  }

  // ========== 공통 차트 옵션 ==========
  const commonChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500, easing: 'linear' },
    layout: { padding: { top: 20, bottom: 20, left: 20, right: 40 } },
    scales: {
      x: {
        display: false,
        type: 'category',
        offset: true,
        categoryPercentage: 0.8,
        barPercentage: 0.9,
        grid: { display: false },
        ticks: {
          align: 'start',
          maxTicksLimit: 5,
          callback: function(value) {
            return this.getLabelForValue(value);
          }
        }
      },
      y: {
        display: false,
        beginAtZero: false,
        ticks: {
          callback: function(value) {
            return value.toLocaleString();
          }
        }
      }
    },
    plugins: {
      tooltip: { enabled: true, mode: 'nearest', intersect: true },
      legend: { display: false }
    },
    events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove']
  };

  const volumeChartOptions = {
    ...commonChartOptions,
    scales: {
      x: {
        display: false,
        type: 'category',
        offset: true,
        categoryPercentage: 0.8,
        barPercentage: 0.9,
        grid: { display: false },
        ticks: {
          align: 'start',
          maxTicksLimit: 5,
          callback: function(value) {
            return this.getLabelForValue(value);
          }
        }
      },
      y: {
        display: false,
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return Math.abs(value) >= 1000 ? (value / 1000).toLocaleString() : value.toLocaleString();
          }
        }
      }
    }
  };

  // ========== Chart.js 플러그인 ==========
  // 캔들 차트용 플러그인: 고가/저가 선, 거래량 0인 경우 표시, 최고/최저가 마커 그리기
  const highLowLinePlugin = {
    id: 'highLowLinePlugin',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta) return;
      const dataset = chart.data.datasets[0];
      const barExtra = dataset.extraData || [];
      const yScale = chart.scales.y;
      const ctx = chart.ctx;

      meta.data.forEach((barElem, idx) => {
        if (!barElem) return;
        const { x, width } = barElem.getProps(['x', 'width'], false);
        const halfW = width / 2;
        const item = barExtra[idx];
        if (!item) return;

        // 거래량 0이면, 이전 종가 기준 가로 선 표시
        if (item.volume === 0) {
          if (item.zeroVolumeLinePrice != null) {
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1.0;
            const yLine = yScale.getPixelForValue(item.zeroVolumeLinePrice);
            ctx.moveTo(x - halfW, yLine);
            ctx.lineTo(x + halfW, yLine);
            ctx.stroke();
            ctx.restore();
          }
          return;
        }

        // 거래량 > 0이면 고가와 저가 선 그리기
        const yHigh = yScale.getPixelForValue(item.high);
        const yLow = yScale.getPixelForValue(item.low);
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 0.7;
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();
        ctx.restore();

        // 시가와 종가가 같은 경우 가로 선 표시
        if (item.open === item.close) {
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 0.7;
          const ySame = yScale.getPixelForValue(item.open);
          ctx.moveTo(x - halfW, ySame);
          ctx.lineTo(x + halfW, ySame);
          ctx.stroke();
          ctx.restore();
        }
      });

      // 최고/최저 가격 마커 표시
      const cm = chart.data.customMarkers;
      if (!cm || !cm.validForMarkers) return;
      if (cm.maxHighIndex >= 0 && cm.maxHighIndex < meta.data.length) {
        const bElem = meta.data[cm.maxHighIndex];
        if (bElem) {
          const xM = bElem.getProps(['x'], false).x;
          const yM = yScale.getPixelForValue(cm.maxHigh);
          ctx.save();
          ctx.font = '12px Arial';
          ctx.fillStyle = 'red';
          const txt = `최고 ${formatNumber(cm.maxHigh)} (${formatDate(cm.maxHighDate)})`;
          ctx.fillText(txt, xM + 5, yM - 5);
          ctx.restore();
        }
      }
      if (cm.minLowIndex >= 0 && cm.minLowIndex < meta.data.length) {
        const bElem = meta.data[cm.minLowIndex];
        if (bElem) {
          const xM = bElem.getProps(['x'], false).x;
          const yM = yScale.getPixelForValue(cm.minLow);
          ctx.save();
          ctx.font = '12px Arial';
          ctx.fillStyle = 'blue';
          const txt = `최저 ${formatNumber(cm.minLow)} (${formatDate(cm.minLowDate)})`;
          ctx.fillText(txt, xM + 5, yM + 15);
          ctx.restore();
        }
      }
    }
  };

  // X축 눈금 강제 표시 플러그인
  const customXTicksPlugin = {
    id: 'customXTicksPlugin',
    afterDatasetsDraw(chart) {
      const { ctx, scales: { x, y } } = chart;
      if (!x || !y) return;
      const ticks = x.ticks;
      if (!ticks || ticks.length === 0) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(150, 150, 150, 0.7)';
      ctx.lineWidth = 0.5;
      ticks.forEach(tick => {
        const xPos = x.getPixelForValue(tick.value);
        ctx.beginPath();
        ctx.moveTo(xPos, y.bottom);
        ctx.lineTo(xPos, y.bottom + 7);
        ctx.stroke();
      });
      ctx.restore();
    }
  };

  // 수평선 플러그인 생성 함수 (예: 30,70 / 20,80 / 0 등)
  const createHorizontalLinePlugin = (levels, dash = [5, 5]) => ({
    id: 'HorizontalLinePlugin_' + levels.join('_'),
    afterDraw(chart) {
      const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
      ctx.save();
      ctx.setLineDash(dash);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'gray';
      levels.forEach(level => {
        const yPos = y.getPixelForValue(level);
        if (yPos >= top && yPos <= bottom) {
          ctx.beginPath();
          ctx.moveTo(left, yPos);
          ctx.lineTo(right, yPos);
          ctx.stroke();
        }
      });
      ctx.restore();
    }
  });
  // 미리 정의된 플러그인들
  const HorizontalLinePlugin3070 = createHorizontalLinePlugin([30, 70]);
  const HorizontalLinePlugin2080 = createHorizontalLinePlugin([20, 80]);
  const HorizontalLinePlugin2080M = createHorizontalLinePlugin([-20, -80]);
  const HorizontalLinePlugin100 = createHorizontalLinePlugin([-100, 100]);
  const HorizontalLinePlugin0 = createHorizontalLinePlugin([0]);

  // ========== 초기화 함수 ==========
  function init() {
    document.getElementById("toggleVolume").checked = true;
    document.getElementById("toggleMovingAverage").checked = true;
    loadStockList();
    initAllCharts();
    setupEventListeners();
    setupCheckboxControls();
    updateIndicatorVisibility();
    fetchLatestTradingDate();
  }

  function loadStockList() {
    fetch('/get_stock_list')
      .then(res => res.json())
      .then(data => {
        AppState.allStocks = data;
        renderStockList(data);
      })
      .catch(err => alert('종목 리스트 로드 오류: ' + err));
  }

  function initAllCharts() {
    initMainChart();
    initVolumeChart();
    initTradingvalueChart();
    initMacdChart();
    initRsiChart();
    initStochChart();
    initStochrsiChart();
    initWilliamsChart();
    initCciChart();
    initAtrChart();
    initRocChart();
    initUoChart();
    initAdxChart();
  }

  function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('keyup', e => {
      if (e.key === 'Enter') searchByName();
    });
    document.getElementById('daysInput').addEventListener('keyup', e => {
      if (e.key === 'Enter') requestChart();
    });
    document.getElementById('toggleMovingAverage').addEventListener('change', function() {
      if (this.checked) addMovingAverages();
      else removeMovingAverages();
    });
    document.getElementById('togglebollinger').addEventListener('change', function() {
      if (this.checked) addBollinger();
      else removeBollinger();
    });
    // 개별 보조지표 토글 이벤트 (배열로 관리)
    const indicatorToggles = [
      { id: "toggleTradingvalue", add: addTradingvalueChart, remove: removeTradingvalueChart },
      { id: "toggleMACD", add: addMacdChart, remove: removeMacdChart },
      { id: "toggleRSI", add: addRsiChart, remove: removeRsiChart },
      { id: "toggleSTOCH", add: addStochChart, remove: removeStochChart },
      { id: "toggleSTOCHRSI", add: addStochrsiChart, remove: removeStochrsiChart },
      { id: "toggleWILLIAMS", add: addWilliamsChart, remove: removeWilliamsChart },
      { id: "toggleCCI", add: addCciChart, remove: removeCciChart },
      { id: "toggleATR", add: addAtrChart, remove: removeAtrChart },
      { id: "toggleROC", add: addRocChart, remove: removeRocChart },
      { id: "toggleUO", add: addUoChart, remove: removeUoChart },
      { id: "toggleADX", add: addAdxChart, remove: removeAdxChart }
    ];
    indicatorToggles.forEach(item => {
      const el = document.getElementById(item.id);
      el.addEventListener('change', function() {
        if (this.checked) item.add();
        else item.remove();
        updateIndicatorVisibility();
      });
    });
  }

  function setupCheckboxControls() {
    const container = document.getElementById("toggleSections2");
    container.addEventListener("change", function(e) {
      if (e.target && e.target.type === "checkbox") {
        const checkboxes = container.querySelectorAll("input[type='checkbox']");
        if (e.target.checked) {
          checkboxes.forEach(chk => { if (chk !== e.target) chk.checked = false; });
        }
        updateIndicatorVisibility();
      }
    });
  }

  function updateIndicatorVisibility() {
    const indicators = [
      { toggle: "toggleVolume", box: "volumeBox", chart: "myVolumeChart" },
      { toggle: "toggleTradingvalue", box: "tradingvalueBox", chart: "tradingvalueChart" },
      { toggle: "toggleMACD", box: "macdBox", chart: "macdChart" },
      { toggle: "toggleRSI", box: "rsiBox", chart: "rsiChart" },
      { toggle: "toggleSTOCH", box: "stochBox", chart: "stochChart" },
      { toggle: "toggleSTOCHRSI", box: "stochrsiBox", chart: "stochrsiChart" },
      { toggle: "toggleWILLIAMS", box: "williamsBox", chart: "williamsChart" },
      { toggle: "toggleCCI", box: "cciBox", chart: "cciChart" },
      { toggle: "toggleATR", box: "atrBox", chart: "atrChart" },
      { toggle: "toggleROC", box: "rocBox", chart: "rocChart" },
      { toggle: "toggleUO", box: "uoBox", chart: "uoChart" },
      { toggle: "toggleADX", box: "adxBox", chart: "adxChart" }
    ];
    indicators.forEach(item => {
      document.getElementById(item.box).style.display = "none";
      if (item.chart) document.getElementById(item.chart).style.visibility = "hidden";
    });
    for (let item of indicators) {
      if (document.getElementById(item.toggle).checked) {
        document.getElementById(item.box).style.display = "block";
        if (item.chart) document.getElementById(item.chart).style.visibility = "visible";
        break;
      }
    }
  }

  function fetchLatestTradingDate() {
    fetch('/get_latest_trading_date')
      .then(res => res.json())
      .then(data => {
        if (data.latest_date) {
          document.getElementById('date_label').textContent = `조회 기준: ${data.latest_date}`;
        }
      })
      .catch(err => console.error("최신 거래일 불러오기 오류:", err));
  }

  // ========== Rendering Functions ==========
  function renderStockList(stockData) {
    const container = document.getElementById('stockContainer');
    container.innerHTML = '';
    stockData.forEach(item => {
      const div = document.createElement('div');
      div.className = 'stockItem';
      div.textContent = `${item.회사명} (${item.종목코드})`;
      div.tabIndex = 0;
      div.addEventListener('click', () => {
        if (AppState.selectedItemElement) {
          AppState.selectedItemElement.classList.remove('selectedStockItem');
        }
        div.classList.add('selectedStockItem');
        AppState.selectedItemElement = div;
        AppState.currentCode = item.종목코드;
      });
      container.appendChild(div);
    });
  }

  function searchByName() {
    const term = document.getElementById('searchInput').value.trim();
    if (!term) {
      renderStockList(AppState.allStocks);
      return;
    }
    const filtered = AppState.allStocks.filter(s => s.회사명.includes(term));
    if (filtered.length === 0) {
      alert('검색 결과가 없습니다.');
      document.getElementById('stockContainer').innerHTML = '';
    } else {
      renderStockList(filtered);
    }
  }

  function updateLatestTradingDate(dates) {
    if (!dates || dates.length === 0) return;
    const latestDate = dates[dates.length - 1];
    const labelElement = document.getElementById('date_label');
    if (labelElement) labelElement.textContent = `조회 기준: ${latestDate}`;
  }

  // ========== Chart Data Request ==========
  function requestChart() {
    if (!AppState.currentCode) {
      alert('종목을 선택하세요.');
      return;
    }
    const daysValue = document.getElementById('daysInput').value.trim();
    if (!daysValue) {
      alert('일수를 입력하세요 (1~365)');
      return;
    }
    const MA = document.getElementById('toggleMovingAverage').checked ? 'true' : 'false';
    const BOLLINGER = document.getElementById('togglebollinger').checked ? 'true' : 'false';
    const flags = {
      tradingvalue: document.getElementById("toggleTradingvalue").checked ? 'true' : 'false',
      macd: document.getElementById("toggleMACD").checked ? 'true' : 'false',
      rsi: document.getElementById("toggleRSI").checked ? 'true' : 'false',
      stoch: document.getElementById("toggleSTOCH").checked ? 'true' : 'false',
      stochrsi: document.getElementById("toggleSTOCHRSI").checked ? 'true' : 'false',
      williams: document.getElementById("toggleWILLIAMS").checked ? 'true' : 'false',
      cci: document.getElementById("toggleCCI").checked ? 'true' : 'false',
      atr: document.getElementById("toggleATR").checked ? 'true' : 'false',
      roc: document.getElementById("toggleROC").checked ? 'true' : 'false',
      uo: document.getElementById("toggleUO").checked ? 'true' : 'false',
      adx: document.getElementById("toggleADX").checked ? 'true' : 'false'
    };
    const requestBody = `code=${AppState.currentCode}&days=${daysValue}&ma=${MA}&bollinger=${BOLLINGER}&tradingvalue=${flags.tradingvalue}&macd=${flags.macd}&rsi=${flags.rsi}&stoch=${flags.stoch}&stochrsi=${flags.stochrsi}&williams=${flags.williams}&cci=${flags.cci}&atr=${flags.atr}&roc=${flags.roc}&uo=${flags.uo}&adx=${flags.adx}`;
    fetch('/get_ohlc_history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: requestBody
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert('에러: ' + json.error);
        return;
      }
      if (!json.dates || !json.opens || !json.closes || !json.highs || !json.lows || !json.volumes) {
        alert('서버 데이터가 올바르지 않습니다.');
        return;
      }
      if (json.volumes.some(volume => Number(volume) === 0)) {
        alert("주의! 거래정지가 의심되는 기간이 있습니다.");
      }
      updateMainChart(json.dates, json.opens, json.closes, json.highs, json.lows, json.volumes);
      updateVolumeChart(json.dates, json.volumes, json.opens, json.closes);
      if (json.ma5 && json.ma20 && json.ma60 && json.ma120) {
        updateMovingAverages(json.dates, json.ma5, json.ma20, json.ma60, json.ma120);
      }
      if (json.BU && json.BL) {
        updateBollinger(json.dates, json.BU, json.BL);
      }
      if (document.getElementById("toggleTradingvalue").checked && json.tradingvalue) {
        updateTradingvalueChart(json.dates, json.tradingvalue, json.opens, json.closes);
        document.getElementById("tradingvalueChart").style.visibility = "visible"; 
      } else {
        document.getElementById("tradingvalueChart").style.visibility = "hidden"; 
      }
      if (document.getElementById("toggleMACD").checked && json.macd && json.signal && json.oscillator) {
        updateMacdChart(json.dates, json.macd, json.signal, json.oscillator);
        document.getElementById("macdChart").style.visibility = "visible"; 
      } else {
        document.getElementById("macdChart").style.visibility = "hidden"; 
      }
      if (document.getElementById("toggleRSI").checked && json.rsi) {
        updateRsiChart(json.dates, json.rsi);
        document.getElementById("rsiChart").style.visibility = "visible"; 
      } else {
        document.getElementById("rsiChart").style.visibility = "hidden"; 
      }
      if (document.getElementById("toggleSTOCH").checked && json.K && json.D) {
        updateStochChart(json.dates, json.K, json.D);
        document.getElementById("stochChart").style.visibility = "visible"; 
      } else {
        document.getElementById("stochChart").style.visibility = "hidden"; 
      }
      if (document.getElementById("toggleSTOCHRSI").checked && json.KK && json.DD) {
        updateStochrsiChart(json.dates, json.KK, json.DD);
        document.getElementById("stochrsiChart").style.visibility = "visible"; 
      } else {
        document.getElementById("stochrsiChart").style.visibility = "hidden"; 
      }
      if (document.getElementById("toggleWILLIAMS").checked && json.R) {
        updateWilliamsChart(json.dates, json.R);
        document.getElementById("williamsChart").style.visibility = "visible"; 
      } else {
        document.getElementById("williamsChart").style.visibility = "hidden"; 
      }
      if (document.getElementById("toggleCCI").checked && json.CCI) {
        updateCciChart(json.dates, json.CCI);
        document.getElementById("cciChart").style.visibility = "visible"; 
      } else {
        document.getElementById("cciChart").style.visibility = "hidden"; 
      }
      if (document.getElementById("toggleATR").checked && json.ATR) {
        updateAtrChart(json.dates, json.ATR);
        document.getElementById("atrChart").style.visibility = "visible"; 
      } else {
        document.getElementById("atrChart").style.visibility = "hidden"; 
      }
      if (document.getElementById("toggleROC").checked && json.ROC) {
        updateRocChart(json.dates, json.ROC);
        document.getElementById("rocChart").style.visibility = "visible"; 
      } else {
        document.getElementById("rocChart").style.visibility = "hidden"; 
      }
      if (document.getElementById("toggleUO").checked && json.UO) {
        updateUoChart(json.dates, json.UO);
        document.getElementById("uoChart").style.visibility = "visible"; 
      } else {
        document.getElementById("uoChart").style.visibility = "hidden"; 
      }
      if (document.getElementById("toggleADX").checked && json.ADX && json.DI && json.DIM) {
        updateAdxChart(json.dates, json.ADX, json.DI, json.DIM);
        document.getElementById("adxChart").style.visibility = "visible"; 
      } else {
        document.getElementById("adxChart").style.visibility = "hidden"; 
      }
      // Reset zoom and update main & volume charts
      AppState.charts.main.options.scales.x.min = undefined;
      AppState.charts.main.options.scales.x.max = undefined;
      AppState.charts.volume.options.scales.x.min = undefined;
      AppState.charts.volume.options.scales.x.max = undefined;
      AppState.charts.main.resetZoom();
      AppState.charts.volume.resetZoom();
      AppState.charts.main.update();
      AppState.charts.volume.update();
    })
    .catch(err => alert('에러:' + err));
  }

  // ========== Main Candle Chart Functions ==========
  function initMainChart() {
    const ctx = document.getElementById('myChart').getContext('2d');
    AppState.charts.main = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: '시가~종가',
          data: [],
          backgroundColor: [],
          extraData: []
        }]
      },
      options: { ...commonChartOptions },
      plugins: [highLowLinePlugin, customXTicksPlugin]
    });
  }

  function updateMainChart(dates, opens, closes, highs, lows, volumes) {
    const barData = [];
    const barColors = [];
    const extraData = [];
    let lastNonZeroClose = null;
    for (let i = 0; i < dates.length; i++) {
      const o = +opens[i], c = +closes[i], h = +highs[i], l = +lows[i], v = +volumes[i];
      if (Number.isNaN(o) || Number.isNaN(c) || Number.isNaN(h) || Number.isNaN(l) || Number.isNaN(v)) continue;
      if (v > 0) {
        lastNonZeroClose = c;
        barData.push([o, c]);
        let color = 'black';
        if (c > o) color = 'red';
        else if (c < o) color = 'blue';
        barColors.push(color);
        extraData.push({ open: o, close: c, high: h, low: l, volume: v, color, isZeroVolume: false, zeroVolumeLinePrice: null });
      } else {
        barData.push([c, c]);
        barColors.push('black');
        extraData.push({ open: c, close: c, high: c, low: c, volume: 0, color: 'black', isZeroVolume: true, zeroVolumeLinePrice: lastNonZeroClose });
      }
    }
    if (dates.length > 0) updateLatestTradingDate(dates);
    const mainChart = AppState.charts.main;
    mainChart.data.labels = dates;
    mainChart.data.datasets[0].data = barData;
    mainChart.data.datasets[0].backgroundColor = barColors;
    mainChart.data.datasets[0].extraData = extraData;
    // 최고/최저값 마커 계산 (거래량 > 0인 경우)
    let maxHighVal = -Infinity, maxHighIndex = -1;
    let minLowVal = Infinity, minLowIndex = -1;
    for (let i = 0; i < dates.length; i++) {
      const h = +highs[i], l = +lows[i], v = +volumes[i];
      if (v > 0) {
        if (h > maxHighVal) { maxHighVal = h; maxHighIndex = i; }
        if (l < minLowVal) { minLowVal = l; minLowIndex = i; }
      }
    }
    const validForMarkers = !(maxHighIndex === -1 || minLowIndex === -1);
    mainChart.data.customMarkers = {
      maxHigh: maxHighVal,
      maxHighIndex,
      maxHighDate: (maxHighIndex >= 0) ? dates[maxHighIndex] : '',
      minLow: minLowVal,
      minLowIndex,
      minLowDate: (minLowIndex >= 0) ? dates[minLowIndex] : '',
      validForMarkers
    };
    if (validForMarkers) {
      const diff = maxHighVal - minLowVal;
      const margin = (diff === 0) ? 1 : diff * 0.05;
      mainChart.options.scales.y.suggestedMin = minLowVal - margin * 1.005;
      mainChart.options.scales.y.suggestedMax = maxHighVal + margin * 0.095;
    } else {
      mainChart.options.scales.y.suggestedMin = 0;
      mainChart.options.scales.y.suggestedMax = 100;
    }
    mainChart.options.scales.x.display = barData.length > 0;
    mainChart.options.scales.y.display = barData.length > 0;
    const chartLabel = document.getElementById('chartLabel');
    if (barData.length > 0 && chartLabel) {
      chartLabel.style.visibility = 'visible';
      chartLabel.innerHTML = `<span style="color:black; font-weight:bold;">(단위: 원)</span>`;
      chartLabel.style.display = "block";
    }
    mainChart.update();
  }

  // ========== Volume Chart Functions ==========
  function initVolumeChart() {
    const ctx = document.getElementById('myVolumeChart').getContext('2d');
    AppState.charts.volume = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: '거래량',
          data: [],
          backgroundColor: []
        }]
      },
      options: { ...volumeChartOptions },
      plugins: [customXTicksPlugin]
    });
  }

  function updateVolumeChart(dates, volumes, opens, closes) {
    const volArr = volumes.map(v => +v || 0);
    const barColors = volumes.map((_, i) => {
      const open = +opens[i], close = +closes[i];
      if (Number.isNaN(open) || Number.isNaN(close)) return 'blue';
      return close >= open ? 'red' : 'blue';
    });
    const volumeChart = AppState.charts.volume;
    volumeChart.data.labels = dates;
    volumeChart.data.datasets[0].data = volArr;
    volumeChart.data.datasets[0].backgroundColor = barColors;
    const maxVol = Math.max(...volArr);
    const margin = (maxVol === 0) ? 1 : maxVol * 0.05;
    volumeChart.options.scales.y.suggestedMax = maxVol + margin;
    volumeChart.options.scales.x.display = volumes.length > 0;
    volumeChart.options.scales.y.display = volumes.length > 0;
    const volumeLabel = document.getElementById("volumeLabel");
    if (volumeLabel) {
      volumeLabel.innerHTML = `<span style="color:black; font-weight:bold;">(단위: 천 주)</span>`;
      volumeLabel.style.display = "block";
    }
    volumeChart.update();
  }

  // ========== Moving Averages ==========
  function updateMovingAverages(dates, ma5, ma20, ma60, ma120) {
    // 기존 MA 데이터셋 제거
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== '5일선' && ds.label !== '20일선' && ds.label !== '60일선' && ds.label !== '120일선'
    );
    const maDatasets = [
      { label: '5일선', data: ma5, borderColor: 'red' },
      { label: '20일선', data: ma20, borderColor: 'purple' },
      { label: '60일선', data: ma60, borderColor: 'blue' },
      { label: '120일선', data: ma120, borderColor: 'green' }
    ];
    maDatasets.forEach(ma => {
      AppState.charts.main.data.datasets.push({
        label: ma.label,
        data: ma.data,
        borderColor: ma.borderColor,
        borderWidth: 1,
        fill: false,
        type: 'line',
        xAxisID: 'x',
        pointRadius: 0,
        spanGaps: false
      });
    });
    const maLabel = document.getElementById("maLabel");
    if (document.getElementById("toggleMovingAverage").checked) {
      maLabel.innerHTML = `<span style="color:red; font-weight:bold;">5일</span> | 
                           <span style="color:purple; font-weight:bold;">20일</span> |
                           <span style="color:blue; font-weight:bold;">60일</span> |
                           <span style="color:green; font-weight:bold;">120일</span>`;
      maLabel.style.visibility = "visible";
    } else {
      maLabel.style.visibility = "hidden";
    }
    AppState.charts.main.update();
  }

  function addMovingAverages() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById('daysInput').value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch('/get_ohlc_history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `code=${AppState.currentCode}&days=${daysValue}&ma=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert('에러: ' + json.error);
        return;
      }
      if (!json.ma5 || !json.ma20 || !json.ma60 || !json.ma120) {
        alert('이동평균선 데이터를 불러올 수 없습니다.');
        return;
      }
      updateMovingAverages(json.dates, json.ma5, json.ma20, json.ma60, json.ma120);
    })
    .catch(err => alert('에러: ' + err));
  }

  function removeMovingAverages() {
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== '5일선' && ds.label !== '20일선' && ds.label !== '60일선' && ds.label !== '120일선'
    );
    const maLabel = document.getElementById("maLabel");
    if (maLabel) maLabel.style.visibility = "hidden";
    AppState.charts.main.update();
  }

  // ========== Bollinger Band ==========
  function updateBollinger(dates, BU, BL) {
    // 기존 Bollinger 데이터셋 제거
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== '상단 밴드' && ds.label !== '하단 밴드'
    );
    // 상단 밴드 데이터셋 추가 (fill 옵션과 backgroundColor 추가)
    AppState.charts.main.data.datasets.push({
      label: '상단 밴드',
      data: BU,
      borderColor: 'brown',
      borderWidth: 1,
      fill: '+1', // 바로 아래 데이터셋(하단 밴드)까지 영역 채움
      backgroundColor: 'rgba(210,180,140,0.1)', // 옅은 브라운 색 (투명도 20%)
      type: 'line',
      xAxisID: 'x',
      pointRadius: 0,
      spanGaps: false
    });

    // 하단 밴드 데이터셋 추가
    AppState.charts.main.data.datasets.push({
      label: '하단 밴드',
      data: BL,
      borderColor: 'brown',
      borderWidth: 1,
      fill: false,
      type: 'line',
      xAxisID: 'x',
      pointRadius: 0,
      spanGaps: false
    });
    const bollingerLabel = document.getElementById("bollingerLabel");
    if (document.getElementById("togglebollinger").checked) {
      bollingerLabel.innerHTML = `<span style="color:brown; font-weight:bold;">상단/하단 밴드</span>`;
      bollingerLabel.style.visibility = "visible";
    } else {
      bollingerLabel.style.visibility = "hidden";
    }
    AppState.charts.main.update();
  }

  function addBollinger() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById('daysInput').value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch('/get_ohlc_history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `code=${AppState.currentCode}&days=${daysValue}&bollinger=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert('에러: ' + json.error);
        return;
      }
      if (!json.BU || !json.BL) {
        alert('볼린저밴드 데이터를 불러올 수 없습니다.');
        return;
      }
      updateBollinger(json.dates, json.BU, json.BL);
    })
    .catch(err => alert('에러: ' + err));
  }

  function removeBollinger() {
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== '상단 밴드' && ds.label !== '하단 밴드'
    );
    const bollingerLabel = document.getElementById("bollingerLabel");
    if (bollingerLabel) bollingerLabel.style.visibility = "hidden";
    AppState.charts.main.update();
  }

  // ========== 거래대금 Chart ==========
  function initTradingvalueChart() {
    const ctx = document.getElementById("tradingvalueChart").getContext("2d");
    AppState.charts.tradingvalue = new Chart(ctx, {
      type: "bar",
      data: { labels: [], datasets: [{
        label: '거래대금',
        data: [],
        fill: false,
        pointRadius: 0
      }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { 
            display: true,
            ticks: {
              callback: function(value) { 
                return (value / 1000000).toLocaleString(); 
              }
            }
          }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin]
    });
  }

  function updateTradingvalueChart(dates, tradingvalue, opens, closes) {
    const tradingvalueChart = AppState.charts.tradingvalue;
    tradingvalueChart.data.labels = dates;

    const barColors = dates.map((_, i) => {
      const o = +opens[i], c = +closes[i];
      if (Number.isNaN(o) || Number.isNaN(c)) return 'blue';
      return c >= o ? 'red' : 'blue';
    });

    tradingvalueChart.data.datasets[0].data = tradingvalue;
    tradingvalueChart.data.datasets[0].backgroundColor = barColors;
    tradingvalueChart.update();

    const tradingvalueLabel = document.getElementById("tradingvalueLabel");
    if (tradingvalueLabel) {
      tradingvalueLabel.innerHTML = `<span style="color:black; font-weight:bold;">(단위: 만 원)</span>`;
      tradingvalueLabel.style.display = "block";
    }
  }

  function addTradingvalueChart() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById("daysInput").value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch("/get_ohlc_history", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `code=${AppState.currentCode}&days=${daysValue}&tradingvalue=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert("에러: " + json.error);
        return;
      }
      if (!json.tradingvalue) {
        alert("거래대금 데이터를 불러올 수 없습니다.");
        return;
      }
      updateTradingvalueChart(json.dates, json.tradingvalue, json.opens, json.closes);
      document.getElementById("tradingvalueChart").style.visibility = "visible";
    })
    .catch(err => alert("에러: " + err));
    document.getElementById("tradingvalueChart").style.visibility = "hidden";
  }

  function removeTradingvalueChart() {
    document.getElementById("tradingvalueChart").style.visibility = "hidden";
  }  

  // ========== MACD Chart ==========
  function initMacdChart() {
    const ctx = document.getElementById("macdChart").getContext("2d");
    AppState.charts.macd = new Chart(ctx, {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          { type: "line", label: "MACD", data: [], borderColor: "red", borderWidth: 1.5, fill: false, pointRadius: 0 },
          { type: "line", label: "Signal", data: [], borderColor: "blue", borderWidth: 1.5, fill: false, pointRadius: 0 },
          { type: "bar", label: "histogram", data: [], backgroundColor: ctx => {
              const values = ctx.chart.data.datasets[2].data;
              return values.map(value => value >= 0 ? "rgba(255, 0, 0, 0.5)" : "rgba(0, 0, 255, 0.5)");
            }, borderWidth: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'linear' },
        layout: { padding: { top: 20, bottom: 20, left: 20, right: 40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin]
    });
  }

  function updateMacdChart(dates, macd, signal, oscillator) {
    const macdChart = AppState.charts.macd;
    macdChart.data.labels = dates;
    macdChart.data.datasets[0].data = macd;
    macdChart.data.datasets[1].data = signal;
    macdChart.data.datasets[2].data = oscillator;
    macdChart.update();
    const macdLabel = document.getElementById("macdLabel");
    if (macdLabel) {
      macdLabel.innerHTML = `<span style="color:red; font-weight:bold;">MACD</span> | 
                             <span style="color:blue; font-weight:bold;">Signal</span>`;
      macdLabel.style.display = "block";
    }
  }

  function addMacdChart() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById("daysInput").value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch("/get_ohlc_history", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `code=${AppState.currentCode}&days=${daysValue}&macd=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert("에러: " + json.error);
        return;
      }
      if (!json.macd || !json.signal || !json.oscillator) {
        alert("MACD 데이터를 불러올 수 없습니다.");
        return;
      }
      updateMacdChart(json.dates, json.macd, json.signal, json.oscillator);
      document.getElementById("macdChart").style.visibility = "visible";
    })
    .catch(err => alert("에러: " + err));
    document.getElementById("macdChart").style.visibility = "hidden";
  }

  function removeMacdChart() {
    document.getElementById("macdChart").style.visibility = "hidden";
  }

  // ========== RSI Chart ==========
  function initRsiChart() {
    const ctx = document.getElementById("rsiChart").getContext("2d");
    AppState.charts.rsi = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [{
        label: 'RSI',
        data: [],
        borderColor: "red",
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0
      }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin3070]
    });
  }

  function updateRsiChart(dates, rsi) {
    const rsiChart = AppState.charts.rsi;
    rsiChart.data.labels = dates;
    rsiChart.data.datasets[0].data = rsi;
    rsiChart.update();
    const rsiLabel = document.getElementById("rsiLabel");
    if (rsiLabel) {
      rsiLabel.innerHTML = `<span style="color:red; font-weight:bold;">RSI</span>`;
      rsiLabel.style.display = "block";
    }
  }

  function addRsiChart() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById("daysInput").value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch("/get_ohlc_history", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `code=${AppState.currentCode}&days=${daysValue}&rsi=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert("에러: " + json.error);
        return;
      }
      if (!json.rsi) {
        alert("RSI 데이터를 불러올 수 없습니다.");
        return;
      }
      updateRsiChart(json.dates, json.rsi);
      document.getElementById("rsiChart").style.visibility = "visible";
    })
    .catch(err => alert("에러: " + err));
    document.getElementById("rsiChart").style.visibility = "hidden";
  }

  function removeRsiChart() {
    document.getElementById("rsiChart").style.visibility = "hidden";
  }

  // ========== STOCH Chart ==========
  function initStochChart() {
    const ctx = document.getElementById("stochChart").getContext("2d");
    AppState.charts.stoch = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { type: "line", label: "%K", data: [], borderColor: "red", borderWidth: 1.5, fill: false, pointRadius: 0 },
          { type: "line", label: "%D", data: [], borderColor: "blue", borderWidth: 1.5, fill: false, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin2080]
    });
  }

  function updateStochChart(dates, K, D) {
    const stochChart = AppState.charts.stoch;
    stochChart.data.labels = dates;
    stochChart.data.datasets[0].data = K;
    stochChart.data.datasets[1].data = D;
    stochChart.update();
    const stochLabel = document.getElementById("stochLabel");
    if (stochLabel) {
      stochLabel.innerHTML = `<span style="color:red; font-weight:bold;">%K</span> | 
                              <span style="color:blue; font-weight:bold;">%D</span>`;
      stochLabel.style.display = "block";
    }
  }

  function addStochChart() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById("daysInput").value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch("/get_ohlc_history", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `code=${AppState.currentCode}&days=${daysValue}&stoch=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert("에러: " + json.error);
        return;
      }
      if (!json.K || !json.D) {
        alert("STOCH 데이터를 불러올 수 없습니다.");
        return;
      }
      updateStochChart(json.dates, json.K, json.D);
      document.getElementById("stochChart").style.visibility = "visible";
    })
    .catch(err => alert("에러: " + err));
    document.getElementById("stochChart").style.visibility = "hidden";
  }

  function removeStochChart() {
    document.getElementById("stochChart").style.visibility = "hidden";
  }

  // ========== STOCHRSI Chart ==========
  function initStochrsiChart() {
    const ctx = document.getElementById("stochrsiChart").getContext("2d");
    AppState.charts.stochrsi = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { type: "line", label: "%K", data: [], borderColor: "red", borderWidth: 1.5, fill: false, pointRadius: 0 },
          { type: "line", label: "%D", data: [], borderColor: "blue", borderWidth: 1.5, fill: false, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin2080]
    });
  }

  function updateStochrsiChart(dates, KK, DD) {
    const stochrsiChart = AppState.charts.stochrsi;
    stochrsiChart.data.labels = dates;
    stochrsiChart.data.datasets[0].data = KK;
    stochrsiChart.data.datasets[1].data = DD;
    stochrsiChart.update();
    const stochrsiLabel = document.getElementById("stochrsiLabel");
    if (stochrsiLabel) {
      stochrsiLabel.innerHTML = `<span style="color:red; font-weight:bold;">%K</span> | 
                                 <span style="color:blue; font-weight:bold;">%D</span>`;
      stochrsiLabel.style.display = "block";
    }
  }

  function addStochrsiChart() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById("daysInput").value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch("/get_ohlc_history", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `code=${AppState.currentCode}&days=${daysValue}&stochrsi=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert("에러: " + json.error);
        return;
      }
      if (!json.KK || !json.DD) {
        alert("STOCHRSI 데이터를 불러올 수 없습니다.");
        return;
      }
      updateStochrsiChart(json.dates, json.KK, json.DD);
      document.getElementById("stochrsiChart").style.visibility = "visible";
    })
    .catch(err => alert("에러: " + err));
    document.getElementById("stochrsiChart").style.visibility = "hidden";
  }

  function removeStochrsiChart() {
    document.getElementById("stochrsiChart").style.visibility = "hidden";
  }

  // ========== Williams %R Chart ==========
  function initWilliamsChart() {
    const ctx = document.getElementById("williamsChart").getContext("2d");
    AppState.charts.williams = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [{
        label: '%R',
        data: [],
        borderColor: "red",
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0
      }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin2080M]
    });
  }

  function updateWilliamsChart(dates, R) {
    const williamsChart = AppState.charts.williams;
    williamsChart.data.labels = dates;
    williamsChart.data.datasets[0].data = R;
    williamsChart.update();
    const williamsLabel = document.getElementById("williamsLabel");
    if (williamsLabel) {
      williamsLabel.innerHTML = `<span style="color:red; font-weight:bold;">%R</span>`;
      williamsLabel.style.display = "block";
    }
  }

  function addWilliamsChart() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById("daysInput").value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch("/get_ohlc_history", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `code=${AppState.currentCode}&days=${daysValue}&williams=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert("에러: " + json.error);
        return;
      }
      if (!json.R) {
        alert("R 데이터를 불러올 수 없습니다.");
        return;
      }
      updateWilliamsChart(json.dates, json.R);
      document.getElementById("williamsChart").style.visibility = "visible";
    })
    .catch(err => alert("에러: " + err));
    document.getElementById("williamsChart").style.visibility = "hidden";
  }

  function removeWilliamsChart() {
    document.getElementById("williamsChart").style.visibility = "hidden";
  }

  // ========== CCI Chart ==========
  function initCciChart() {
    const ctx = document.getElementById("cciChart").getContext("2d");
    AppState.charts.cci = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [{
        label: 'CCI',
        data: [],
        borderColor: "red",
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0
      }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin100]
    });
  }

  function updateCciChart(dates, CCI) {
    const cciChart = AppState.charts.cci;
    cciChart.data.labels = dates;
    cciChart.data.datasets[0].data = CCI;
    cciChart.update();
    const cciLabel = document.getElementById("cciLabel");
    if (cciLabel) {
      cciLabel.innerHTML = `<span style="color:red; font-weight:bold;">CCI</span>`;
      cciLabel.style.display = "block";
    }
  }

  function addCciChart() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById("daysInput").value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch("/get_ohlc_history", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `code=${AppState.currentCode}&days=${daysValue}&cci=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert("에러: " + json.error);
        return;
      }
      if (!json.CCI) {
        alert("CCI 데이터를 불러올 수 없습니다.");
        return;
      }
      updateCciChart(json.dates, json.CCI);
      document.getElementById("cciChart").style.visibility = "visible";
    })
    .catch(err => alert("에러: " + err));
    document.getElementById("cciChart").style.visibility = "hidden";
  }

  function removeCciChart() {
    document.getElementById("cciChart").style.visibility = "hidden";
  }

  // ========== ATR Chart ==========
  function initAtrChart() {
    const ctx = document.getElementById("atrChart").getContext("2d");
    AppState.charts.atr = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [{
        label: 'ATR',
        data: [],
        borderColor: "red",
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0
      }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin]
    });
  }

  function updateAtrChart(dates, ATR) {
    const atrChart = AppState.charts.atr;
    atrChart.data.labels = dates;
    atrChart.data.datasets[0].data = ATR;
    atrChart.update();
    const atrLabel = document.getElementById("atrLabel");
    if (atrLabel) {
      atrLabel.innerHTML = `<span style="color:red; font-weight:bold;">ATR</span>`;
      atrLabel.style.display = "block";
    }
  }

  function addAtrChart() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById("daysInput").value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch("/get_ohlc_history", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `code=${AppState.currentCode}&days=${daysValue}&atr=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert("에러: " + json.error);
        return;
      }
      if (!json.ATR) {
        alert("ATR 데이터를 불러올 수 없습니다.");
        return;
      }
      updateAtrChart(json.dates, json.ATR);
      document.getElementById("atrChart").style.visibility = "visible";
    })
    .catch(err => alert("에러: " + err));
    document.getElementById("atrChart").style.visibility = "hidden";
  }

  function removeAtrChart() {
    document.getElementById("atrChart").style.visibility = "hidden";
  }

  // ========== ROC Chart ==========
  function initRocChart() {
    const ctx = document.getElementById("rocChart").getContext("2d");
    AppState.charts.roc = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [{
        label: 'ROC',
        data: [],
        borderColor: "red",
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0
      }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin0]
    });
  }

  function updateRocChart(dates, ROC) {
    const rocChart = AppState.charts.roc;
    rocChart.data.labels = dates;
    rocChart.data.datasets[0].data = ROC;
    rocChart.update();
    const rocLabel = document.getElementById("rocLabel");
    if (rocLabel) {
      rocLabel.innerHTML = `<span style="color:red; font-weight:bold;">ROC</span>`;
      rocLabel.style.display = "block";
    }
  }

  function addRocChart() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById("daysInput").value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch("/get_ohlc_history", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `code=${AppState.currentCode}&days=${daysValue}&roc=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert("에러: " + json.error);
        return;
      }
      if (!json.ROC) {
        alert("ROC 데이터를 불러올 수 없습니다.");
        return;
      }
      updateRocChart(json.dates, json.ROC);
      document.getElementById("rocChart").style.visibility = "visible";
    })
    .catch(err => alert("에러: " + err));
    document.getElementById("rocChart").style.visibility = "hidden";
  }

  function removeRocChart() {
    document.getElementById("rocChart").style.visibility = "hidden";
  }

  // ========== Ultimate Oscillator Chart ==========
  function initUoChart() {
    const ctx = document.getElementById("uoChart").getContext("2d");
    AppState.charts.uo = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [{
        label: 'Ultimate Oscillator',
        data: [],
        borderColor: "red",
        borderWidth: 1.5,
        fill: false,
        pointRadius: 0
      }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin3070]
    });
  }

  function updateUoChart(dates, UO) {
    const uoChart = AppState.charts.uo;
    uoChart.data.labels = dates;
    uoChart.data.datasets[0].data = UO;
    uoChart.update();
    const uoLabel = document.getElementById("uoLabel");
    if (uoLabel) {
      uoLabel.innerHTML = `<span style="color:red; font-weight:bold;">Ultimate Oscillator</span>`;
      uoLabel.style.display = "block";
    }
  }

  function addUoChart() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById("daysInput").value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch("/get_ohlc_history", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `code=${AppState.currentCode}&days=${daysValue}&uo=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert("에러: " + json.error);
        return;
      }
      if (!json.UO) {
        alert("UO 데이터를 불러올 수 없습니다.");
        return;
      }
      updateUoChart(json.dates, json.UO);
      document.getElementById("uoChart").style.visibility = "visible";
    })
    .catch(err => alert("에러: " + err));
    document.getElementById("uoChart").style.visibility = "hidden";
  }

  function removeUoChart() {
    document.getElementById("uoChart").style.visibility = "hidden";
  }

  // ========== ADX Chart ==========
  function initAdxChart() {
    const ctx = document.getElementById("adxChart").getContext("2d");
    AppState.charts.adx = new Chart(ctx, {
      type: "line",
      data: { 
        labels: [], 
        datasets: [
          { type: "line", label: "ADX", data: [], borderColor: "red", borderWidth: 1.5, fill: false, pointRadius: 0 },
          { type: "line", label: "+DI", data: [], borderColor: "blue", borderWidth: 1, fill: false, pointRadius: 0 },
          { type: "line", label: "-DI", data: [], borderColor: "purple", borderWidth: 1, fill: false, pointRadius: 0 }
        ] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin]
    });
  }

  function updateAdxChart(dates, ADX, DI, DIM) {
    const adxChart = AppState.charts.adx;
    adxChart.data.labels = dates;
    adxChart.data.datasets[0].data = ADX;
    adxChart.data.datasets[1].data = DI;
    adxChart.data.datasets[2].data = DIM;
    adxChart.update();
    const adxLabel = document.getElementById("adxLabel");
    if (adxLabel) {
      adxLabel.innerHTML = `<span style="color:red; font-weight:bold;">ADX</span> |
                            <span style="color:blue; font-weight:bold;">+DI</span> |
                            <span style="color:purple; font-weight:bold;">-DI</span>`;
      adxLabel.style.display = "block";
    }
  }

  function addAdxChart() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById("daysInput").value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch("/get_ohlc_history", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `code=${AppState.currentCode}&days=${daysValue}&adx=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert("에러: " + json.error);
        return;
      }
      if (!json.ADX || !json.DI || !json.DIM) {
        alert("ADX 데이터를 불러올 수 없습니다.");
        return;
      }
      updateAdxChart(json.dates, json.ADX, json.DI, json.DIM);
      document.getElementById("adxChart").style.visibility = "visible";
    })
    .catch(err => alert("에러: " + err));
    document.getElementById("adxChart").style.visibility = "hidden";
  }

  function removeAdxChart() {
    document.getElementById("adxChart").style.visibility = "hidden";
  }

  // ========== Initialize on window load ==========
  window.onload = init;
  window.searchByName = searchByName;
  window.requestChart = requestChart;
})();

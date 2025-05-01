// page1.js
// IIFE (즉시 실행 함수)로 전체 스크립트를 캡슐화하여 전역 변수 충돌을 방지합니다.
(function(global) {
  'use strict';

  Chart.defaults.font.family = "'Paperlogy', Arial, sans-serif";

   // 캔들 차트 클래스 정의
  function CandleChart(ctx) {
    this.ctx = ctx;
    this.chart = new Chart(ctx, {
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
      options: Object.assign({}, commonChartOptions)
    });
    // 플러그인 관리 객체 생성
    this.pluginManager = new PluginManager(this.chart);
  }

  // 캔들 차트 업데이트 메서드
  CandleChart.prototype.updateChart = function(data) {
    const { dates, opens, closes, highs, lows, volumes } = data;
    const barData = [];
    const barColors = [];
    const extraData = [];
    let lastNonZeroClose = null;
    
    dates.forEach((date, i) => {
      const o = +opens[i], c = +closes[i], h = +highs[i], l = +lows[i], v = +volumes[i];
      if (Number.isNaN(o) || Number.isNaN(c)) return;
      if (v > 0) {
        lastNonZeroClose = c;
        barData.push([o, c]);
        barColors.push(c > o ? '#ff4f4f' : (c < o ? '#4f4fff' : 'black'));
        extraData.push({ open: o, close: c, high: h, low: l, volume: v });
      } else {
        barData.push([c, c]);
        barColors.push('black');
        extraData.push({ open: c, close: c, high: c, low: c, volume: 0, zeroVolumeLinePrice: lastNonZeroClose });
      }
    });
    
    this.chart.data.labels = dates;
    this.chart.data.datasets[0].data = barData;
    this.chart.data.datasets[0].backgroundColor = barColors;
    this.chart.data.datasets[0].extraData = extraData;
    this.chart.update();
  };

  // 플러그인 관리 클래스 정의
  function PluginManager(chart) {
    this.chart = chart;
    this.plugins = [];
  }

  PluginManager.prototype.register = function(plugin) {
    this.plugins.push(plugin);
    if (!this.chart.config.plugins) {
      this.chart.config.plugins = [];
    }
    this.chart.config.plugins.push(plugin);
    this.chart.update();
  };

  PluginManager.prototype.unregister = function(pluginId) {
    this.plugins = this.plugins.filter(p => p.id !== pluginId);
    this.chart.config.plugins = this.chart.config.plugins.filter(p => p.id !== pluginId);
    this.chart.update();
  };

  // 전역 객체(window)에 노출 (다른 스크립트에서 접근 가능)
  global.CandleChart = CandleChart;
  global.PluginManager = PluginManager;
  global.PlusChart = PlusChart;
  global.MinusChart = MinusChart;
  global.ResetChart = ResetChart;

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
    //animation: { duration: 0, easing: 'linear' },
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
          font: {size: 12},
          callback: function(value) {
            return this.getLabelForValue(value);
          }
        }
      },
      y: {
        display: false,
        beginAtZero: false,
        ticks: {
          font: {size: 12},
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
          font: {size: 12},
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
          font: {size: 12},
          callback: function(value) {
            return Math.abs(value) >= 1000 ? (value / 1000).toLocaleString() : value.toLocaleString();
          }
        }
      }
    }
  };

  function updateMobileChartPadding() {
    if (window.matchMedia('(max-width: 767px)').matches) {
      // 메인 차트 업데이트
      AppState.charts.main.options.layout.padding = 20;
      AppState.charts.main.update();
  
      // 보조(지표) 차트들도 동일하게 업데이트
      const indicatorCharts = ['volume', 'tradingvalue', 'macd', 'rsi', 'stoch', 'stochrsi', 'williams', 'cci', 'atr', 'roc', 'uo', 'adx'];
      indicatorCharts.forEach(key => {
        if (AppState.charts[key]) {
          AppState.charts[key].options.layout.padding = 0;
          AppState.charts[key].update();
        }
      });
    }
  }
    

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
          ctx.font = '0.75rem';
          ctx.fillStyle = '#ff4f4f';
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
          ctx.font = '0.75rem';
          ctx.fillStyle = '#4f4fff';
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

  // 현금흐름 레이블 플러그인
  const cashflowLabelPlugin = {
    id: 'cashflowLabelPlugin',
    afterDatasetsDraw(chart, args, options) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const label = dataset.label; // '영업', '투자', '재무'
        const meta = chart.getDatasetMeta(datasetIndex);
        ctx.font = 'bold 18px Paperlogy';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
  
        meta.data.forEach((point, index) => {
          if (index !== dataset.data.length - 1) return;
          const value = dataset.data[index];
          const color = value >= 0 ? '#4caf50' : '#ff4f4f';
          ctx.fillStyle = color;
          ctx.font = 'bold 18px Paperlogy'



          ctx.fillText(label, point.x + 15, point.y);
        });
      });
    }
  };

  
  // 미리 정의된 플러그인들
  const HorizontalLinePlugin3070 = createHorizontalLinePlugin([30, 70]);
  const HorizontalLinePlugin2080 = createHorizontalLinePlugin([20, 80]);
  const HorizontalLinePlugin2080M = createHorizontalLinePlugin([-20, -80]);
  const HorizontalLinePlugin100 = createHorizontalLinePlugin([-100, 100]);
  const HorizontalLinePlugin0 = createHorizontalLinePlugin([0]);

  // ========== 초기화 함수 ==========
  let currentDays = 122;
  function init() {
    document.getElementById('daysInput').value = currentDays;
    document.getElementById("toggleVolume").checked = true;
    document.getElementById("toggleMovingAverage").checked = true;
    loadStockList();
    initAllCharts();
    setupEventListeners();
    setupCheckboxControls();
    updateIndicatorVisibility();
    fetchLatestTradingDate();
    setupSearchIconToggle();
    updateMobileChartPadding();
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
      searchByName();
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
    document.getElementById('toggleenvelope').addEventListener('change', function() {
      if (this.checked) addenvelope();
      else removeenvelope();
    });
    document.getElementById('toggleichimoku').addEventListener('change', function() {
      if (this.checked) addichimoku();
      else removeichimoku();
    });
    document.getElementById('togglepsar').addEventListener('change', function() {
      if (this.checked) addpsar();
      else removepsar();
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

  // ========== 차트 확대/축소/초기화 버튼 ==========
  function MinusChart() {
    // 현재 currentDays가 242이면 더이상 증가 안 함.
    if (!AppState.currentCode) return;
    if (currentDays < 242) {
      currentDays += 40;
      if (currentDays > 242) {
        currentDays = 242;
      }
      document.getElementById('daysInput').value = currentDays;
      requestChart(); // 차트 재요청
    }
  }
  
  function PlusChart() {
    // currentDays가 42 이하이면 감소 안 함.
    if (!AppState.currentCode) return;
    if (currentDays > 42) {
      currentDays -= 40;
      if (currentDays < 42) {
        currentDays = 42;
      }
      document.getElementById('daysInput').value = currentDays;
      requestChart(); // 차트 재요청
    }
  }

  function ResetChart() {
    if (!AppState.currentCode) return;
    if (currentDays != 122) {
      currentDays = 122;
      document.getElementById('daysInput').value = currentDays;
      requestChart(); // 차트 재요청
    }
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

      if (AppState.currentCode === item.종목코드) {
        div.classList.add('selectedStockItem');
        AppState.selectedItemElement = div;
      }  

      div.addEventListener('click', () => {
        if (AppState.currentCode === item.종목코드) return;
        
        if (AppState.selectedItemElement) {
          AppState.selectedItemElement.classList.remove('selectedStockItem');
        }
        if (window.matchMedia('(max-width: 767px)').matches) {
          document.getElementById('chartBox').style.display = 'block';
          document.getElementById('IndexBox').style.display = 'block';
        }
        div.classList.add('selectedStockItem');
        AppState.selectedItemElement = div;
        AppState.currentCode = item.종목코드;
        requestChart();      
      });
      container.appendChild(div);
    });
  }

  function searchByName() {
    const term = document.getElementById('searchInput').value.trim().toLowerCase();
    const stockListBox = document.getElementById('stockListBox');
  
    // 모바일 환경인지 체크 (최대 폭 767px)
    if (window.matchMedia('(max-width: 767px)').matches) {
      if (!term) {
        // 검색어가 없으면 리스트 숨김
        stockListBox.style.display = 'none';
        renderStockList(AppState.allStocks);
        return;
      }
      // 검색어가 있으면 리스트 보임
      stockListBox.style.display = 'block';
      const filtered = AppState.allStocks.filter(s => s.회사명.toLowerCase().includes(term));
      if (filtered.length === 0) {
        document.getElementById('stockContainer').innerHTML = '';
      } else {
        renderStockList(filtered);
      }
    } else {
      // 데스크탑 환경에서는 기본 동작 (예: 항상 보이거나 별도 처리)
      const filtered = AppState.allStocks.filter(s => s.회사명.toLowerCase().includes(term));
      renderStockList(filtered);
    }
  }
  

  function setupSearchIconToggle() {
    const searchInput = document.getElementById('searchInput');
    const searchIcon = document.querySelector('.searchbutton');
  
    function updateIcon() {
      if (searchInput.value.trim() !== '') {
        searchIcon.src = closeIconUrl; // 여기서 변수 사용
        searchIcon.alt = "clearbutton";
        searchIcon.ariaLabel = "검색어 지우기";
      } else {
        searchIcon.src = searchIconUrl; // 여기서 변수 사용
        searchIcon.alt = "searchbutton";
        searchIcon.ariaLabel = "검색";
      }
    }
  
    searchInput.addEventListener('input', updateIcon);
  
    searchIcon.addEventListener('click', () => {
      if (searchIcon.alt === 'clearbutton') {
        searchInput.value = '';
        updateIcon();
        if (window.matchMedia('(max-width: 767px)').matches) {
          document.getElementById('stockListBox').style.display = 'none';
        }
        renderStockList(AppState.allStocks);
      } else {
        searchByName();
      }
    });
  
    updateIcon();
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
    const daysValue = currentDays.toString();
    if (!daysValue) {
      alert('일수를 입력하세요 (1~365)');
      return;
    }
    const MA = document.getElementById('toggleMovingAverage').checked ? 'true' : 'false';
    const BOLLINGER = document.getElementById('togglebollinger').checked ? 'true' : 'false';
    const ENVELOPE = document.getElementById('toggleenvelope').checked ? 'true' : 'false';
    const ICHIMOKU = document.getElementById('toggleichimoku').checked ? 'true' : 'false';
    const PSAR = document.getElementById('togglepsar').checked ? 'true' : 'false';
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
    const requestBody = `code=${AppState.currentCode}&days=${daysValue}&ma=${MA}&bollinger=${BOLLINGER}&envelope=${ENVELOPE}&ichimoku=${ICHIMOKU}&psar=${PSAR}&tradingvalue=${flags.tradingvalue}&macd=${flags.macd}&rsi=${flags.rsi}&stoch=${flags.stoch}&stochrsi=${flags.stochrsi}&williams=${flags.williams}&cci=${flags.cci}&atr=${flags.atr}&roc=${flags.roc}&uo=${flags.uo}&adx=${flags.adx}`;
    fetch('/get_ohlc_history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: requestBody
    })
    .then(res => {
      if (!res.ok) {
        throw new Error(`서버 오류: ${res.status}`);
      }
      return res.json();
    })
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
      if (json.BB_upper && json.BB_lower) {
        updateBollinger(json.dates, json.BB_upper, json.BB_lower);
      }
      if (json.E_upper && json.E_lower) {
        updateenvelope(json.dates, json.E_upper, json.E_lower);
      }
      if (json.ichimoku1 && json.ichimoku2 && json.ichimoku3 &&json.ichimoku4 && json.ichimoku5) {
        updateichimoku(json.dates, json.ichimoku1, json.ichimoku2, json.ichimoku3, json.ichimoku4, json.ichimoku5);
      }    
      if (json.psar) {
        updatepsar(json.dates, json.psar);
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

      updateFinancialTable(AppState.currentCode);
      updateWordCloud(AppState.currentCode);
      updateWordCloudHeader(document.querySelector('.selectedStockItem').textContent.split(' (')[0]);
      updateSentimentHeader(document.querySelector('.selectedStockItem').textContent.split(' (')[0]);
      updateCashHeader(document.querySelector('.selectedStockItem').textContent.split(' (')[0]);
      updateCashChart(AppState.currentCode);
      updateSentimentData(AppState.currentCode);
      updateGosuIndex(AppState.currentCode)
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
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.main.options.scales.x.ticks.font.size = 6;
      AppState.charts.main.options.scales.y.ticks.font.size = 6;
      AppState.charts.main.update();
    }
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
        if (c > o) color = '#ff4f4f';
        else if (c < o) color = '#4f4fff';
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
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.volume.options.scales.x.ticks.font.size = 6;
      AppState.charts.volume.options.scales.y.ticks.font.size = 6;
      AppState.charts.volume.update();
    }
  }

  function updateVolumeChart(dates, volumes, opens, closes) {
    const volArr = volumes.map(v => +v || 0);
    const barColors = volumes.map((_, i) => {
      const open = +opens[i], close = +closes[i];
      if (Number.isNaN(open) || Number.isNaN(close)) return '#4f4fff';
      return close >= open ? '#ff4f4f' : '#4f4fff';
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
        spanGaps: false,
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
  function updateBollinger(dates, BB_upper, BB_lower) {
    // 기존 Bollinger 데이터셋 제거
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== '볼린저 상단 밴드' && ds.label !== '볼린저 하단 밴드'
    );
    // 상단 밴드 데이터셋 추가 (fill 옵션과 backgroundColor 추가)
    AppState.charts.main.data.datasets.push({
      label: '볼린저 상단 밴드',
      data: BB_upper,
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
      label: '볼린저 하단 밴드',
      data: BB_lower,
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
      bollingerLabel.innerHTML = `<span style="color:brown; font-weight:bold;">볼린저 상단/하단 밴드</span>`;
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
      if (!json.BB_upper || !json.BB_lower) {
        alert('볼린저밴드 데이터를 불러올 수 없습니다.');
        return;
      }
      updateBollinger(json.dates, json.BB_upper, json.BB_lower);
    })
    .catch(err => alert('에러: ' + err));
  }

  function removeBollinger() {
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== '볼린저 상단 밴드' && ds.label !== '볼린저 하단 밴드'
    );
    const bollingerLabel = document.getElementById("bollingerLabel");
    if (bollingerLabel) bollingerLabel.style.visibility = "hidden";
    AppState.charts.main.update();
  }

  // ========== envelope Band ==========
  function updateenvelope(dates, E_upper, E_lower) {
    // 기존 envelope 데이터셋 제거
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== '인벨롭 상단 밴드' && ds.label !== '인벨롭 하단 밴드'
    );
    // 상단 밴드 데이터셋 추가 (fill 옵션과 backgroundColor 추가)
    AppState.charts.main.data.datasets.push({
      label: '인벨롭 상단 밴드',
      data: E_upper,
      borderColor: 'rgba(80, 188, 223, 1)',
      borderWidth: 1,
      fill: '+1', // 바로 아래 데이터셋(하단 밴드)까지 영역 채움
      backgroundColor: 'rgba(80, 188, 223, 0.1)', // 옅은 브라운 색 (투명도 20%)
      type: 'line',
      xAxisID: 'x',
      pointRadius: 0,
      spanGaps: false
    });

    // 하단 밴드 데이터셋 추가
    AppState.charts.main.data.datasets.push({
      label: '인벨롭 하단 밴드',
      data: E_lower,
      borderColor: 'rgba(80, 188, 223, 1)',
      borderWidth: 1,
      fill: false,
      type: 'line',
      xAxisID: 'x',
      pointRadius: 0,
      spanGaps: false
    });
    const envelopeLabel = document.getElementById("envelopeLabel");
    if (document.getElementById("toggleenvelope").checked) {
      envelopeLabel.innerHTML = `<span style="color:rgba(80, 188, 223, 1); font-weight:bold;">Envelope 상단/하단 밴드</span>`;
      envelopeLabel.style.visibility = "visible";
    } else {
      envelopeLabel.style.visibility = "hidden";
    }
    AppState.charts.main.update();
  }

  function addenvelope() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById('daysInput').value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch('/get_ohlc_history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `code=${AppState.currentCode}&days=${daysValue}&envelope=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert('에러: ' + json.error);
        return;
      }
      if (!json.E_upper || !json.E_lower) {
        alert('envelope 데이터를 불러올 수 없습니다.');
        return;
      }
      updateenvelope(json.dates, json.E_upper, json.E_lower);
    })
    .catch(err => alert('에러: ' + err));
  }

  function removeenvelope() {
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== '인벨롭 상단 밴드' && ds.label !== '인벨롭 하단 밴드'
    );
    const envelopeLabel = document.getElementById("envelopeLabel");
    if (envelopeLabel) envelopeLabel.style.visibility = "hidden";
    AppState.charts.main.update();
  }
  
  // ========== ichimoku Band ==========
  const ichimokuFillPlugin = {
    id: 'ichimokuFillPlugin',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      // 선행스팬A와 B 데이터셋 인덱스 찾기
      const spanAIndex = chart.data.datasets.findIndex(ds => ds.label === '선행스팬A');
      const spanBIndex = chart.data.datasets.findIndex(ds => ds.label === '선행스팬B');
      if (spanAIndex === -1 || spanBIndex === -1) return;
  
      const metaA = chart.getDatasetMeta(spanAIndex).data;
      const metaB = chart.getDatasetMeta(spanBIndex).data;
      // 데이터 길이가 다르면 중단
      const len = Math.min(metaA.length, metaB.length);
      if (len < 2) return;
  
      ctx.save();
      for (let i = 0; i < len - 1; i++) {
        // 두 구간의 선 A, B의 값 (차트 데이터 값)
        const aVal1 = chart.data.datasets[spanAIndex].data[i];
        const aVal2 = chart.data.datasets[spanAIndex].data[i + 1];
        const bVal1 = chart.data.datasets[spanBIndex].data[i];
        const bVal2 = chart.data.datasets[spanBIndex].data[i + 1];
  
        // 구간 내 평균값으로 조건 판단
        const avgA = (aVal1 + aVal2) / 2;
        const avgB = (bVal1 + bVal2) / 2;
        const fillColor = avgA > avgB ? 'rgba(255,0,0,0.1)' : 'rgba(0,0,255,0.1)';
  
        // 좌표 계산: 각 포인트의 x, y (이미 계산된 캔버스 좌표 사용)
        const x1 = metaA[i].x;
        const x2 = metaA[i + 1].x;
        const yA1 = metaA[i].y;
        const yA2 = metaA[i + 1].y;
        const yB1 = metaB[i].y;
        const yB2 = metaB[i + 1].y;
  
        ctx.beginPath();
        ctx.moveTo(x1, yA1); // 선 A의 시작점
        ctx.lineTo(x2, yA2); // 선 A의 끝점
        ctx.lineTo(x2, yB2); // 선 B의 끝점
        ctx.lineTo(x1, yB1); // 선 B의 시작점
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      ctx.restore();
    }
  };
  Chart.register(ichimokuFillPlugin);

  function updateichimoku(dates, ichimoku1, ichimoku2, ichimoku3, ichimoku4, ichimoku5) {

    const chikouLen = ichimoku5.length;
    const SHIFT = 26; 

    for (let i = chikouLen - SHIFT; i < chikouLen; i++) {
      ichimoku5[i] = null;
    }
    // 기존 ichimoku 데이터셋 제거    
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== '기준선' && ds.label !== '전환선' && ds.label !== '선행스팬A' && ds.label !== '선행스팬B' && ds.label !== '후행스팬'
    );
    // 기준선 데이터셋 추가 
    AppState.charts.main.data.datasets.push({
      label: '기준선',
      data: ichimoku1,
      borderColor: 'orange',
      borderWidth: 1,
      fill: false,
      type: 'line',
      xAxisID: 'x',
      pointRadius: 0,
      spanGaps: false
    });

    // 전환선 데이터셋 추가
    AppState.charts.main.data.datasets.push({
      label: '전환선',
      data: ichimoku2,
      borderColor: 'green',
      borderWidth: 1,
      fill: false,
      type: 'line',
      xAxisID: 'x',
      pointRadius: 0,
      spanGaps: false
    });

    // 선행스팬A 데이터셋 추가
    AppState.charts.main.data.datasets.push({
      label: '선행스팬A',
      data: ichimoku3,
      borderColor: 'red',
      borderWidth: 1,
      fill: false,
      type: 'line',
      xAxisID: 'x',
      pointRadius: 0,
      spanGaps: false
    });

    // 선행스팬B 데이터셋 추가
    AppState.charts.main.data.datasets.push({
      label: '선행스팬B',
      data: ichimoku4,
      borderColor: 'blue',
      borderWidth: 1,
      fill: false,
      type: 'line',
      xAxisID: 'x',
      pointRadius: 0,
      spanGaps: false
    });    

    // 후행스팬 데이터셋 추가
    AppState.charts.main.data.datasets.push({
      label: '후행스팬',
      data: ichimoku5,
      borderColor: 'purple',
      borderWidth: 1,
      fill: false,
      type: 'line',
      xAxisID: 'x',
      pointRadius: 0,
      spanGaps: false
    });  

    const ichimokuLabel = document.getElementById("ichimokuLabel");
    if (document.getElementById("toggleichimoku").checked) {
      ichimokuLabel.innerHTML = `<span style="color:orange; font-weight:bold;">기준선</span> | 
                                  <span style="color:green; font-weight:bold;">전환선</span> |
                                  <span style="color:red; font-weight:bold;">선행스팬A</span> |
                                  <span style="color:blue; font-weight:bold;">선행스팬B</span> |
                                  <span style="color:purple; font-weight:bold;">후행스팬</span>`;
      ichimokuLabel.style.visibility = "visible";
    } else {
      ichimokuLabel.style.visibility = "hidden";
    }
    
    AppState.charts.main.update();
  }

  function addichimoku() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById('daysInput').value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch('/get_ohlc_history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `code=${AppState.currentCode}&days=${daysValue}&ichimoku=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert('에러: ' + json.error);
        return;
      }
      if (!json.ichimoku1 || !json.ichimoku2 || !json.ichimoku3 || !json.ichimoku4 || !json.ichimoku5) {
        alert('ichimoku 데이터를 불러올 수 없습니다.');
        return;
      }
      updateichimoku(json.dates, json.ichimoku1, json.ichimoku2, json.ichimoku3, json.ichimoku4, json.ichimoku5);
    })
    .catch(err => alert('에러: ' + err));
  }

  function removeichimoku() {
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== '기준선' && ds.label !== '전환선' && ds.label !== '선행스팬A' && ds.label !== '선행스팬B' && ds.label !== '후행스팬'
    );
    const ichimokuLabel = document.getElementById("ichimokuLabel");
    if (ichimokuLabel) ichimokuLabel.style.visibility = "hidden";
    AppState.charts.main.update();
  }
  
  // ========== psar Band ==========
  function updatepsar(dates, psar) {

    // 기존 psar 데이터셋 제거    
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== 'psar'
    );
    // psar 데이터셋 추가 
    AppState.charts.main.data.datasets.push({
      label: 'psar',
      data: psar,
      borderColor: 'green',
      borderWidth: 1,
      type: 'scatter',
      backgroundColor: 'green',
      pointRadius: 1,
      pointStyle: 'circle',
      xAxisID: 'x',
      spanGaps: false
    });

    const psarLabel = document.getElementById("psarLabel");
    if (document.getElementById("togglepsar").checked) {
      psarLabel.innerHTML = `<span style="color:green; font-weight:bold;">Parabolic SAR</span>`;
      psarLabel.style.visibility = "visible";
    } else {
      psarLabel.style.visibility = "hidden";
    }
    
    AppState.charts.main.update();
  }

  function addpsar() {
    if (!AppState.currentCode) return;
    const daysValue = document.getElementById('daysInput').value.trim();
    if (!daysValue || isNaN(daysValue) || daysValue < 1 || daysValue > 365) return;
    fetch('/get_ohlc_history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `code=${AppState.currentCode}&days=${daysValue}&psar=true`
    })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        alert('에러: ' + json.error);
        return;
      }
      if (!json.psar) {
        alert('psar 데이터를 불러올 수 없습니다.');
        return;
      }
      updatepsar(json.dates, json.psar);
    })
    .catch(err => alert('에러: ' + err));
  }

  function removepsar() {
    AppState.charts.main.data.datasets = AppState.charts.main.data.datasets.filter(ds =>
      ds.label !== 'psar'
    );
    const psarLabel = document.getElementById("psarLabel");
    if (psarLabel) psarLabel.style.visibility = "hidden";
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
        //animation: { duration: 0, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              font: {size: 12},
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { 
            display: true,
            ticks: {
              font: {size: 12},
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
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.tradingvalue.options.scales.x.ticks.font.size = 6;
      AppState.charts.tradingvalue.options.scales.y.ticks.font.size = 6;
      AppState.charts.tradingvalue.update();
    }
  }

  function updateTradingvalueChart(dates, tradingvalue, opens, closes) {
    const tradingvalueChart = AppState.charts.tradingvalue;
    tradingvalueChart.data.labels = dates;

    const barColors = dates.map((_, i) => {
      const o = +opens[i], c = +closes[i];
      if (Number.isNaN(o) || Number.isNaN(c)) return '#4f4fff';
      return c >= o ? '#ff4f4f' : '#4f4fff';
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
              return values.map(value => value >= 0 ? "#ff4f4f" : "#4f4fff");
            }, borderWidth: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        //animation: { duration: 0, easing: 'linear' },
        layout: { padding: { top: 20, bottom: 20, left: 20, right: 40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              font: {size: 12},
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true, ticks: {font: {size: 12} }}
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin]
    });
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.macd.options.scales.x.ticks.font.size = 6;
      AppState.charts.macd.options.scales.y.ticks.font.size = 6;
      AppState.charts.macd.update();
    }
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
        //animation: { duration: 0, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              font: {size: 12},
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true, ticks: {font: {size: 12} }}
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin3070]
    });
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.rsi.options.scales.x.ticks.font.size = 6;
      AppState.charts.rsi.options.scales.y.ticks.font.size = 6;
      AppState.charts.rsi.update();
    }
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
        //animation: { duration: 0, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              font: {size: 12},
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true, ticks: {font: {size: 12} }}
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin2080]
    });
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.stoch.options.scales.x.ticks.font.size = 6;
      AppState.charts.stoch.options.scales.y.ticks.font.size = 6;
      AppState.charts.stoch.update();
    }
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
        //animation: { duration: 0, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              font: {size: 12},
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true, ticks: {font: {size: 12} }}
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin2080]
    });
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.stochrsi.options.scales.x.ticks.font.size = 6;
      AppState.charts.stochrsi.options.scales.y.ticks.font.size = 6;
      AppState.charts.stochrsi.update();
    }
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
        //animation: { duration: 0, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              font: {size: 12},
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true, ticks: {font: {size: 12} }}
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin2080M]
    });
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.williams.options.scales.x.ticks.font.size = 6;
      AppState.charts.williams.options.scales.y.ticks.font.size = 6;
      AppState.charts.williams.update();
    }
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
        //animation: { duration: 0, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              font: {size: 12},
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true, ticks: {font: {size: 12} }}
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin100]
    });
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.cci.options.scales.x.ticks.font.size = 6;
      AppState.charts.cci.options.scales.y.ticks.font.size = 6;
      AppState.charts.cci.update();
    }
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
        //animation: { duration: 0, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              font: {size: 12},
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true, ticks: {font: {size: 12} }}
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin]
    });
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.atr.options.scales.x.ticks.font.size = 6;
      AppState.charts.atr.options.scales.y.ticks.font.size = 6;
      AppState.charts.atr.update();
    }
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
        //animation: { duration: 0, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              font: {size: 12},
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true, ticks: {font: {size: 12} }}
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin0]
    });
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.roc.options.scales.x.ticks.font.size = 6;
      AppState.charts.roc.options.scales.y.ticks.font.size = 6;
      AppState.charts.roc.update();
    }
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
        //animation: { duration: 0, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              font: {size: 12},
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true, ticks: {font: {size: 12} }}
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin, HorizontalLinePlugin3070]
    });
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.uo.options.scales.x.ticks.font.size = 6;
      AppState.charts.uo.options.scales.y.ticks.font.size = 6;
      AppState.charts.uo.update();
    }
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
        //animation: { duration: 0, easing: 'linear' },
        layout: { padding: { top:20, bottom:20, left:20, right:40 } },
        scales: {
          x: {
            display: true,
            type: 'category',
            offset: true,
            grid: { display: false },
            ticks: {
              font: {size: 12},
              align: 'start',
              maxTicksLimit: 5,
              callback: function(value) { return this.getLabelForValue(value); }
            }
          },
          y: { display: true, ticks: {font: {size: 12} }}
        },
        plugins: { legend: { display: false } }
      },
      plugins: [customXTicksPlugin]
    });
    if (window.matchMedia('(max-width: 767px)').matches) {
      AppState.charts.adx.options.scales.x.ticks.font.size = 6;
      AppState.charts.adx.options.scales.y.ticks.font.size = 6;
      AppState.charts.adx.update();
    }
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

  // ========== 재무 데이터 로드 ==========
  function updateFinancialTable(code) {
    // 재무비율 데이터 로드 및 출력
    fetch(`/get_financial_data?code=${code}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert('재무 데이터 오류: ' + data.error);
          return;
        }

        if (data < 0) {
          cell.classList.add("negative");
        }

        const tbody = document.querySelector('#financialTable tbody');
  
        tbody.innerHTML = '';
  
        // 지표 순서 (원하는 순서대로, 여기서는 공백 없이 실제 이름을 사용)
        const indicators = [
          '부채비율', '유보율', '매출액증가율', 'EPS증가율',
          'ROA', 'ROE', 'EPS', 'BPS', 'PER', 'PBR', 'EV/EBITDA'
        ];
  
        const years = ['24년', '23년', '22년'];
  
        let bodyRowsHtml = '';
        for (let i = 0; i < years.length; i++) {
          bodyRowsHtml += `<tr>`;
          bodyRowsHtml += `<td>${years[i]}</td>`;
          indicators.forEach(indicator => {
            // 역순으로 값 채우기: 2 - i (i=0: data[indicator][2], i=1: data[indicator][1], i=2: data[indicator][0])
            let val = (data[indicator] && data[indicator][2 - i] != null)
                      ? data[indicator][2 - i]
                      : 'N/A';
            bodyRowsHtml += `<td>${val}</td>`;
          });
          bodyRowsHtml += `</tr>`;
        }
        tbody.innerHTML = bodyRowsHtml;
        // 음수, N/A 전용 css
        document.querySelectorAll("#financialTable td").forEach(cell => {
          const text = cell.textContent.trim();
          if (text === 'N/A') {
            cell.classList.add('na-cell');
          } else {
            const num = parseFloat(text.replace(/,/g, ''));
            if (!isNaN(num) && num < 0) {
              cell.classList.add('negative');
            }
          }
        });
      })
      .catch(err => {
        alert('재무 데이터 로드 실패: ' + err);
      });
    // 제목 데이터 로드
    const stockInfo = AppState.allStocks.find(s => s.종목코드 === code);  
    if (stockInfo) {
      document.getElementById('selectedStockName').textContent = stockInfo.회사명 + " 재무비율";
    } else {
      document.getElementById('selectedStockName').textContent = "선택된 종목 정보가 없습니다.";
    }
  }

  // ========== 워드 클라우드 로드 ==========
  function updateWordCloud(stockCode) {
    // 워드 클라우드 컨테이너와 캔버스 선택
    const container = document.getElementById('wordCloudContainer');
    const canvas = document.getElementById('wordCloudCanvas');
  
    // 컨테이너의 실제 크기를 캔버스 해상도로 지정
    const viewW = container.offsetWidth;
    const viewH = container.offsetHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = viewW * dpr;
    canvas.height = viewH * dpr;
    canvas.style.width = viewW/16 + 'rem';
    canvas.style.height = viewH/16 + 'rem'

  
    fetch(`/get_wordcloud_data?code=${stockCode}`)
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          console.error('워드 클라우드 데이터 에러:', data.error);
          return;
        }
        // data가 { "단어": 빈도, ... } 형식이라면 배열로 변환
        const wordArray = Object.entries(data).map(([word, freq]) => {
          const cleanedWord = word.split(',')[0];
          return [cleanedWord, freq]; // 빈도 그대로 사용하여 크기 차이 유지
        });

        if (wordArray.length === 0) {
          console.warn("워드 클라우드에 표시할 단어가 없습니다.");
          return;
        }
  
        // 최대 빈도 계산
        const maxFrequency = Math.max(...wordArray.map(([_, freq]) => freq));

        // wordcloud2.js 라이브러리로 워드 클라우드 생성
        WordCloud(canvas, {
          list: wordArray,
          gridSize: 10,
          weightFactor: function(freq) {
            const maxFontSize = 100; // 원하는 최대 폰트 크기
            const size = (freq / maxFrequency) * (Math.min(canvas.width, canvas.height) / 2);
            return Math.min(size, maxFontSize);
          },
          fontFamily: "'Paperlogy', Arial, sans-serif", // 원하는 웹 폰트로 변경 가능
          color: 'random-dark',
          rotateRatio: 0,
          backgroundColor: '#f9f9f9'
        });
      })
      .catch(error => console.error('워드클라우드 업데이트 실패:', error));
  }

  function updateWordCloudHeader(stockName) {
    const titleEl = document.getElementById('wordCloudTitle');
  
    if (!stockName) {
      // 아직 종목이 선택되지 않음
      titleEl.textContent = "선택된 종목 정보가 없습니다.";
    } else {
      titleEl.textContent = `${stockName} 워드클라우드`;
    }
  }

  // ========== 투자자 지표 로드 ============
  function updateSentimentChart(sentimentData) {
    // sentimentData 예시: { positive: 40.23, negative: 35.12, neutral: 24.65 }
    const ctx = document.getElementById('sentimentChart').getContext('2d');
    const labels = ['긍정', '부정', '중립'];
    const dataValues = [sentimentData.positive, sentimentData.negative, sentimentData.neutral];
  
    // 이전에 생성된 차트가 있으면 파괴
    if(window.sentimentChartInstance) {
      window.sentimentChartInstance.destroy();
    }
  
    window.sentimentChartInstance = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: ['#4caf50', '#ff4f4f', '#ffc107'] // 긍정(녹색), 부정(빨간색), 중립(회색)
        }]
      },
      options: {
        plugins: {
          legend: {
            display: false // 범례 숨김
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                //const label = labels[context.dataIndex] || '';
                return context.parsed + '%';
              }
            }
          },
          datalabels: {
            // 10% 미만 슬라이스는 라벨 표시 X
            formatter: function(value, context) {
              if (value < 10) {
                return '';
              }
              return labels[context.dataIndex];
            },
            color: '#fff',
            font: {
              weight: 'bold',
              size: 20
            }
          }
        }
      },
      plugins: [ChartDataLabels]
    });
  }
  
  function updateSentimentData(stockCode) {
    fetch(`/get_sentiment_data?code=${stockCode}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert('에러: ' + data.error);
          return;
        }
        updateSentimentChart(data);
      })
      .catch(err => alert('에러: ' + err));
  }

  function updateSentimentHeader(stockName) {
    const titleST = document.getElementById('sentimentIndexHeader');
  
    if (!stockName) {
      // 아직 종목이 선택되지 않음
      titleST.textContent = "선택된 종목 정보가 없습니다.";
    } else {
      titleST.textContent = `${stockName} 투자자 지표`;
    }
  }

  function updateGosuIndex(stockCode) {
    fetch('/get_gosu_index?code=' + stockCode)
      .then(res => res.json())
      .then(data => {
        let dates = data.dates;
        let instNetVolume = data.institution.net_volume;
        let instStrength = data.institution.strength_percent;
        let foreignNetVolume = data.foreign.net_volume;
        let foreignStrength = data.foreign.strength_percent;
  
        // 역순 정렬 (최신 날짜가 맨 위)
        dates = dates.reverse();
        instNetVolume = instNetVolume.reverse();
        instStrength = instStrength.reverse();
        foreignNetVolume = foreignNetVolume.reverse();
        foreignStrength = foreignStrength.reverse();
  
        // 날짜 포맷 변환 (YYYY.MM.DD → MM/DD)
        const formattedDates = dates.map(d => {
          const parts = d.split('.');
          return parts.length === 3 ? parts[1].padStart(2, '0') + '/' + parts[2].padStart(2, '0') : d;
        });
  
        // 기관+외국인 전체 강도 최대값(100% 기준)
        let maxStrength = Math.max(...instStrength, ...foreignStrength);
        if (maxStrength === 0) maxStrength = 1;
  
        const container = document.getElementById('gosuIndexContent');
        if (!container) {
          console.error("고수지표 컨테이너(gosuIndexContent)를 찾을 수 없습니다.");
          return;
        }
        container.innerHTML = '';
  
        // 각 날짜별 행 생성
        for (let i = 0; i < formattedDates.length; i++) {
          const row = document.createElement('div');
          row.className = 'combined-bar-row';
  
          // 날짜 레이블
          const dateLabel = document.createElement('div');
          dateLabel.className = 'day-label';
          dateLabel.textContent = formattedDates[i];
          row.appendChild(dateLabel);
  
          // 기관 막대
          const instBarContainer = document.createElement('div');
          instBarContainer.className = 'bar-container';
          const instBar = document.createElement('div');
          instBar.className = 'bar';
          instBar.classList.add(getVolumeColorClass(instNetVolume[i]));
          const instWidth = (instStrength[i] / maxStrength) * 100;
          instBar.style.width = instWidth + '%';
          const instBarText = document.createElement('div');
          instBarText.className = 'bar-text';
          if (instNetVolume[i] > 0) {
            instBarText.textContent = `${instStrength[i]}% (매수)`;
          } else if (instNetVolume[i] < 0) {
            instBarText.textContent = `${instStrength[i]}% (매도)`;
          } else {
            instBarText.textContent = `${instStrength[i]}%`;
          }
          instBar.appendChild(instBarText);
          instBarContainer.appendChild(instBar);
          row.appendChild(instBarContainer);
  
          // 외국인 막대
          const foreignBarContainer = document.createElement('div');
          foreignBarContainer.className = 'bar-container';
          const foreignBar = document.createElement('div');
          foreignBar.className = 'bar';
          foreignBar.classList.add(getVolumeColorClass(foreignNetVolume[i]));
          const foreignWidth = (foreignStrength[i] / maxStrength) * 100;
          foreignBar.style.width = foreignWidth + '%';
          const foreignBarText = document.createElement('div');
          foreignBarText.className = 'bar-text';
          if (foreignNetVolume[i] > 0) {
            foreignBarText.textContent = `${foreignStrength[i]}% (매수)`;
          } else if (foreignNetVolume[i] < 0) {
            foreignBarText.textContent = `${foreignStrength[i]}% (매도)`;
          } else {
            foreignBarText.textContent = `${foreignStrength[i]}%`;
          }
          foreignBar.appendChild(foreignBarText);
          foreignBarContainer.appendChild(foreignBar);
          row.appendChild(foreignBarContainer);
  
          container.appendChild(row);
        }
  
        // 하단에 "기관"과 "외국인" 레이블 추가
        const footer = document.createElement('div');
        footer.className = 'gosu-footer';
  
        const instLabel = document.createElement('div');
        instLabel.className = 'footer-label';
        instLabel.textContent = '기관';
  
        const foreignLabel = document.createElement('div');
        foreignLabel.className = 'footer-label';
        foreignLabel.textContent = '외국인';
  
        footer.appendChild(instLabel);
        footer.appendChild(foreignLabel);
        container.appendChild(footer);
      })
      .catch(err => console.error("고수지표 업데이트 오류:", err));
  }
  
  function getVolumeColorClass(netVolume) {
    if (netVolume > 0) {
      return 'net-buy';
    } else if (netVolume < 0) {
      return 'net-sell';
    } else {
      return 'net-neutral';
    }
  }


  // ========== 현금흐름 지표 로드 ============
  function updateCashHeader(stockName) {
    const titleST = document.getElementById('cashIndexHeader');
  
    if (!stockName) {
      // 아직 종목이 선택되지 않음
      titleST.textContent = "선택된 종목 정보가 없습니다.";
    } else {
      titleST.textContent = `${stockName} 현금흐름`;
    }
  }

  function initCashflowChart() {
    const ctx = document.getElementById("cashflowChart").getContext("2d");
  
    AppState.charts.cashflow = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['21년', '22년', '23년', '24년'],
        datasets: [
          {
            label: '영업',
            data: [], // 여기에 나중에 실제 값 들어감
            borderColor: function(ctx) {
              const data = ctx.chart.data.datasets[0].data;
              const last = data[data.length - 1];
              return last >= 0 ? '#4caf50' : '#ff4f4f';
            },
            pointBackgroundColor: function(ctx) {
              const data = ctx.chart.data.datasets[0].data;
              const last = data[data.length - 1];
              return last >= 0 ? '#4caf50' : '#ff4f4f';
            },
            pointBorderColor: '#f0f0f0',    
            pointBorderWidth: 0.5,
            borderWidth: 2,
            tension: 0.3,
            fill: false,
            pointRadius: 5,
            pointHoverRadius: 7
          },
          {
            label: '투자',
            data: [],
            borderColor: function(ctx) {
              const data = ctx.chart.data.datasets[1].data;
              const last = data[data.length - 1];
              return last >= 0 ? '#4caf50' : '#ff4f4f';
            },
            pointBackgroundColor: function(ctx) {
              const data = ctx.chart.data.datasets[1].data;
              const last = data[data.length - 1];
              return last >= 0 ? '#4caf50' : '#ff4f4f';
            },
            pointBorderColor: '#f0f0f0',    
            pointBorderWidth: 0.5,
            borderWidth: 2,
            tension: 0.3,
            fill: false,
            pointRadius: 5,
            pointHoverRadius: 7
          },
          {
            label: '재무',
            data: [],
            borderColor: function(ctx) {
              const data = ctx.chart.data.datasets[2].data;
              const last = data[data.length - 1];
              return last >= 0 ? '#4caf50' : '#ff4f4f';
            },
            pointBackgroundColor: function(ctx) {
              const data = ctx.chart.data.datasets[2].data;
              const last = data[data.length - 1];
              return last >= 0 ? '#4caf50' : '#ff4f4f';
            },
            pointBorderColor: '#f0f0f0',    
            pointBorderWidth: 0.5, 
            borderWidth: 2,
            tension: 0.3,
            fill: false,
            pointRadius: 5,
            pointHoverRadius: 7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 20, bottom: 20, left: 10, right: 60 }
        },
        plugins: {
          legend: {
            display: false,
            labels: {
              color: '#333',
              font: {
                size: 14
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              drawOnChartArea: true,
              color: (ctx) => {
                const label = ctx.tick.label;
                return (label === '21' || label === '21년') ? '#cccccc' : 'transparent';
              }
            },
            ticks: {
              font: { size: 12 }
            }
          },
          y: {
            grid: {
              drawTicks: true,
              drawOnChartArea: true,
              color: function(context) {
                return context.tick.value === 0 ? '#888' : 'transparent'; // ✅ 0이면 회색선, 나머지는 숨김
              }
            },
            ticks: {
              color: '#333', // 그대로
              font: { size: 12 }
            }
          }
        }
      },
      plugins: [cashflowLabelPlugin] 
    });
  }
  
  function updateCashflowChart(labels, data) {
    if (typeof data !== 'object' || data === null) {
      console.warn("❌ data가 유효한 객체가 아님", data);
      return;
    }
  
    if (!('operating' in data) || !('investing' in data) || !('financing' in data)) {
      console.warn("❌ 현금흐름 키 누락", data);
      return;
    }
  
    const chart = AppState.charts.cashflow;
    if (!chart || !chart.data || !chart.data.datasets || chart.data.datasets.length < 3) {
      console.error("❌ 차트 초기화 오류 또는 datasets 누락", chart);
      return;
    }
  
    chart.data.labels = labels || ['21년', '22년', '23년', '24년'];
    chart.data.datasets[0].data = data.operating;
    chart.data.datasets[1].data = data.investing;
    chart.data.datasets[2].data = data.financing;
    chart.update();
  }

  function updateCashChart(code) {
    fetch(`/get_cashflow?code=${code}`)
      .then(res => res.json())
      .then(data => {
        console.log("📦 현금흐름 응답 데이터:", data)
        if (!AppState.charts.cashflow) initCashflowChart();  // ✅ 여기!
        updateCashflowChart(data.labels, data);  // 데이터 업데이트
      })
      .catch(err => console.error("현금흐름 fetch 실패:", err));
  }
  

  // ========== Initialize on window load ==========
  window.onload = init;
  window.searchByName = searchByName;
  window.requestChart = requestChart;
})(window);

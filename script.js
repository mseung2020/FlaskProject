let allStocks = [];
let currentCode = null;
let selectedItemElement = null;

let myChart;        // (위) 시가/종가 + 고가/저가
let myVolumeChart;  // (아래) 거래량

// 동기화 중복 호출 방지용 플래그
let isSyncing = false;

// ----------------- 헬퍼 함수 -----------------
function formatNumber(num) {
  return Number(num).toLocaleString('en-US');
}
function formatDate(str) {
  return str.replace(/\./g, '/');
}

// (위) 시가/종가 + 고가/저가 표시용 플러그인
const highLowLinePlugin = {
  id: 'highLowLinePlugin',
  afterDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    if(!meta) return;
    const dataset = chart.data.datasets[0];
    const barExtra = dataset.extraData || [];
    const yScale = chart.scales.y;
    const { ctx } = chart;

    meta.data.forEach((barElem, idx) => {
      if(!barElem) return;
      const props = barElem.getProps(['x','y','base','width','height'], false);
      const xCenter = props.x;
      const barW    = props.width;
      const halfW   = barW/2;

      const item = barExtra[idx];
      if(!item) return;

      // 거래량=0 → 검정 가로선
      if(item.volume===0) {
        if(item.zeroVolumeLinePrice!=null){
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle='black';
          ctx.lineWidth=1.0;
          const yLine=yScale.getPixelForValue(item.zeroVolumeLinePrice);
          ctx.moveTo(xCenter-halfW, yLine);
          ctx.lineTo(xCenter+halfW, yLine);
          ctx.stroke();
          ctx.restore();
        }
        return;
      }

      // 거래량>0
      const yHigh=yScale.getPixelForValue(item.high);
      const yLow =yScale.getPixelForValue(item.low);

      // 고가~저가 수직선
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle=item.color;
      ctx.lineWidth=0.7;
      ctx.moveTo(xCenter, yHigh);
      ctx.lineTo(xCenter, yLow);
      ctx.stroke();
      ctx.restore();

      // 시가=종가
      if(item.open===item.close){
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle='black';
        ctx.lineWidth=0.7;
        const ySame=yScale.getPixelForValue(item.open);
        ctx.moveTo(xCenter-halfW, ySame);
        ctx.lineTo(xCenter+halfW, ySame);
        ctx.stroke();
        ctx.restore();
      }
    });

    // 최고/최저가 표시
    const cm=chart.data.customMarkers;
    if(!cm || !cm.validForMarkers) return;

    // 최고가
    if(cm.maxHighIndex>=0 && cm.maxHighIndex<meta.data.length){
      const bElem=meta.data[cm.maxHighIndex];
      if(bElem){
        const xM=bElem.getProps(['x'], false).x;
        const yM=yScale.getPixelForValue(cm.maxHigh);
        ctx.save();
        ctx.font='12px Arial';
        ctx.fillStyle='red';
        const txt=`최고 ${formatNumber(cm.maxHigh)} (${formatDate(cm.maxHighDate)})`;
        ctx.fillText(txt, xM+5, yM-5);
        ctx.restore();
      }
    }
    // 최저가
    if(cm.minLowIndex>=0 && cm.minLowIndex<meta.data.length){
      const bElem=meta.data[cm.minLowIndex];
      if(bElem){
        const xM=bElem.getProps(['x'], false).x;
        const yM=yScale.getPixelForValue(cm.minLow);
        ctx.save();
        ctx.font='12px Arial';
        ctx.fillStyle='blue';
        const txt=`최저 ${formatNumber(cm.minLow)} (${formatDate(cm.minLowDate)})`;
        ctx.fillText(txt, xM+5, yM+15);
        ctx.restore();
      }
    }
  }
};

// ----------------- Chart 동기화 (Zoom/Pan) -----------------
/*function syncZoomPan(sourceChart, targetChart) {
  if(isSyncing) return;
  isSyncing = true;

  // 동일한 X축 min/max 값을 전달
  targetChart.options.scales.x.min = sourceChart.options.scales.x.min;
  targetChart.options.scales.x.max = sourceChart.options.scales.x.max;

  // 업데이트 (애니메이션 없이 즉시)
  targetChart.update('none');
  isSyncing = false;
}*/

// ----------------- onload -----------------
window.onload = function(){
  fetch('/get_stock_list')
    .then(res=>res.json())
    .then(data=>{
      allStocks=data;
      renderStockList(allStocks);
    });

  initMainChart();     // (위)
  initVolumeChart();   // (아래)

  document.getElementById('searchInput').addEventListener('keyup', e=>{
    if(e.key==='Enter') searchByName();
  });
  document.getElementById('daysInput').addEventListener('keyup', e=>{
    if(e.key==='Enter') requestChart();
  });
};

// ----------------- (위) 차트 초기화 -----------------
function initMainChart(){
  const ctx=document.getElementById('myChart').getContext('2d');
  myChart=new Chart(ctx,{
    type:'bar',
    data:{
      labels:[],
      datasets:[{
        label:'시가~종가',
        data:[],
        backgroundColor:[],
        extraData:[]
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation: {
        duration: 1500, // 애니메이션 지속 시간 (밀리초)
        easing: 'easeInOutCubic ' // 애니메이션 효과
      },
      layout:{
        padding:{ top:20, bottom:20, left:20, right:70 }
      },
      scales:{
        x:{
          type:'category',
          min: undefined,
          max: undefined,
          offset:true,
          categoryPercentage:0.8,
          barPercentage:0.9
        },
        y:{
          beginAtZero:false,
          /*title:{ display:true, text:'주가' },*/
          // --- (1) 세로축 숫자를 K, M 등으로 축약 ---
          ticks:{
            callback: function(value, index, ticks){
              const absVal = Math.abs(value);
              if(absVal>=1_000_000){
                return (value/1_000_000).toFixed(1)+'M';
              } else if(absVal>=1_000){
                return (value/1_000).toFixed(1)+'K';
              }
              return value;
            }
          }
        }
      },
      plugins:{
        tooltip:{ enabled:true, mode: 'index', intersect: true },
        legend:{ display:false },
        /*zoom:{
          pan:{
            enabled:true,
            mode:'x',
            onPan: ({chart})=>{
              syncZoomPan(myChart, myVolumeChart);
            }
          },
          zoom:{
            wheel:{ enabled:true },
            pinch:{ enabled:false },
            mode:'x',
            onZoom: ({chart})=>{
              syncZoomPan(myChart, myVolumeChart);
            }
          }
        }*/
      },
      events:['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove']
    },
    plugins:[ highLowLinePlugin ]
  });
}

// ----------------- (아래) 차트 초기화 -----------------
function initVolumeChart(){
  const ctx=document.getElementById('myVolumeChart').getContext('2d');
  myVolumeChart=new Chart(ctx,{
    type:'bar',
    data:{
      labels:[],
      datasets:[{
        label:'거래량',
        data:[],
        backgroundColor:[]
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation: {
        duration: 1500, // 애니메이션 지속 시간 (밀리초)
        easing: 'easeInOutCubic ' // 애니메이션 효과
      },
      layout:{
        padding:{ top:20, bottom:20, left:20, right:70 }
      },
      scales:{
        x:{
          type:'category',
          min: undefined,
          max: undefined,
          offset:true,
          categoryPercentage:0.8,
          barPercentage:0.9
        },
        y:{
          beginAtZero:true,
          /*title:{ display:true, text:'거래량' },*/
          // --- (1) 세로축 숫자를 K, M 등으로 축약 ---
          ticks:{
            callback: function(value, index, ticks){
              const absVal = Math.abs(value);
              if(absVal>=1_000_000){
                return (value/1_000_000).toFixed(1)+'M';
              } else if(absVal>=1_000){
                return (value/1_000).toFixed(1)+'K';
              }
              return value;
            }
          }
        }
      },
      plugins:{
        tooltip:{ enabled:true, mode: 'index', intersect: true },
        legend:{ display:false },
        /*zoom:{
          pan:{
            enabled:true,
            mode:'x',
            onPan: ({chart})=>{
              syncZoomPan(myVolumeChart, myChart);
            }
          },
          zoom:{
            wheel:{ enabled:true },
            pinch:{ enabled:false },
            mode:'x',
            onZoom: ({chart})=>{
              syncZoomPan(myVolumeChart, myChart);
            }
          }
        }*/
      },
      events:['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove']
    }
  });
}

// ----------------- 종목 목록 표시 -----------------
function renderStockList(stockData){
  const container=document.getElementById('stockContainer');
  container.innerHTML='';
  stockData.forEach(item=>{
    const div=document.createElement('div');
    div.className='stockItem';
    div.textContent=`${item.회사명} (${item.종목코드})`;
    div.onclick=()=>{
      if(selectedItemElement){
        selectedItemElement.classList.remove('selectedStockItem');
      }
      div.classList.add('selectedStockItem');
      selectedItemElement=div;
      currentCode=item.종목코드;
    };
    container.appendChild(div);
  });
}

// ----------------- 이름 검색 -----------------
function searchByName(){
  const term=document.getElementById('searchInput').value.trim();
  if(!term){
    renderStockList(allStocks);
    return;
  }
  const filtered=allStocks.filter(s=>s.회사명.includes(term));
  if(filtered.length===0){
    alert('검색 결과가 없습니다.');
    document.getElementById('stockContainer').innerHTML='';
  } else {
    renderStockList(filtered);
  }
}

// ----------------- 차트 요청 -----------------
function requestChart(){
  if(!currentCode){
    alert('종목을 선택하세요.');
    return;
  }
  const daysValue=document.getElementById('daysInput').value.trim();
  if(!daysValue){
    alert('일수를 입력하세요 (1~365)');
    return;
  }

  fetch('/get_ohlc_history',{
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body:'code='+currentCode+'&days='+daysValue
  })
  .then(res=>res.json())
  .then(json=>{
    if(json.error){
      alert('에러: '+json.error);
      return;
    }
    if(!json.dates||!json.opens||!json.closes||!json.highs||!json.lows||!json.volumes){
      alert('서버 데이터가 올바르지 않습니다.');
      return;
    }

    // (위) 차트 데이터 업데이트
    updateMainChart(json.dates, json.opens, json.closes, json.highs, json.lows, json.volumes);
    // (아래) 차트 데이터 업데이트
    updateVolumeChart(json.dates, json.volumes, json.opens, json.closes);

    // -- (2) 새 종목 검색 시, 늘 기본 배율로 보이도록 x축 범위 undefined 후 resetZoom --
    myChart.options.scales.x.min = undefined;
    myChart.options.scales.x.max = undefined;
    myVolumeChart.options.scales.x.min = undefined;
    myVolumeChart.options.scales.x.max = undefined;

    // 업데이트 후 줌 초기화
    myChart.update('none');
    myVolumeChart.update('none');
    myChart.resetZoom();
    myVolumeChart.resetZoom();
  })
  .catch(err=>alert('에러:'+err));
}

// ----------------- (위) 차트 데이터 업데이트 -----------------
function updateMainChart(dates, opens, closes, highs, lows, volumes){
  const barData=[];
  const barColors=[];
  const extraData=[];
  let lastNonZeroClose=null;

  for(let i=0;i<dates.length;i++){
    const o=+opens[i], c=+closes[i], h=+highs[i], l=+lows[i], v=+volumes[i];
    if(Number.isNaN(o)||Number.isNaN(c)||Number.isNaN(h)||Number.isNaN(l)||Number.isNaN(v)){
      continue;
    }

    if(v>0){
      lastNonZeroClose=c;
      barData.push([o,c]);
      let color='black';
      if(c>o) color='red';
      else if(c<o) color='blue';
      barColors.push(color);
      extraData.push({
        open:o, close:c, high:h, low:l,
        volume:v, color, isZeroVolume:false,
        zeroVolumeLinePrice:null
      });
    } else {
      barData.push([c,c]);
      barColors.push('black');
      extraData.push({
        open:c, close:c, high:c, low:c,
        volume:0, color:'black', isZeroVolume:true,
        zeroVolumeLinePrice:lastNonZeroClose
      });
    }
  }

  myChart.data.labels=dates;
  myChart.data.datasets[0].data=barData;
  myChart.data.datasets[0].backgroundColor=barColors;
  myChart.data.datasets[0].extraData=extraData;

  // 최고/최저가 (거래량>0만)
  let maxHighVal=-Infinity, maxHighIndex=-1;
  let minLowVal= Infinity,  minLowIndex=-1;
  for(let i=0;i<dates.length;i++){
    const h=+highs[i], l=+lows[i], v=+volumes[i];
    if(v>0){
      if(h>maxHighVal){ maxHighVal=h; maxHighIndex=i; }
      if(l<minLowVal){ minLowVal=l; minLowIndex=i; }
    }
  }
  let validForMarkers=!(maxHighIndex===-1||minLowIndex===-1);

  myChart.data.customMarkers={
    maxHigh:maxHighVal,
    maxHighIndex,
    maxHighDate:(maxHighIndex>=0)?dates[maxHighIndex]:'',
    minLow:minLowVal,
    minLowIndex,
    minLowDate:(minLowIndex>=0)?dates[minLowIndex]:'',
    validForMarkers
  };

  // Y축 범위 살짝 여유
  if(validForMarkers){
    const diff=maxHighVal-minLowVal;
    const margin=(diff===0)?1:diff*0.05;
    myChart.options.scales.y.suggestedMin=minLowVal-margin;
    myChart.options.scales.y.suggestedMax=maxHighVal+margin;
  } else {
    myChart.options.scales.y.suggestedMin=0;
    myChart.options.scales.y.suggestedMax=100;
  }
  myChart.update();
}

// ----------------- (아래) 차트 데이터 업데이트 -----------------
function updateVolumeChart(dates, volumes, opens, closes){
  const volArr=volumes.map(v=>+v||0);
  const barColors = volumes.map((_, i) => { // `v` 대신 `_` 사용
    const open = +opens[i];
    const close = +closes[i];
    if (Number.isNaN(open) || Number.isNaN(close)) return 'blue'; // 기본 색상(보합)
    return close >= open ? 'red' : 'blue'; // 상승은 빨강, 하락 및 보합은 파랑
  });

  myVolumeChart.data.labels=dates;
  myVolumeChart.data.datasets[0].data=volArr;
  myVolumeChart.data.datasets[0].backgroundColor = barColors; // 동적 색상 적용

  // Y축 최대값
  const maxVol=Math.max(...volArr);
  const margin=(maxVol===0)?1:maxVol*0.05;
  myVolumeChart.options.scales.y.suggestedMax=maxVol+margin;

  myVolumeChart.update();
}
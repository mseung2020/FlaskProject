// theme.js - 테마 사이클 페이지

// ========== 전역 상태 ==========
const ThemeState = {
  calendarData: null,
  currentData: null,
  forecastData: null,
  themeColors: {},
  selectedTheme: null
};

// ========== 모바일 메뉴 토글 ==========
document.addEventListener('DOMContentLoaded', function() {
  const menuIcon = document.querySelector('.menu-icon');
  const overlay = document.getElementById('overlay');
  
  if (menuIcon) {
    menuIcon.addEventListener('click', toggleMenu);
  }
  if (overlay) {
    overlay.addEventListener('click', toggleMenu);
  }

  // 데이터 로드 및 렌더링
  initThemeLab();
});

function toggleMenu() {
  document.getElementById('main-nav').classList.toggle('nav-active');
  document.getElementById('overlay').classList.toggle('active');
}

// ========== 초기화 ==========
async function initThemeLab() {
  try {
    const calendarRes = await fetch('/api/theme/calendar');
    const currentRes = await fetch('/api/theme/current');
    const forecastRes = await fetch('/api/theme/forecast');

    ThemeState.calendarData = await calendarRes.json();
    ThemeState.currentData = await currentRes.json();
    ThemeState.forecastData = await forecastRes.json();

    renderCalendar(ThemeState.calendarData);
    renderCurrent(ThemeState.currentData);
    renderForecast(ThemeState.forecastData);

  } catch (error) {
    console.error('테마 데이터 로드 실패:', error);
    showError();
  }
}

// ========== [PAST] 달력 렌더링 ==========
function renderCalendar(data) {
  if (!data || !data.calendar || !data.trading_days) {
    console.warn('달력 데이터 없음');
    return;
  }

  const rowsContainer = document.getElementById('calendarRows');
  const tradingDays = data.trading_days;
  
  // 날짜별 테마 매핑
  const dateThemeMap = {};
  data.calendar.forEach(function(item) {
    if (!dateThemeMap[item.date]) {
      dateThemeMap[item.date] = [];
    }
    dateThemeMap[item.date].push(item);
  });

  // 테마별 색상 할당
  const uniqueThemes = [];
  data.calendar.forEach(function(item) {
    if (uniqueThemes.indexOf(item.theme) === -1) {
      uniqueThemes.push(item.theme);
    }
  });
  assignThemeColors(uniqueThemes);

  // 52주 생성 (오늘 기준 과거 52주, 항상 5칸)
  const today = new Date();
  const weeks = [];
  
  for (let w = 51; w >= 0; w--) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (w * 7));
    
    // 그 주의 월요일 찾기
    const dayOfWeek = weekStart.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekStart.setDate(weekStart.getDate() + daysToMonday);
    
    // 월~금 5일 생성
    const weekDates = [];
    for (let d = 0; d < 5; d++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + d);
      weekDates.push(formatDate(date));
    }
    
    weeks.push(weekDates);
  }
  
  // 주별로 행 생성
  let lastMonth = null;
  
  weeks.forEach(function(weekDates) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'calendar-row';
    
    // 월 셀 - 이 주에 1~7일이 있으면 표시
    const monthCell = document.createElement('div');
    monthCell.className = 'month-cell';
    
    let showMonth = false;
    for (let i = 0; i < weekDates.length; i++) {
      const day = getDayOfMonth(weekDates[i]);
      if (day >= 1 && day <= 7) {
        const currentMonth = getMonthString(weekDates[i]);
        if (currentMonth !== lastMonth) {
          monthCell.textContent = currentMonth;
          lastMonth = currentMonth;
          showMonth = true;
          break;
        }
      }
    }
    
    rowDiv.appendChild(monthCell);
    
    // 테마 카운트
    const rowThemeCounts = {};
    
    // 5칸 채우기 (월~금)
    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      const date = weekDates[dayIdx];
      const dayCell = document.createElement('div');
      dayCell.className = 'day-cell';
      dayCell.dataset.date = date;
      
      // 강세 테마 있으면 색칠
      const themes = dateThemeMap[date];
      if (themes && themes.length > 0) {
        const strongestTheme = themes.sort(function(a, b) {
          return b.avg_return - a.avg_return;
        })[0];
        const themeName = strongestTheme.theme;
        
        dayCell.classList.add('has-data');
        dayCell.setAttribute('data-theme', themeName);
        dayCell.style.background = ThemeState.themeColors[themeName];
        
        // 클릭 이벤트: 테마 필터링
        dayCell.addEventListener('click', function() {
          filterByTheme(themeName);
        });
        
        // 커스텀 툴팁 생성
        const tooltip = document.createElement('div');
        tooltip.className = 'custom-tooltip';
        tooltip.innerHTML = 
          '<div class="tooltip-date">' + date + '</div>' +
          '<div class="tooltip-theme">' + themeName + '</div>' +
          '<div class="tooltip-return">+' + strongestTheme.avg_return + '%</div>';
        dayCell.appendChild(tooltip);
        
        rowThemeCounts[themeName] = (rowThemeCounts[themeName] || 0) + 1;
      } else {
        // 빈 칸 클릭 시 필터 해제
        dayCell.addEventListener('click', function() {
          clearFilter();
        });
      }
      
      rowDiv.appendChild(dayCell);
    }
    
    // 테마 셀
    const themeCell = document.createElement('div');
    themeCell.className = 'theme-cell';
    
    const themeCounts = Object.entries(rowThemeCounts);
    if (themeCounts.length > 0) {
      themeCounts.sort(function(a, b) { return b[1] - a[1]; });
      const dominantTheme = themeCounts[0][0];
      const count = themeCounts[0][1];
      
      themeCell.classList.add('active');
      
      const colorDot = document.createElement('div');
      colorDot.className = 'theme-color-dot';
      colorDot.style.background = ThemeState.themeColors[dominantTheme];
      
      const themeName = document.createElement('div');
      themeName.className = 'theme-name';
      themeName.textContent = dominantTheme;
      
      themeCell.appendChild(colorDot);
      themeCell.appendChild(themeName);
      
      // 테마 셀 클릭 이벤트
      themeCell.addEventListener('click', function() {
        filterByTheme(dominantTheme);
      });
    }
    
    rowDiv.appendChild(themeCell);
    rowsContainer.appendChild(rowDiv);
  });
}

// ========== 테마 필터링 ==========
function filterByTheme(themeName) {
  // 같은 테마 클릭 시 해제
  if (ThemeState.selectedTheme === themeName) {
    clearFilter();
    return;
  }
  
  ThemeState.selectedTheme = themeName;
  
  // 모든 셀 선택
  const allDayCells = document.querySelectorAll('.day-cell');
  const allThemeCells = document.querySelectorAll('.theme-cell:not(.header-cell)');
  
  allDayCells.forEach(function(cell) {
    const cellTheme = cell.getAttribute('data-theme');
    
    if (cell.classList.contains('has-data')) {
      if (cellTheme === themeName) {
        cell.classList.add('highlighted');
        cell.classList.remove('filtered');
      } else {
        cell.classList.remove('highlighted');
        cell.classList.add('filtered');
      }
    } else {
      cell.classList.add('filtered');
    }
  });
  
  allThemeCells.forEach(function(cell) {
    const cellText = cell.querySelector('.theme-name');
    if (cellText && cellText.textContent === themeName) {
      cell.classList.remove('filtered');
    } else {
      cell.classList.add('filtered');
    }
  });
}

function clearFilter() {
  ThemeState.selectedTheme = null;
  
  const allCells = document.querySelectorAll('.day-cell, .theme-cell');
  allCells.forEach(function(cell) {
    cell.classList.remove('filtered', 'highlighted');
  });
}

// ========== 유틸리티 ==========
function generateTradingDays(numDays) {
  const days = [];
  const today = new Date();
  let count = 0;
  let currentDate = new Date(today);

  while (count < numDays) {
    const dayOfWeek = currentDate.getDay();
    
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const dateStr = formatDate(currentDate);
      days.unshift(dateStr);
      count++;
    }
    
    currentDate.setDate(currentDate.getDate() - 1);
  }

  return days;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '.' + m + '.' + d;
}

function getDayOfMonth(dateStr) {
  const parts = dateStr.split('.');
  return parseInt(parts[2], 10);
}

function getMonthString(dateStr) {
  const parts = dateStr.split('.');
  const month = parseInt(parts[1], 10);
  return month + '월';
}

function assignThemeColors(themes) {
  const colors = [
    '#ff7675', '#74b9ff', '#a29bfe', '#55efc4', '#ffeaa7', '#fd79a8',
    '#ff6b81', '#70a1ff', '#5f27cd', '#00d2d3', '#ffa502', '#ff6348',
    '#7bed9f', '#a4b0be', '#ff6b6b', '#4834d4', '#f368e0', '#22a6b3'
  ];
  
  // 알파벳 정렬로 일관성 유지
  const sortedThemes = themes.slice().sort();
  
  sortedThemes.forEach(function(theme, idx) {
    ThemeState.themeColors[theme] = colors[idx % colors.length];
  });
}

// ========== [PRESENT] 현재 트렌드 ==========
function renderCurrent(data) {
  // 로딩 숨김
  const loader = document.getElementById('presentLoader');
  if (loader) {
    loader.classList.add('hidden');
  }
  
  if (!data) data = [];

  const container = document.getElementById('currentCards');
  container.innerHTML = '';

  // 3개 슬롯 생성 (빈 칸 포함)
  for (let i = 0; i < 3; i++) {
    const item = data[i];
    
    if (!item) {
      // 빈 카드
      const emptyCard = document.createElement('div');
      emptyCard.className = 'current-card empty';
      
      const icon = document.createElement('div');
      icon.className = 'empty-icon';
      icon.textContent = '━';
      
      const message = document.createElement('div');
      message.className = 'empty-message';
      message.textContent = 'NO DATA';
      
      emptyCard.appendChild(icon);
      emptyCard.appendChild(message);
      
      container.appendChild(emptyCard);
      continue;
    }
    
    const card = document.createElement('div');
    card.className = 'current-card' + (item.rank === 1 ? ' top1' : '');

    // 순위 배지
    const rankBadge = document.createElement('div');
    rankBadge.className = 'current-rank rank-' + item.rank;
    rankBadge.textContent = item.rank;

    // 테마명
    const themeName = document.createElement('div');
    themeName.className = 'current-theme-name';
    themeName.textContent = item.theme;

    // 대표 종목 + 물음표
    const stocksContainer = document.createElement('div');
    stocksContainer.className = 'current-stocks';
    
    const stocksText = document.createElement('div');
    stocksText.className = 'stocks-text';
    const preview = item.stocks.slice(0, 3).join(' · ');
    const remaining = item.stocks.length > 3 ? ' 외 ' + (item.stocks.length - 3) + '건' : '';
    stocksText.textContent = preview + remaining;
    
    // 물음표 + 툴팁
    const helpIcon = document.createElement('div');
    helpIcon.className = 'stocks-help';
    helpIcon.textContent = '?';
    
    const tooltip = document.createElement('div');
    tooltip.className = 'stocks-tooltip';
    // 종목을 줄바꿈으로 표시
    tooltip.innerHTML = item.stocks.map(function(s) {
      return '· ' + s;
    }).join('<br>');
    
    helpIcon.appendChild(tooltip);
    
    stocksContainer.appendChild(stocksText);
    stocksContainer.appendChild(helpIcon);

    // 연속 강세 일수
    const stat1 = document.createElement('div');
    stat1.className = 'current-stat';
    stat1.innerHTML = 
      '<div class="stat-label">연속 강세</div>' +
      '<div class="stat-value">' + item.streak + '일째</div>';

    // 평균 수익률
    const stat2 = document.createElement('div');
    stat2.className = 'current-stat';
    stat2.innerHTML = 
      '<div class="stat-label">평균 수익률</div>' +
      '<div class="stat-value">+' + item.streak_return + '%</div>';

    card.appendChild(rankBadge);
    card.appendChild(themeName);
    card.appendChild(stocksContainer);
    card.appendChild(stat1);
    card.appendChild(stat2);

    container.appendChild(card);
  }
}

// ========== [FUTURE] 미래 예측 ==========
function renderForecast(data) {
  if (!data || data.length === 0) {
    return;
  }

  // 카드 1: 단기 예측
  const nearContainer = document.getElementById('futureNear');
  const nearData = data.near || data[0];
  
  if (nearData) {
    const confidenceHTML = 
      '<div class="near-confidence">' +
      '예측 점수 ' + (nearData.confidence || '0') + '점' +
      '<div class="confidence-help">?' +
      '<div class="confidence-tooltip">' +
      '사이클 간격 (40%) + ' +
      '최근 모멘텀 (30%) + ' +
      '작년 동기 (30%)<br>' +
      '</div>' +
      '</div>' +
      '</div>';
    
    nearContainer.innerHTML = 
      '<div class="near-badge">NEAR FORECAST</div>' +
      '<div class="near-theme">' + (nearData.theme || '분석 중') + '</div>' +
      '<div class="near-info-row">' +
      '<div class="near-period">' + (nearData.period || '3월 예상') + '</div>' +
      confidenceHTML +
      '</div>' +
      '<div class="near-footer">' + (nearData.model || 'Trend Analysis') + '</div>';
  }

  // 카드 2: 장기 계절성
  const seasonalContainer = document.getElementById('futureSeasonal');
  const seasonalData = data.seasonal || [];
  
  let timelineHTML = '<div class="seasonal-badge">SEASONAL CYCLE</div>';
  timelineHTML += '<div class="timeline-list">';
  
  if (seasonalData.length > 0) {
    seasonalData.forEach(function(item) {
      const isUnknown = !item.theme || item.theme === '?';
      const themeColor = ThemeState.themeColors[item.theme] || '#ddd';
      
      timelineHTML += 
        '<div class="timeline-item' + (isUnknown ? ' unknown' : '') + '" style="--theme-color:' + themeColor + '">' +
        '<div class="timeline-month-wrapper">' +
        '<div class="timeline-month">' + item.month.replace('월', '') + '</div>' +
        '<div class="timeline-month-text">월</div>' +
        '</div>' +
        '<div class="timeline-theme">' + (item.theme || '?') + '</div>' +
        '</div>';
    });
  } else {
    // 더미 데이터
    timelineHTML += 
      '<div class="timeline-item unknown" style="--theme-color:#ddd">' +
      '<div class="timeline-month-wrapper"><div class="timeline-month">3</div><div class="timeline-month-text">월</div></div>' +
      '<div class="timeline-theme">?</div>' +
      '</div>' +
      '<div class="timeline-item" style="--theme-color:#74b9ff">' +
      '<div class="timeline-month-wrapper"><div class="timeline-month">5</div><div class="timeline-month-text">월</div></div>' +
      '<div class="timeline-theme">냉방</div>' +
      '</div>' +
      '<div class="timeline-item" style="--theme-color:#ffeaa7">' +
      '<div class="timeline-month-wrapper"><div class="timeline-month">6</div><div class="timeline-month-text">월</div></div>' +
      '<div class="timeline-theme">태양광</div>' +
      '</div>';
  }
  
  timelineHTML += '</div>';
  timelineHTML += '<div class="seasonal-footer">Seasonal Pattern Analysis</div>';
  
  seasonalContainer.innerHTML = timelineHTML;
}

// ========== 에러 표시 ==========
function showError() {
  const container = document.getElementById('calendarRows');
  if (container) {
    container.innerHTML = '<div style="padding:40px; text-align:center; color:#999;">데이터 로딩 실패</div>';
  }
}

// ========== 모바일 모달 ==========
document.addEventListener('DOMContentLoaded', function() {
  const modal = document.getElementById('infoModal');
  const modalBody = document.getElementById('infoModalBody');
  const closeBtn = document.querySelector('.info-modal-close');
  const overlay = document.querySelector('.info-modal-overlay');

  // 모바일 전용 (768px 이하)
  function isMobile() {
    return window.innerWidth <= 768;
  }

  // 모달 열기
  window.openInfoModal = function(content) {
    if (!isMobile()) return;
    
    modalBody.innerHTML = content;
    modal.classList.add('active');
  };

  // 모달 닫기
  function closeModal() {
    modal.classList.remove('active');
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', closeModal);

  // 물음표 클릭 이벤트 (동적으로 추가된 요소용)
  document.addEventListener('click', function(e) {
    if (!isMobile()) return;

    if (e.target.closest('.stocks-help')) {
      e.stopPropagation();
      const stocksText = e.target.closest('.current-stocks').querySelector('.stocks-text').textContent;
      const tooltip = e.target.closest('.stocks-help').querySelector('.stocks-tooltip');
      if (tooltip) {
        openInfoModal('<h3>종목 리스트</h3>' + tooltip.innerHTML);
      }
    }

    if (e.target.closest('.confidence-help')) {
      e.stopPropagation();
      const tooltip = e.target.closest('.confidence-help').querySelector('.confidence-tooltip');
      if (tooltip) {
        openInfoModal('<h3>예측 점수 계산</h3>' + tooltip.innerHTML);
      }
    }
  });
});

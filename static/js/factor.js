  document.addEventListener('DOMContentLoaded', function () {
      const buttons = document.querySelectorAll('.factor-toggle');

      buttons.forEach(btn => {
          btn.addEventListener('click', function () {
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

  document.addEventListener('DOMContentLoaded', function () {
    const selectorBtns = document.querySelectorAll('.selector-btn');

    selectorBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        selectorBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
      });
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    const knob = document.getElementById("sliderKnob");
    const track = document.getElementById("sliderTrack");

    const positions = [0, 33.33, 66.66, 100];

    let isDragging = false;

    knob.addEventListener("mousedown", (e) => {
      isDragging = true;
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        snapToClosest();
        document.body.style.userSelect = "";
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const rect = track.getBoundingClientRect();
      let x = e.clientX - rect.left;
      x = Math.max(0, Math.min(x, rect.width));
      knob.style.left = `${(x / rect.width) * 100}%`;
    });

    function snapToClosest() {
      const currentLeft = parseFloat(knob.style.left);
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
      // 여기서 원하는 텍스트(예: "3개월")를 표시할 수 있음
    }

    // 초기 위치 설정
    knob.style.left = `${positions[0]}%`;
  });

  function drawMidDividerLine(chart) {
    const meta = chart.getDatasetMeta(0);
    const bar5 = meta.data[4];
    const bar6 = meta.data[5];

    const y1 = bar5.y;
    const y2 = bar6.y;
    const midY = (y1 + y2) / 2;

    const { ctx, chartArea } = chart;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(chartArea.left, midY);
    ctx.lineTo(chartArea.right, midY);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#999';
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();

  }

  document.querySelector('.box4-right-btn').addEventListener('click', async () => {
    const button = document.querySelector('.box4-right-btn');
    button.classList.add('loading');

    const leftBox = document.querySelector('#Content3 .big-inner-box:first-child');
    const rightBox = document.querySelector('#Content3 .big-inner-box:last-child');
    const content1 = document.querySelector('#Content1');

    // 로딩 이미지 보이기
    document.getElementById('loader-1').classList.remove('hidden');
    document.getElementById('loader-left').classList.remove('hidden');
    document.getElementById('loader-right').classList.remove('hidden');
    document.getElementById('returnChart').style.display = 'none';

    // 기존 결과 숨기기
    document.getElementById('left-result').innerHTML = '';
    document.getElementById('right-result').innerHTML = '';

    try {
      // 페이지에 있는 모든 버튼 순서대로 수집
      const allButtons = document.querySelectorAll('.factor-btn.factor-toggle');

      // 선택된 버튼 가져옴
      const selectedButtons = document.querySelectorAll('.factor-btn.factor-toggle.active');

      // 버튼 순서에 맞는 index 추출
      const selectedIndices = Array.from(selectedButtons).map(btn =>
        Array.from(allButtons).indexOf(btn) + 1
      );

      const activeModeBtn = document.querySelector('.selector-btn.active');
      const mode = activeModeBtn && activeModeBtn.id === "selector-btn-1" ? "AND" : "OR";

      const labels = ["3개월", "6개월", "9개월", "12개월"];
      const knob = document.getElementById("sliderKnob");
      const track = document.getElementById("sliderTrack");
      const leftPercentStr = knob.style.left || '0%';
      const leftPercent = parseFloat(leftPercentStr);  // 예: "66.66%" → 66.66
      const index = Math.round(leftPercent / 33.33);
      const months = parseInt(labels[index].replace('개월', ''));

      const payload = {
        selectedFactors: selectedIndices,
        mode: mode,
        months: months
      };

      const response = await fetch('/factor_result', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      const textBox = renderConditionText(result.selected_names, result.months, result.mode);
      const leftResult = document.getElementById('left-result');
      leftResult.innerHTML = '';  // 기존 제거
      leftResult.appendChild(textBox);

      const returnText = document.createElement('div');
      returnText.className = 'return-text-final';
      returnText.style.textAlign = 'right';
      returnText.style.fontSize = '28px';
      returnText.style.fontWeight = 'bold';
      returnText.style.marginTop = '20px';
      returnText.style.color = result.average_return > 0 ? '#FF4D4D' : '#3B82F6';
      returnText.textContent = result.average_return !== null ? result.average_return.toFixed(2) + '%' : '데이터 부족';

      leftResult.appendChild(returnText);
      
      // ✅ Chart 그리기
      const chartCanvas = document.getElementById('returnChart');
      if (chartCanvas) {
        const ctx = chartCanvas.getContext('2d');

        // 이전 차트가 있으면 제거
        if (window.returnChart && typeof window.returnChart.destroy === 'function') {
          window.returnChart.destroy();
        }

        const returns = result.company_returns;

        // 정렬 및 상하위 5개 추출
        const sorted = returns.sort((a, b) => b.return - a.return);
        let displayList = sorted;
        if (sorted.length > 10) {
          displayList = [...sorted.slice(0, 5), ...sorted.slice(-5)];
        }

        // ✅ 조건에 따라 레이블 표시 플러그인 정의
        const showTopBottomLabel = returns.length > 10;
        const topBottomLabelPlugin = {
          id: 'topBottomLabel',
          beforeDraw(chart) {
            if (!showTopBottomLabel) return;
            const { ctx, chartArea } = chart;
            ctx.save();
            ctx.font = '12px Paperlogy';
            ctx.fillStyle = '#666';
            ctx.textAlign = 'right';
            ctx.fillText('(수익률 상위 5개 / 하위 5개)', chartArea.right + 15, chartArea.top - 10);
            ctx.restore();
          }
        };

        const labels = displayList.map(item => item.name);
        const data = displayList.map(item => item.return);
        const POS_COLOR = '#4caf50';
        const NEG_COLOR = '#ff4f4f';
        const colors = data.map(val => val >= 0 ? POS_COLOR : NEG_COLOR);


        window.returnChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              data: data,
              backgroundColor: colors,

              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            layout: {
              padding: {
                top: 20
              }
            },
            animation: {
              duration: 1500,
              onComplete: () => {
                if (returns.length > 10) {
                  drawMidDividerLine(window.returnChart);
                }
              }
            },
            plugins: {
              tooltip: {
                callbacks: {
                  label: function(context) {
                    return `${context.raw.toFixed(2)}%`;
                  }
                },
                bodyFont: {
                  family: 'GmarketSansMedium'  // ✅ 툴팁 폰트 지정
                }
              },
              legend: {
                display: false
              }
            },
            scales: {
              x: {
                reverse: true,
                grid: { display: false },
                ticks: { 
                  callback: val => `${val}%`,
                  font: {
                    size: 11,
                    family: 'GmarketSansMedium'  // ✅ 가로축 숫자%
                  }
                }
              },
              y: {
                grid: { display: false },
                ticks: {
                  color: '#000',
                  font: {
                    size: 12,
                    family: 'Paperlogy'  // ✅ 세로축 회사명
                  }
                }
              }
            }
          },
          plugins: [topBottomLabelPlugin]
        });
      }

      // 로딩 숨기기
      document.getElementById('loader-1').classList.add('hidden');
      document.getElementById('loader-left').classList.add('hidden');
      document.getElementById('loader-right').classList.add('hidden');
      document.getElementById('returnChart').style.display = 'block';

      // 결과 표시
      renderCompanyList(result.companies);

    } catch (err) {
      console.error("❌ fetch 실패:", err);
    } finally {
      button.classList.remove('loading');
    }
  });

  function renderCompanyList(companies) {
    const rightResult = document.getElementById('right-result');
    rightResult.innerHTML = ''; // 초기화

    const ul = document.createElement('ul');
    ul.className = 'company-list';

    companies.forEach(name => {
      const li = document.createElement('li');
      li.className = 'company-item';
      li.textContent = name;
      li.addEventListener('click', () => {
        document.querySelectorAll('.company-item').forEach(item => item.classList.remove('selected'));
        li.classList.add('selected');
      });
      ul.appendChild(li);
    });

    rightResult.appendChild(ul);
  }

  function renderConditionText(names, months, mode) {
    const connector = mode === "AND" ? "이고" : "또는";
    const monthText = `${months}개월 동안`;

    const colorSet = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#06b6d4'];

    const container = document.createElement('div');
    container.className = 'condition-text';
    container.style.whiteSpace = 'pre-line';
    container.style.textAlign = 'left';
    container.style.lineHeight = '1.8';
    container.style.fontSize = '18px';
    container.style.padding = '10px';

    const monthLine = document.createElement('div');
    monthLine.textContent = monthText;
    container.appendChild(monthLine);

    names.forEach((name, i) => {
      const line = document.createElement('div');
      const span = document.createElement('span');
      span.style.color = colorSet[i % colorSet.length];
      span.style.fontWeight = 'bold';
      span.textContent = `"${name}"`;

      line.appendChild(span);
      line.appendChild(document.createTextNode(i === names.length - 1 ? ' 기업의' : ` ${connector}`));
      container.appendChild(line);
    });

    const finalLine = document.createElement('div');
    finalLine.textContent = '평균 수익률은?';
    container.appendChild(finalLine);

    const disclaimer = document.createElement('div');
    disclaimer.textContent = '(일부 데이터는 포함되지 않았을 수 있습니다.)';
    disclaimer.style.fontSize = '12px';
    disclaimer.style.color = '#888';
    disclaimer.style.marginTop = '4px';
    disclaimer.style.textAlign = 'left';

    container.appendChild(disclaimer);

    return container;
  }








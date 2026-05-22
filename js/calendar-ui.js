// js/calendar-ui.js — 미니 달력 렌더러

const CalendarUI = {
  render(container, currentDate, events, selectedDate) {
    const yr = currentDate.getFullYear();
    const mo = currentDate.getMonth();
    const firstDow  = new Date(yr, mo, 1).getDay();
    const daysInMo  = new Date(yr, mo + 1, 0).getDate();
    const today     = new Date();

    // 이벤트가 있는 날짜 집합
    const evDays = new Set();
    (events || []).forEach(e => {
      const d = new Date(e.start?.dateTime || e.start?.date);
      if (d.getFullYear() === yr && d.getMonth() === mo) evDays.add(d.getDate());
    });

    const moLabel = currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });
    const dows    = ['일', '월', '화', '수', '목', '금', '토'];

    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += '<div class="cal-day other-month"></div>';
    for (let d = 1; d <= daysInMo; d++) {
      const isToday    = today.getFullYear() === yr && today.getMonth() === mo && today.getDate() === d;
      const isSelected = selectedDate && selectedDate.getFullYear() === yr && selectedDate.getMonth() === mo && selectedDate.getDate() === d;
      const hasDot     = evDays.has(d);
      cells += `<div class="cal-day${isToday ? ' today' : ''}${isSelected && !isToday ? ' selected' : ''}${hasDot ? ' has-event' : ''}"
        onclick="App.selectCalDate(new Date(${yr},${mo},${d}))">${d}</div>`;
    }

    container.innerHTML = `
      <div class="cal-nav">
        <button class="cal-nav-btn" onclick="App.changeCalMonth(-1)">‹</button>
        <span class="cal-nav-title">${moLabel}</span>
        <button class="cal-nav-btn" onclick="App.changeCalMonth(1)">›</button>
      </div>
      <div class="cal-grid">
        ${dows.map(d => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
      </div>`;
  },
};

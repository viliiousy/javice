// js/calendar-ui.js — 달력 (월~일 순서, 공휴일, 토=파랑 일=빨강)

const CalendarUI = {
  _lpTimer: null,

  // 대한민국 공휴일 (YYYY-MM-DD)
  HOLIDAYS: new Set([
    '2026-01-01','2026-01-28','2026-01-29','2026-01-30',
    '2026-03-01','2026-05-05','2026-05-25','2026-06-06',
    '2026-08-15','2026-09-24','2026-09-25','2026-09-26',
    '2026-10-03','2026-10-09','2026-12-25',
    '2025-01-01','2025-01-28','2025-01-29','2025-01-30',
    '2025-03-01','2025-05-05','2025-05-06','2025-06-06',
    '2025-08-15','2025-10-03','2025-10-06','2025-10-07','2025-10-08',
    '2025-10-09','2025-12-25',
  ]),

  _isHoliday(yr,mo,d) {
    const str=`${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return this.HOLIDAYS.has(str);
  },

  render(container, currentDate, events, selectedDate) {
    if(!container) return;
    const yr=currentDate.getFullYear(), mo=currentDate.getMonth();
    // 월요일 시작: firstDow를 월(0)~일(6) 기준으로 변환
    const rawFirstDow=new Date(yr,mo,1).getDay(); // 0=일,1=월...6=토
    const firstDow=(rawFirstDow===0?6:rawFirstDow-1); // 0=월,1=화...6=일
    const daysInMo=new Date(yr,mo+1,0).getDate();
    const today=new Date();

    const evDays=new Set();
    (events||[]).forEach(e=>{
      try{
        let d;
        if(e.start?.dateTime) d=new Date(e.start.dateTime);
        else if(e.start?.date){ const [y,m,dd]=e.start.date.split('-').map(Number); d=new Date(y,m-1,dd); }
        else return;
        if(d.getFullYear()===yr&&d.getMonth()===mo) evDays.add(d.getDate());
      }catch{}
    });

    const taskDays=new Set();
    if(typeof App!=='undefined'){
      Object.values(App.S.tasks||{}).forEach(list=>{
        list.filter(t=>t.status==='needsAction'&&t.due).forEach(t=>{
          try{ const [y,m,dd]=t.due.split('T')[0].split('-').map(Number); if(y===yr&&m-1===mo) taskDays.add(dd); }catch{}
        });
      });
    }

    const clDays=new Set();
    if(typeof Checklist!=='undefined'){
      Checklist.getItems().filter(i=>i.dueDate&&!i.done).forEach(i=>{
        const d=new Date(i.dueDate+'T00:00:00');
        if(d.getFullYear()===yr&&d.getMonth()===mo) clDays.add(d.getDate());
      });
    }

    const moLabel=currentDate.toLocaleDateString('ko-KR',{year:'numeric',month:'long'});
    // 월~일 순서
    const dows=['월','화','수','목','금','토','일'];

    let cells='';
    for(let i=0;i<firstDow;i++) cells+='<div class="cal-day other-month"></div>';
    for(let d=1;d<=daysInMo;d++){
      const thisDate=new Date(yr,mo,d);
      const dow=thisDate.getDay(); // 0=일,6=토
      const isToday=today.getFullYear()===yr&&today.getMonth()===mo&&today.getDate()===d;
      const isSel=selectedDate&&selectedDate.getFullYear()===yr&&selectedDate.getMonth()===mo&&selectedDate.getDate()===d;
      const isHoliday=this._isHoliday(yr,mo,d);
      const isSat=dow===6, isSun=dow===0;

      let cls='cal-day';
      if(isToday) cls+=' today';
      else if(isSel) cls+=' selected';
      if(evDays.has(d)) cls+=' has-event';
      if(taskDays.has(d)) cls+=' has-task';
      if(clDays.has(d)) cls+=' has-cl';
      if((isSun||isHoliday)&&!isToday) cls+=' day-red';
      if(isSat&&!isToday) cls+=' day-blue';

      cells+=`<div class="${cls}"
        onclick="App.selectCalDate(new Date(${yr},${mo},${d}))"
        ontouchstart="CalendarUI._startLP(${yr},${mo},${d},event)"
        ontouchend="CalendarUI._endLP()"
        ontouchcancel="CalendarUI._endLP()"
        onmousedown="CalendarUI._startLP(${yr},${mo},${d},event)"
        onmouseup="CalendarUI._endLP()"
        onmouseleave="CalendarUI._endLP()">${d}</div>`;
    }

    container.innerHTML=`
      <div class="cal-nav">
        <button class="cal-nav-btn" onclick="App.changeCalMonth(-1)">‹</button>
        <span class="cal-nav-title">${moLabel}</span>
        <button class="cal-nav-btn" onclick="App.changeCalMonth(1)">›</button>
      </div>
      <div class="cal-grid">
        ${dows.map((d,i)=>{
          const cls=i===5?'cal-dow dow-blue':i===6?'cal-dow dow-red':'cal-dow';
          return `<div class="${cls}">${d}</div>`;
        }).join('')}
        ${cells}
      </div>`;
  },

  _startLP(yr,mo,day,e){
    if(e.type==='touchstart') e.preventDefault();
    clearTimeout(this._lpTimer);
    this._lpTimer=setTimeout(()=>{ CalendarUI._endLP(); App.showLongPressMenu(new Date(yr,mo,day)); },600);
  },
  _endLP(){ clearTimeout(this._lpTimer); this._lpTimer=null; },
};

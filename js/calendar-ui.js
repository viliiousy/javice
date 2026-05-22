// js/calendar-ui.js — 미니 달력 (Tasks 마감일 dot 포함)

const CalendarUI = {
  _lpTimer: null,

  render(container, currentDate, events, selectedDate) {
    if (!container) return;
    const yr=currentDate.getFullYear(), mo=currentDate.getMonth();
    const firstDow=new Date(yr,mo,1).getDay();
    const daysInMo=new Date(yr,mo+1,0).getDate();
    const today=new Date();

    // 구글 이벤트 날짜
    const evDays=new Set();
    (events||[]).forEach(e=>{
      try {
        let d;
        if(e.start?.dateTime) d=new Date(e.start.dateTime);
        else if(e.start?.date){ const [y,m,dd]=e.start.date.split('-').map(Number); d=new Date(y,m-1,dd); }
        else return;
        if(d.getFullYear()===yr&&d.getMonth()===mo) evDays.add(d.getDate());
      } catch{}
    });

    // Tasks 마감일
    const taskDays=new Set();
    if(typeof App!=='undefined'){
      Object.values(App.S.tasks||{}).forEach(list=>{
        list.filter(t=>t.status==='needsAction'&&t.due).forEach(t=>{
          try{
            const ds=t.due.split('T')[0];
            const [y,m,dd]=ds.split('-').map(Number);
            if(y===yr&&m-1===mo) taskDays.add(dd);
          }catch{}
        });
      });
    }

    // 체크리스트 마감일
    const clDays=new Set();
    if(typeof Checklist!=='undefined'){
      Checklist.getItems().filter(i=>i.dueDate&&!i.done).forEach(i=>{
        const d=new Date(i.dueDate+'T00:00:00');
        if(d.getFullYear()===yr&&d.getMonth()===mo) clDays.add(d.getDate());
      });
    }

    const moLabel=currentDate.toLocaleDateString('ko-KR',{year:'numeric',month:'long'});
    const dows=['일','월','화','수','목','금','토'];
    let cells='';
    for(let i=0;i<firstDow;i++) cells+='<div class="cal-day other-month"></div>';
    for(let d=1;d<=daysInMo;d++){
      const isToday=today.getFullYear()===yr&&today.getMonth()===mo&&today.getDate()===d;
      const isSel=selectedDate&&selectedDate.getFullYear()===yr&&selectedDate.getMonth()===mo&&selectedDate.getDate()===d;
      let cls='cal-day';
      if(isToday) cls+=' today';
      else if(isSel) cls+=' selected';
      if(evDays.has(d))  cls+=' has-event';
      if(taskDays.has(d)) cls+=' has-task';
      if(clDays.has(d))  cls+=' has-cl';
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
        ${dows.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
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

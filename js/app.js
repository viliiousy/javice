// js/app.js — 갓생 대시보드 메인 컨트롤러

const App = {
  S: {
    calDate:       new Date(),
    selDate:       new Date(),
    lists:         [],
    tasks:         {},
    events:        [],
    taskFilter:    'all',
    taskSort:      false,
    calPanel:      'today',
    showCompleted: false,
  },

  async init() {
    this._updateHeaderDate(new Date());
    this.initDarkMode();
    this._setupListeners();
    if (typeof Tabs !== 'undefined') Tabs.init();
    try { if (typeof CardSort !== 'undefined') CardSort.init(); } catch (e) {}
    try { if (typeof CardLayout !== 'undefined') { CardLayout.init(); CardLayout.apply(); } } catch (e) {}
    try { if (typeof Weather !== 'undefined') Weather.init(); } catch(e){}
    setTimeout(()=>{ if(typeof JARVIS!=='undefined') JARVIS.init(); },500);
    if(typeof Platform!=='undefined'&&Platform.native){ Auth.init(); } else { const waitGIS=setInterval(()=>{ if(typeof google!=='undefined'&&google.accounts){ clearInterval(waitGIS); Auth.init(); } },150); setTimeout(()=>clearInterval(waitGIS),8000); }   // 앱은 GIS 를 기다리지 않는다
  },

  _setupListeners() {
    const $=id=>document.getElementById(id);
    const on=(id,fn)=>{ const el=$(id); if(el) el.onclick=fn; };
    on('btnGoogleLogin', ()=>Auth.login());
    on('btnLogout',      ()=>Auth.logout());
    on('btnSync',        ()=>this.sync());
    on('btnShowCompleted',()=>{ this.S.showCompleted=!this.S.showCompleted; const b=document.getElementById('btnShowCompleted'); if(b)b.style.background=this.S.showCompleted?'var(--accent)':''; this._renderTasks(); });
    on('btnShowHidden',  ()=>{ this.S.showHidden=!this.S.showHidden; this._paintShowHidden(); this._renderTasks(); });

    // 이 카드의 머리는 달력이다. 할일은 아래 목록이 제 + 를 따로 가지고 있다.
    on('btnAddEvent',    ()=>this._showAddEventModalForDate(this.S.selDate));
    on('btnDateSort',    ()=>this._toggleDateSort());
    on('btnModalClose',  ()=>this.closeModal());
    $('btnCalSettings')?.addEventListener('click',()=>GoogleCalendar.showSettings());
    const modal=$('modal'); if(modal) modal.onclick=e=>{ if(e.target===modal) this.closeModal(); };
  },

  _toggleDateSort() {
    this.S.taskSort=!this.S.taskSort;
    const btn=document.getElementById('btnDateSort');
    if(btn){ btn.style.background=this.S.taskSort?'var(--accent)':''; btn.style.color=this.S.taskSort?'#fff':''; btn.style.border=this.S.taskSort?'1px solid var(--accent)':''; }
    this._renderTasks();
  },

  _initialAvatar(name) {
    const ch=[...String(name||'').trim()][0]||'B';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#FF6A2B"/><text x="32" y="33" dominant-baseline="central" text-anchor="middle" font-family="-apple-system,'IBM Plex Sans KR',sans-serif" font-size="30" font-weight="600" fill="#17181B">${ch.replace(/[<&>]/g,'')}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  },
  async onAuthSuccess(userInfo) {
    // 가입 승인: 승인 전이면 신청/대기 화면을 띄우고 여기서 멈춘다(js/gate.js)
    try { if (typeof Gate !== 'undefined' && !(await Gate.pass(userInfo))) { const ls=document.getElementById('loginScreen'); if(ls) ls.style.display='none'; return; } } catch(e) { console.warn('[Gate]', e); }
    try { if (typeof AppUpdate !== 'undefined') setTimeout(() => AppUpdate.check('login'), 1200); } catch (e) {}   // 로그인하자마자 새 APK 가 있는지 보고 바로 안내
    { const ls=document.getElementById('loginScreen'); if(ls) ls.style.display='none'; }
    { const ap=document.getElementById('app'); if(ap) ap.style.display='block'; }
    if(userInfo?.name){
      const hName = document.getElementById('hName');
      if(hName) hName.textContent=userInfo.name;
      // 사진이 있으면 그 사진, 없으면(Apple 로그인은 사진을 주지 않는다) 이름 첫 글자로 동그라미를 만든다
      { const av=document.getElementById('hAvatar'); if(av) av.src=userInfo.picture || this._initialAvatar(userInfo.name); }
      const pn=document.getElementById('pmName'); if(pn) pn.textContent=userInfo.name||'';
      const pm=document.getElementById('pmMail'); if(pm) pm.textContent=userInfo.email||'';
      const hUser = document.getElementById('hUser');
      if(hUser) hUser.style.display='flex';
    } else {
      const hUser = document.getElementById('hUser');
      if(hUser) hUser.style.display='flex';
    }
    this._updateHeaderDate(new Date());
    try { Habits.init(new Date()); } catch(e){ console.warn('Habits init',e); }
    try { Notifications.init(); } catch(e){ console.warn('Notifications init',e); }
    try { LocalNotify.init(); } catch(e){ console.warn('LocalNotify init',e); }
    try { if(typeof Widgets!=='undefined') Widgets.init(); } catch(e){}
    // 허브에서 '연결 코드가 없다' 며 돌아왔으면 이 계정으로 연결해 주고 다시 허브로
    if(/[?&]linkhub=1/.test(location.search)) Settings.hubLink(120000).then(c=>{ if(c) location.replace('hub.html?from=app'); else App.showToast('로그인이 끝나면 허브를 다시 열어 주세요','error',{label:'허브 열기',fn:()=>Settings.openHub()}); });
    else if(localStorage.getItem('gl_hub_mode')==='1') Settings.hubLink().catch(()=>{});
    try{ Settings.hubMenu(); }catch(e){}
    // 바로 가기 주소: ?set=notify · ?set=ai · ?set=connector · ?set=cal · ?set=device · ?set=widget …
    // 안내 문구에 '설정 › ○○ 로 가세요' 대신 이 주소(또는 QR)를 주면 한 번에 그 화면이 열린다.
    { const sp=new URLSearchParams(location.search), sc=sp.get('set');
      if(sc){ sp.delete('set'); const q=sp.toString(); history.replaceState(null,'',location.pathname+(q?'?'+q:'')+location.hash);
        setTimeout(()=>{ try{ if(sc==='key') JARVIS.showKeySetup(); else Settings.open(Settings.CATS.some(c=>c.id===sc)||Settings.SUB[sc]?sc:undefined); }catch(e){} }, 1200); } }
    // 휴대폰 앱은 세로로 쓴다(허브에서 가로로 돌렸다가 돌아온 경우 포함). 태블릿은 자유
    try{ if(Platform.native&&Math.min(screen.width,screen.height)<600){ const P=window.Capacitor.Plugins, SO=P.ScreenOrientation; const so=()=>SO&&SO.lock({orientation:'portrait'}).catch(()=>{}); (P.BashyNative&&P.BashyNative.setOrientation)?P.BashyNative.setOrientation({mode:'portrait'}).catch(so):so(); } }catch(e){}
    try { Diet.render(new Date()); } catch(e){ console.warn('Diet render',e); }
    try { Fitness.render(new Date()); } catch(e){ console.warn('Fitness render',e); }
    try { Checklist.render(); }     catch(e){ console.warn('Checklist render',e); }
    try { Memo.render(); }          catch(e){ console.warn('Memo render',e); }
    try { InBody.init(); }          catch(e){ console.warn('InBody init',e); }
    try { Econ.init(); }            catch(e){ console.warn('Econ init',e); }
    try { AIUsage.init(); }         catch(e){ console.warn('AIUsage init',e); }
    try { TopStrip.render(); }      catch(e){ console.warn('TopStrip',e); }
    try { CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,[],this.S.selDate); } catch(e){ console.warn('Cal render',e); }
    this._updateStatsBanner();
    // 처음 쓰는 계정이면 설정 도우미 (클라우드 기록을 받은 뒤에 판단해야 기존 사용자를 새로 보지 않는다)
    setTimeout(()=>{ try { Onboard.maybeStart(); } catch(e){ console.warn('Onboard',e); } }, 900);
    try { await this.sync(); } catch(e){ console.warn('[Sync]',e); }   // 동기화가 실패해도 시작 화면은 그대로 쓴다
  },

  // 오프라인 모드는 없앴다.
  // 로그인 없이 쓰면 기록이 u_offline_* 로 저장돼서 클라우드에 한 번도 안 올라갔다.
  // 화면에는 멀쩡히 보이니까 저장된 줄 알지만, 다른 기기에는 없고 브라우저를 지우면 같이 사라진다.
  // '보이는데 없는' 상태를 만드는 문이라 문 자체를 닫았다.
  // (승계는 UserStore.adoptOffline() 이 로그인할 때 한 번 해 준다.)

  // ── 동기화 ────────────────────────────
  // 출처 넷을 합친다: 구글(연결돼 있으면) · 아이폰 캘린더(켰으면) · 구독 주소(있으면) · Bashy(항상).
  // 화면은 출처를 모른다 — 모두 구글 모양으로 들어오고 `_src` 만 다르다 (js/cal-sources.js).
  _srcEv: { google: [], device: [], ics: [], bashy: [] },
  _range() {
    const tMin=new Date(); tMin.setMonth(tMin.getMonth()-1); tMin.setHours(0,0,0,0);
    const tMax=new Date(); tMax.setMonth(tMax.getMonth()+3); tMax.setHours(23,59,59,999);
    return [tMin,tMax];
  },
  _evSort(a,b){ return new Date(a.start?.dateTime||a.start?.date+'T00:00:00')-new Date(b.start?.dateTime||b.start?.date+'T00:00:00'); },
  _mergeEvents() {
    const S=this._srcEv;
    this.S.events=[...S.google,...S.device,...S.ics,...S.bashy].sort((a,b)=>this._evSort(a,b));
  },
  _bashyTasks() {
    return BashyCal.tasks().map(t=>{ t.starred=UserStore.get('gl_star_'+t.id)==='1'; t._hidden=UserStore.get('gl_hidden_'+t.id)==='1'; return t; });
  },
  // 계정에 저장된 Bashy 일정·할일만 다시 읽어 그린다 (다른 기기에서 바뀐 걸 받았을 때, 동기화 시작할 때)
  refreshLocal() {
    const [tMin,tMax]=this._range();
    this._srcEv.bashy=BashyCal.events(tMin,tMax);
    this._mergeEvents();
    if(!this.S.lists.some(l=>l.id===BashyCal.LIST_ID)) this.S.lists=[...this.S.lists,BashyCal.list()];
    this.S.tasks[BashyCal.LIST_ID]=this._bashyTasks();
    this._renderAllCal();
  },
  _renderAllCal() {
    this._buildTaskFilters();
    this._renderTasks();
    CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
    this._renderCalPanel();
    this._updateStatsBanner();
    this._updateHeaderDate(this.S.selDate); // 동기화 후 할일 뱃지 즉시 반영
  },
  // 구글 연결이 끊겼을 때(Apple 로그인 사용자의 토큰 만료 등) 구글 것만 내린다
  dropGoogle() {
    this._srcEv.google=[];
    this.S.lists=this.S.lists.filter(l=>l.id===BashyCal.LIST_ID);
    Object.keys(this.S.tasks).forEach(k=>{ if(k!==BashyCal.LIST_ID) delete this.S.tasks[k]; });
    if(this.S.taskFilter!=='all'&&!this.S.lists.some(l=>l.id===this.S.taskFilter)) this.S.taskFilter='all';
    this._mergeEvents(); this._renderAllCal();
  },
  async sync() {
    if(!Auth.signedIn() && !UserStore._uid) return;
    const google=Auth.isLoggedIn(), remote=google||DeviceCal.on()||IcsCal.sources().length>0;
    if(remote) this.showToast('동기화 중...','');
    // 계정에 있는 것부터 바로 보인다 — 바깥 캘린더를 기다리지 않는다
    try { this.refreshLocal(); } catch(e){ console.warn('[Sync] local',e); }
    const [tMin,tMax]=this._range();
    const errs=[];
    const pGoogle=google?(async()=>{
      const lists=await GoogleTasks.fetchTaskLists();
      const tasks={};
      await Promise.all(lists.map(async l=>{
        tasks[l.id]=await GoogleTasks.fetchTasks(l.id);
        tasks[l.id].forEach(t=>{
          // API notes 마커 기반 starred OR 로컬 localStorage starred 둘 중 하나라도 true면 starred
          const localStar = UserStore.get('gl_star_'+t.id)==='1';
          t.starred = !!(t._apiStarred || localStar);
          t._hidden=UserStore.get('gl_hidden_'+t.id)==='1';
        });
      }));
      // 할일은 일정보다 먼저 그린다(예전과 같이)
      Object.keys(this.S.tasks).forEach(k=>{ if(k!==BashyCal.LIST_ID) delete this.S.tasks[k]; });
      Object.assign(this.S.tasks,tasks);
      this.S.lists=[...lists,BashyCal.list()];
      this._buildTaskFilters(); this._renderTasks();
      this._srcEv.google=(await GoogleCalendar.fetchEvents(tMin,tMax)).map(e=>({...e,_src:'google'}));
    })().catch(e=>{ errs.push(e); }):Promise.resolve();
    const pDev=DeviceCal.on()?DeviceCal.fetch(tMin,tMax).then(v=>{ this._srcEv.device=v; }).catch(e=>{ console.warn('[Sync] 아이폰 캘린더',e); errs.push(e); })
      :Promise.resolve(this._srcEv.device=[]);
    const pIcs=IcsCal.sources().length?IcsCal.fetch(tMin,tMax).then(v=>{ this._srcEv.ics=v; }).catch(e=>{ console.warn('[Sync] 구독 캘린더',e); })
      :Promise.resolve(this._srcEv.ics=[]);
    if(!google) this._srcEv.google=[];
    await Promise.all([pGoogle,pDev,pIcs]);
    this._mergeEvents();
    this._renderAllCal();
    if(errs.length){
      console.error('[Sync]',errs);
      this.showToast('동기화 실패: '+errs[0].message,'error');
    } else if(remote){
      const bad=Object.keys(IcsCal.errors).length;
      this.showToast(bad?`동기화 완료 — 구독 캘린더 ${bad}개를 받지 못했습니다`:`동기화 완료 (일정 ${this.S.events.length}개)`, bad?'error':'success');
    }
  },

  // ── 스탯 배너 (즉각 반영 + 반짝임 + 긴급 할일) ──
  _statsPrev: '{}',
  // ── 상단바: 바뀐 칸만 갈아 끼운다 ─────────────────
  // 통째로 다시 그리면 몸무게·BMI·주식처럼 안 바뀐 칸까지 새로 생겨 같이 움직였다.
  // 칸마다 지난번 HTML(서명)을 기억해 두고, 다른 칸만 바꾼다.
  _morph(el, html) {
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const sign = n => { n.querySelectorAll('*').forEach(c => { if (c.classList?.contains('stat-chip') || c.classList?.contains('sg')) c.dataset.sig = c.outerHTML; }); };
    const keyOf = (n, i) => (n.dataset.s ? n.dataset.s + ':' + (n.className.match(/stat-(wt|bf|bmi|ms|stock|kg)\b/)?.[1] || '') : '') || (n.className.split(' ')[0] + '#' + i);
    const sync = (oldP, newP, deep) => {
      const olds = new Map([...oldP.children].map((n, i) => [keyOf(n, i), n]));
      const out = [...newP.children].map((nn, i) => {
        const k = keyOf(nn, i), on = olds.get(k), sig = nn.outerHTML;
        if (on && on.dataset.sig === sig) return on;
        if (on && deep && deep(nn) && on.tagName === nn.tagName) {   // 묶음(.sg)은 안쪽 칸만 맞춘다
          on.className = nn.className; sync(on, nn, null); on.dataset.sig = sig; return on;
        }
        nn.dataset.sig = sig; nn.querySelectorAll('.ti-grp,.stat-chip').forEach(c => { c.dataset.sig = c.outerHTML; });
        return nn;
      });
      out.forEach((n, i) => { if (oldP.children[i] !== n) oldP.insertBefore(n, oldP.children[i] || null); });
      while (oldP.children.length > out.length) oldP.lastElementChild.remove();
    };
    const oRow = el.querySelector(':scope > .stats-row'), nRow = tmp.querySelector(':scope > .stats-row');
    if (!oRow || !nRow) { el.innerHTML = html; el.querySelectorAll('.sg,.ti-grp,.stat-chip').forEach(c => { c.dataset.sig = c.outerHTML; }); return; }
    sync(oRow, nRow, n => n.classList.contains('sg') || n.classList.contains('ti-grp'));
    // 줄(일정·할일·AI)은 통째로 — 칩이 아니라 움직일 숫자가 없다
    const rest = [...tmp.children].filter(n => n !== nRow);
    [...el.children].forEach(n => { if (n !== oRow) n.remove(); });
    rest.forEach(n => el.appendChild(n));
  },

  // ── 숫자 움직임: 슬롯머신처럼 굴러 멈추고, 바뀐 만큼 '+1' / '+520' 이 떠오른다 ──
  _numPrev: null,
  _animStats(el, now) {
    const P = this._numPrev; this._numPrev = now;
    if (!P || P.ds !== now.ds) return;          // 날짜를 바꾼 것은 변화가 아니다
    const chip = k => el.querySelector(`.stat-chip[data-s="${k}"]`);
    const fl = (k, txt, cls) => { const c = chip(k); if (c) this._float(c, txt, cls); };
    const sl = (k, from, to) => { const c = chip(k), b = c && c.querySelector('b'); if (b) this._slot(b, from, to); };
    if (now.h !== P.h) { const d = now.h - P.h; fl('habits', (d > 0 ? '+' : '−') + Math.abs(d), d > 0 ? 'plus' : 'minus'); sl('habits', P.hTxt, now.hTxt); }
    if (now.t !== P.t) { const d = now.t - P.t; fl('tasks', (d > 0 ? '+' : '−') + Math.abs(d), d > 0 ? 'plus' : 'minus'); sl('tasks', String(P.t), String(now.t)); }
    if (now.c !== P.c) { const d = now.c - P.c; fl('checklist', (d > 0 ? '+' : '−') + Math.abs(d), d > 0 ? 'plus' : 'minus'); sl('checklist', P.cTxt, now.cTxt); }
    if (now.eat !== P.eat || now.bonus !== P.bonus) {
      const de = now.eat - P.eat, db = now.bonus - P.bonus;
      // 식단은 🍔, 운동은 🏋️ — 더해지면 빨강, 빠지면 파랑
      if (de) fl('diet', '🍔 ' + (de > 0 ? '+' : '−') + Math.abs(de).toLocaleString('ko-KR'), de > 0 ? 'plus' : 'minus');
      if (db) setTimeout(() => fl('diet', '🏋️ ' + (db > 0 ? '+' : '−') + Math.abs(db).toLocaleString('ko-KR'), db > 0 ? 'plus' : 'minus'), de ? 260 : 0);
      sl('diet', P.calTxt, now.calTxt);
    }
  },
  _float(chip, txt, cls) {
    const r = chip.getBoundingClientRect(); if (!r.width) return;
    const f = document.createElement('i'); f.className = 'stat-float ' + (cls || ''); f.textContent = txt;
    f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top) + 'px';
    document.body.appendChild(f);
    const a = f.animate([
      { transform: 'translate(-50%, 4px) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%, -14px) scale(1.15)', opacity: 1, offset: .22 },
      { transform: 'translate(-50%, -18px) scale(1)', opacity: 1, offset: .6 },
      { transform: 'translate(-50%, -34px) scale(.95)', opacity: 0 }], { duration: 1300, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    a.onfinish = () => f.remove();
    chip.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: .3 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
  },
  // 자리마다 숫자 띠를 세워 위로 굴린다 — 왼쪽 자리부터 차례로 멈춘다
  _slot(b, from, to) {
    from = String(from ?? ''); to = String(to ?? '');
    if (from === to) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { b.textContent = to; return; }
    const L = Math.max(from.length, to.length), a = from.padStart(L, ' '), c = to.padStart(L, ' ');
    // 숫자 덩어리(쉼표 포함)마다 처음 바뀐 자리부터 끝까지 굴린다 — '1/6' 의 6 처럼 안 바뀐 덩어리는 그대로
    const spin = new Array(L).fill(false);
    for (let i = 0; i < L;) {
      if (!/[\d,]/.test(c[i])) { i++; continue; }
      let j = i; while (j < L && /[\d,]/.test(c[j])) j++;
      const f = [...c.slice(i, j)].findIndex((ch, q) => ch !== a[i + q]);
      if (f >= 0) for (let q = i + f; q < j; q++) spin[q] = true;
      i = j;
    }
    let k = 0;
    b.innerHTML = [...c].map((ch, i) => {
      if (!/\d/.test(ch) || !spin[i]) return ch === ' ' ? '' : esc(ch);
      const st = /\d/.test(a[i]) ? +a[i] : 0, en = +ch, n = 10 + ((en - st + 10) % 10) + k * 3;
      k++;
      return `<span class="sl" data-n="${n}" data-k="${k}"><span class="sl-in">${Array.from({ length: n + 1 }, (_, j) => `<i>${(st + j) % 10}</i>`).join('')}</span></span>`;
    }).join('');
    const strips = b.querySelectorAll('.sl-in');
    let left = strips.length;
    strips.forEach(s => {
      const n = +s.parentNode.dataset.n, kk = +s.parentNode.dataset.k;
      const an = s.animate([
        { transform: 'translateY(0)', filter: 'blur(0)' },
        { transform: `translateY(-${n * 0.55}em)`, filter: 'blur(.6px)', offset: .45 },
        { transform: `translateY(-${n * 1.2}em)`, filter: 'blur(0)' }], { duration: 650 + kk * 140, easing: 'cubic-bezier(.3,.05,.2,1)', fill: 'forwards' });
      an.onfinish = () => { if (--left === 0 && b.isConnected) b.textContent = to; };
    });
  },
  // 상단바는 습관 한 번 누를 때도 습관·식단·운동 카드가 저마다 다시 그리라고 부른다(한 동작에 3~4번).
  // 부를 때마다 그리지 않고, 한 화면(프레임) 안의 요청을 모아 한 번만 그린다.
  // 숫자 움직임(_animStats)은 지난번 값과 비교하므로 모아서 그려도 그대로 움직인다.
  // 화면이 가려져 rAF 가 멈춘 때(앱이 뒤에 있을 때)를 위해 짧은 타이머도 같이 건다 — 먼저 오는 쪽이 그린다.
  _sbRaf: 0, _sbTo: 0,
  _updateStatsBanner() {
    if (this._sbRaf || this._sbTo) return;
    const run = () => {
      if (this._sbRaf) { try { cancelAnimationFrame(this._sbRaf); } catch(e){} }
      clearTimeout(this._sbTo); this._sbRaf = 0; this._sbTo = 0;
      try { this._paintStatsBanner(); } catch(e) { console.warn('[StatsBanner]', e); }
    };
    try { this._sbRaf = requestAnimationFrame(run); } catch(e) {}
    this._sbTo = setTimeout(run, 120);
  },
  _paintStatsBanner() {
    try { if(typeof Widgets!=='undefined') Widgets.push(); } catch(e){}
    const el=document.getElementById('statsBanner'); if(!el) return;
    const now=new Date();
    const selDate=this.S.selDate||now;

    // 습관 — 캘린더에서 선택한 날짜(selDate) 기준 활성 습관만 카운트
    // (deletedFrom 설정된 삭제 습관, createdAt이 selDate 이후인 습관 자동 제외)
    const hList=Habits.getHabitsForDate(selDate), hChk=Habits.getChecked(selDate);
    const hDone=hList.filter(h=>hChk.includes(h.id)).length;

    // 식단
    const dt=Diet.totals(Diet.getData(selDate)), ds=Diet.getSettings();
    const calPct=ds.calorieGoal?Math.round(dt.cal/ds.calorieGoal*100):0;

    // 할일 — 전체 미완료·미숨김 목록 (upcoming/urgent 계산에 사용)
    const allPending=[];
    Object.entries(this.S.tasks||{}).forEach(([lid,list])=>
      list.filter(t=>t.status==='needsAction'&&!t._hidden).forEach(t=>allPending.push({...t,_lid:lid}))
    );
    // 기준: 선택된 날짜의 미완료·미숨김 할일
    // due 있는 할일은 selDate와 due 날짜가 일치하는 것만, due 없는 할일은 오늘 선택 시에만 카운트
    const selDateStr=`${selDate.getFullYear()}-${String(selDate.getMonth()+1).padStart(2,'0')}-${String(selDate.getDate()).padStart(2,'0')}`;
    const nowDateStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const isSelToday=selDateStr===nowDateStr;
    const pending=allPending.filter(t=>t.due?t.due.split('T')[0]===selDateStr:isSelToday).length;
    let clAllItems=[]; try { clAllItems=Checklist.getItems()||[]; } catch(e){}
    const clItems=clAllItems.filter(i=>!i.done);
    let lastMsg='';
    try { if(typeof JARVIS!=='undefined'&&JARVIS.history&&JARVIS.history.length){ const H=JARVIS.history; for(let i=H.length-1;i>=0;i--){ if(H[i]&&H[i].role==='assistant'){ lastMsg=String(H[i].content||'').replace(/[{][\s\S]*[}]/g,'').trim(); break; } } } } catch(e){}

    // 이번주 일정 + 기한 있는 할일 (오늘~7일)
    // 넓은 화면(PC·태블릿)은 상단바가 길다 — 2주 앞까지, 더 많이 보인다
    const _wideTop = (()=>{ try { return matchMedia('(min-width:641px)').matches; } catch(e){ return false; } })();
    const weekEnd=new Date(now); weekEnd.setDate(now.getDate()+(_wideTop?14:7)); weekEnd.setHours(23,59,59,999);
    const upcoming=[];
    // 캘린더 이벤트
    (this.S.events||[]).forEach(e=>{
      try{
        const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date+'T00:00:00');
        if(d>=now&&d<=weekEnd) upcoming.push({label:(e.summary||'').slice(0,15),isTask:false,date:d});
      }catch{}
    });
    // 기한 있는 할일
    allPending.filter(t=>t.due).forEach(t=>{
      try{
        const d=_dueEnd(t);
        if(d>=now&&d<=weekEnd) upcoming.push({label:(t.title||'').slice(0,15),isTask:true,date:d,id:t.id});
      }catch{}
    });
    upcoming.sort((a,b)=>a.date-b.date);
    upcoming.splice(_wideTop?12:6); // 일정 최대 6개(넓은 화면 12개)

    // 긴급 할일 TOP 3
    // 설정 › 일정과 할일 › '상단에 지난 할일도 보이기' — 끄면 기한이 지난 것은 위 줄에서 뺀다
    const showOver = localStorage.getItem('gl_top_overdue')!=='0';
    const urgentTasks=[...allPending].filter(t=>showOver||!t.due||t.due.split('T')[0]>=nowDateStr).sort((a,b)=>{
      const aO=a.due&&_dueEnd(a)<now?1:0,bO=b.due&&_dueEnd(b)<now?1:0;
      const aS=(a.starred?8:0)+(aO?4:0)+(a.due?2:0),bS=(b.starred?8:0)+(bO?4:0)+(b.due?2:0);
      if(bS!==aS) return bS-aS;
      if(a.due&&b.due) return new Date(a.due)-new Date(b.due);
      return 0;
    }).filter(t=>!upcoming.some(u=>u.id===t.id)).slice(0,_wideTop?6:3);

    // 변경 감지 (긴급할일 id+status 포함)
    const curStr=JSON.stringify({hDone,cal:dt.cal,pending,cl:clItems.length,uIds:urgentTasks.map(t=>t.id+t.status).join()});
    this._statsPrev=curStr;

    // HTML 조립
    const ic=n=>typeof Icons!=='undefined'?Icons.svg(n,'chip-ic'):'';

    // 아침에는 모든 칸이 0 이다. `0/2800kcal`, `습관 0/4` — 이건 정보가 아니라 벽이다.
    // 하루를 여는 화면이 "아직 아무것도 안 했다"만 네 번 반복해서 알려준다.
    // 그래서 '한 것' 이 아니라 '남은 것' 을 적는다. 아침에도 할 말이 생기고,
    // 어차피 행동을 정하는 숫자는 먹은 양이 아니라 더 먹어도 되는 양이다.
    // 한 줄에 다 들어가게 짧게 쓴다: 습관 2/4 · 2,800kcal · 할일 5 · 체크 3/7 (한 것/전체)
    const calGoal = Number(ds.calorieGoal) || 0;
    // 운동으로 쓴 열량도 식단 카드와 같은 규칙(절반·전부·안 함)으로 더한다
    let calBonus = 0;
    try { if (typeof Fitness!=='undefined' && Fitness.burn) { const bk = Fitness.burn(selDate).kcal, bm = ds.burnMode||'half'; calBonus = bm==='off'?0:bm==='full'?bk:Math.round(bk/2/10)*10; } } catch(e){}
    const calLeft = calGoal + calBonus - dt.cal;
    const won = v => Math.round(v).toLocaleString('ko-KR');
    const calTxt = !calGoal      ? `<b>${won(dt.cal)}</b>kcal`
                 : calLeft >= 0  ? `<span class="kc-pre">남은 </span><b>${won(calLeft)}</b>kcal`
                                 : `<span class="kc-pre">초과 </span><b>+${won(-calLeft)}</b>kcal`;
    // 새 디자인의 폰 화면은 헤더 오른쪽 두 줄(인바디·자산)을 접는다 — 몸무게만 이 줄 끝으로 옮긴다.
    let kgTxt = '';
    try { const r = (typeof InBody!=='undefined' && InBody.getRecords()) || []; const la = r[r.length-1]; if (la && la.wt) kgTxt = `<div class="stat-chip stat-kg" data-s="inbody" title="최근 체중"><b>${la.wt}</b>kg</div>`; } catch(e){}
    const clAll = clAllItems.length, clDone = clAll - clItems.length;

    // 왼쪽 묶음: 오늘 할 것(습관·할일·체크) / 오른쪽 묶음: 몸(칼로리·몸무게)
    const habC = hList.length?`<div class="stat-chip ${hDone===hList.length?'stat-green':''}" data-s="habits" title="오늘 습관">${ic('check')}습관 <b>${hDone}/${hList.length}</b></div>`:'';
    const tskC = pending>0?`<div class="stat-chip" data-s="tasks" title="남은 할일">${ic('tasks')}할일 <b>${pending}</b></div>`:'';
    const clC  = clAll>0?`<div class="stat-chip ${clDone===clAll?'stat-green':''}" data-s="checklist" title="체크리스트">${ic('pen')}체크 <b>${clDone}/${clAll}</b></div>`:'';
    const calC = `<div class="stat-chip ${calGoal&&calLeft<0?'stat-red':calPct>=80?'stat-green':''}" data-s="diet" title="${calGoal?(calLeft>=0?'남은 칼로리':'초과한 칼로리'):'먹은 칼로리'}">${ic('diet')}${calTxt}</div>`;
    const stC = typeof TopInfo!=='undefined' ? TopInfo.stockChip() : '';
    const chipsHTML=`<div class="sg sg-l">${habC}${tskC}${clC}</div>${stC?`<div class="sg sg-s">${stC}</div>`:''}<div class="sg sg-r">${typeof TopInfo!=='undefined'?TopInfo.bodyChips(calC):calC+kgTxt}</div>`;
    // 인바디·자산은 이 줄에서 빠졌다. 헤더 오른쪽 두 줄(TopStrip)로 옮겼다 —
    // 같은 줄에 여섯 칸이 붙으면 모바일에서 두 줄로 접히면서 정작 오늘 할 일이 밀렸다.
    try { TopStrip.render(); } catch(e){}

    // 이번주 일정/할일 - 날짜 포함, 3개씩 줄바꿈
    const upcomingHTML=upcoming.length?`
      <div class="stats-upcoming">
        ${upcoming.map(i=>{
          const md=`${i.date.getMonth()+1}/${i.date.getDate()}`;
          return `<span class="stats-upcoming-chip ${i.isTask?'uc-task':'uc-event'}">${i.isTask?ic('tasks'):ic('calendar')}<span class="uc-date">${md}</span> ${esc(i.label)}</span>`;
        }).join('')}
      </div>`:'';

    const urgentHTML=urgentTasks.length?`
      <div class="stats-urgent-row">
        ${urgentTasks.map(t=>{
          const due=t.due?new Date(t.due):null,over=!!t.due&&_dueEnd(t)<now;
          return `<div class="stats-urgent-chip${over?' urgent-over':''}${t.starred?' urgent-star':''}" data-s="tasks">${t.starred?'<b class="uc-star">★</b>':''}${esc(t.title.length>15?t.title.slice(0,14)+'…':t.title)}${due?` <span class="${over?'stats-overdue':'stats-due'}">${_fmtDate(due)}</span>`:''}</div>`;
        }).join('')}
      </div>`:'';

    const jarvisHTML=lastMsg?`<div class="stats-jarvis"><span class="stats-jarvis-icon">AI</span><span class="stats-jarvis-txt">${esc(lastMsg.slice(0,90))}</span></div>`:'';

    // 폰: 일정·할일 칩을 한 줄로 합쳐 옆으로 밀어 보게 — 두 줄이면 상단바가 너무 두꺼워진다
    let listHTML=upcomingHTML+urgentHTML;
    if (upcomingHTML && urgentHTML) {
      const inner=h=>h.replace(/^\s*<div[^>]*>/,'').replace(/<\/div>\s*$/,'');
      listHTML=`<div class="stats-upcoming stats-merged">${inner(upcomingHTML)}${inner(urgentHTML)}</div>`;
    }
    this._morph(el, `<div class="stats-row">${chipsHTML}</div>${listHTML}${jarvisHTML}`);
    // 칩 개수에 따라 글씨를 한 단계씩 줄인다(폰에서 한 줄을 지키려고) — 넘치면 줄 안에서만 옆으로 민다
    try { const row=el.querySelector('.stats-row'); const n=row.querySelectorAll('.stat-chip').length; row.dataset.n=n; row.classList.toggle('dense', n>=5); row.classList.toggle('denser', n>=7); } catch(e){}

    // 숫자가 바뀐 칸은 자리마다 굴러간다(늘면 아래에서 올라오고, 줄면 위에서 내려온다)
    try { this._animStats(el, { ds:selDateStr, h:hDone, hTxt:`${hDone}/${hList.length}`, t:pending, c:clDone, cTxt:`${clDone}/${clAll}`,
      eat:dt.cal, bonus:calBonus, calTxt: !calGoal ? won(dt.cal) : calLeft>=0 ? won(calLeft) : '+'+won(-calLeft) }); } catch(e){ console.warn(e); }

    // (예전 칩 반짝임은 숫자 움직임으로 바꿨다 — _animStats)

    // 칩 클릭 → 섹션 스크롤
    // 예전엔 그릴 때마다 칩 하나하나에 onclick 을 다시 달았다(타이머까지 걸어서). 상단바에 한 번만 건다.
    if(!el._chipBound){
      el._chipBound=true;
      el.addEventListener('click',e=>{
        const chip=e.target.closest&&e.target.closest('[data-s]'); if(!chip||!el.contains(chip)) return;
        {
          const sec=chip.dataset.s;
          if(sec==='inbody'){ try{ TopStrip.go('card-inbody'); }catch(e){} return; }
          if(sec==='econ'){ try{ TopStrip.go('card-econ'); }catch(e){} return; }
          const map={habits:'.card-habits',diet:'.card-diet',tasks:'.card-calendar',checklist:'.card-checklist'};
          const target=document.querySelector(map[sec]);
          if(target){
            const sH=(document.querySelector('.header-sticky-group')?.offsetHeight||100)+8;
            window.scrollTo({top:target.getBoundingClientRect().top+window.scrollY-sH,behavior:'smooth'});
          }
        }
      });
    }
  },

  // ── 날짜 선택 ────────────────────────
  // 달력을 할일의 날짜 필터로도 쓰게 해 뒀었는데, 날짜를 누를 때마다 할일 목록이
  // 통째로 줄어들어 '할일이 사라졌다' 로 읽혔다. 달력은 위쪽 일정·습관·식단이
  // 보는 날을 정할 뿐, 할일 목록은 건드리지 않는다.
  selectCalDate(date) {
    this.S.selDate=date;
    this.S.calPanel='today';
    document.querySelectorAll('.cal-panel-tab').forEach((t,i)=>t.classList.toggle('active',i===0));
    CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,date);
    this._renderCalPanel();
    try{ Habits.render(date); }catch{}
    try{ Diet.render(date); }catch{}
    try{ Fitness.render(date); }catch{}
    this._updateHeaderDate(date);
    this._renderTasks();
  },

  _dsOf(d){ const x=new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; },


  _updateHeaderDate(date) {
    const d   = new Date(date);
    const now = new Date();
    const isToday = (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth()    === now.getMonth()    &&
      d.getDate()     === now.getDate()
    );
    const dow = d.getDay();

    // 날짜 텍스트
    const elDate = document.getElementById('hDate');
    if(elDate) {
      const isMobile = window.innerWidth <= 640;
      if (document.documentElement.dataset.ui === 'v2') {
        // 새 디자인: 큰 날짜 숫자 + 작은 두 줄(월 / 요일). 오늘이 아니면 요일 자리에 '오늘로' 표시.
        const wd = d.toLocaleDateString('ko-KR',{weekday:'long'});
        const yy = d.getFullYear() !== now.getFullYear() ? `${String(d.getFullYear()).slice(2)}년 ` : '';
        const wdc = dow===0 ? 'wd-sun' : dow===6 ? 'wd-sat' : 'wd-day';
        // 날씨: 오늘은 지금 날씨, 다른 날은 그날 기록(최저·최고·하늘) — Weather.day(d)
        const W = typeof Weather!=='undefined' ? Weather : null, wxd = W && W.mode === 'detail' && W.has(d);
        // 날씨 세부 표시: 날짜 숫자는 조금 작게, 그 위로 날씨 효과 · 오른쪽에 최저-지금-최고 호
        elDate.classList.toggle('wx-detail', !!wxd);
        elDate.innerHTML = `<b class="hd-n">${d.getDate()}${wxd ? W.fx(d) : ''}</b><span class="hd-s">${yy}${d.getMonth()+1}월${isToday ? '<i class="hd-today">TODAY</i>' : ''}<br><span class="${wdc}">${wd}</span>${W ? `<span id="hWx">${W.html(d)}</span>` : ''}</span>`;
      } else
      elDate.textContent = isMobile
        ? `${String(d.getFullYear()).slice(2)}년 ${d.getMonth()+1}월 ${d.getDate()}일`
        : d.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});
      elDate.style.cursor = 'pointer';
      elDate.onclick = (e) => { e.stopPropagation(); App._toggleDateDropdown(d); };
    }

    // 요일 + 오늘 표시
    const elDay = document.getElementById('hDay');
    if(elDay) {
      elDay.innerHTML = '';
      elDay.style.cssText = '';
      const dayStr = d.toLocaleDateString('ko-KR', {weekday:'long'});

      if(isToday) {
        // 오늘: 초록색 강제
        elDay.innerHTML = '<span id="todayBadge">오늘</span> · ' + dayStr;
        const badge = document.getElementById('todayBadge');
        if(badge) {
          badge.style.color = '#059669';
          badge.style.fontWeight = '900';
          badge.style.fontSize = '12px';
        }
      } else {
        const isHoliday = typeof CalendarUI!=='undefined' && CalendarUI._isHoliday(d.getFullYear(), d.getMonth(), d.getDate());
        const color = (dow===0||isHoliday) ? '#dc2626' : dow===6 ? '#2563eb' : '';
        elDay.textContent = dayStr;
        if(color) elDay.style.color = color;
      }

      // 할일 뱃지
      // 기준: 선택된 날짜(date 파라미터 = selDate)의 미완료·미숨김 할일
      // - status==='needsAction': 완료된 할일 제외
      // - !t._hidden: 숨김 처리된 할일 제외
      // - due 있는 할일: due 날짜가 선택 날짜와 일치하는 것만
      // - due 없는 할일: 선택 날짜가 오늘인 경우에만 카운트
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const taskCount = Object.values(this.S.tasks||{}).reduce((n,l) =>
        n + l.filter(t => {
          if(t.status!=='needsAction'||t._hidden) return false;
          return t.due ? t.due.split('T')[0]===dateStr : isToday;
        }).length, 0);
      if(taskCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'h-tbadge';
        badge.textContent = '할일 ' + taskCount;
        badge.style.cssText = 'font-size:9px;background:var(--accent);color:var(--accent-fg);padding:1px 5px;border-radius:8px;font-weight:700;margin-left:4px;vertical-align:middle';
        elDay.appendChild(badge);
      }
    }
  },

  _toggleDateDropdown(currentDate) {
    // 기존 드롭다운 닫기
    const existing=document.getElementById('datePicker');
    if(existing){ existing.remove(); return; }

    const hDate=document.querySelector('.h-date');
    if(!hDate) return;

    const dropdown=document.createElement('div');
    dropdown.id='datePicker';
    dropdown.className='date-picker-dropdown';

    const calContainer=document.createElement('div');
    let pickerDate=new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

    const render=()=>{
      calContainer.innerHTML='';
      CalendarUI.render(calContainer, pickerDate, App.S.events, currentDate);
      // 달력 클릭 오버라이드 (touch + mouse 모두)
      // 날짜 고르기: 달력의 탭 처리(_bind)를 그대로 쓰고, 고른 뒤 할 일만 바꾼다.
      calContainer._onDay=(d,e)=>{ e.stopPropagation(); dropdown.remove(); App.selectCalDate(d); };
      // 월 이동 버튼 오버라이드
      calContainer.querySelector('.cal-nav-btn:first-child').onclick=(e)=>{
        e.stopPropagation();
        pickerDate=new Date(pickerDate.getFullYear(), pickerDate.getMonth()-1, 1);
        render();
      };
      calContainer.querySelector('.cal-nav-btn:last-child').onclick=(e)=>{
        e.stopPropagation();
        pickerDate=new Date(pickerDate.getFullYear(), pickerDate.getMonth()+1, 1);
        render();
      };
    };

    dropdown.innerHTML=`<div class="date-picker-header">
      <span style="font-size:13px;font-weight:700;color:var(--text)">날짜 선택</span>
      <button class="date-picker-today-btn" id="dpTodayBtn">오늘</button>
    </div>`;
    dropdown.appendChild(calContainer);

    hDate.style.position='relative';
    hDate.appendChild(dropdown);
    render();

    dropdown.querySelector('#dpTodayBtn').onclick=(e)=>{
      e.stopPropagation();
      dropdown.remove();
      App.selectCalDate(new Date());
    };

    // 바깥 클릭 닫기
    setTimeout(()=>{
      document.addEventListener('click', function close(e){
        if(!dropdown.contains(e.target)){ dropdown.remove(); document.removeEventListener('click',close); }
      });
    },0);
  },



  changeCalMonth(dir) {
    const d=this.S.calDate;
    this.S.calDate=new Date(d.getFullYear(),d.getMonth()+dir,1);
    CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
  },

  setCalPanel(panel,btn) {
    this.S.calPanel=panel;
    document.querySelectorAll('.cal-panel-tab').forEach(t=>t.classList.remove('active'));
    if(btn) btn.classList.add('active');
    this._renderCalPanel();
  },

  _renderCalPanel() {
    const wrap=document.getElementById('eventsWrap'); if(!wrap) return;
    const p=this.S.calPanel||'today';
    if(p==='today')     this._renderEventsForDate(this.S.selDate,wrap);
    else if(p==='week') this._renderWeekEvents(wrap);
    else                this._renderMonthEvents(wrap);
  },

  // tasks를 날짜별로 가져오기
  _getTasksForDate(date) {
    const target=new Date(date); target.setHours(0,0,0,0);
    const result=[];
    Object.values(this.S.tasks||{}).forEach(list=>{
      list.filter(t=>t.status==='needsAction'&&t.due).forEach(t=>{
        try{
          const ds=t.due.split('T')[0];
          const [y,m,dd]=ds.split('-').map(Number);
          const td=new Date(y,m-1,dd); td.setHours(0,0,0,0);
          if(td.getTime()===target.getTime()) result.push(t);
        }catch{}
      });
    });
    return result;
  },

  _getTasksForRange(startDate, endDate) {
    const result=[];
    Object.values(this.S.tasks||{}).forEach(list=>{
      list.filter(t=>t.status==='needsAction'&&t.due).forEach(t=>{
        try{
          const ds=t.due.split('T')[0];
          const [y,m,dd]=ds.split('-').map(Number);
          const td=new Date(y,m-1,dd);
          if(td>=startDate&&td<=endDate) result.push({...t,_dueDate:td});
        }catch{}
      });
    });
    return result.sort((a,b)=>a._dueDate-b._dueDate);
  },

  _renderEventsForDate(date,wrap) {
    const target=new Date(date); target.setHours(0,0,0,0);
    const evs=(this.S.events||[]).filter(e=>{
      try{
        let d;
        if(e.start?.dateTime) d=new Date(e.start.dateTime);
        else if(e.start?.date){ const [y,m,dd]=e.start.date.split('-').map(Number); d=new Date(y,m-1,dd); }
        else return false;
        d.setHours(0,0,0,0);
        return d.getTime()===target.getTime();
      }catch{ return false; }
    }).sort((a,b)=>{
      const da=a.start?.dateTime?new Date(a.start.dateTime):new Date(a.start?.date);
      const db=b.start?.dateTime?new Date(b.start.dateTime):new Date(b.start?.date);
      return da-db;
    });

    const tasks=this._getTasksForDate(date);
    const cls=typeof Checklist!=='undefined'?Checklist.getItemsForDate(date):[];
    const label=date.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
    const sum=this._daySummary(date);

    if(!evs.length&&!tasks.length&&!cls.length){
      wrap.innerHTML=`<div class="day-sum-hd">${label}</div>${sum}`
        +`<p class="empty" style="font-size:12px">일정 없음<br><span style="color:var(--text3);font-size:11px">꾹 누르면 추가</span></p>`;
      return;
    }

    // 체크리스트 항목
    const clH=cls.map(c=>`<div class="event-item" style="border-color:var(--accent)">
      <div class="event-time" style="color:var(--accent)">체크</div>
      <div class="event-title${c.done?' done-text':''}">${esc(c.title)}</div>
    </div>`).join('');

    // 캘린더 이벤트
    const evH=evs.map(e=>this._evRow(e,true)).join('');

    wrap.innerHTML=`<div class="day-sum-hd">${label}</div>${sum}${clH}${evH}`;
  },

  // 일정 한 줄. 출처가 여럿이면 캘린더 이름과 색 점으로 어디 것인지 보인다.
  // 구글 일정은 예전 그대로 — '주요 일정'(기본 캘린더)이 아닐 때만 이름을 적는다.
  // 일정이 여러 캘린더에서 왔는지 — 예전엔 줄마다 전체 일정을 다시 훑었다(일정 n개면 n×n). 목록이 같으면 한 번만 센다.
  _multiCal() {
    const evs=this.S.events||[];
    if(this._mcC && this._mcC.a===evs && this._mcC.n===evs.length) return this._mcC.v;
    const v=new Set(evs.map(x=>x._calId||'primary')).size>1;
    this._mcC={ a:evs, n:evs.length, v };
    return v;
  },
  _evRow(e, full) {
    const allDay=!e.start?.dateTime; const s=allDay?null:new Date(e.start.dateTime);
    const col=e._calColor||_evColor(e.colorId);
    const multi=this._multiCal();
    const showCal=e._calName && (e._src&&e._src!=='google' ? multi : e._calName!=='주요 일정');
    const dot=e._src&&e._src!=='google'?`<i class="ev-dot" style="background:${col}"></i>`:'';
    if(!full) return `<div class="event-item" style="border-color:${col}" onclick="App._showEvDetail('${e.id}')"><div class="event-time" style="color:${col}">${allDay?'종일':_fmtTime(s)}</div><div class="event-title">${dot}${esc(e.summary||'(제목 없음)')}</div></div>`;
    return `<div class="event-item" style="border-color:${col}" onclick="App._showEvDetail('${e.id}')">
        <div class="event-time" style="color:${col}">${allDay?'종일':_fmtTime(s)}</div>
        <div>
          <div class="event-title">${dot}${esc(e.summary||'(제목 없음)')}</div>
          ${showCal?`<div class="event-loc" style="color:${col}">${esc(e._calName)}</div>`:''}
          ${e.location?`<div class="event-loc">${esc(e.location)}</div>`:''}
        </div>
      </div>`;
  },

  // ── 그 날 하루 요약 ────────────────────
  // 달력 칸은 습관 농도까지가 한계다. 네 가지 신호를 30px 칸에 다 넣으면 아무것도 안 읽힌다.
  // 그래서 고른 날의 습관·운동·식단은 달력 바로 아래 세 줄로 편다 —
  // 훑는 건 달력이 하고, 자세한 건 날짜를 눌러서 본다.
  _daySummary(date) {
    const row=(k,v,dim,go)=>`<button type="button" class="day-sum-row${go?'':' nogo'}"${
      go?` onclick="App._gotoCard('${go}')"`:''}><span class="dsr-k">${k}</span><span class="dsr-v${
      dim?' dim':''}">${v}</span></button>`;
    const out=[];

    try {
      const list=Habits.getHabitsForDate(date), chk=Habits.getChecked(date);
      if(list.length){
        const done=list.filter(h=>chk.includes(h.id)).length;
        const left=list.filter(h=>!chk.includes(h.id)).map(h=>h.name);
        out.push(row('습관',`<b>${done}/${list.length}</b>${
          left.length?` · 남음 ${esc(left.slice(0,2).join(', '))}${left.length>2?` 외 ${left.length-2}`:''}`:' · 전부 완료'}`,
          false,'habits'));
      }
    } catch(e){ console.warn('요약 습관', e); }

    // 이 날 마감인 할일. 아래 할일 목록에도 같은 항목이 있지만 그건 '전체를 날짜순으로'
    // 보는 목록이고 여기는 '고른 날' 얘기다. 대신 같은 모양의 줄로 넣어 따로 놀지 않게 한다.
    try {
      const td=this._getTasksForDate(date);
      if(td.length) out.push(row('할일',
        `${esc(td.slice(0,2).map(t=>t.title).join(', '))}${td.length>2?` 외 ${td.length-2}`:''}`, false, null));
    } catch(e){ console.warn('요약 할일', e); }

    try {
      const dow=new Date(date).getDay(), plan=Fitness.planFor(dow);
      const n=(plan.exercises||[]).length + Fitness.getCustomExercises(date).length;
      const done=Fitness._checked(date).length;
      if(plan.name==='휴식') out.push(row('운동','휴식일',true,'fitness'));
      else if(n) out.push(row('운동',`${esc(plan.name)} · <b>${done}/${n}</b> 종목`,!done,'fitness'));
    } catch(e){ console.warn('요약 운동', e); }

    try {
      const t=Diet.totals(Diet.getData(date)), goal=Diet.getSettings().calorieGoal;
      out.push(t.cal
        ? row('식단',`<b>${t.cal.toLocaleString()}</b> / ${goal.toLocaleString()} kcal · 단백질 ${t.protein}g`,false,'diet')
        : row('식단','기록 없음',true,'diet'));
    } catch(e){ console.warn('요약 식단', e); }

    return out.length?`<div class="day-sum">${out.join('')}</div>`:'';
  },

  // 요약 줄을 누르면 그 카드로 데려간다. 모바일에서는 탭까지 옮겨 준다.
  _gotoCard(name) {
    const card=document.querySelector('.card-'+name); if(!card) return;
    const tab=card.getAttribute('data-tab');
    if(tab && typeof Tabs!=='undefined' && Tabs.set) { try{ Tabs.set(tab); }catch{} }
    card.scrollIntoView({behavior:'smooth',block:'center'});
    card.classList.add('card-ping');
    setTimeout(()=>card.classList.remove('card-ping'),1200);
  },

  _renderWeekEvents(wrap) {
    const now=new Date(),dow=now.getDay();
    const mon=new Date(now); mon.setDate(now.getDate()-(dow===0?6:dow-1)); mon.setHours(0,0,0,0);
    const sun=new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59,999);
    const evs=(this.S.events||[]).filter(e=>{ try{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); return d>=mon&&d<=sun; }catch{return false;} })
      .sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
    const tasks=this._getTasksForRange(mon,sun);

    if(!evs.length&&!tasks.length){ wrap.innerHTML='<p class="empty" style="font-size:12px">이번 주 일정 없음</p>'; return; }

    const groups={};
    tasks.forEach(t=>{ const k=t._dueDate.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}); if(!groups[k])groups[k]=[]; groups[k].push({_isTask:true,...t}); });
    evs.forEach(e=>{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); const k=d.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}); if(!groups[k])groups[k]=[]; groups[k].push(e); });

    wrap.innerHTML=Object.keys(groups).sort().map(day=>`
      <div class="ev-group-hd">${day}</div>
      ${groups[day].map(e=>{
        if(e._isTask) return `<div class="event-item" style="border-color:var(--yellow)"><div class="event-time" style="color:var(--yellow)">할일</div><div class="event-title">${esc(e.title)}</div></div>`;
        return this._evRow(e,false);
      }).join('')}`).join('');
  },

  _renderMonthEvents(wrap) {
    const yr=this.S.calDate.getFullYear(),mo=this.S.calDate.getMonth();
    const evs=(this.S.events||[]).filter(e=>{ try{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); return d.getFullYear()===yr&&d.getMonth()===mo; }catch{return false;} })
      .sort((a,b)=>new Date(a.start?.dateTime||a.start?.date)-new Date(b.start?.dateTime||b.start?.date));
    const mStart=new Date(yr,mo,1), mEnd=new Date(yr,mo+1,0);
    const tasks=this._getTasksForRange(mStart,mEnd);
    const moLabel=new Date(yr,mo,1).toLocaleDateString('ko-KR',{year:'numeric',month:'long'});
    if(!evs.length&&!tasks.length){ wrap.innerHTML=`<p class="empty" style="font-size:12px">${moLabel} 일정 없음</p>`; return; }

    const groups={};
    tasks.forEach(t=>{ const k=t._dueDate.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}); if(!groups[k])groups[k]=[]; groups[k].push({_isTask:true,...t}); });
    evs.forEach(e=>{ const d=e.start?.dateTime?new Date(e.start.dateTime):new Date(e.start?.date); const k=d.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'}); if(!groups[k])groups[k]=[]; groups[k].push(e); });

    wrap.innerHTML=`<div style="padding:5px 12px 3px;font-size:11px;color:var(--text3)">${moLabel} · ${evs.length+tasks.length}개</div>`
      +Object.keys(groups).sort().map(day=>`
        <div class="ev-group-hd">${day}</div>
        ${groups[day].map(e=>{
          if(e._isTask) return `<div class="event-item" style="border-color:var(--yellow)"><div class="event-time" style="color:var(--yellow)">할일</div><div class="event-title">${esc(e.title)}</div></div>`;
          return this._evRow(e,false);
        }).join('')}`).join('');
  },

  // ── Long press 메뉴 ──────────────────
  showLongPressMenu(date) {
    const d=date||this.S.selDate;
    const ds=d.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
    const defCal=GoogleCalendar.getDefaultCalendar();
    const calOptions=GoogleCalendar._allCalendars.length
      ?GoogleCalendar._allCalendars.map(c=>`<option value="${c.id}"${c.id===defCal?' selected':''}>${esc(c.summary)}</option>`).join('')
      :`<option value="primary">기본 캘린더</option>`;
    const gDef=Auth.isLoggedIn()?`<div style="margin-top:14px"><label class="modal-lbl">기본 캘린더</label>
        <select id="lpDefCal" class="inp inp-sm" onchange="GoogleCalendar.saveSettings({...GoogleCalendar.getSettings(),default:this.value})">${calOptions}</select>
      </div>`:'';
    this.openModal(`@plus ${ds}`,`
      <div class="lp-menu">
        <button class="lp-btn" onclick="App.closeModal();App._showAddEventModalForDate(new Date('${d.toDateString()}'))">일정 추가</button>
        <button class="lp-btn" onclick="App.closeModal();App._showAddTaskForDate(new Date('${d.toDateString()}'))">할일 추가</button>
        <button class="lp-btn" onclick="App.closeModal();App._showAddChecklistForDate(new Date('${d.toDateString()}'))">체크리스트 추가</button>
      </div>${gDef}`);
  },

  // 저장할 곳: 구글 캘린더(연결돼 있으면) · 쓸 수 있는 아이폰 캘린더 · Bashy. 구독 주소는 읽기 전용이라 없다.
  _destSelect(cur) {
    const ds=CalSources.destinations(), groups=[];
    ds.forEach(d=>{ let g=groups.find(x=>x.name===d.group); if(!g) groups.push(g={name:d.group,items:[]}); g.items.push(d); });
    const opt=d=>`<option value="${esc(d.key)}"${d.key===cur?' selected':''}>${esc(d.label)}</option>`;
    return groups.length===1&&groups[0].items.length===1
      ? groups[0].items.map(opt).join('')
      : groups.map(g=>`<optgroup label="${esc(g.name)}">${g.items.map(opt).join('')}</optgroup>`).join('');
  },
  _showAddEventModalForDate(date, editId) {
    const d=date||this.S.selDate;
    const ed=editId?this.S.events.find(e=>e.id===editId):null;
    let base=new Date(d.getFullYear(),d.getMonth(),d.getDate(),new Date().getHours()+1,0);
    let end=new Date(base.getTime()+3600000);
    if(ed&&ed.start?.dateTime){ base=new Date(ed.start.dateTime); end=new Date(ed.end?.dateTime||base); }
    else if(ed&&ed.start?.date){ base=new Date(ed.start.date+'T09:00:00'); end=new Date(base.getTime()+3600000); }
    const fmt=x=>new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,16);
    const cur=CalSources.defaultDest();
    const dests=CalSources.destinations();
    const destRow=ed?'':`<div class="modal-row"><label class="modal-lbl">저장할 곳</label><select id="evDest" class="inp inp-sm ev-dest">${this._destSelect(cur)}</select>${
      dests.length===1?`<p class="ev-dest-hint">Bashy 계정에 저장됩니다. ${DeviceCal.avail()?'구글·아이폰 캘린더':'구글 캘린더'}는 설정 › 일정과 할일에서 연결합니다.</p>`:''}</div>`;
    this.openModal(ed?'@calendar 일정 수정':'@calendar 일정 추가',`
      <div class="modal-row"><label class="modal-lbl">제목 *</label><input id="evT" type="text" class="inp" value="${esc(ed?.summary||'')}"></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">시작</label><input id="evS" type="datetime-local" value="${fmt(base)}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">종료</label><input id="evE" type="datetime-local" value="${fmt(end)}" class="inp inp-sm"></div>
      </div>
      ${destRow}
      <div class="modal-row"><label class="modal-lbl">장소</label><input id="evL" type="text" placeholder="(선택)" class="inp" value="${esc(ed?.location||'')}"></div>
      <div class="modal-row"><label class="modal-lbl">설명</label><textarea id="evD" class="inp" rows="2" placeholder="(선택)">${esc(ed?.description||'')}</textarea></div>
      <div class="modal-btns">
        <button onclick="App._createEvent(${ed?`'${ed.id}'`:''})" class="btn-sm accent">저장</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('evT')?.focus(),50);
  },

  async _createEvent(editId) {
    const title=document.getElementById('evT').value.trim();
    const start=document.getElementById('evS').value;
    const end  =document.getElementById('evE').value;
    if(!title||!start||!end){ this.showToast('제목과 날짜를 입력해주세요','error'); return; }
    const f={ title, start:new Date(start), end:new Date(end),
      description:document.getElementById('evD').value.trim(), location:document.getElementById('evL').value.trim() };
    if(f.end<f.start) f.end=new Date(f.start);
    try{
      if(editId){   // 수정은 Bashy 일정만 (구글·아이폰 일정은 그 앱에서 고친다)
        const ev=BashyCal.updateEvent(editId,f);
        this._srcEv.bashy=this._srcEv.bashy.map(e=>e.id===editId?ev:e);
      } else {
        const key=document.getElementById('evDest')?.value||CalSources.defaultDest();
        const ev=await CalSources.createEvent(key,f);
        CalSources.remember(key);
        const src=ev._src||'google';
        (this._srcEv[src]=this._srcEv[src]||[]).push(ev);
      }
      this._mergeEvents();
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      this._renderCalPanel(); this._updateStatsBanner(); this.closeModal(); this.showToast(editId?'일정 수정됨':'일정 추가됨','success');
    }catch(e){ console.warn('[Event]',e); this.showToast('일정 '+(editId?'수정':'추가')+' 실패'+(e?.message?': '+e.message:''),'error'); }
  },

  // 시간은 30분 단위로만 고른다. type="time" 은 1분 단위라 스물네 번을 눌러야
  // 30분이 움직였고, 폰에서는 휠이 1분씩 돌았다. 할일 마감을 7분 단위로 잡는 사람은 없다.
  _halfHours(sel) {
    const out = [`<option value=""${sel?'':' selected'}>시간 없음</option>`];
    for (let m = 0; m < 24*60; m += 30) {
      const h = Math.floor(m/60), mm = m%60;
      const v = String(h).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
      const ampm = h < 12 ? '오전' : '오후';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      out.push(`<option value="${v}"${v===sel?' selected':''}>${ampm} ${h12}:${String(mm).padStart(2,'0')}</option>`);
    }
    return out.join('');
  },

  // 구글 Tasks 의 추가 창을 그대로 따랐다. 거기서 만든 할일이 여기로 내려오는데
  // 필드 이름이 서로 다르면(메모 vs 세부사항) 같은 칸을 다른 것으로 착각하게 된다.
  showAddTask(date) {
    // 구글이 없으면 Bashy 목록에 넣는다 — 할일 카드는 구글 없이도 쓴다
    if(!this.S.lists.some(l=>l.id===BashyCal.LIST_ID)) this.S.lists=[...this.S.lists,BashyCal.list()];
    const d = date ? new Date(date) : (this.S.selDate || new Date());
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    // 지금 보고 있는 목록으로 기본값을 맞춘다. '전체' 를 보고 있으면 첫 목록.
    const cur = this.S.taskFilter !== 'all' && this.S.lists.some(l=>l.id===this.S.taskFilter)
      ? this.S.taskFilter : (Auth.isLoggedIn() ? (this.S.lists[0]?.id || BashyCal.LIST_ID) : BashyCal.LIST_ID);
    this.openModal('@tasks 할일 추가',`
      <div class="modal-row"><label class="modal-lbl">제목 *</label>
        <input id="qtTitle" type="text" class="inp" placeholder="할 일"></div>
      <div class="modal-row"><label class="modal-lbl">세부사항</label>
        <textarea id="qtNotes" class="inp" rows="2" placeholder="(선택)"></textarea></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">마감 날짜</label>
          <input id="qtDue" type="date" value="${ds}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">시간</label>
          <select id="qtTime" class="inp inp-sm">${this._halfHours('')}</select></div>
      </div>
      <div class="modal-row"><label class="modal-lbl">목록</label>
        <select id="qtList" class="inp inp-sm">${this.S.lists.map(l=>
          `<option value="${l.id}"${l.id===cur?' selected':''}>${esc(l.title)}</option>`).join('')}</select></div>
      <div class="modal-btns">
        <button onclick="App._saveQuickTask()" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>{
      const t=document.getElementById('qtTitle');
      t?.focus();
      // 제목만 치고 엔터 — 가장 흔한 경우를 두 번 누르게 하지 않는다.
      t?.addEventListener('keydown', e => {
        if(e.key==='Enter'){ e.preventDefault(); App._saveQuickTask(); }
      });
    },50);
  },
  // ── 빠른 할 일 (위젯의 + 에서) ─────────────
  // 제목과 세부만 적는 아래 시트. 목록은 위젯에서 고른 목록이 먼저 골라져 있고, 위 칩으로 바꿀 수 있다.
  // 날짜는 기본 없음 — 오늘/내일만 한 번에. 제목 치고 엔터(또는 저장)면 끝.
  quickTask(listId) {
    if(!this.S.lists.some(l=>l.id===BashyCal.LIST_ID)) this.S.lists=[...this.S.lists,BashyCal.list()];
    const lists=this.S.lists, cur=lists.some(l=>l.id===listId) ? listId : (this.S.taskFilter!=='all' && lists.some(l=>l.id===this.S.taskFilter) ? this.S.taskFilter : (lists[0]?.id||BashyCal.LIST_ID));
    document.getElementById('qtSheet')?.remove();
    const ov=document.createElement('div'); ov.id='qtSheet'; ov.className='mx-ov qt-ov';
    const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const t0=new Date(), t1=new Date(Date.now()+864e5);
    ov.innerHTML=`<div class="mx-sh qt-sh" role="dialog" aria-label="새 할 일">
      <div class="qt-lists">${lists.map(l=>`<button type="button" class="qt-l${l.id===cur?' on':''}" data-id="${esc(l.id)}">${esc(l.title)}</button>`).join('')}</div>
      <input id="qtTitle" class="qt-title" type="text" placeholder="새 할 일" enterkeyhint="done" autocomplete="off">
      <textarea id="qtNotes" class="qt-notes" rows="1" placeholder="세부정보 추가"></textarea>
      <input type="hidden" id="qtList" value="${esc(cur)}"><input type="hidden" id="qtDue" value=""><input type="hidden" id="qtTime" value="">
      <div class="qt-bar">
        <button type="button" class="qt-d" data-d="${ymd(t0)}">오늘</button>
        <button type="button" class="qt-d" data-d="${ymd(t1)}">내일</button>
        <span class="qt-sp"></span>
        <button type="button" class="qt-save" disabled>저장</button>
      </div></div>`;
    document.body.appendChild(ov);
    const $=s=>ov.querySelector(s), title=$('#qtTitle'), save=$('.qt-save');
    const close=()=>{ ov.classList.remove('on'); setTimeout(()=>ov.remove(),200); };
    ov.addEventListener('click',e=>{ if(e.target===ov) close(); });
    ov.querySelectorAll('.qt-l').forEach(b=>b.onclick=()=>{ ov.querySelectorAll('.qt-l').forEach(x=>x.classList.toggle('on',x===b)); $('#qtList').value=b.dataset.id; try{Haptic.light();}catch(e){} title.focus(); });
    ov.querySelectorAll('.qt-d').forEach(b=>b.onclick=()=>{ const on=!b.classList.contains('on'); ov.querySelectorAll('.qt-d').forEach(x=>x.classList.remove('on')); b.classList.toggle('on',on); $('#qtDue').value=on?b.dataset.d:''; title.focus(); });
    title.addEventListener('input',()=>{ save.disabled=!title.value.trim(); });
    const go=async()=>{ if(!title.value.trim()) return; save.disabled=true; await this._saveQuickTask(); close(); };
    title.addEventListener('keydown',e=>{ if(e.key==='Enter' && !e.isComposing){ e.preventDefault(); go(); } });
    $('#qtNotes').addEventListener('input',e=>{ e.target.style.height='auto'; e.target.style.height=Math.min(120,e.target.scrollHeight)+'px'; });
    save.onclick=go;
    requestAnimationFrame(()=>{ ov.classList.add('on'); title.focus(); });
  },
  // 예전 이름. 달력 길게 누르기 메뉴가 아직 이 이름으로 부른다.
  _showAddTaskForDate(date) { this.showAddTask(date); },

  async _saveQuickTask() {
    const title=document.getElementById('qtTitle')?.value.trim();
    const notes=document.getElementById('qtNotes')?.value.trim()||'';
    const listId=document.getElementById('qtList')?.value;
    const due=document.getElementById('qtDue')?.value;
    const time=document.getElementById('qtTime')?.value||'';
    if(!title){ this.showToast('제목을 입력해주세요','error'); return; }
    try{
      const task=await TaskStore.createTask(listId,title,due||null,notes);
      task.starred=false;
      // 구글 Tasks 의 due 는 날짜만 받는다(시각은 버려진다). 시간은 세부정보 창과
      // 같은 자리에 따로 둔다 — 두 곳이 다른 데 저장하면 한쪽에서 넣은 시간이 안 보인다.
      if(time) UserStore.set('gl_task_extra_'+task.id,
        JSON.stringify({ ...(UserStore.parse('gl_task_extra_'+task.id, {})), time }));
      if(!this.S.tasks[listId]) this.S.tasks[listId]=[];
      this.S.tasks[listId].unshift(task);
      this._buildTaskFilters(); this._renderTasks();
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      this.closeModal(); this.showToast('할일 추가됨','success');
      this._updateStatsBanner();
    }catch{ this.showToast('추가 실패','error'); }
  },

  _showAddChecklistForDate(date) {
    const _d=new Date(date); const ds=`${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
    this.openModal('@pen 체크리스트 추가',`
      <div class="modal-row"><label class="modal-lbl">항목 *</label><input id="qcTitle" type="text" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">마감</label><input id="qcDue" type="date" value="${ds}" class="inp inp-sm"></div>
      <div class="modal-btns">
        <button onclick="App._saveQuickChecklist()" class="btn-sm accent">추가</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('qcTitle')?.focus(),50);
  },

  _saveQuickChecklist() {
    const title=document.getElementById('qcTitle')?.value.trim();
    const due=document.getElementById('qcDue')?.value;
    if(!title){ this.showToast('항목을 입력해주세요','error'); return; }
    const items=Checklist.getItems();
    items.push({id:'cl_'+Date.now(),title,dueDate:due||null,done:false,createdAt:new Date().toISOString()});
    Checklist.saveItems(items); Checklist.render();
    CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
    this.closeModal(); this.showToast('추가됨','success');
    this._updateStatsBanner();
  },

  _showEvDetail(id) {
    const e=this.S.events.find(x=>x.id===id); if(!e) return;
    const allDay=!e.start?.dateTime; const s=allDay?null:new Date(e.start.dateTime);
    const en=e.end?.dateTime?new Date(e.end.dateTime):null;
    const col=e._calColor||_evColor(e.colorId);
    const src=e._src&&e._src!=='google'?CalSources.srcName(e):'';
    const where=[e._calName, src&&src!==e._calName&&e._src!=='bashy'?src:''].filter(Boolean).join(' · ');
    const ro=e._readOnly||e._src==='ics';
    const btnDel='width:100%;padding:9px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:8px;color:var(--red);cursor:pointer;font-family:inherit;font-size:13px';
    this.openModal('@calendar 일정',`
      <h4 style="font-size:16px;font-weight:700;margin-bottom:12px">${esc(e.summary||'(제목 없음)')}</h4>
      ${where?`<p class="ev-src" style="font-size:12px;color:${col};margin-bottom:8px">${e._src&&e._src!=='google'?`<i class="ev-dot" style="background:${col}"></i>`:''}${esc(where)}</p>`:''}
      <p style="color:var(--text2);font-size:13px;margin-bottom:8px">${e.start?.date||_fmtFull(s)}<br>${allDay?'종일':_fmtTime(s)+(en?' — '+_fmtTime(en):'')}</p>
      ${e.location?`<p style="color:var(--text2);font-size:13px;margin-bottom:8px">${esc(e.location)}</p>`:''}
      ${e.description?`<div style="color:var(--text2);font-size:13px;padding:10px;background:var(--card2);border-radius:8px;white-space:pre-wrap;margin-bottom:12px">${esc(e.description)}</div>`:''}
      ${ro?`<p class="ev-ro">${e._src==='ics'?'구독한 캘린더라 여기서는 고치거나 지울 수 없습니다.':'읽기 전용 캘린더입니다.'}</p>`
        :`${e._src==='bashy'?`<div class="modal-btns" style="margin-bottom:8px"><button class="btn-sm" onclick="App._showAddEventModalForDate(null,'${e.id}')">수정</button></div>`:''}
      <button onclick="App._delEvent('${e.id}','${e._calId||''}')" style="${btnDel}">일정 삭제${e._recurring?' (이 회차만)':''}</button>`}
    `);
  },

  async _delEvent(id,calId='') {
    if(!confirm('삭제하시겠습니까?')) return;
    const ev=this.S.events.find(e=>e.id===id)||{id,_calId:calId||'primary',_src:'google'};
    try{
      await CalSources.deleteEvent(ev);
      Object.keys(this._srcEv).forEach(k=>{ this._srcEv[k]=this._srcEv[k].filter(e=>e.id!==id); });
      this._mergeEvents();
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      this._renderCalPanel(); this._updateStatsBanner(); this.closeModal(); this.showToast('삭제됨','success');
    }catch(e){ this.showToast('삭제 실패'+(e?.message?': '+e.message:''),'error'); }
  },

  // ── 할일 ─────────────────────────────
  // 기한이 지난 할일을 보일지. 켜고 끈 값은 계정에 저장돼서 다음에 열어도 그대로다 —
  // 매번 기본값으로 돌아가는 토글은 토글이 아니라 버튼이다.
  // 기본은 '보인다'. 지금 할일 중 기한 지난 게 대부분인데 기본을 숨김으로 두면
  // 앱을 처음 열었을 때 목록이 텅 비어 보인다 — 없는 것과 가려 둔 것은 다르다.
  showOverdue(){ return UserStore.get('gl_task_show_overdue') !== '0'; },
  toggleOverdue(){
    UserStore.set('gl_task_show_overdue', this.showOverdue()?'0':'1');
    FirebaseSync?.scheduleSave();
    this._buildTaskFilters(); this._renderTasks();
  },
  // 지금 몇 개가 숨어 있는지. 숫자를 안 적으면 '지난 할일이 없다' 와 '가려 뒀다' 가 같아 보인다.
  _overdueCount(){
    const t0=new Date(); t0.setHours(0,0,0,0);
    let n=0;
    for(const list of this.S.lists){
      (this.S.tasks[list.id]||[]).forEach(t=>{
        if(t.status!=='needsAction'||!t.due) return;
        if(!this.S.showHidden && t._hidden) return;
        const [y,m,d]=t.due.split('T')[0].split('-').map(Number);
        if(new Date(y,m-1,d) < t0) n++;
      });
    }
    return n;
  },

  // 할일 목록 색(기기 공용 칸). 줄마다 다시 파싱하지 않게 문자열이 같으면 지난 값을 쓴다. 깨져 있으면 빈 표.
  _catColors() {
    let raw=null; try { raw=localStorage.getItem('gl_cat_colors'); } catch(e){}
    if(this._ccC && this._ccC.raw===raw) return this._ccC.v;
    let v={}; try { v=JSON.parse(raw||'{}')||{}; } catch(e){ v={}; }
    this._ccC={ raw, v };
    return v;
  },
  _buildTaskFilters() {
    const wrap=document.getElementById('taskFilters'); if(!wrap) return;
    // 별표는 손대도 아무 일이 안 일어나던 필터라 뺐다. 안 되는 버튼은 없는 버튼보다 나쁘다.
    const tabs=[{id:'all',label:'전체'},...this.S.lists.filter(l=>l.id!==BashyCal.LIST_ID||!Auth.isLoggedIn()||(this.S.tasks[l.id]||[]).length).map(l=>({id:l.id,label:l.title}))];
    const catColors=this._catColors();
    const on=this.showOverdue(), n=this._overdueCount();
    const ic=(typeof Icons!=='undefined')?Icons.svg('clock','tf-ic'):'';
    wrap.innerHTML=`<button class="fit-tab tf-over${on?' active':''}"
        onclick="App.toggleOverdue()" aria-pressed="${on}"
        title="${on?'기한 지난 할일 감추기':'기한 지난 할일 보기'}">${ic}지난${n?` ${n}`:''}</button>`
      + tabs.map(t=>{
      const isListTab=t.id!=='all';
      const col=isListTab&&catColors[t.id]?catColors[t.id]:'';
      const borderStyle=col?`border-color:${col};color:${col};border-width:2px`:'' ;
      return `<button class="fit-tab${this.S.taskFilter===t.id?' active':''}"
        onclick="App._setFilter('${t.id}')"
        oncontextmenu="event.preventDefault();App._showCatColorPicker('${t.id}','${esc(t.label)}')"
        ontouchstart="App._tabLongPress('${t.id}','${esc(t.label)}',event)"
        ontouchend="App._tabLongPressEnd()" ontouchmove="App._tabLongPressEnd()"
        style="${borderStyle}">${esc(t.label)}</button>`;
    }).join('')
      // 할일을 더하는 자리는 할일 목록의 머리다. 달력 머리에 있던 '+ 할일' 은
      // 여기로 옮겼다 — 무엇을 더하는지가 어디를 보고 있는지로 정해진다.
      + `<button class="fit-tab tf-add" onclick="App.showAddTask()"
           title="할일 추가" aria-label="할일 추가">+ 추가</button>`;
  },
  _toggleCompleted(){ this.S.showCompleted=!this.S.showCompleted; this._buildTaskFilters(); this._renderTasks(); },
  _tabLpTimer: null,
  _tabLongPress(id,label,e){
    this._tabLpTimer=setTimeout(()=>{ this._showCatColorPicker(id,label); },600);
  },
  _tabLongPressEnd(){ clearTimeout(this._tabLpTimer); },
  _toggleHidden(){ this.S.showHidden=!this.S.showHidden; this._paintShowHidden(); this._buildTaskFilters(); this._renderTasks(); },
  // 숨긴 할일 보기 단추. 감은 눈 = 숨긴 것은 안 보이는 중, 뜬 눈 = 숨긴 것도 보이는 중.
  // 할일 줄의 단추와 같은 두 아이콘만 쓴다 — 원숭이·눈동자가 섞여 있던 것을 하나로 묶었다.
  _paintShowHidden(){
    const b=document.getElementById('btnShowHidden'); if(!b) return;
    const on=!!this.S.showHidden;
    b.innerHTML=Icons.svg(on?'eye':'eyeclosed');
    b.classList.toggle('active',on);
    b.title=b.ariaLabel=on?'숨긴 할일 가리기':'숨긴 할일 보기';
  },
  _setFilter(id){ this.S.taskFilter=id; this._buildTaskFilters(); this._renderTasks(); },

  _renderTasks() {
    if(!document.getElementById('tasksContainer')) return;
    const today=new Date().toDateString(), filter=this.S.taskFilter;
    let all=[];
    for(const list of this.S.lists){
      (this.S.tasks[list.id]||[]).filter(t=>{
        if(t.status==='needsAction') return true;
        // 완료 항목: showCompleted 모드일 때만 오늘 완료된 것 표시
        if(this.S.showCompleted && t.status==='completed'&&t.completed)
          return new Date(t.completed).toDateString()===today;
        return false;
      }).forEach(t=>all.push({...t,_lid:list.id,_lname:list.title}));
    }
    if(filter!=='all') all=all.filter(t=>t._lid===filter);
    // 숨김 처리
    if(!this.S.showHidden) all=all.filter(t=>!t._hidden);
    // 기한이 지난 것은 기본으로 접어 둔다. 위 '지난' 을 켜면 다시 나온다.
    if(!this.showOverdue()){
      const t0=new Date(); t0.setHours(0,0,0,0);
      all=all.filter(t=>{
        if(t.status!=='needsAction'||!t.due) return true;
        const [y,m,d]=t.due.split('T')[0].split('-').map(Number);
        return new Date(y,m-1,d) >= t0;
      });
    }
    // 날짜순
    all.sort((a,b)=>{
      const da=a.due?new Date(a.due):new Date('9999');
      const db=b.due?new Date(b.due):new Date('9999');
      return da-db;
    });
    if(!all.length){
      document.getElementById('tasksContainer').innerHTML =
        `<p class="empty">${Icons.big('tasks')}${
          this.showOverdue() ? '할일이 없습니다' : '다가올 할일이 없습니다 (지난 할일은 위에서 켜서 보세요)'}</p>`;
      return;
    }
    const groups={};
    // 전체/날짜순 탭: 단일 목록으로 날짜순 표시
    // 특정 목록 탭: 해당 카테고리만 그룹핑
    if(filter==='all'){
      groups['_all_']=[...all];
    } else {
      all.forEach(t=>{ if(!groups[t._lname])groups[t._lname]=[]; groups[t._lname].push(t); });
    }
    const catColors=this._catColors();
    document.getElementById('tasksContainer').innerHTML=Object.entries(groups).map(([k,v])=>{
      if(k==='_all_') return `<div class="task-group">${v.map(t=>this._taskHTML(t)).join('')}</div>`;
      // 카테고리 그룹 border-left 색상
      const listId=v[0]?._lid||'';
      const col=catColors[listId]||'';
      const style=col?`border-left:3px solid ${col};padding-left:8px;border-radius:0 var(--r-xs) var(--r-xs) 0`:'';
      return `<div class="task-group" style="${style}">
        <div class="task-group-name" style="${col?'color:'+col+';font-weight:700':''}">${esc(k)}</div>
        ${v.map(t=>this._taskHTML(t)).join('')}
      </div>`;
    }).join('');

    // 밀기·길게누르기 (js/rowui.js). PC 의 ✕ 는 .task-del 이 이미 한다.
    try { RowUI.paint(document.getElementById('tasksContainer'), {
      edit: v => { const [id,lid]=v.split('|'); this._showTaskDetail(id,lid); },
      del:  v => { const [id,lid]=v.split('|'); this._delTask(id,lid); },
    }); } catch(e) { console.warn('RowUI', e); }
    try { Fold.apply(document.getElementById('tasksContainer'), 'tasks'); } catch(e) {}
  },

  _taskHTML(t) {
    const done=t.status==='completed', due=t.due?new Date(t.due):null;
    const overdue=!!t.due&&_dueEnd(t)<new Date()&&!done, hidden=t._hidden;
    const dueStr=due?`<span class="task-due-inline${overdue?' overdue':''}">${_fmtDate(due)}</span>`:'';
    const catColors=this._catColors();
    const catCol=catColors[t._lid]||'';
    const colorBar=catCol?`<div class="task-cat-bar" style="background:${catCol}"></div>`:'';
    return `<div class="task-item${done?' done':''}${hidden?' task-hidden':''}"
      data-row data-nox data-i="${t.id}|${t._lid}" data-label="${esc(t.title)}">
      ${colorBar}
      <div class="task-check" onclick="event.stopPropagation();App._toggle('${t.id}','${t._lid}',${done})"></div>
      <div class="task-body" onclick="App._showTaskDetail('${t.id}','${t._lid}')">
        <div class="task-text-row">
          <span class="task-title-txt">${hidden?Icons.svg('eyeclosed','task-hid-ic'):''}${esc(t.title)}</span>
          ${dueStr}
        </div>
        ${t.notes?`<div class="task-notes">${esc(t.notes.slice(0,60))}${t.notes.length>60?'…':''}</div>`:''}
      </div>
      <button class="task-hide-btn" onclick="event.stopPropagation();App._toggleHideTask('${t.id}','${t._lid}')" title="${hidden?'다시 보이기':'숨기기'}" aria-label="${hidden?'다시 보이기':'숨기기'}">${Icons.svg(hidden?'eye':'eyeclosed','task-hide-ic')}</button>
      <button class="task-del" onclick="event.stopPropagation();App._delTask('${t.id}','${t._lid}')">✕</button>
    </div>`;
  },

  _toggleHideTask(taskId,listId){
    const t=this.S.tasks[listId]?.find(x=>x.id===taskId); if(!t) return;
    t._hidden=!t._hidden;
    UserStore.set('gl_hidden_'+taskId, t._hidden?'1':'');
    FirebaseSync?.scheduleSave();
    this._renderTasks();
    this._updateStatsBanner();
    this._updateHeaderDate(this._curDate || new Date());
  },

  _showTaskDetail(taskId, listId) {
    const t=this.S.tasks[listId]?.find(x=>x.id===taskId); if(!t) return;
    const due=t.due?t.due.split('T')[0]:'';
    // 시간/반복은 localStorage에 보조 저장
    const extra=UserStore.parse('gl_task_extra_'+taskId, {});
    const listOptions=this.S.lists.map(l=>`<option value="${l.id}"${l.id===listId?' selected':''}>${esc(l.title)}</option>`).join('');
    const repeatOpts=['없음','매일','매주','매월','매년'].map(v=>`<option${extra.repeat===v?' selected':''}>${v}</option>`).join('');
    this.openModal('@list 세부정보',`
      <div class="modal-row"><label class="modal-lbl">제목</label>
        <input id="tdTitle" type="text" value="${esc(t.title)}" class="inp"></div>
      <div class="modal-row"><label class="modal-lbl">세부사항</label>
        <textarea id="tdNotes" class="inp" rows="3">${esc(t.notes||'')}</textarea></div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">마감 날짜</label>
          <input id="tdDue" type="date" value="${due}" class="inp inp-sm"></div>
        <div><label class="modal-lbl">시간</label>
          <select id="tdTime" class="inp inp-sm">${this._halfHours(extra.time||'')}</select></div>
      </div>
      <div class="modal-grid2">
        <div><label class="modal-lbl">반복</label>
          <select id="tdRepeat" class="inp inp-sm">${repeatOpts}</select></div>
        <div><label class="modal-lbl">목록 이동</label>
          <select id="tdList" class="inp inp-sm">${listOptions}</select></div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:12px">
        수정: ${t.updated?new Date(t.updated).toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'}):''}
      </div>
      <div class="modal-btns">
        <button onclick="App._saveTaskDetail('${taskId}','${listId}')" class="btn-sm accent">저장 및 동기화</button>
        <button onclick="App._delTask('${taskId}','${listId}');App.closeModal();" class="btn-danger">삭제</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(()=>document.getElementById('tdTitle')?.focus(),50);
  },

  async _saveTaskDetail(taskId, listId) {
    const title=document.getElementById('tdTitle')?.value.trim();
    const notes=document.getElementById('tdNotes')?.value.trim()||'';
    const due  =document.getElementById('tdDue')?.value||null;
    const time =document.getElementById('tdTime')?.value||'';
    const repeat=document.getElementById('tdRepeat')?.value||'없음';
    const newListId=document.getElementById('tdList')?.value||listId;
    if(!title){ this.showToast('제목을 입력해주세요','error'); return; }
    // 시간/반복은 localStorage 보조 저장
    UserStore.set('gl_task_extra_'+taskId, JSON.stringify({time,repeat}));
    try{
      if(newListId!==listId){
        const created=await TaskStore.moveTask(listId,newListId,taskId,title,notes,due);
        created.starred=UserStore.get('gl_star_'+taskId)==='1';
        // 목록을 옮기면 할 일 번호가 새로 생긴다 — 시간·반복·별표도 새 번호로 옮긴다
        UserStore.set('gl_task_extra_'+created.id, JSON.stringify({time,repeat}));
        if(created.starred) UserStore.set('gl_star_'+created.id,'1');
        FirebaseSync?.scheduleSave?.();
        if(!this.S.tasks[newListId]) this.S.tasks[newListId]=[];
        this.S.tasks[newListId].unshift(created);
        this.S.tasks[listId]=this.S.tasks[listId]?.filter(t=>t.id!==taskId);
      } else {
        const updated=await TaskStore.updateTask(listId,taskId,{title,notes,due:due||null});
        const t=this.S.tasks[listId]?.find(x=>x.id===taskId);
        // updated.due는 RFC3339 형식 (UTC) → 로컬 표시 시 날짜 부분만 사용
        const newDue = updated.due ? updated.due.split('T')[0]+'T00:00:00.000Z' : null;
        if(t) Object.assign(t,{title,notes:notes||'',due:newDue});
      }
      this._renderTasks();
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      this.closeModal(); this.showToast('저장됨','success');
      this._updateStatsBanner();
    }catch(e){ this.showToast('저장 실패: '+e.message,'error'); }
  },

  async _toggle(taskId,listId,done){
    try{
      try { Haptic.light(); } catch(e){}
      await TaskStore.toggleTask(listId,taskId,!done);
      const t=this.S.tasks[listId]?.find(x=>x.id===taskId);
      if(t){ t.status=!done?'completed':'needsAction'; t.completed=!done?new Date().toISOString():null; }
      this._renderTasks();
      this._updateStatsBanner();
      !done?Sounds?.check():Sounds?.uncheck();
      this.showToast(!done?'완료!':'다시 할일로','success');
    }catch{ this.showToast('업데이트 실패','error'); }
  },

  _toggleStar(taskId,listId){
    const t=this.S.tasks[listId]?.find(x=>x.id===taskId); if(!t) return;
    t.starred=!t.starred;
    // 로컬 스토리지 업데이트
    t.starred?UserStore.set('gl_star_'+taskId,'1'):UserStore.remove('gl_star_'+taskId); FirebaseSync?.scheduleSave?.();
    // Google Tasks API notes 필드에 별표 상태 동기화 (fire-and-forget)
    if(Auth.isLoggedIn()&&!TaskStore.isB(listId)){
      GoogleTasks.setTaskStar(listId, taskId, t.starred, t.notes||'');
      // API 마커 상태도 로컬에 반영
      t._apiStarred = t.starred;
    }
    FirebaseSync?.scheduleSave();
    this._renderTasks();
  },

  async _delTask(taskId,listId){
    if(!confirm('삭제하시겠습니까?')) return;
    try{
      await TaskStore.deleteTask(listId,taskId);
      this.S.tasks[listId]=this.S.tasks[listId]?.filter(t=>t.id!==taskId);
      this._renderTasks();
      CalendarUI.render(document.getElementById('miniCal'),this.S.calDate,this.S.events,this.S.selDate);
      Sounds?.delete();
      this.showToast('삭제됨','success');
      this._updateStatsBanner();
    }catch{ this.showToast('삭제 실패','error'); }
  },

  // 인라인 할일 입력 폼은 없앴다. 같은 일을 하는 창이 둘이면 어느 쪽이 최신인지
  // 아무도 모른다 — 실제로 이쪽에는 세부사항·시간 칸이 끝내 안 들어갔다.
  // 지금은 showAddTask() 하나뿐이다.

  // ── 프로필 메뉴 ──────────────────────
  toggleProfileMenu() {
    const menu=document.getElementById('profileMenu');
    if(!menu) return;
    menu.classList.toggle('hidden');
    try{ Settings.hubMenu(); }catch(e){}
    // 바로 가기 주소: ?set=notify · ?set=ai · ?set=connector · ?set=cal · ?set=device · ?set=widget …
    // 안내 문구에 '설정 › ○○ 로 가세요' 대신 이 주소(또는 QR)를 주면 한 번에 그 화면이 열린다.
    { const sp=new URLSearchParams(location.search), sc=sp.get('set');
      if(sc){ sp.delete('set'); const q=sp.toString(); history.replaceState(null,'',location.pathname+(q?'?'+q:'')+location.hash);
        setTimeout(()=>{ try{ if(sc==='key') JARVIS.showKeySetup(); else Settings.open(Settings.CATS.some(c=>c.id===sc)||Settings.SUB[sc]?sc:undefined); }catch(e){} }, 1200); } }   // 다른 기기에서 동기화된 허브 모드 값까지 반영
    // 프로필 아이콘 위치 기준으로 메뉴 위치 설정
    if(!menu.classList.contains('hidden')){
      const hUser=document.getElementById('hUser');
      if(hUser){
        const rect=hUser.getBoundingClientRect();
        menu.style.top=(rect.bottom+4)+'px';
        menu.style.right=(window.innerWidth-rect.right)+'px';
        menu.style.left='auto';
      }
    }
    // 바깥을 누르면 닫는다. 열고 닫을 때마다 새로 걸던 것이 쌓이지 않게 지난 것을 먼저 뗀다.
    if(this._pmClose){ document.removeEventListener('click',this._pmClose); this._pmClose=null; }
    if(!menu.classList.contains('hidden')) setTimeout(()=>{
      if(this._pmClose) document.removeEventListener('click',this._pmClose);
      const close=(e)=>{ if(!e.target.closest('#hUser')&&!e.target.closest('#profileMenu')){ menu.classList.add('hidden'); document.removeEventListener('click',close); if(this._pmClose===close) this._pmClose=null; } };
      this._pmClose=close;
      document.addEventListener('click',close);
    },0);
  },

  // ── 테마 ──────────────────────────────
  // 시스템 / 밝게 / 어둡게 3단계. 기본은 '시스템'이다 —
  // 폰 다크모드를 켜둔 사람에게 앱만 하얗게 빛나면 이질감이 크다.
  // (첫 페인트 전 적용은 index.html <head> 의 부트스트랩이 맡는다. 여기서 하면 늦다.)
  THEMES: ['system','light','dark'],
  THEME_LBL: { system:'테마: 시스템', light:'테마: 밝게', dark:'테마: 어둡게' },

  get _theme(){
    const v = localStorage.getItem('gl_theme');
    if (this.THEMES.includes(v)) return v;
    return localStorage.getItem('gl_dark')==='true' ? 'dark' : 'system';   // 예전 설정 승계
  },
  set _theme(v){ localStorage.setItem('gl_theme', v); },

  _resolveDark(t){
    if (t==='dark')  return true;
    if (t==='light') return false;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  },

  _applyTheme() {
    document.documentElement.classList.toggle('dark', this._resolveDark(this._theme));
    this._updateDarkLabel();
  },

  initDarkMode() {
    this._applyTheme();
    // 시스템 설정을 따라가는 중이면 OS 가 바뀔 때 같이 바뀌어야 한다
    if (window.matchMedia) {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => { if (this._theme==='system') this._applyTheme(); };
      mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    }
    setTimeout(()=>{ this._updateSoundLabel(); this._updateUILabel(); },100);
  },

  // 디자인 판 바꾸기: v2(새 디자인) ↔ v1(예전 모습). 예전 코드 전체는 ui-v1-backup 브랜치에도 남아 있다.
  toggleUI() {
    const cur = document.documentElement.dataset.ui === 'v1' ? 'v1' : 'v2';
    const nx  = cur === 'v2' ? 'v1' : 'v2';
    try { localStorage.setItem('gl_ui', nx); } catch(e){}
    document.documentElement.dataset.ui = nx;
    try { window.FirebaseSync?.scheduleSave?.(); } catch(e){}
    document.getElementById('profileMenu')?.classList.add('hidden');
    this._updateUILabel();
    try { this._updateHeaderDate(this.S.selDate || new Date()); } catch(e){}
    this.showToast(nx === 'v2' ? '새 디자인' : '예전 디자인', 'success');
  },
  _updateUILabel() {
    const el = document.getElementById('uiLabel');
    if (el) el.textContent = document.documentElement.dataset.ui === 'v1' ? '예전' : '새 디자인';
  },

  toggleDarkMode() {
    const i = this.THEMES.indexOf(this._theme);
    this._theme = this.THEMES[(i+1) % this.THEMES.length];
    this._applyTheme();
    document.getElementById('profileMenu')?.classList.add('hidden');
    this.showToast(this.THEME_LBL[this._theme].replace('테마: ',''), 'success');
  },

  // 메인에 어떤 카드를 둘지 — 설정은 Tabs 가 들고 있다 (카드 보이기/숨기기를 이미 다루는 곳)
  showCardSettings() {
    document.getElementById('profileMenu')?.classList.add('hidden');
    if (typeof Tabs !== 'undefined') Tabs.openSettings();
  },

  toggleSound() {
    if(typeof Sounds!=='undefined'){
      Sounds.enabled=!Sounds.enabled;
      const el=document.getElementById('soundLabel');
      if(el) el.textContent=Sounds.enabled?'사운드 켜짐':'사운드 꺼짐';
      if(Sounds.enabled) Sounds.click();
    }
    document.getElementById('profileMenu')?.classList.add('hidden');
  },

  // 라벨에 아이콘이 같이 들어간다. textContent 로 쓰면 아이콘이 지워진다 —
  // Icons.title() 을 만든 것과 같은 이유다.
  _label(id, icon, text) {
    const el=document.getElementById(id); if(!el) return;
    const ic=(typeof Icons!=='undefined') ? Icons.svg(icon) : '';
    el.innerHTML = ic + String(text).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    el.dataset.icOn='1';
  },
  _updateSoundLabel() {
    if(typeof Sounds==='undefined') return;
    this._label('soundLabel', Sounds.enabled?'volume':'mute',
                Sounds.enabled?'사운드 켜짐':'사운드 꺼짐');
  },

  _updateDarkLabel() {
    const t=this._theme;
    this._label('darkModeLabel', t==='dark'?'moon':t==='light'?'sun':'monitor',
                this.THEME_LBL[t] || this.THEME_LBL.system);
  },

  _showCatColorPicker(listId, listName) {
    const catColors=this._catColors();
    const cur=catColors[listId]||'';
    const colors=['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#64748b',''];
    App.openModal(`@palette "${listName}" 색상`,`
      <p style="font-size:12px;color:var(--text2);margin-bottom:12px">카테고리 배경 색상을 선택하세요.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${colors.map(c=>c
          ?`<div onclick="App._saveCatColor('${listId}','${c}')" style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===cur?'var(--text)':'transparent'}"></div>`
          :`<div onclick="App._saveCatColor('${listId}','')" style="width:32px;height:32px;border-radius:50%;background:var(--bg);border:2px dashed var(--border2);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px">✕</div>`
        ).join('')}
      </div>
      <div class="modal-btns"><button onclick="App.closeModal()" class="btn-sm">닫기</button></div>`);
  },

  _saveCatColor(listId, color) {
    const catColors={ ...this._catColors() };
    if(color) catColors[listId]=color; else delete catColors[listId];
    localStorage.setItem('gl_cat_colors',JSON.stringify(catColors));
    this._buildTaskFilters();
    this._renderTasks();
    App.closeModal();
  },

  // 제목 앞에 "@이름 " 을 붙이면 그 자리를 단색 아이콘으로 그린다 — "@calendar 일정 추가".
  // 이모지를 쓰지 않는 이유는 icons.js 머리말에 적어 뒀다. 이름이 없으면 글자만 나온다.
  openModal(title,body,afterRender){
    const tEl=document.getElementById('modalTitle');
    const m=/^@([a-z]+)\s+([\s\S]+)$/.exec(String(title));
    if(m && typeof Icons!=='undefined' && Icons.P[m[1]]) Icons.title(tEl, m[1], m[2]);
    else tEl.textContent=title;
    document.getElementById('modal').classList.remove('set-modal');
    document.getElementById('modalBody').innerHTML=body;
    document.getElementById('modal').classList.remove('hidden');
    if(afterRender) setTimeout(afterRender, 80);
  },
  closeModal(){ document.getElementById('modal').classList.add('hidden'); },

  // act = { label, fn } 를 주면 토스트 안에 그 일을 바로 하는 단추가 붙는다.
  // '설정 › AI 에서 키를 넣어 주세요' 처럼 길을 알려 주는 대신, 누르면 그 화면이 바로 열린다.
  showToast(msg,type='',act){
    const t=document.getElementById('toast'); if(!t) return;
    t.textContent=msg; t.className=`toast${type?' '+type:''}${act?' has-act':''}`;
    if(act&&act.label&&typeof act.fn==='function'){
      const b=document.createElement('button'); b.type='button'; b.className='toast-act'; b.textContent=act.label;
      b.onclick=e=>{ e.stopPropagation(); t.classList.add('hidden'); try{ act.fn(); }catch(err){ console.warn(err); } };
      t.appendChild(b);
    }
    clearTimeout(this._tt);
    this._tt=setTimeout(()=>t.classList.add('hidden'),act?6000:3000);
  },
};

function esc(s){ if(!s)return''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// 구글 할 일 기한(UTC 자정)을 그 날 끝(현지 23:59)으로 — 오늘 기한이 오전 9시부터 '지남' 으로 보이지 않게
function _dueEnd(t){ return new Date(String(t.due).slice(0,10)+'T23:59:59'); }
function _fmtDate(d){ return d?.toLocaleDateString('ko-KR',{month:'short',day:'numeric',weekday:'short'})||''; }
function _fmtTime(d){ return d?.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})||''; }
function _fmtFull(d){ return d?.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'})||''; }
function _evColor(cid){ const M={'1':'#7986cb','2':'#33b679','3':'#8e24aa','4':'#e67c73','5':'#f6bf26','6':'#f5511d','7':'#039be5','8':'#616161','9':'#3f51b5','10':'#0b8043','11':'#d60000'}; return M[cid]||'var(--cyan)'; }

document.addEventListener('DOMContentLoaded',()=>App.init());

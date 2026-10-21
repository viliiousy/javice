// js/ai-usage.js — AI 구독 사용량 (Claude · ChatGPT · Higgsfield)
//
// 값은 이 앱이 만들지 않는다. PC 크롬의 '사용량 수집기' 확장이 5분마다 읽어
// /api/hub 로 올리고, 서버가 /users/<uid>/_usage 에 넣어 둔다. 여기서는 읽어서 보여주기만 한다.
//
// 헤더 오른쪽 줄(TopStrip)에 한 줄로 요약하고, 누르면 자세히 + 연결 설정이 열린다.
// 연동을 안 한 사람에게는 줄 자체가 안 보인다 — 없는 숫자를 0% 로 그리지 않는다.
//
// 연결 코드(<FirebaseUID>.<hubKey>) 하나를 확장과 태블릿 허브가 같이 쓴다.
// hubKey 는 /users/<uid>/_link 에 있어 localStorage 로 내려오지 않는다.

const AIUsage = {
  data: null,
  _timer: null,
  SHORT_NAMES: { claude: 'Claude', chatgpt: 'GPT', higgsfield: 'Higgs' },
  NAMES: { claude: 'Claude', chatgpt: 'ChatGPT', higgsfield: 'Higgsfield' },
  HUB_URL: 'https://bashy.app/hub.html',

  // ── 어떤 서비스를 추적할지 ─────────────────
  // 사용량은 PC 크롬의 수집 확장이 각 사이트에서 읽어 온다. 지금 읽을 수 있는 곳은 Claude·ChatGPT·Higgsfield 이다.
  // Gemini·Grok 은 사이트에 남은 사용량을 보여 주는 곳이 없어 아직 읽지 못한다 — 고를 수는 없게 '준비 중' 으로 둔다.
  TRACK: [
    { id:'claude',     name:'Claude',     ok:true },
    { id:'chatgpt',    name:'ChatGPT',    ok:true },
    { id:'higgsfield', name:'Higgsfield', ok:true },
    { id:'gemini',     name:'Gemini',     ok:false },
    { id:'grok',       name:'Grok',       ok:false },
  ],
  shown() {
    try { const v = JSON.parse(localStorage.getItem('gl_aiu_show') || 'null'); if (Array.isArray(v)) return v; } catch {}
    return ['claude', 'chatgpt', 'higgsfield'];
  },
  trackHtml() {
    const on = this.shown();
    return `<div class="aiu-track-pick">${this.TRACK.map(t => `
      <label class="ob-chk${t.ok ? '' : ' off'}"><input type="checkbox" class="aiu-show" value="${t.id}" ${t.ok && on.includes(t.id) ? 'checked' : ''} ${t.ok ? '' : 'disabled'} onchange="AIUsage.saveTrack()">
        <span>${t.name}</span>${t.ok ? '' : '<i>준비 중</i>'}</label>`).join('')}</div>`;
  },
  saveTrack() {
    const v = [...document.querySelectorAll('.aiu-show:checked')].map(i => i.value);
    localStorage.setItem('gl_aiu_show', JSON.stringify(v));
    window.FirebaseSync?.scheduleSave?.();
    if (typeof TopStrip !== 'undefined') TopStrip.render();
  },

  init() {
    // 로그인(Firebase 인증)이 끝나야 읽을 수 있다. 끝날 때까지 가볍게 기다린다.
    const wait = setInterval(() => {
      if (this._authed()) { clearInterval(wait); this.refresh(); this.linkExtension(); }
    }, 1500);
    setTimeout(() => clearInterval(wait), 120000);
    this._timer = setInterval(() => { if (this._authed() && !document.hidden) this.refresh(); }, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this._authed()) this.refresh(); });
  },

  _authed() {
    return typeof FirebaseSync !== 'undefined' && FirebaseSync.ready() && FirebaseSync._authed;
  },

  async refresh() {
    try {
      const r = await fetch(`${FirebaseSync._dbUrl}/users/${FirebaseSync._uid}/_usage/latest.json${await FirebaseSync._q()}`);
      if (!r.ok) return;
      this.data = await r.json();
      if (typeof TopStrip !== 'undefined') TopStrip.render();
    } catch (e) { console.warn('[AIUsage]', e.message); }
  },

  // ── 헤더 한 줄 ────────────────────────
  // 숫자 없이 모양으로만 보여 준다. (자세한 숫자는 눌렀을 때 창에서)
  //   Claude · ChatGPT : 바깥 고리 = 7일 한도 남은 양, 안쪽 원 = 5시간 한도 남은 양
  //                      (안쪽은 가득 찬 물이 쓴 만큼 위에서부터 줄어드는 모양)
  //   Higgsfield      : 파이 — 이번 구독 기간 크레딧 남은 몫
  COLORS: { claude: '#d97757', chatgpt: '#10a37f', higgsfield: '#8fb32b' },
  _left(w) { return w && w.pct != null ? Math.max(0, Math.min(1, 1 - Number(w.pct) / 100)) : null; },
  _tone(left, base) { return left == null ? base : left <= 0.1 ? 'var(--red)' : left <= 0.3 ? 'var(--yellow)' : base; },
  _gid: 0,

  // 헤더에는 숫자 없이 고리 모양만, 그 아래에 서비스 이름.
  //   Claude·ChatGPT : 바깥 고리 = 7일 한도 남은 양, 안쪽 고리 = 5시간 한도 남은 양
  //   Higgsfield     : 고리 하나 = 이번 구독 기간 크레딧 남은 양
  // 남은 양이 30% 아래면 노랑, 10% 아래면 빨강.
  _arc(r, frac, color, w) {
    const C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
    return `<circle cx="20" cy="20" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="${w}"/>` +
      (f > 0.005 ? `<circle cx="20" cy="20" r="${r}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"
        stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - f)).toFixed(2)}" transform="rotate(-90 20 20)"/>` : '');
  },


  gauge(key, size) {
    const s = (this.data || {})[key];
    if (!s) return '';
    const base = this.COLORS[key];
    let rings, label;
    if (key === 'higgsfield') {
      const tot = Number(s.total) || 0;
      const f = tot ? Math.max(0, Math.min(1, Number(s.credits) / tot)) : 0;
      rings = this._arc(15, f, this._tone(f, base), 6);
      label = `Higgsfield 크레딧 ${Math.round(f * 100)}% 남음`;
    } else {
      const w7 = this._left(s.d7), h5 = this._left(s.h5);
      rings = this._arc(16.5, w7, this._tone(w7, base), 4.5) + this._arc(9.5, h5, this._tone(h5, base), 4.5);
      label = `${this.NAMES[key]} 5시간 ${h5 == null ? '—' : Math.round(h5 * 100) + '%'} · 7일 ${w7 == null ? '—' : Math.round(w7 * 100) + '%'} 남음`;
    }
    return `<svg class="aiu-g" width="${size}" height="${size}" viewBox="0 0 40 40" role="img" aria-label="${label}"><title>${label}</title>${rings}</svg>`;
  },

  row() {
    const d = this.data;
    if (!d || !Object.keys(d).length) return '';
    const show = this.shown();
    const items = ['claude', 'chatgpt', 'higgsfield'].filter(k => d[k] && show.includes(k)).map(k =>
      `<span class="aiu-it">${this.gauge(k, 28)}<span class="aiu-nm"><span class="nm-full">${k === 'higgsfield' ? 'Higgs' : this.NAMES[k]}</span><span class="nm-short">${this.SHORT_NAMES[k]}</span></span></span>`);
    if (!items.length) return '';
    return `<button class="ts-row ts-ai" id="tsAI" onclick="AIUsage.open()"
      title="AI 남은 사용량 — Claude·ChatGPT: 바깥 고리 7일 · 안쪽 고리 5시간 / Higgsfield: 남은 크레딧">
      <span class="aiu-gs">${items.join('')}</span></button>`;
  },

  _num(v) {
    const n = Number(v);
    return !isFinite(n) ? '—' : n >= 100 ? Math.round(n).toLocaleString('ko-KR') : String(Math.round(n * 10) / 10);
  },

  _ago(iso) {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!isFinite(m)) return '';
    if (m < 1) return '방금';
    if (m < 60) return `${m}분 전`;
    if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
    return `${Math.round(m / 1440)}일 전`;
  },

  _until(iso) {
    const m = Math.round((Date.parse(iso) - Date.now()) / 60000);
    if (!isFinite(m)) return '';
    if (m <= 0) return '곧 초기화';
    if (m < 60) return `${m}분 뒤 초기화`;
    if (m < 60 * 24) return `${Math.floor(m / 60)}시간 ${m % 60}분 뒤 초기화`;
    return `${Math.floor(m / 1440)}일 ${Math.floor((m % 1440) / 60)}시간 뒤 초기화 · ${this._when(iso)}`;
  },

  _when(iso) {
    const d = new Date(iso);
    const w = '일월화수목금토'[d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()}(${w}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  _bar(label, w) {
    if (!w) return '';
    const left = Math.max(0, Math.min(100, Math.round(100 - (Number(w.pct) || 0))));
    const tone = left <= 10 ? 'var(--red)' : left <= 30 ? 'var(--yellow)' : 'var(--accent)';
    const t = left <= 10 ? 't-crit' : left <= 30 ? 't-lo' : 't-ok';
    return `<div class="aiu-bar ${t}">
      <div class="aiu-bar-top"><span>${label}</span><b><span class="num">${left}%</span><small> 남음</small></b></div>
      <div class="aiu-track"><div class="aiu-fill" style="width:${left}%;background:${tone}"></div></div>
      <div class="aiu-sub">${w.reset ? this._until(w.reset) : ''}</div>
    </div>`;
  },

  _svc(key) {
    const s = (this.data || {})[key];
    const name = this.NAMES[key];
    if (!s) return `<div class="aiu-svc"><div class="aiu-head"><b>${name}</b><span class="aiu-sub">아직 받은 값 없음</span></div></div>`;
    const stale = Date.now() - Date.parse(s.at) > 30 * 60000;
    const head = `<div class="aiu-head">${this.gauge(key, 34)}<b>${name}</b><span class="aiu-plan">${esc(s.plan || '')}</span>
      <span class="aiu-sub${stale ? ' aiu-stale' : ''}">${stale ? '갱신 늦음 · ' : ''}${this._ago(s.at)}</span></div>`;
    if (key === 'higgsfield') {
      const tot = Number(s.total) || 0;
      const left = Number(s.credits) || 0;
      const pctLeft = tot > 0 ? Math.max(0, Math.min(100, left / tot * 100)) : null;
      return `<div class="aiu-svc">${head}
        <div class="aiu-bar ${pctLeft != null && pctLeft < 10 ? 't-crit' : 't-ok'}">
          <div class="aiu-bar-top"><span>남은 크레딧</span><b><span class="num">${this._num(left)}</span>${tot ? `<small class="num"> / ${this._num(tot)}</small>` : ''}</b></div>
          ${pctLeft == null ? '' : `<div class="aiu-track"><div class="aiu-fill" style="width:${pctLeft}%;background:${pctLeft < 10 ? 'var(--red)' : 'var(--accent)'}"></div></div>`}
          <div class="aiu-sub">${s.ends ? '구독 갱신 ' + new Date(s.ends).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : ''}</div>
        </div></div>`;
    }
    return `<div class="aiu-svc">${head}${this._bar('5시간 한도', s.h5)}${this._bar('7일 한도', s.d7)}</div>`;
  },

  open() {
    const ext = document.documentElement.dataset.bashyExt;
    App.openModal('@sparkle AI 사용량', `
      <div class="aiu-wrap">
        ${['claude', 'chatgpt', 'higgsfield'].filter(k => this.shown().includes(k)).map(k => this._svc(k)).join('')}
        <div class="aiu-link">
          <div class="aiu-head"><b>PC 크롬 사용량 수집 확장</b><span class="aiu-sub">${ext ? '이 브라우저에 설치됨 · 자동 연결' : '이 브라우저에는 없음'}</span></div>
          <p class="aiu-sub aiu-p">Claude·ChatGPT·Higgsfield 는 남은 사용량을 API 로 알려 주지 않아, PC 크롬에 로그인된 사이트에서 확장이 5분마다 읽어 옵니다.
            확장을 설치한 크롬에서 bashy.app 에 한 번 로그인하면 연결은 저절로 됩니다.</p>
          ${ext ? '' : this._extGet()}
          <button type="button" class="btn-sm aiu-a" onclick="Settings.open('topinfo')">위쪽에 보일 AI 고르기</button>
        </div>
      </div>`);
    this.refresh();
    this.linkExtension();
  },

  // 확장은 PC 크롬에만 깔린다. 휴대폰에서 '확장 받기' 를 누르면 갈 곳이 없으니, PC 로 링크를 옮기는 길을 준다.
  EXT_URL: 'https://bashy.app/extension.html',
  _extGet() {
    const mob = /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || (typeof Platform !== 'undefined' && Platform.native);
    if (!mob) return `<a class="btn-sm accent aiu-a" href="${this.EXT_URL}" target="_blank" rel="noopener">확장 받기 — 한 번 눌러 내려받기</a>`;
    return `<p class="aiu-sub aiu-p">지금은 휴대폰이라 설치할 수 없습니다. PC 크롬 주소창에 <b>bashy.app/extension</b> 을 치거나, 아래 단추로 링크를 PC 로 보내세요.</p>
      <div class="aiu-btns">
        ${typeof navigator.share === 'function' ? `<button type="button" class="btn-sm accent" onclick="navigator.share({title:'Bashy 사용량 확장',url:'${this.EXT_URL}'}).catch(()=>{})">PC 로 링크 보내기</button>` : ''}
        <button type="button" class="btn-sm" onclick="Settings.copy('${this.EXT_URL}','링크를 복사했습니다 — 카카오톡 나에게 보내기 등으로 PC 에 붙여 넣으세요')">링크 복사</button>
      </div>`;
  },

  // 확장이 이 페이지에 붙어 있으면(content script 가 data-bashy-ext 를 남긴다) 계정 연결 코드를 넘겨 준다.
  // 사용자가 코드를 복사·붙여 넣을 일이 없게.
  async linkExtension() {
    if (!document.documentElement.dataset.bashyExt || !this._authed()) return;
    const code = typeof Settings !== 'undefined' ? await Settings.hubLink(0) : null;
    if (code) window.postMessage({ type: 'bashy-ext-code', code }, location.origin);
  },
};

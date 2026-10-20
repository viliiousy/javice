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
    return `<div class="aiu-bar">
      <div class="aiu-bar-top"><span>${label}</span><b>${left}% 남음</b></div>
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
      <span class="aiu-sub${stale ? ' aiu-stale' : ''}">${this._ago(s.at)}</span></div>`;
    if (key === 'higgsfield') {
      const tot = Number(s.total) || 0;
      const left = Number(s.credits) || 0;
      const pctLeft = tot > 0 ? Math.max(0, Math.min(100, left / tot * 100)) : null;
      return `<div class="aiu-svc">${head}
        <div class="aiu-bar">
          <div class="aiu-bar-top"><span>남은 크레딧</span><b>${this._num(left)}${tot ? ` / ${this._num(tot)}` : ''}</b></div>
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
          <div class="aiu-head"><b>PC 크롬 사용량 수집 확장</b><span class="aiu-sub">${ext ? '이 브라우저에 설치됨 · 계정에 자동 연결' : '이 브라우저에서는 보이지 않음'}</span></div>
          <div class="aiu-sub" style="margin-top:4px">Claude·ChatGPT·Higgsfield 는 남은 사용량을 API 로 알려 주지 않아서, PC 크롬에 로그인된 사이트에서 확장이 5분마다 읽어 옵니다.
            확장을 설치한 크롬에서 bashy.app 에 한 번 로그인하면 연결은 저절로 됩니다.</div>
          <div class="modal-btns" style="justify-content:flex-start;flex-wrap:wrap">
            <a class="btn-sm aiu-a" href="https://github.com/viliiousy/javice/blob/main/docs/extension-install.md" target="_blank" rel="noopener">설치 방법</a>
          </div>
          <div class="aiu-sub" style="margin-top:6px">위쪽에 표시할 AI 는 설정 › 디자인 › 상단바 정보에서 고릅니다.</div>
        </div>
      </div>`);
    this.refresh();
    this.linkExtension();
  },

  // 확장이 이 페이지에 붙어 있으면(content script 가 data-bashy-ext 를 남긴다) 계정 연결 코드를 넘겨 준다.
  // 사용자가 코드를 복사·붙여 넣을 일이 없게.
  async linkExtension() {
    if (!document.documentElement.dataset.bashyExt || !this._authed()) return;
    const code = typeof Settings !== 'undefined' ? await Settings.hubLink(0) : null;
    if (code) window.postMessage({ type: 'bashy-ext-code', code }, location.origin);
  },

  _code: null,
  async _loadCode() {
    const box = document.getElementById('aiuCodeBox');
    const show = t => { if (box) box.textContent = t; };
    if (!this._authed()) { this._code = null; show('로그인하면 연결 코드를 만들 수 있습니다.'); return; }
    const link = await FirebaseSync.getLink();
    if (link && link.hubKey) {
      this._code = `${FirebaseSync._uid}.${link.hubKey}`;
      show(this._code);
    } else {
      this._code = null;
      show('아직 연결 코드가 없습니다 — "새 코드 만들기" 를 눌러 주세요.');
    }
  },

  async newCode() {
    if (!this._authed()) { App.showToast('로그인이 필요합니다', 'error'); return; }
    const b = new Uint8Array(24);
    crypto.getRandomValues(b);
    const key = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const ok = await FirebaseSync.setLink({ hubKey: key });
    if (!ok) { App.showToast('저장 실패 — 잠시 뒤 다시 시도해 주세요', 'error'); return; }
    await this._loadCode();
    App.showToast('새 연결 코드를 만들었습니다', 'success');
  },

  async copyCode() {
    if (!this._code) { App.showToast('먼저 코드를 만들어 주세요', 'error'); return; }
    try { await navigator.clipboard.writeText(this._code); App.showToast('복사했습니다', 'success'); }
    catch { App.showToast('복사 실패 — 코드를 길게 눌러 복사해 주세요', 'error'); }
  },
};

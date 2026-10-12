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
  NAMES: { claude: 'Claude', chatgpt: 'ChatGPT', higgsfield: 'Higgsfield' },
  HUB_URL: 'https://bashy.app/hub.html',

  init() {
    // 로그인(Firebase 인증)이 끝나야 읽을 수 있다. 끝날 때까지 가볍게 기다린다.
    const wait = setInterval(() => {
      if (this._authed()) { clearInterval(wait); this.refresh(); }
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

  // 가운데 로고는 각 서비스의 공식 파비콘을 불러와, 배경을 걷어 낸 '모양' 만 쓴다(그려 넣지 않는다).
  //   Claude 는 주황 바탕의 밝은 무늬, ChatGPT·Higgsfield 는 밝은 바탕의 어두운 무늬라
  //   밝기로 문턱을 넘긴 부분만 남긴다. 그 모양 안을 남은 양만큼 아래부터 채운다.
  LOGO: k => `https://www.google.com/s2/favicons?sz=128&domain=${{ claude: 'claude.ai', chatgpt: 'chatgpt.com', higgsfield: 'higgsfield.ai' }[k]}`,
  MARK: { claude: 'light', chatgpt: 'dark', higgsfield: 'dark' },

  gauge(key, size) {
    const s = (this.data || {})[key];
    if (!s) return '';
    const base = this.COLORS[key], id = 'aiug' + (++this._gid);
    const R = 17, C = 2 * Math.PI * R;
    let ring, fill, label;
    if (key === 'higgsfield') {
      const tot = Number(s.total) || 0;
      ring = tot ? Math.max(0, Math.min(1, Number(s.credits) / tot)) : 0;
      fill = ring;
      label = `Higgsfield 크레딧 ${Math.round(ring * 100)}% 남음`;
    } else {
      const w7 = this._left(s.d7), h5 = this._left(s.h5);
      ring = w7 == null ? 0 : w7;
      fill = h5 == null ? 0 : h5;
      label = `${this.NAMES[key]} 5시간 ${h5 == null ? '—' : Math.round(fill * 100) + '%'} · 7일 ${w7 == null ? '—' : Math.round(ring * 100) + '%'} 남음`;
    }
    const tone = r => r <= 0.1 ? 'var(--red)' : r <= 0.3 ? 'var(--yellow)' : base;
    const light = this.MARK[key] === 'light';
    const slope = light ? 10 : -10, icpt = light ? -8 : 5;   // 밝은 무늬: 밝기>0.8 / 어두운 무늬: 밝기<0.5
    const L = 8, S = 24;                                      // 로고 자리 (viewBox 40 기준)
    const top = L + (1 - fill) * S;                           // 남은 만큼 아래부터 찬다
    return `<svg class="aiu-g" width="${size}" height="${size}" viewBox="0 0 40 40" role="img" aria-label="${label}">
      <defs>
        <filter id="${id}f" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0"/>
          <feComponentTransfer>
            <feFuncR type="linear" slope="${slope}" intercept="${icpt}"/>
            <feFuncG type="linear" slope="${slope}" intercept="${icpt}"/>
            <feFuncB type="linear" slope="${slope}" intercept="${icpt}"/>
          </feComponentTransfer>
        </filter>
        <mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
          <image href="${this.LOGO(key)}" x="${L}" y="${L}" width="${S}" height="${S}" filter="url(#${id}f)" preserveAspectRatio="xMidYMid meet"/>
        </mask>
        <clipPath id="${id}c"><rect x="0" y="${top.toFixed(2)}" width="40" height="40"/></clipPath>
      </defs>
      <circle cx="20" cy="20" r="${R}" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="3"/>
      <circle cx="20" cy="20" r="${R}" fill="none" stroke="${tone(ring)}" stroke-width="3" stroke-linecap="round"
        stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - ring)}" transform="rotate(-90 20 20)"/>
      <rect x="${L}" y="${L}" width="${S}" height="${S}" fill="currentColor" opacity=".26" mask="url(#${id}m)"/>
      <g clip-path="url(#${id}c)"><rect x="${L}" y="${L}" width="${S}" height="${S}" fill="${tone(fill)}" mask="url(#${id}m)"/></g>
    </svg>`;
  },

  row() {
    const d = this.data;
    if (!d || !Object.keys(d).length) return '';
    const g = ['claude', 'chatgpt', 'higgsfield'].map(k => this.gauge(k, 22)).filter(Boolean);
    if (!g.length) return '';
    return `<button class="ts-row ts-ai" id="tsAI" onclick="AIUsage.open()"
      title="AI 남은 사용량 — Claude · ChatGPT: 바깥 고리 7일, 안쪽 5시간 / Higgsfield: 남은 크레딧">
      <span class="ts-body aiu-gs">${g.join('')}</span></button>`;
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
    return `${Math.round(m / 1440)}일 뒤 초기화`;
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
    App.openModal('@sparkle AI 사용량 · 허브', `
      <div class="aiu-wrap">
        ${['claude', 'chatgpt', 'higgsfield'].map(k => this._svc(k)).join('')}
        <div class="aiu-link">
          <div class="aiu-head"><b>연결 코드</b><span class="aiu-sub">PC 수집 확장 · 태블릿 허브에 붙여 넣습니다</span></div>
          <div id="aiuCodeBox" class="aiu-code aiu-sub">확인 중…</div>
          <div class="modal-btns" style="justify-content:flex-start;flex-wrap:wrap">
            <button class="btn-sm" onclick="AIUsage.copyCode()">복사</button>
            <button class="btn-sm" onclick="AIUsage.newCode()">새 코드 만들기</button>
            <a class="btn-sm aiu-a" href="${this.HUB_URL}" target="_blank" rel="noopener">태블릿 허브 열기</a>
          </div>
          <div class="aiu-sub" style="margin-top:6px">새 코드를 만들면 예전 코드를 쓰던 기기는 연결이 끊깁니다.</div>
        </div>
      </div>`, () => this._loadCode());
    this.refresh();
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

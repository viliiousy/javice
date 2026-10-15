// js/device-pair.js — 태블릿 허브 같은 기기를 이 구글 계정에 연결(승인)한다.
//
// 허브(안드로이드 WebView)는 구글 로그인을 할 수 없어서, 허브가 6자리 번호(+QR)를 띄우고
// 이미 로그인된 bashy.app 에서 그 번호를 승인한다. 승인되면 허브는 연결 코드와 클라우드에 저장된
// 설정(Home Assistant·OpenClaw·호출어)을 한꺼번에 받아 간다. 기기마다 코드·키를 넣을 필요가 없다.
const DevicePair = {
  API: '/api/hub',

  init() {
    const pin = new URLSearchParams(location.search).get('pair');
    if (!pin) return;
    history.replaceState(null, '', location.pathname + location.hash);   // 새로고침해도 다시 뜨지 않게
    const wait = setInterval(() => {
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn()) { clearInterval(wait); this.open(pin); }
    }, 700);
    setTimeout(() => clearInterval(wait), 120000);
  },

  open(pin = '') {
    pin = String(pin).replace(/\D/g, '').slice(0, 6);
    App.openModal('@grid 기기 연결', `
      <div style="display:grid;gap:12px">
        <div style="font-size:13px;color:var(--text2);line-height:1.6">
          태블릿 허브 화면의 <b>⚙ 설정 → bashy 계정으로 연결</b>을 누르면 나오는 6자리 번호를 넣어 주세요.
          승인하면 그 기기가 이 계정의 AI 사용량·할 일과 저장된 스마트홈 설정을 바로 씁니다.
        </div>
        <input id="dpPin" inputmode="numeric" maxlength="7" autocomplete="one-time-code" placeholder="000 000" value="${pin}"
          style="font:700 26px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;text-align:center;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--bg2);color:var(--text)">
        <div id="dpMsg" style="font-size:12.5px;color:var(--text3);min-height:1.2em"></div>
        <div class="modal-btns">
          <button class="btn-sm" onclick="App.closeModal()">취소</button>
          <button class="btn-sm accent" id="dpGo" onclick="DevicePair.approve()">승인</button>
        </div>
      </div>`);
    setTimeout(() => { const i = document.getElementById('dpPin'); if (i && !pin) i.focus(); }, 50);
  },

  async approve() {
    const msg = t => { const m = document.getElementById('dpMsg'); if (m) m.textContent = t; };
    const pin = (document.getElementById('dpPin').value || '').replace(/\D/g, '');
    if (pin.length !== 6) { msg('6자리 번호를 넣어 주세요'); return; }
    const btn = document.getElementById('dpGo'); if (btn) btn.disabled = true;
    msg('승인 중…');
    try {
      const idToken = await Auth._firebaseIdToken();
      if (!idToken) throw new Error('로그인이 필요합니다');
      const r = await fetch(Platform.api(this.API), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ act: 'pairApprove', pin, idToken }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      App.closeModal();
      App.showToast('기기를 연결했습니다 — 몇 초 안에 기기에 반영됩니다', 'success');
    } catch (e) {
      msg(e.message || String(e));
      if (btn) btn.disabled = false;
    }
  },
};
document.addEventListener('DOMContentLoaded', () => DevicePair.init());

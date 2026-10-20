// js/device-pair.js — 태블릿 허브 같은 기기를 이 구글 계정에 연결(승인)한다.
//
// 허브(안드로이드 WebView)는 구글 로그인을 할 수 없어서, 허브가 6자리 번호(+QR)를 띄우고
// 이미 로그인된 bashy.app 에서 그 번호를 승인한다. 승인되면 허브는 연결 코드와 클라우드에 저장된
// 설정(Home Assistant·OpenClaw·호출어)을 한꺼번에 받아 간다. 기기마다 코드·키를 넣을 필요가 없다.
const DevicePair = {
  API: '/api/hub',

  init() {
    // SmartThings 허락 후 돌아온 경우 (?st=ok|cancel|fail|expired)
    const stRes = new URLSearchParams(location.search).get('st');
    if (stRes) {
      history.replaceState(null, '', location.pathname + location.hash);
      const M = { ok: 'SmartThings 를 연결했습니다', cancel: 'SmartThings 연결을 취소했습니다', expired: '시간이 지나 다시 시도해 주세요', fail: 'SmartThings 연결에 실패했습니다 — 다시 시도해 주세요' };
      const wait = setInterval(() => {
        if (typeof App !== 'undefined' && App.showToast && typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn()) {
          clearInterval(wait); App.showToast(M[stRes] || M.fail, stRes === 'ok' ? 'success' : 'error');
          if (stRes === 'ok') { this._setProvider('st', true); this.open(); }
        }
      }, 700);
      setTimeout(() => clearInterval(wait), 60000);
    }
    const pin = new URLSearchParams(location.search).get('pair');
    if (!pin) return;
    history.replaceState(null, '', location.pathname + location.hash);   // 새로고침해도 다시 뜨지 않게
    const wait = setInterval(() => {
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn()) { clearInterval(wait); this.open(pin); }
    }, 700);
    setTimeout(() => clearInterval(wait), 120000);
  },

  // 허브 태블릿 QR(?pair=번호)로 들어왔을 때만 쓰는 승인 창
  openPair(pin = '') {
    pin = String(pin).replace(/\D/g, '').slice(0, 6);
    App.openModal('@grid 허브 태블릿 승인', `
      <div style="display:grid;gap:12px">
        <div style="font-size:13px;color:var(--text2);line-height:1.6">허브 태블릿 화면에 뜬 6자리 번호가 맞으면 승인을 눌러 주세요. 그 태블릿이 이 계정의 할 일·AI 사용량·스마트홈 설정을 씁니다.</div>
        <input id="dpPin" inputmode="numeric" maxlength="7" autocomplete="one-time-code" placeholder="000 000" value="${pin}"
          style="font:700 26px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;text-align:center;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--bg2);color:var(--text)">
        <div id="dpMsg" style="font-size:12.5px;color:var(--text3);min-height:1.2em"></div>
        <div class="modal-btns">
          <button class="btn-sm" onclick="App.closeModal()">취소</button>
          <button class="btn-sm accent" id="dpGo" onclick="DevicePair.approve()">승인</button>
        </div>
      </div>`);
  },

  open(pin = '') {
    if (pin) return this.openPair(pin);
    App.openModal('@grid 스마트홈 연결', `
      <div style="display:grid;gap:12px">
        <div style="font-size:13px;color:var(--text2);line-height:1.6">허브가 집 기기를 어디서 가져올지 고릅니다. <b>계정 연결</b>은 SmartThings·구글 홈을 함께 쓸 수 있고, <b>Home Assistant</b>는 집 서버 하나만 씁니다.</div>
        <div class="dp-seg" id="dpProv">
          <button type="button" data-p="st" onclick="DevicePair._setProvider('st')">계정 연결</button>
          <button type="button" data-p="ha" onclick="DevicePair._setProvider('ha')">Home Assistant</button>
        </div>
        <div id="dpSt" style="display:grid;gap:14px">
          <div class="dp-card">
            <div class="dp-card-h"><b>SmartThings</b><span id="dpStMsg">확인 중…</span></div>
            <div class="dp-card-p">삼성 계정으로 한 번 허락하면 SmartThings 앱의 방·기기·장면을 허브에서 그대로 켜고 끕니다.</div>
            <div class="modal-btns" id="dpStBtns"></div>
          </div>
          <div class="dp-card is-off">
            <div class="dp-card-h"><b>구글 홈</b><span>준비 중</span></div>
            <div class="dp-card-p">구글 계정으로 허락하면 구글 홈 기기를 SmartThings 기기와 함께 보여 줍니다. 구글 승인 절차가 끝나면 열립니다.</div>
            <div class="modal-btns"><button class="btn-sm" disabled>구글 홈 계정 연결하기</button></div>
          </div>
        </div>
        <div id="dpHa" style="display:grid;gap:12px">
        <div style="font-size:12px;color:var(--text3);line-height:1.6">집 Wi-Fi 의 Home Assistant 서버에 바로 붙습니다. 여기 저장하면 같은 계정의 허브가 모두 이 설정을 받아 갑니다.</div>
        <label style="font-size:12px;color:var(--text2)">Home Assistant 주소 (집)
          <input id="dpHaUrl" class="inp inp-sm" inputmode="url" autocomplete="off" spellcheck="false" placeholder="http://192.168.0.10:8123"></label>
        <label style="font-size:12px;color:var(--text2)">외부 주소 (선택)
          <input id="dpHaExt" class="inp inp-sm" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://bashy-bot.duckdns.org"></label>
        <label style="font-size:12px;color:var(--text2)">장기 액세스 토큰
          <input id="dpHaTok" class="inp inp-sm" type="password" autocomplete="off" spellcheck="false" placeholder="HA 프로필 → 보안 → 장기 액세스 토큰"></label>
        <div id="dpCfgMsg" style="font-size:12px;color:var(--text3);min-height:1.2em"></div>
        <div class="modal-btns"><button class="btn-sm accent" onclick="DevicePair.saveCfg()">설정 저장</button></div>
        </div>
      </div>`);
    this.loadCfg().then(() => { this._paintProv(); this.stStatus(); });
  },

  // ── SmartThings ──
  async _api(body) {
    const idToken = await Auth._firebaseIdToken();
    if (!idToken) throw new Error('로그인이 필요합니다');
    const r = await fetch(Platform.api(this.API), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, idToken }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  },
  _prov() { const c = this._cfg || {}; return c.provider || (c.haToken ? 'ha' : 'st'); },
  _paintProv() {
    const p = this._prov();
    document.querySelectorAll('#dpProv button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
    const st = document.getElementById('dpSt'), ha = document.getElementById('dpHa');
    if (st) st.style.display = p === 'st' ? 'grid' : 'none';
    if (ha) ha.style.display = p === 'ha' ? 'grid' : 'none';
    const ap = document.getElementById('dpApple'); if (ap) ap.style.display = p === 'apple' ? 'block' : 'none';
  },
  async _setProvider(p, quiet) {
    if (!this._cfg) { const link = await FirebaseSync.getLink().catch(() => null); this._cfg = (link && link.hubCfg) || {}; }
    if (this._prov() === p && this._cfg.provider) { this._paintProv(); return; }
    const next = { ...(this._cfg || {}), provider: p, at: new Date().toISOString() };
    const ok = await FirebaseSync.setLink({ hubCfg: next }).catch(() => false);
    if (ok) { this._cfg = next; if (!quiet) App.showToast(p === 'st' ? '허브가 연결한 계정(SmartThings·구글 홈)을 씁니다' : p === 'apple' ? '허브가 애플 홈을 씁니다(아이폰·아이패드 앱)' : '허브가 Home Assistant 를 씁니다', 'success'); }
    this._paintProv();
  },
  async stStatus() {
    const msg = t => { const m = document.getElementById('dpStMsg'); if (m) m.textContent = t; };
    const btns = document.getElementById('dpStBtns'); if (!btns) return;
    try {
      const j = await this._api({ act: 'stStatus' });
      if (j.linked) {
        msg(`연결됨 · 방 ${j.rooms} · 기기 ${j.devices}`);
        btns.innerHTML = `<button class="btn-sm" onclick="DevicePair.stUnlink()">연결 해제</button><button class="btn-sm" onclick="DevicePair.stLink()">다른 SmartThings 계정 연결하기</button>`;
      } else {
        msg(j.ready === false ? 'SmartThings 연동을 준비하고 있습니다. 조금 뒤 다시 열어 주세요.' : (j.error ? '연결이 끊겼습니다 — 다시 연결해 주세요' : '아직 연결하지 않았습니다.'));
        btns.innerHTML = j.ready === false ? '' : `<button class="btn-sm accent" onclick="DevicePair.stLink()">SmartThings 계정 연결하기</button>`;
      }
    } catch (e) { msg(e.message); btns.innerHTML = ''; }
  },
  async stLink() {
    try {
      const j = await this._api({ act: 'stStart' });
      await this._setProvider('st', true);
      const B = window.Capacitor?.Plugins?.Browser;
      if (B && window.Capacitor?.isNativePlatform?.()) { await B.open({ url: j.url }); App.showToast('삼성 계정으로 허락한 뒤 이 화면으로 돌아오면 연결됩니다'); setTimeout(() => this.stStatus(), 15000); }
      else location.href = j.url;
    } catch (e) { App.showToast(e.message, 'error'); }
  },
  async stUnlink() {
    if (!confirm('SmartThings 연결을 해제할까요? 허브에서 기기가 보이지 않게 됩니다.')) return;
    try { await this._api({ act: 'stStatus', unlink: true }); App.showToast('연결을 해제했습니다'); this.stStatus(); }
    catch (e) { App.showToast(e.message, 'error'); }
  },

  // 허브 설정은 /users/<uid>/_link/hubCfg 에 둔다 (본인만 읽고 쓰는 자리). 토큰은 화면에 다시 보여 주지 않는다.
  async loadCfg() {
    const msg = t => { const m = document.getElementById('dpCfgMsg'); if (m) m.textContent = t; };
    if (typeof FirebaseSync === 'undefined' || !FirebaseSync.ready()) { msg('로그인하면 저장할 수 있습니다.'); return; }
    const link = await FirebaseSync.getLink().catch(() => null);
    const c = (link && link.hubCfg) || {};
    this._cfg = c;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    set('dpHaUrl', c.haUrl); set('dpHaExt', c.haUrlExt);
    const tok = document.getElementById('dpHaTok');
    if (tok && c.haToken) tok.placeholder = '저장되어 있음 — 바꿀 때만 입력';
    msg(c.at ? `마지막 저장: ${new Date(c.at).toLocaleString('ko-KR')}` : '아직 저장된 허브 설정이 없습니다.');
  },

  async saveCfg() {
    const msg = t => { const m = document.getElementById('dpCfgMsg'); if (m) m.textContent = t; };
    const v = id => (document.getElementById(id)?.value || '').trim();
    const haUrl = v('dpHaUrl'), haUrlExt = v('dpHaExt'), tok = v('dpHaTok');
    for (const u of [haUrl, haUrlExt]) if (u && !/^https?:\/\//.test(u)) { msg('주소는 http:// 또는 https:// 로 시작해야 합니다'); return; }
    const next = { ...(this._cfg || {}), provider: 'ha', haUrl, haUrlExt, at: new Date().toISOString() };
    if (tok) next.haToken = tok;
    if (!next.haToken) { msg('토큰을 입력해 주세요'); return; }
    const ok = await FirebaseSync.setLink({ hubCfg: next });
    if (!ok) { msg('저장 실패 — 잠시 뒤 다시 시도해 주세요'); return; }
    this._cfg = next;
    const t = document.getElementById('dpHaTok'); if (t) { t.value = ''; t.placeholder = '저장되어 있음 — 바꿀 때만 입력'; }
    msg('저장했습니다. 연결된 허브는 다음에 켤 때 이 설정으로 바뀝니다.');
    App.showToast('허브 설정을 클라우드에 저장했습니다', 'success');
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

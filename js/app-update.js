// js/app-update.js — 안드로이드 APK 로 설치한 사람에게 새 빌드가 나오면 알린다.
//
// 플레이 스토어를 거치지 않고 APK 를 직접 깐 사람은 업데이트 소식을 받을 길이 없다.
// 앱 안에 빌드 번호(js/build-info.js, 앱을 묶을 때 만들어짐)를 넣어 두고, 깃허브 릴리스(android-latest)의
// 번호와 비교해 더 크면 '새 버전' 시트를 띄운다. 누르면 휴대폰 브라우저가 새 APK 를 받는다.
// '나중에' 를 누르면 그 빌드는 다시 묻지 않는다(더 새 빌드가 나오면 다시 묻는다).
const AppUpdate = {
  API: 'https://api.github.com/repos/viliiousy/javice/releases/tags/android-latest',
  APK: 'https://github.com/viliiousy/javice/releases/download/android-latest/bashy.apk',
  SKIP_KEY: 'gl_apk_skip',
  get local() { return Number((window.BASHY_BUILD || {}).n) || 0; },
  get on() { try { return window.Capacitor?.getPlatform?.() === 'android' && this.local > 0; } catch (e) { return false; } },
  async check(force) {
    if (!this.on) return;
    if (!force && Date.now() - (this._t || 0) < 6 * 3600e3) return;
    this._t = Date.now();
    try {
      const r = await fetch(this.API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) return;
      const j = await r.json();
      const m = /build=(\d+)/.exec(j.body || '') || /빌드 (\d+)/.exec(j.name || '');
      const remote = m ? Number(m[1]) : 0;
      if (!(remote > this.local)) { if (force) App.showToast('최신 버전입니다', 'success'); return; }
      if (!force && Number(localStorage.getItem(this.SKIP_KEY) || 0) >= remote) return;
      const asset = (j.assets || []).find(a => /\.apk$/.test(a.name));
      this.show(remote, asset ? asset.browser_download_url : this.APK, asset ? asset.updated_at : '');
    } catch (e) {}
  },
  show(remote, url, at) {
    document.getElementById('apkUp')?.remove();
    const el = document.createElement('div'); el.id = 'apkUp'; el.className = 'mx-ov';
    const d = at ? new Date(at) : null;
    el.innerHTML = `<div class="mx-sh fx-ask" role="dialog" aria-label="새 버전">
      <b class="fx-ask-t">새 버전이 나왔습니다</b>
      <p class="fx-ask-p">지금 앱은 빌드 ${this.local}, 새 버전은 빌드 ${remote}${d ? ` (${d.getMonth() + 1}/${d.getDate()} 올라옴)` : ''}입니다.<br>
        아래 단추를 누르면 새 APK 파일을 받습니다. 받은 뒤 다운로드 알림(또는 파일 앱)에서 눌러 설치하면 기록은 그대로 두고 앱만 바뀝니다.</p>
      <div class="fx-ask-btns"><button type="button" class="fx-ask-no">나중에</button><button type="button" class="mx-go fx-ask-yes">업데이트 받기</button></div>
    </div>`;
    document.body.appendChild(el);
    const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 220); };
    el.querySelector('.fx-ask-no').onclick = () => { localStorage.setItem(this.SKIP_KEY, String(remote)); close(); };
    el.querySelector('.fx-ask-yes').onclick = () => { close(); this.open(url); };
    requestAnimationFrame(() => el.classList.add('on'));
  },
  // 앱 화면 안이 아니라 휴대폰 브라우저로 연다 — 그래야 APK 가 내려받아진다
  open(url) {
    try { const B = window.Capacitor?.Plugins?.Browser; if (B && B.open) { B.open({ url }); return; } } catch (e) {}
    try { const w = window.open(url, '_system'); if (w) return; } catch (e) {}
    location.href = url;
  },
};
setTimeout(() => AppUpdate.check(), 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) AppUpdate.check(); });

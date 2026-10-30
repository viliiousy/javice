// js/ota.js — 앱(아이폰·갤럭시) 화면 업데이트: 화면 파일만 새로 받아 바꾼다(앱을 다시 빌드·설치하지 않아도 되게)
//
// 앱은 화면 파일(HTML·JS·CSS·그림)을 앱 안에 넣어 두고 연다(심사 때문에 — app/scripts/build-www.mjs).
// 그래서 글자 하나를 고쳐도 아이폰은 맥미니에서 다시 빌드, 갤럭시는 APK 를 다시 받아야 했다.
//
// 이제 배포할 때마다(.github/workflows/deploy.yml) 같은 화면 묶음(zip)을 깃허브 릴리스 web-latest 에 올리고,
// 앱은 열 때·돌아올 때 그 버전(커밋)을 보고 다르면 뒤에서 받아 둔다(@capgo/capacitor-updater, 자체 주소만 씀 — 외부 서비스 없음).
// 받은 화면은 다음에 앱을 열 때(또는 백그라운드에 다녀올 때) 바뀐다 — 쓰던 화면이 갑자기 바뀌지 않게.
//
// 안전장치
//   · 새 화면이 열리고 나서 notifyAppReady() 를 못 부르면(오류로 멈추면) 15초 뒤 이전 화면으로 저절로 되돌아간다.
//   · 네이티브 코드가 바뀐 새 화면은 옛 앱에 주지 않는다 — app/ota-native.json 의 최소 빌드보다 낮으면 받지 않는다.
//   · 새 앱(스토어·TestFlight·APK)을 깔면 그 앱에 들어 있던 화면으로 돌아간다(resetWhenUpdate).
const OTA = {
  API: 'https://api.github.com/repos/viliiousy/javice/releases/tags/web-latest',
  get P() { try { return window.Capacitor?.Plugins?.CapacitorUpdater || null; } catch (e) { return null; } },
  get on() { try { return !!(window.Capacitor?.isNativePlatform?.() && this.P); } catch (e) { return false; } },
  get web() { return (window.BASHY_BUILD || {}).web || ''; },

  async start() {
    if (!this.on) return;
    try { await this.P.notifyAppReady(); } catch (e) {}   // 이 화면은 잘 열렸다 — 되돌리지 말 것
    setTimeout(() => this.check(), 4000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
  },

  async check(manual) {
    if (!this.on || this._busy) return;
    if (!manual && Date.now() - (this._t || 0) < 20 * 60e3) return;
    this._busy = true; this._t = Date.now();
    try {
      const r = await fetch(this.API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!r.ok) return;
      const rel = await r.json();
      // 릴리스 본문의 'OTA={…}' 한 줄(.github/workflows/deploy.yml 이 쓴다)
      let j = null; try { const m = /OTA=(\{.*\})/.exec(rel.body || ''); j = m ? JSON.parse(m[1]) : null; } catch (e) {}
      if (!j || !j.v || !j.url) return;
      if (j.v === this.web) { if (manual) App.showToast('화면이 최신입니다', 'success'); return; }
      // 이 앱(네이티브)이 받을 수 있는 화면인가
      const plat = window.Capacitor.getPlatform();
      let build = 0; try { build = Number((await window.Capacitor.Plugins.App.getInfo()).build) || 0; } catch (e) {}
      const min = Number((j.nativeMin || {})[plat] || 0);
      if (build && min && build < min) { if (manual) App.showToast('새 화면은 새 앱이 필요합니다 — 앱을 업데이트해 주세요'); return; }
      // 이미 받아 둔 같은 버전이 있으면 다시 받지 않는다
      let list = []; try { list = (await this.P.list()).bundles || []; } catch (e) {}
      let b = list.find(x => x.version === j.v && x.status !== 'error');
      if (!b) b = await this.P.download({ url: j.url, version: j.v });
      await this.P.next({ id: b.id });
      console.log('[OTA] 새 화면 준비됨', j.v);
      if (manual) App.showToast('새 화면을 받았습니다 — 앱을 다시 열면 바뀝니다', 'success');
    } catch (e) { console.warn('[OTA]', e && e.message); if (manual) App.showToast('화면 업데이트를 받지 못했습니다'); }
    finally { this._busy = false; }
  },
};
window.OTA = OTA;
OTA.start();
// 일반 화면(index.html)으로 왔으면 허브 모드 표시를 끈다(화면 꺼짐 막기 해제) — 허브 화면(hub.html)이 다시 켠다
try { const BN = window.Capacitor?.Plugins?.BashyNative; if (window.Capacitor?.isNativePlatform?.() && BN && BN.hubMode && !/hub\.html/.test(location.pathname)) BN.hubMode({ on: false }).catch(() => {}); } catch (e) {}

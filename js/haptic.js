// js/haptic.js — 손끝 진동(햅틱)
//
// 아이폰 앱들(미리알림·설정·사진)이 쓰는 규칙을 따른다 — 아무 데서나 떨지 않는다.
//   select  : 값이 한 칸 바뀔 때 (탭 전환, 요일·세그먼트·스위치, 끌기 중 자리가 바뀔 때) — 가장 약한 '틱'
//   light   : 가벼운 확정 (체크, 놓기, 밀어서 삭제 단추가 열릴 때)
//   medium  : 무언가를 '집었다' (길게 눌러 줄이 들릴 때, 음성 입력 시작)
//   success : 하루치를 다 끝냈을 때 (그날 습관 전부 완료 등)
//   warn    : 지우기처럼 되돌리기 어려운 일 직전
// 앱에서는 네이티브 Haptics 플러그인을, 안드로이드 웹에서는 진동 API 를 쓴다. 아이폰 사파리는 진동이 없다.
const Haptic = {
  get P() { return (typeof Platform !== 'undefined' && Platform.native && window.Capacitor?.Plugins?.Haptics) || null; },
  get on() { try { return localStorage.getItem('gl_haptic') !== 'false'; } catch (e) { return true; } },
  set on(v) { try { localStorage.setItem('gl_haptic', v ? 'true' : 'false'); } catch (e) {} },
  _v(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} },
  _last: 0,
  _go(fn, ms) {
    if (!this.on) return;
    const now = Date.now(); if (now - this._last < 35) return; this._last = now;   // 겹쳐 떨지 않게
    const P = this.P;
    if (P) { try { fn(P); } catch (e) {} } else this._v(ms);
  },
  select()  { this._go(P => P.selectionChanged ? (P.selectionStart?.(), P.selectionChanged(), P.selectionEnd?.()) : P.impact({ style: 'LIGHT' }), 5); },
  light()   { this._go(P => P.impact({ style: 'LIGHT' }), 8); },
  medium()  { this._go(P => P.impact({ style: 'MEDIUM' }), 14); },
  success() { this._go(P => P.notification({ type: 'SUCCESS' }), [10, 40, 14]); },
  warn()    { this._go(P => P.notification({ type: 'WARNING' }), [18, 50, 18]); },
};

// 화면 곳곳의 '값을 고르는' 단추에 틱을 붙인다 (손가락이 닿는 순간)
document.addEventListener('pointerdown', (e) => {
  const t = e.target.closest?.('.tab-btn, .set-sw, .set-seg button, .fit-day, .cal-panel-tab, .ib-tab, .ib-period, .seg button, .j-chip, .dk-act, .fit-tab');
  if (t) Haptic.select();
}, { passive: true });

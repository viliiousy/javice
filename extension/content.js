// bashy.app 에 로그인해 있으면 계정 연결 코드를 페이지에서 받아 저장한다 — 코드를 복사해 붙여 넣을 필요가 없다.
// 페이지에는 '확장이 있다' 는 표시(data-bashy-ext)만 남기고, 코드는 페이지가 postMessage 로 넘겨 줄 때만 받는다.
document.documentElement.dataset.bashyExt = chrome.runtime.getManifest().version;
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data;
  if (!d || d.type !== 'bashy-ext-code' || typeof d.code !== 'string') return;
  chrome.runtime.sendMessage({ type: 'set-code', code: d.code });
});

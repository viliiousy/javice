const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const NAMES = { claude: 'Claude', chatgpt: 'ChatGPT', higgsfield: 'Higgsfield' };

function ago(iso) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!isFinite(m)) return '';
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : `${Math.round(m / 60)}시간 전`;
}

function line(name, v, err, skip) {
  let body;
  if (err) body = `<span class="bad">${esc(err)}</span>`;
  else if (!v) body = `<span class="mut">${esc(skip || '아직 없음')}</span>`;
  else if (name === 'higgsfield') body = `<b>${v.credits}</b> 크레딧 남음${v.total ? ` / ${v.total}` : ''} <span class="mut">${esc(v.plan)}</span>`;
  else body = `5시간 <b>${v.h5 ? v.h5.pct + '%' : '-'}</b> · 7일 <b>${v.d7 ? v.d7.pct + '%' : '-'}</b> <span class="mut">${esc(v.plan)}</span>`;
  const when = v && v.at ? `<small class="mut">${ago(v.at)}</small>` : '';
  return `<div class="svc"><b>${NAMES[name]}</b><div>${body}<br>${when}</div></div>`;
}

async function render() {
  const { code, last } = await chrome.storage.local.get(['code', 'last']);
  if (code && !$('code').value) $('code').value = code;
  const L = last || {};
  $('list').innerHTML = Object.keys(NAMES).map(n =>
    line(n, (L.usage || {})[n], (L.errors || {})[n], (L.skipped || {})[n])).join('') +
    (L.sent ? `<small class="${L.sent.ok ? 'ok' : 'bad'}">${L.sent.ok ? '전송 완료 ' + ago(L.at) : '전송 실패: ' + esc(L.sent.error)}</small>` : '');
}

$('save').onclick = async () => {
  const code = $('code').value.trim();
  $('codeMsg').textContent = '확인 중…';
  const r = await chrome.runtime.sendMessage({ type: 'test-code', code });
  if (r && r.ok) {
    await chrome.storage.local.set({ code });
    $('codeMsg').className = 'ok'; $('codeMsg').textContent = '연결됨 ✓';
    await chrome.runtime.sendMessage({ type: 'collect-now' }); render();
  } else {
    $('codeMsg').className = 'bad'; $('codeMsg').textContent = (r && r.error) || '확인 실패';
  }
};
$('now').onclick = async () => { $('now').textContent = '읽는 중…'; await chrome.runtime.sendMessage({ type: 'collect-now' }); $('now').textContent = '지금 수집'; render(); };
render();

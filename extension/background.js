// Bashy 사용량 수집기 — 서비스 워커
//
// 이 확장은 '이미 로그인된 크롬' 을 빌려 쓴다. 비밀번호도, API 키도 쓰지 않는다.
// 각 사이트가 자기 화면에 사용량을 그릴 때 부르는 주소를 같은 쿠키로 부를 뿐이다.
// 사이트에서 받은 토큰은 그 사이트에만 다시 쓰고, bashy 로는 숫자(%·크레딧)만 보낸다.
//
//   Claude      /api/organizations → /api/organizations/<org>/usage
//   ChatGPT     /api/auth/session → /backend-api/wham/usage   (Codex·플러스 한도)
//   Higgsfield  higgsfield.ai 탭 안에서 /fnf/user 를 읽는다 (탭이 없으면 뒤에서 잠깐 열었다 닫는다)
//               (로그인 토큰이 페이지 안에서만 만들어지기 때문)
//
// 직접 부르기가 막히면(봇 차단 등) 열려 있는 그 사이트 탭 안에서 같은 호출을 한다.

const HUB = 'https://bashy.app/api/hub';
const EVERY_MIN = 5;

chrome.runtime.onInstalled.addListener(() => schedule());
chrome.runtime.onStartup.addListener(() => schedule());
function schedule() {
  chrome.alarms.create('collect', { periodInMinutes: EVERY_MIN, delayInMinutes: 0.2 });
}
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'collect') collectAll(); });

// Higgsfield 는 탭이 열려 있을 때만 읽을 수 있으니, 탭이 뜨면 바로 한 번 읽는다
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === 'complete' && /^https:\/\/higgsfield\.ai\//.test(tab.url || '')) {
    setTimeout(() => collectAll(['higgsfield']), 4000);
  }
});

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg && msg.type === 'collect-now') { collectAll().then(reply); return true; }
  if (msg && msg.type === 'test-code')   { testCode(msg.code).then(reply); return true; }
  return false;
});

// ── 공통 ────────────────────────────────────────────
async function getJSON(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', ...opts });
  if (!r.ok) throw new Error(`${new URL(url).host} HTTP ${r.status}`);
  return r.json();
}

// 탭 안(페이지 세계)에서 함수를 돌려 결과만 받는다.
// 열린 탭이 없으면 뒤쪽에 조용히 하나 열어 읽고 바로 닫는다 — 사용자가 탭을 열어 둘 필요가 없다.
async function inTab(urlPattern, func, openUrl = urlPattern.replace(/\*$/, '')) {
  const tabs = await chrome.tabs.query({ url: urlPattern });
  let tab = tabs.find(t => t.status === 'complete') || tabs[0], temp = null, tempWin = null;
  if (!tab) {
    if (!openUrl) return { skipped: '열린 탭 없음' };
    // 크롬 창이 하나도 없으면(맥에서 창을 다 닫아 둔 경우) tabs.create 가 실패한다.
    // 그때는 최소화된 창을 잠깐 만들어 읽고 창째 닫는다.
    const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
    if (wins.length) {
      temp = await chrome.tabs.create({ url: openUrl, active: false, pinned: false });
    } else {
      tempWin = await chrome.windows.create({ url: openUrl, focused: false, state: 'minimized' });
      temp = tempWin.tabs[0];
    }
    await waitLoaded(temp.id, 30000);
    await new Promise(r => setTimeout(r, 3000));   // 페이지가 로그인 토큰을 준비할 시간
    tab = temp;
  }
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func });
    if (!res || res.result == null) throw new Error('탭에서 결과를 못 받음');
    if (res.result.error) throw new Error(res.result.error);
    return res.result;
  } finally {
    if (tempWin) chrome.windows.remove(tempWin.id).catch(() => {});
    else if (temp) chrome.tabs.remove(temp.id).catch(() => {});
  }
}

function waitLoaded(tabId, ms) {
  return new Promise((resolve, reject) => {
    const done = (id, info) => { if (id === tabId && info.status === 'complete') { clear(); resolve(); } };
    const timer = setTimeout(() => { clear(); reject(new Error('페이지 로딩 시간 초과')); }, ms);
    const clear = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(done); };
    chrome.tabs.onUpdated.addListener(done);
    chrome.tabs.get(tabId).then(t => { if (t.status === 'complete') { clear(); resolve(); } }).catch(() => {});
  });
}

// ── Claude ─────────────────────────────────────────
function shapeClaude(orgName, u, caps) {
  const plan = (caps || []).find(c => /^claude_(max|pro|team|enterprise)/.test(c));
  const w = x => (x && x.utilization != null) ? { pct: x.utilization, reset: x.resets_at } : null;
  return { plan: plan ? plan.replace('claude_', '') : null, h5: w(u.five_hour), d7: w(u.seven_day), at: new Date().toISOString() };
}

async function claudeDirect() {
  const orgs = await getJSON('https://claude.ai/api/organizations');
  // 구독(채팅) 조직만 사용량이 있다. API 전용 조직은 403 을 준다.
  const list = (orgs || []).slice().sort((a, b) =>
    ((b.capabilities || []).includes('chat') ? 1 : 0) - ((a.capabilities || []).includes('chat') ? 1 : 0));
  for (const o of list) {
    try {
      const u = await getJSON(`https://claude.ai/api/organizations/${o.uuid}/usage`);
      if (u && (u.five_hour || u.seven_day)) return shapeClaude(o.name, u, o.capabilities);
    } catch (e) { /* 다음 조직 */ }
  }
  throw new Error('Claude 사용량 응답 없음');
}

async function claudeInTab() {
  const r = await inTab('https://claude.ai/*', async () => {
    try {
      const orgs = await fetch('/api/organizations').then(r => r.json());
      for (const o of orgs) {
        const r = await fetch(`/api/organizations/${o.uuid}/usage`);
        if (!r.ok) continue;
        const u = await r.json();
        if (u.five_hour || u.seven_day) return { u, caps: o.capabilities, name: o.name };
      }
      return { error: '사용량 응답 없음' };
    } catch (e) { return { error: String(e.message || e) }; }
  });
  if (r.skipped) throw new Error(r.skipped);
  return shapeClaude(r.name, r.u, r.caps);
}

// ── ChatGPT ────────────────────────────────────────
function shapeGpt(j) {
  const rl = j.rate_limit || {};
  const w = x => x ? { pct: x.used_percent, reset: x.reset_at } : null;
  return { plan: j.plan_type || null, h5: w(rl.primary_window), d7: w(rl.secondary_window), at: new Date().toISOString() };
}

async function gptDirect() {
  const s = await getJSON('https://chatgpt.com/api/auth/session');
  if (!s || !s.accessToken) throw new Error('ChatGPT 로그인 필요');
  const j = await getJSON('https://chatgpt.com/backend-api/wham/usage', {
    headers: { Authorization: 'Bearer ' + s.accessToken },
  });
  return shapeGpt(j);
}

async function gptInTab() {
  const j = await inTab('https://chatgpt.com/*', async () => {
    try {
      const s = await fetch('/api/auth/session').then(r => r.json());
      if (!s.accessToken) return { error: '로그인 필요' };
      const r = await fetch('/backend-api/wham/usage', { headers: { Authorization: 'Bearer ' + s.accessToken } });
      if (!r.ok) return { error: 'HTTP ' + r.status };
      const j = await r.json();
      return { plan_type: j.plan_type, rate_limit: j.rate_limit };   // 토큰은 돌려주지 않는다
    } catch (e) { return { error: String(e.message || e) }; }
  });
  if (j.skipped) throw new Error(j.skipped);
  return shapeGpt(j);
}

// ── Higgsfield ─────────────────────────────────────
async function higgsInTab() {
  const r = await inTab('https://higgsfield.ai/*', async () => {
    try {
      for (let i = 0; i < 40 && !(window.Clerk && window.Clerk.session); i++) await new Promise(r => setTimeout(r, 250));
      if (!window.Clerk || !window.Clerk.session) return { error: '로그인 필요' };
      const t = await window.Clerk.session.getToken();
      const r = await fetch('https://fnf-api-gw.higgsfield.ai/fnf/user', { headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) return { error: 'HTTP ' + r.status };
      const j = await r.json();
      const n = v => Number(v) || 0;
      const extra = n(j.package_credits) + n(j.bonus_credits) + n(j.daily_credits);
      return {
        plan: j.plan_type, credits: n(j.subscription_credits) + extra, extra,
        total: j.total_plan_credits, ends: j.plan_ends_at,
      };
    } catch (e) { return { error: String(e.message || e) }; }
  });
  if (r.skipped) return { skipped: r.skipped };
  return { ...r, at: new Date().toISOString() };
}

// ── 수집 → 전송 ────────────────────────────────────
async function tryBoth(direct, viaTab) {
  try { return await direct(); }
  catch (e1) {
    try { return await viaTab(); }
    catch (e2) { throw new Error(`${e1.message} / 탭: ${e2.message}`); }
  }
}

async function collectAll(only) {
  const want = n => !only || only.includes(n);
  const { code } = await chrome.storage.local.get('code');
  const usage = {}, errors = {}, skipped = {};

  const jobs = [];
  if (want('claude'))     jobs.push(tryBoth(claudeDirect, claudeInTab).then(v => usage.claude = v, e => errors.claude = e.message));
  if (want('chatgpt'))    jobs.push(tryBoth(gptDirect, gptInTab).then(v => usage.chatgpt = v, e => errors.chatgpt = e.message));
  if (want('higgsfield')) jobs.push(higgsInTab().then(v => v.skipped ? (skipped.higgsfield = v.skipped) : (usage.higgsfield = v), e => errors.higgsfield = e.message));
  await Promise.all(jobs);

  let sent = null;
  if (!code) sent = { error: '연결 코드가 없습니다' };
  else if (Object.keys(usage).length) {
    try {
      const r = await fetch(HUB, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ act: 'push', code, usage }),
      });
      const j = await r.json().catch(() => ({}));
      sent = r.ok ? { ok: true, saved: j.saved } : { error: j.error || `HTTP ${r.status}` };
    } catch (e) { sent = { error: e.message }; }
  }

  const prev = (await chrome.storage.local.get('last')).last || {};
  const last = { ...prev, at: new Date().toISOString(), errors, skipped, sent, usage: { ...(prev.usage || {}), ...usage } };
  await chrome.storage.local.set({ last });
  badge(errors, sent);
  return last;
}

function badge(errors, sent) {
  const bad = (sent && sent.error) || Object.keys(errors).length;
  chrome.action.setBadgeText({ text: bad ? '!' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#d9480f' });
}

async function testCode(code) {
  try {
    const r = await fetch(HUB, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'ping', code }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { error: j.error || `HTTP ${r.status}` };
  } catch (e) { return { error: e.message }; }
}

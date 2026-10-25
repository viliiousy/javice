// 옛 Vercel 배포 지우기 — 최근 10개만 남긴다(배포 저장 공간 10GB 한도).
// 배포마다 사이트 전체가 새로 저장되는데 하루에도 수십 번 올라가서 한도를 금방 채운다.
// 지금 bashy.app 에 걸린 배포(가장 최근 성공한 production)는 무슨 일이 있어도 남긴다.
const T = process.env.VERCEL_TOKEN, KEEP = Number(process.env.KEEP || 10), NAME = 'javice';
if (!T) { console.log('VERCEL_TOKEN 없음 — 건너뜀'); process.exit(0); }
const api = async (path, opt = {}) => {
  const r = await fetch('https://api.vercel.com' + path, { ...opt, headers: { Authorization: 'Bearer ' + T, ...(opt.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`${r.status} ${path} ${j?.error?.message || ''}`), { status: r.status });
  return j;
};
// 프로젝트가 있는 범위(개인 또는 팀)를 찾는다
let q = '';
try { await api(`/v9/projects/${NAME}`); }
catch (e) {
  const { teams = [] } = await api('/v2/teams');
  for (const t of teams) { try { await api(`/v9/projects/${NAME}?teamId=${t.id}`); q = `&teamId=${t.id}`; break; } catch (e2) {} }
  if (!q) { console.log('프로젝트를 찾지 못함 — 건너뜀'); process.exit(0); }
}
const all = []; let until = '';
for (let i = 0; i < 30; i++) {
  const j = await api(`/v6/deployments?projectId=${NAME}&limit=100${q}${until ? '&until=' + until : ''}`);
  all.push(...(j.deployments || []));
  if (!j.pagination || !j.pagination.next) break;
  until = j.pagination.next;
}
all.sort((a, b) => (b.createdAt || b.created) - (a.createdAt || a.created));
const live = all.find(d => d.target === 'production' && (d.state || d.readyState) === 'READY');
const keep = new Set(all.slice(0, KEEP).map(d => d.uid));
if (live) keep.add(live.uid);
const del = all.filter(d => !keep.has(d.uid) && !['BUILDING', 'QUEUED', 'INITIALIZING'].includes(d.state || d.readyState));
console.log(`배포 ${all.length}개 · 남김 ${keep.size}개 · 지움 ${del.length}개`);
let n = 0;
for (const d of del) {
  try { await api(`/v13/deployments/${d.uid}?${q.slice(1)}`, { method: 'DELETE' }); n++; }
  catch (e) { if (e.status === 429) { console.log('한 번에 지울 수 있는 개수(약 200개/10분)를 넘어 나머지는 다음 배포 때 지웁니다'); break; } console.log('못 지움', d.uid, e.message); }
}
console.log(`${n}개 지웠습니다`);

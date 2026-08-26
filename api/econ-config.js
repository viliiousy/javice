// api/econ-config.js — 경제알림 크론(price_watch.py)이 관심종목 설정을 읽어 가는 통로
//
// 예전에는 이 설정이 공개 레포의 config.json 이었고, 브라우저가 GitHub PAT 를
// localStorage 에 들고 있다가 직접 커밋했다. 토큰은 repo 쓰기 권한이라 위험했고
// 설정 자체도 누구나 읽을 수 있었다.
//
// 지금 설정은 bashy.app 안에서 UserStore('gl_econ_config') 로 관리되어
// /users/<FirebaseUID>/u_<구글ID>_gl_econ_config 에 들어간다.
// 그 값을 읽기만 하는 통로가 여기다. 쓰기는 제공하지 않는다 — 최소 권한.
//
// 인증: ECON_SECRET (economy 레포의 GitHub Secret 과 Vercel 환경변수에 같은 값)
// 서비스 계정 키는 Vercel 에만 남는다. economy 레포에는 이 읽기 전용 비밀만 준다.

const { fbGet } = require('../lib/fb-admin');

// 앱은 localStorage 키를 `u_<구글ID>_<키>` 로 저장하고 그대로 올린다.
// 이 접두사는 경로의 Firebase UID 와 다르다 — 추측하지 말고 실제 키에서 찾는다.
// (api/cron-notify.js 의 findPrefix 와 같은 이유다. 2026-08-24 에 이걸 놓쳐서 알림이 조용히 0건이 됐었다)
function findPrefix(keys) {
  for (const k of keys) {
    const m = k.match(/^(u_.+?_)gl_/);
    if (m) return m[1];
  }
  return null;
}

// shallow=true 는 키 이름만 준다. 사용자 데이터 전체(인바디 기록 등)를 받지 않기 위해서다.
async function configFor(uid) {
  const keys = await fbGet(`/users/${uid}.json?shallow=true`);
  if (!keys) return { uid, error: '사용자 데이터 없음' };
  const prefix = findPrefix(Object.keys(keys));
  if (!prefix) return { uid, error: '키 접두사를 찾지 못함' };
  const raw = await fbGet(`/users/${uid}/${prefix}gl_econ_config.json`);
  if (raw == null) return { uid, error: '설정 없음 (앱에서 종목을 한 번 담아 주세요)' };
  try {
    return { uid, config: typeof raw === 'string' ? JSON.parse(raw) : raw };
  } catch (e) {
    return { uid, error: 'JSON 파싱 실패: ' + e.message };
  }
}

module.exports = async (req, res) => {
  const secret = process.env.ECON_SECRET;
  if (!secret) { res.status(500).json({ error: 'ECON_SECRET 미설정' }); return; }
  if (req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const want = req.query?.uid;
    const uids = want ? [want] : Object.keys((await fbGet('/users.json?shallow=true')) || {});
    if (!uids.length) { res.status(404).json({ error: '등록된 사용자가 없습니다' }); return; }

    const all = [];
    for (const u of uids) {
      try { all.push(await configFor(u)); }
      catch (e) { all.push({ uid: u, error: e.message }); }
    }
    const hit = all.find(r => r.config);

    // 설정을 못 찾았는데 200 을 주면, 크론이 빈 관심종목으로 조용히 돌아간다.
    // 그러면 알림이 안 오는 게 정상인지 고장인지 구분할 수 없다 → 404 로 드러낸다.
    if (!hit) {
      res.status(404).json({ error: '설정을 찾지 못했습니다', tried: all.map(r => ({ uid: r.uid.slice(0,8)+'…', reason: r.error })) });
      return;
    }
    if (req.query?.all === '1') { res.status(200).json({ ok:true, results: all }); return; }
    res.status(200).json({ ok: true, uid: hit.uid, config: hit.config });
  } catch (e) {
    console.error('[econ-config]', e);
    res.status(500).json({ error: e.message });
  }
};

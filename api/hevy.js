// api/hevy.js — Hevy(운동 기록 앱) 연동
//
// 지금 이 파일이 하는 일은 '탐색' 하나뿐이다.
// 종목 이름은 영어("Shoulder Press (Dumbbell)")로 온다는 걸 확인했다.
// 이제 번역·매핑해야 할 이름이 몇 개인지 세야 뒤 작업의 크기가 나온다.
//
// API 키는 서버에만 둔다. 브라우저가 들고 있으면 공개된 것과 같고,
// Hevy API 에는 운동 기록을 만들고 지우는 엔드포인트도 있다 — 읽기 전용 키가 아니다.
//
// 탐색 모드는 HEVY_PROBE=1 이 켜져 있을 때만 응답한다. 확인이 끝나면 그 값을 지운다.
// 응답에는 종목 이름과 등장 횟수만 담는다. 날짜·메모·중량 값은 내보내지 않는다 —
// 지금 알아야 할 건 데이터의 모양이지 내용이 아니다.

const API = 'https://api.hevyapp.com/v1';

async function hevy(path) {
  const r = await fetch(API + path, {
    headers: { 'api-key': process.env.HEVY_API_KEY, 'Accept': 'application/json' },
  });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { /* 아래에서 head 로 확인한다 */ }
  // 실패했을 때 본문 앞부분만 남긴다. 통째로 흘리면 거기에 뭐가 섞여 있을지 모른다.
  return { status: r.status, body: body, head: text.slice(0, 200) };
}

module.exports = async function handler(req, res) {
  if (!process.env.HEVY_API_KEY) {
    res.status(500).json({ error: 'HEVY_API_KEY 미설정' });
    return;
  }
  // 켜져 있지 않으면 그냥 없는 주소처럼 굴게 한다. 401 은 '여기 뭔가 있다' 는 신호가 된다.
  if (process.env.HEVY_PROBE !== '1') {
    res.status(404).json({ error: 'not found' });
    return;
  }

  try {
    // 페이지를 끝까지 돌며 '종목 이름' 만 모은다. 기록 내용은 모으지 않는다.
    const seen = new Map();
    let workouts = 0, pages = 1;

    for (let p = 1; p <= pages && p <= 30; p++) {
      const r = await hevy('/workouts?page=' + p + '&pageSize=10');
      if (r.status !== 200) {
        res.status(502).json({ error: 'Hevy 응답 ' + r.status, head: r.head, page: p });
        return;
      }
      pages = (r.body && r.body.page_count) || 1;
      const list = (r.body && r.body.workouts) || [];
      for (const w of list) {
        workouts++;
        for (const e of (w.exercises || [])) {
          const k = e.exercise_template_id || e.title;
          if (!seen.has(k)) seen.set(k, { id: e.exercise_template_id, title: e.title, n: 0 });
          seen.get(k).n++;
        }
      }
    }

    const out = Array.from(seen.values()).sort((a, b) => b.n - a.n);
    res.status(200).json({ ok: true, pages: pages, workouts: workouts, distinct: out.length, exercises: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// api/hevy.js — Hevy(운동 기록 앱) 연동
//
// 지금 이 파일이 하는 일은 '탐색' 하나뿐이다.
// 종목 이름이 한국어("바벨 스쿼트")로 오는지 영어("Squat (Barbell)")로 오는지에 따라
// 뒤에 붙일 매핑 작업의 크기가 완전히 달라진다. 그것부터 확인하고 설계를 굳힌다.
//
// API 키는 서버에만 둔다. 브라우저가 들고 있으면 공개된 것과 같고,
// Hevy API 에는 운동 기록을 만들고 지우는 엔드포인트도 있다 — 읽기 전용 키가 아니다.
//
// 탐색 모드는 HEVY_PROBE=1 이 켜져 있을 때만 응답한다. 확인이 끝나면 그 값을 지운다.
// 응답에는 종목 이름과 세트 '개수' 만 담는다. 날짜·메모·중량 값은 내보내지 않는다 —
// 지금 알아야 할 건 데이터의 모양이지 내용이 아니다.

const API = 'https://api.hevyapp.com/v1';

async function hevy(path) {
  const r = await fetch(API + path, {
    headers: { 'api-key': process.env.HEVY_API_KEY, 'Accept': 'application/json' },
  });
  const text = await r.text();
  let body = null;
  try {
    // 페이지를 끝까지 돌며 '종목 이름' 만 모은다. 기록 내용(중량·횟수·날짜)은 모으지 않는다.
    // 알고 싶은 건 "번역해야 할 이름이 몇 개냐" 하나다.
    const seen = new Map();
    let workouts = 0, pages = 1;
    for (let p = 1; p <= pages && p <= 30; p++) {
      const r = await hevy('/workouts?page=' + p + '&pageSize=10');
      if (r.status !== 200) {
        res.status(502).json({ error: 'Hevy 응답 ' + r.status, head: r.head, page: p });
        return;
      }
      pages = (r.body && r.body.page_count) || 1;
      for (const w of (r.body && r.body.workouts) || []) {
        workouts++;
        for (const e of w.exercises || []) {
          const k = e.exercise_template_id;
          if (!seen.has(k)) seen.set(k, { id: k, title: e.title, n: 0 });
          seen.get(k).n++;
        }
      }
    }
    const list = [...seen.values()].sort((a, b) => b.n - a.n);
    res.status(200).json({ ok: true, pages, workouts, distinct: list.length, exercises: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

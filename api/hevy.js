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
  try { body = JSON.parse(text); } catch {}
  // 실패했을 때 본문 앞부분만 남긴다. 통째로 흘리면 거기에 뭐가 섞여 있을지 모른다.
  return { status: r.status, body, head: text.slice(0, 200) };
}

module.exports = async (req, res) => {
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
    const r = await hevy('/workouts?page=1&pageSize=5');
    if (r.status !== 200) {
      res.status(502).json({ error: 'Hevy 응답 ' + r.status, head: r.head });
      return;
    }

    const list = (r.body && r.body.workouts) || [];
    const w  = list[0] || null;
    const ex = w && w.exercises && w.exercises[0];

    res.status(200).json({
      ok: true,
      page_count: (r.body && r.body.page_count) != null ? r.body.page_count : null,
      workouts_in_page: list.length,
      // 스키마가 문서와 같은지 확인한다. 키 이름만 본다.
      workoutKeys:  w  ? Object.keys(w)  : [],
      exerciseKeys: ex ? Object.keys(ex) : [],
      setKeys:      ex && ex.sets && ex.sets[0] ? Object.keys(ex.sets[0]) : [],
      // 이름의 '언어' 와 세트가 실제로 채워져 오는지만 본다.
      titles: ((w && w.exercises) || []).slice(0, 12).map(e => ({
        title:     e.title,
        sets:      (e.sets || []).length,
        hasWeight: (e.sets || []).some(s => s.weight_kg != null),
        hasReps:   (e.sets || []).some(s => s.reps != null),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

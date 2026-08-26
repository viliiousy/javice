// lib/gcal.js — 서버에서 구글 캘린더 「오늘 일정」을 읽는다
//
// 브라우저 없이 동작한다. 리프레시 토큰이 /google_refresh/<구글 sub> 에 있으므로
// 크론이 앱을 열지 않고도 캘린더를 조회할 수 있다 (lib/google-oauth.js 참고).
//
// 실패는 반드시 형태를 구분해서 돌려준다. 예전에 "일정 0건"과 "권한 없음"과 "API 오류"가
// 전부 똑같이 조용한 0건으로 보여서 며칠을 헤맸다.
//   { events: [...] }              정상
//   { needConsent, reason }        서버에 리프레시 토큰이 없거나 철회됨 → 사용자 재동의 필요
//   { error, detail }              캘린더 API가 거절함 (범위 부족·쿼터 등) → 이건 버그다

const { accessTokenFor } = require('./google-oauth');

const TZ_MIN = 9 * 60;   // 한국 표준시. 서머타임이 없어 고정값으로 둔다.

// 한국 시간 기준 오늘 00:00 ~ 내일 00:00 을 RFC3339(UTC)로 만든다
function dayRange(now) {
  const base = now instanceof Date ? now : new Date();
  const kst  = new Date(base.getTime() + TZ_MIN * 60000);
  const y = kst.getUTCFullYear(), m = kst.getUTCMonth(), d = kst.getUTCDate();
  const startMs = Date.UTC(y, m, d) - TZ_MIN * 60000;
  return {
    date:    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    timeMin: new Date(startMs).toISOString(),
    timeMax: new Date(startMs + 86400000).toISOString(),
  };
}

// UTC ISO → 한국 시간 "HH:MM"
function hhmm(iso) {
  const d = new Date(new Date(iso).getTime() + TZ_MIN * 60000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

async function todayEvents(sub, opts) {
  const o   = opts || {};
  const tok = await accessTokenFor(sub);
  if (tok.needConsent) return { needConsent: true, reason: tok.reason || '리프레시 토큰 없음' };

  const { timeMin, timeMax, date } = dayRange(o.now);
  const u = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  u.searchParams.set('timeMin', timeMin);
  u.searchParams.set('timeMax', timeMax);
  u.searchParams.set('singleEvents', 'true');   // 반복 일정을 개별 건으로 펼친다
  u.searchParams.set('orderBy', 'startTime');   // singleEvents=true 일 때만 쓸 수 있다
  u.searchParams.set('maxResults', '25');

  const res = await fetch(u, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { error: `캘린더 API ${res.status}`, detail: body.slice(0, 160).replace(/\s+/g, ' ') };
  }

  const data   = await res.json().catch(() => ({}));
  const events = (data.items || [])
    .filter(e => e && e.status !== 'cancelled')
    .map(e => {
      const allDay = !!(e.start && e.start.date);
      const iso    = e.start && e.start.dateTime;
      return {
        title:  (e.summary || '(제목 없음)').trim(),
        allDay,
        time:   allDay ? '종일' : hhmm(iso),
        startMs: allDay ? 0 : new Date(iso).getTime(),
      };
    });

  return { events, date };
}

module.exports = { todayEvents, dayRange, hhmm };

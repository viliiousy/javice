// api/cron-notify.js — Web Push 알림 크론

// Firebase DB — 서비스 계정으로 인증해서 읽는다 (규칙을 잠근 뒤에도 동작)
const { fbGet, fbFetch } = require('../lib/fb-admin');

// 오늘 일정 조회 (서버에 보관된 리프레시 토큰 사용 — 앱을 열 필요가 없다)
const { todayEvents } = require('../lib/gcal');

// FCM v1 발송 — 토큰 캐시·시간 제한은 lib/fcm.js 에 있다 (api/test-push.js 와 같이 쓴다)
const fcm = require('../lib/fcm');

// 시세 알림(기준가 · 급변동 · 리포트 · 장 시작/마감) — 예전 텔레그램 봇을 옮겨 왔다
const { econAlerts } = require('../lib/econ-alerts');

// notification 블록을 빼고 data 로만 보낸다.
// notification 이 들어 있으면 브라우저·SDK 가 그것만으로도 알림을 띄울 수 있고,
// 우리 서비스워커도 따로 띄운다 — 같은 알림이 두 번 뜨는 흔한 원인이다.
// data 만 오는 메시지는 아무도 마음대로 띄우지 않는다. 띄우는 곳이 sw.js 한 군데로 정해진다.
//
// slot 을 같이 실어 보낸다. sw.js 가 이걸 알림 tag 로 써서,
// 같은 알림이 두 번 와도 하나로 합쳐지고 다른 알림끼리는 서로 안 덮는다.
async function sendFCM(fcmToken, title, body, slot) {
  const r = await fcm.send({ token:fcmToken,
    data:{ title:String(title), body:String(body), slot:String(slot||'') },
    webpush:{ fcm_options:{ link:'/' } },
    // 아이폰 앱: data 만 있는 메시지는 화면에 뜨지 않는다. APNs 알림 내용을 같이 싣는다(웹 푸시에는 영향 없음).
    apns:{ headers:{ 'apns-collapse-id':String(slot||'bashy').slice(0,64) },
      payload:{ aps:{ alert:{ title:String(title), body:String(body) }, sound:'default' } } } });
  const err = r.body?.error;
  return {
    ok:     r.status>=200 && r.status<300,
    status: r.status,
    // FCM은 죽은 토큰에 404 UNREGISTERED, 형식이 틀리면 400 INVALID_ARGUMENT 를 준다
    reason: err ? (err.details?.find(x=>x.errorCode)?.errorCode || err.status || err.message) : (r.error || null),
  };
}

// 앱은 localStorage 키를 `u_<구글ID>_<키>` 로 저장하고 그대로 Firebase에 올린다.
// 이 접두사는 경로의 Firebase UID와 다른 값이다 — 추측하지 말고 실제 키에서 찾아낸다.
// (2026-08-24 경로 이전 때 이걸 놓쳐서 습관·식단·할일 알림이 조용히 0건이 됐었다)
function findPrefix(userData) {
  for (const k of Object.keys(userData)) {
    const m = k.match(/^(u_.+?_)gl_/);
    if (m) return m[1];
  }
  return null;
}

// 접두사는 `u_<구글 계정 id>_` 이고, 그 id는 js/google-auth.js 의 userInfo.id — 곧 OAuth sub 다.
// 리프레시 토큰이 /google_refresh/<sub> 에 있으므로 그대로 열쇠로 쓸 수 있다.
// 다만 로그인 때 id를 못 받으면 이메일이 대신 들어간다. 그건 sub가 아니므로 숫자일 때만 신뢰한다.
function googleSubFromPrefix(prefix) {
  const m = /^u_(\d{6,})_$/.exec(prefix || '');
  return m ? m[1] : null;
}

// 등록 형태는 두 가지다.
//   신규: { settings, devices: { <기기id>: { token, ua, updatedAt } } }
//   구버전: { token, settings }            ← 기기 하나만 담을 수 있어 PC·폰이 서로 덮어썼다
function deviceList(data) {
  const out = [], skipped = [];
  const take = (id, token, ua, invalid, local) => {
    if (typeof token !== 'string' || !token) return;
    // 한 번 죽었다고 표시된 기기는 다시 두드리지 않는다.
    // 매번 재시도하면 매번 실패하고, 이 크론은 실패가 있으면 500 을 준다 —
    // 10분마다 도는 지금은 그게 곧 실패 메일 폭주다. 2026-08-26 에 겪었다.
    // 기기를 다시 등록하면 이 노드가 통째로 교체되면서 표식도 같이 사라진다.
    if (invalid) { skipped.push(id); return; }
    out.push({ id, token, ua: ua || '', local: !!local });
  };
  if (data.devices && typeof data.devices === 'object') {
    for (const [id, d] of Object.entries(data.devices)) {
      if (d) take(id, d.token, d.ua, d.invalid, d.local);
    }
  }
  take('legacy', data.token, '', data.invalid);
  return { devices: out, skipped };
}

// 못 쓰는 기기에 표식을 남긴다. 지우지 않는 이유는 재등록 시 통째로 교체되기 때문.
async function markInvalid(uid, devId, info) {
  const path = devId === 'legacy'
    ? `/fcm_tokens/${uid}/invalid.json`
    : `/fcm_tokens/${uid}/devices/${devId}/invalid.json`;
  await fbFetch(path, { method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ at: Date.now(), ...info }) }).catch(()=>{});
}

// 문자열 FCM 토큰, 또는 구버전 PushSubscription JSON 에서 토큰을 뽑는다
function toFcmToken(token) {
  if (token.startsWith('local_')) return null;
  if (token.startsWith('{')) {
    try {
      const sub = JSON.parse(token);
      if (sub.endpoint?.includes('fcm.googleapis.com')) {
        const last = sub.endpoint.split('/').pop();
        if (last && last.length > 30) return last;
      }
    } catch {}
    return null;   // 애플(web.push.apple.com) 엔드포인트는 FCM v1으로 못 보낸다
  }
  return token.length > 30 ? token : null;
}

function tokenShape(token) {
  if (token.startsWith('{')) {
    let host = '?';
    try { host = new URL(JSON.parse(token).endpoint).host; } catch {}
    return `구버전JSON(${host})`;
  }
  return `문자열(${token.length}자)`;
}

function dateStr(offsetHours=9) {
  const d = new Date(Date.now() + offsetHours*3600000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

async function processUser(uid, tokenData) {
  const settings = tokenData.settings;
  const tag = uid.slice(0,8) + '…';
  if(!settings?.enabled) return { sent:0, failed:0, detail:[`${tag} 알림 꺼짐`] };

  const { devices, skipped } = deviceList(tokenData);
  const skipNote = skipped.length ? [`${tag} 못 쓰는 기기 ${skipped.length}대 건너뜀 (${skipped.join(', ')})`] : [];
  if(!devices.length) return { sent:0, failed:0, detail:[...skipNote, `${tag} 쓸 수 있는 기기 없음`] };

  const now    = new Date(Date.now() + 9*3600000);
  const nowMin = now.getUTCHours()*60 + now.getUTCMinutes();
  const today  = dateStr();
  // 사용자 데이터 전체(인바디·메모·운동 기록…)를 10분마다 통째로 받지 않는다.
  // 키 이름만(shallow) 받아 접두사를 찾고, 필요한 칸만 따로 읽는다 (api/econ-config.js 와 같은 방식).
  const userKeys = await fbGet(`/users/${uid}.json?shallow=true`);
  if(!userKeys || typeof userKeys !== 'object') return { sent:0, failed:0, detail:[`${tag} 사용자 데이터 없음`] };

  const prefix = findPrefix(userKeys);
  if(!prefix) {
    console.error('[cron] 키 접두사를 찾지 못함, uid:', uid, '키샘플:', Object.keys(userKeys).slice(0,3));
    return { sent:0, failed:1, detail:[`${tag} 키 접두사 못 찾음`] };
  }

  const force = tokenData.force === true;

  // ── 언제 보낼지 ────────────────────────────────────────────────
  // 예전에는 '지금이 설정 시각 ±5분인가' 로 물었다. 크론이 매시 정각에만 도니
  // 분이 00~04 인 설정만 걸렸고, 21:30 으로 맞춰 둔 알림은 영영 오지 않았다.
  // 설정 화면은 <input type="time"> 이라 아무 분이나 고를 수 있는데 말이다.
  //
  // 게다가 GitHub Actions 의 예약 실행은 몇 분에서 몇십 분씩 밀린다.
  // 정각 설정마저 '크론이 제때 왔는가' 라는 운에 걸려 있었다.
  //
  // 그래서 질문을 바꿨다 — '지금이 그 시각인가' 가 아니라
  // '그 시각이 지났는가, 그리고 오늘 아직 안 보냈는가'.
  // 크론이 늦어도, 한 번 걸러도, 다음 실행이 대신 보낸다.
  // 표식(sent)이 있으니 두 번 가지 않는다.
  //
  // 다만 너무 늦은 것은 보내지 않는다. 21:30 리마인더가 새벽 2시에 오면
  // 안 오느니만 못하고, 크론이 반나절 멈췄다 살아나면 묵은 알림이 한꺼번에 쏟아진다.
  const LATE_LIMIT = 120;                 // 분 — 이보다 늦었으면 그냥 넘긴다
  const sentMap = tokenData.sent || {};
  const done    = new Set();              // 오늘 처리 끝난 칸 (보냈거나, 보낼 게 없었거나)

  // 분 단위로 직접 묻는 쪽. 약 알림은 '설정 시각' 이 아니라 '5분 전' '한 시간 뒤' 처럼
  // 계산된 시각이라 문자열이 아니라 분을 받는다.
  function dueAt(slot, targetMin) {
    if (force) return true;
    if (targetMin < 0) return false;
    if (nowMin < targetMin) return false;               // 아직 시간 전
    if (nowMin - targetMin > LATE_LIMIT) return false;  // 너무 늦었다
    return sentMap[slot] !== today;                     // 오늘 이미 처리했으면 끝
  }
  function due(slot, timeStr) {
    const p = String(timeStr || '09:00').split(':').map(Number);
    return dueAt(slot, (p[0]||0)*60 + (p[1]||0));
  }
  // 보낼 게 없다고 판정난 칸도 표식을 남긴다. 안 그러면 10분마다 같은 걸 다시 계산하고,
  // 캘린더는 구글 API를 헛되이 다시 부른다.
  const settle = (slot) => { if(!force) done.add(slot); };

  // 보낼 메시지를 먼저 다 만든 뒤, 등록된 모든 기기에 같은 내용을 보낸다
  const msgs  = [];
  const notes = [];        // 발송과 별개로 로그에 남길 설명 (조용히 사라지지 않게)
  let   quiet = 0;         // 알림은 못 만들었지만 "고장"인 경우의 수
  // 한 칸 읽기. 앱은 값을 JSON 문자열로 올린다 — 없으면 null.
  const readKey = async (k) => {
    if (!Object.prototype.hasOwnProperty.call(userKeys, k)) return null;
    return fbGet(`/users/${uid}/${encodeURIComponent(k)}.json`);
  };
  const parse = (v, def) => v == null ? def : (typeof v === 'string' ? JSON.parse(v || 'null') ?? def : v);
  const [rawHabits, rawChecked] = await Promise.all([
    readKey(`${prefix}gl_habits_list`), readKey(`${prefix}gl_habits_${today}`),
  ]);
  const habitList    = parse(rawHabits, []);
  const habitChecked = parse(rawChecked, []);

  // ── 약 ──────────────────────────────────────────────────────
  // 다른 습관과 달리 하나씩 따로 본다. '2개 남았어요' 는 어느 약인지 모르는 알림이라
  // 받고도 다시 앱을 열어 봐야 한다. 약은 이름과 시각이 알림 안에 있어야 한다.
  //
  // 초기화는 따로 안 한다 — 표식이 날짜라서 자정이 지나면 모든 칸이 저절로 다시 열린다.
  const dow = now.getUTCDay();                   // now 는 이미 KST 로 밀어 둔 시각
  const meds = habitList.filter(h => h && h.cat==='med' && h.notify !== false && h.time);
  for (const h of meds) {
    if (Array.isArray(h.days) && h.days.length && !h.days.includes(dow)) continue;
    if (h.createdAt   && today <  h.createdAt)   continue;
    if (h.deletedFrom && today >= h.deletedFrom) continue;
    if (habitChecked.includes(h.id)) continue;   // 먹었으면 더 조를 일이 없다

    const p = String(h.time).split(':').map(Number);
    const target = (p[0]||0)*60 + (p[1]||0);
    const nm = String(h.name||'약').slice(0,40);

    // 한 약은 한 번에 하나만. 예전에는 '5분 전' 과 '한 시간 뒤 재알림' 이 같은 실행에서
    // 둘 다 나갔다 — 크론이 밀려 09:00 에 처음 돌면 08:00 약의 pre(07:55, 65분 지각)와
    // h1(09:00, 정시)이 동시에 due 가 됐다. 약이 세 개면 여섯 개가 한꺼번에 울렸다.
    //
    // 재알림이 나갈 상황이면 '5분 전' 은 이미 뜻이 없다. 보내지 말고 조용히 처리만 해 둔다.
    let nag = null;
    for (let k = 1; k <= 12; k++) {
      const at = target + 60*k;
      if (at >= 24*60) break;
      // 크론이 반나절 멈췄다 살아나면 밀린 것을 몰아 보내게 되는데 그건 알림이 아니라 소음이다.
      if (dueAt(`med_${h.id}_h${k}`, at)) { nag = `med_${h.id}_h${k}`; break; }
    }
    const preDue = dueAt(`med_${h.id}_pre`, target - 5);

    if (nag) {
      if (preDue) settle(`med_${h.id}_pre`);      // 지나간 예고는 삼킨다
      msgs.push({ slot:nag, title:'💊 아직 약을 안 드셨어요', body:`${nm} · ${h.time} 이었어요` });
    } else if (preDue) {
      msgs.push({ slot:`med_${h.id}_pre`, title:'💊 약 먹을 시간', body:`${nm} · ${h.time}` });
    }
  }

  // ── 시각을 정해 둔 습관(약 말고) ─────────────────────────────
  // 습관 편집에서 '알림 설정하기' 로 켠 것. 그 시각에 아직 체크하지 않았으면 한 번 알린다.
  for (const h of habitList.filter(h => h && h.cat!=='med' && h.notify === true && h.time)) {
    if (Array.isArray(h.days) && h.days.length && !h.days.includes(dow)) continue;
    if (h.createdAt   && today <  h.createdAt)   continue;
    if (h.deletedFrom && today >= h.deletedFrom) continue;
    const slot = `hab_${h.id}`;
    const p = String(h.time).split(':').map(Number);
    if (!dueAt(slot, (p[0]||0)*60 + (p[1]||0))) continue;
    if (habitChecked.includes(h.id)) { settle(slot); continue; }
    msgs.push({ slot, title:`⏰ ${String(h.name||'습관').slice(0,40)}`, body:`${h.time} — 지금 할 시간입니다` });
  }

  if(settings.habits?.enabled && due('habits', settings.habits.time)) {
    // 약은 저 위에서 제 이름으로 따로 알리므로 여기서 또 세지 않는다.
    const list = habitList.filter(h => !(h && h.cat==='med' && h.notify !== false));
    const checked = habitChecked;
    const miss = list.filter(h=>!checked.includes(h.id));
    if(miss.length>0) msgs.push({slot:'habits', title:'✅ 습관 리마인더', body:`${miss.length}개 남았어요: ${miss.slice(0,2).map(h=>h.name).join(', ')}`});
    else settle('habits');                       // 다 했으면 조를 일이 없다
  }
  if(settings.diet?.enabled) {
    for(const [meal,t] of Object.entries({아침:settings.diet.아침||'09:00',점심:settings.diet.점심||'13:00',저녁:settings.diet.저녁||'19:00'})) {
      const slot = `diet_${meal}`;
      if(!due(slot, t)) continue;
      const diet=parse(await readKey(`${prefix}gl_diet_${today}`), {});
      if(!(diet[meal]?.length)) msgs.push({slot, title:`🥗 ${meal} 식단 기록`, body:`${meal}을 아직 기록하지 않으셨어요!`});
      else settle(slot);                         // 이미 먹은 걸 적었으면 끝
    }
  }
  if(settings.tasks?.enabled && due('tasks', settings.tasks.time)) {
    const dueTasks=[];
    // 할일은 어느 키에 들었는지 정해져 있지 않아 전부 훑어야 한다 — 이 칸이 due 일 때(하루 한 번)만 통째로 받는다.
    const userData = (await fbGet(`/users/${uid}.json`)) || {};
    Object.entries(userData).forEach(([k,v])=>{
      if(!k.startsWith(prefix)) return;
      try { const arr=JSON.parse(v); if(Array.isArray(arr)) arr.filter(t=>t.status==='needsAction'&&t.due?.startsWith(today)).forEach(t=>dueTasks.push(t.title)); } catch {}
    });
    if(dueTasks.length>0) msgs.push({slot:'tasks', title:'📋 오늘 마감 할일', body:`${dueTasks.length}개: ${dueTasks.slice(0,2).join(', ')}`});
    else settle('tasks');
  }
  // 📅 오늘 일정 — 구글 캘린더를 서버에서 직접 읽는다.
  // 예전 설정에 있던 minutesBefore(몇 분 전)는 구현된 적이 없다. 지정한 시각에
  // 오늘 일정을 묶어 보내는 방식이다.
  if(settings.calendar?.enabled && due('calendar', settings.calendar.time || '08:00')) {
    const sub = googleSubFromPrefix(prefix);
    if(!sub) {
      notes.push(`${tag} 캘린더: 접두사에서 구글 ID를 못 읽음 (${prefix})`);
      quiet++;
    } else {
      try {
        const r = await todayEvents(sub);
        if(r.needConsent) {
          // 버그가 아니라 사용자 조치 사항이다 → 실패로 세지 않되 로그에는 반드시 남긴다.
          // 하루 한 번만 남긴다 — 10분마다 같은 줄을 쌓아 봐야 읽히지 않는다.
          notes.push(`${tag} 캘린더: 서버 동의 없음 (${r.reason}) — 앱에서 캘린더 접근을 다시 허용해야 합니다`);
          settle('calendar');
        } else if(r.error) {
          notes.push(`${tag} 캘린더: ${r.error} ${r.detail||''}`);
          quiet++;                                 // 표식을 남기지 않는다 — 다음 실행에서 다시 해본다
        } else if(!r.events.length) {
          notes.push(`${tag} 캘린더: 오늘(${r.date}) 일정 없음`);
          settle('calendar');
        } else {
          const head = r.events.slice(0,3).map(e=>`${e.time} ${e.title}`).join(' · ');
          msgs.push({
            slot:  'calendar',
            title: `📅 오늘 일정 ${r.events.length}개`,
            body:  r.events.length>3 ? `${head} 외 ${r.events.length-3}건` : head,
          });
        }
      } catch(e) {
        notes.push(`${tag} 캘린더: 예외 ${e.message}`);
        quiet++;
      }
    }
  }

  // 💹 시세 알림 — 담은 종목의 기준가 · 급변동 · 정한 시각 리포트 · 장 시작/마감
  if (settings.econ?.enabled !== false) {
    try {
      const cfg = parse(await readKey(`${prefix}gl_econ_config`), null);
      if (cfg) { const E = await econAlerts(uid, cfg, today, nowMin, force); msgs.push(...E.msgs); notes.push(...E.notes.map(n => `${tag} ${n}`)); }
    } catch (e) { notes.push(`${tag} 시세 알림: ${e.message}`); }
  }

  // 처리 끝난 칸에 오늘 날짜를 남긴다. 이게 있어야 다음 실행이 같은 걸 또 보내지 않는다.
  // force(수동 테스트)일 때는 남기지 않는다 — 테스트 한 번이 그날 진짜 알림을 삼키면 안 된다.
  async function stamp() {
    for (const slot of done) {
      await fbFetch(`/fcm_tokens/${uid}/sent/${encodeURIComponent(slot)}.json`,
        { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(today) }).catch(()=>{});
    }
  }

  if(!msgs.length) {
    await stamp();
    return { sent:0, failed:quiet, detail:[...skipNote, ...notes, `${tag} 지금 보낼 알림 없음 (기기 ${devices.length}대)`] };
  }

  let sent=0, failed=quiet; const detail=[...skipNote, ...notes];
  for (const dev of devices) {
    const shape = tokenShape(dev.token);
    const fcm   = toFcmToken(dev.token);
    if(!fcm) {
      failed++;
      detail.push(`${tag}/${dev.id} ${shape} → FCM으로 보낼 수 없는 형식`);
      // 형식이 틀린 토큰은 다음에도 틀리다. 한 번 알리고 표식을 남겨 조용히 시킨다.
      await markInvalid(uid, dev.id, { status:0, reason:'UNSUPPORTED_TOKEN_FORMAT', shape });
      continue;
    }
    // 앱(아이폰·안드로이드)은 습관·식단·일정 알림을 기기 안에서 직접 울린다 — 서버는 시세 알림만 보낸다(같은 알림 두 번 방지)
    const list = dev.local ? msgs.filter(m => String(m.slot || '').startsWith('ec_')) : msgs;
    if (!list.length) continue;
    const results = await Promise.all(list.map(m => sendFCM(fcm, m.title, m.body, m.slot).then(r => ({...r, title:m.title, slot:m.slot}))));
    const ok   = results.filter(r=>r.ok);
    const fail = results.filter(r=>!r.ok);
    sent += ok.length; failed += fail.length;
    // 한 대라도 받았으면 그 칸은 오늘 몫을 다한 것으로 본다.
    for (const r of ok) if(!force && r.slot) done.add(r.slot);
    detail.push(`${tag}/${dev.id} ${shape} → 성공 ${ok.length} / 실패 ${fail.length}`);
    for (const f of fail) {
      console.error('[cron] 발송 실패:', dev.id, f.title, f.status, f.reason);
      detail.push(`    ${f.title}: ${f.status} ${f.reason||''}`);
    }
    const dead = fail.find(f => f.status === 404 || f.reason === 'UNREGISTERED' || f.reason === 'INVALID_ARGUMENT');
    if (dead) await markInvalid(uid, dev.id, { status: dead.status, reason: dead.reason || null });
  }

  // 기기가 모두 앱이면 습관·식단 같은 칸은 기기가 이미 울렸다 — 서버도 '처리됨' 으로 남겨 10분마다 다시 셈하지 않는다
  if (!force && devices.every(d => d.local)) for (const m of msgs) if (!String(m.slot || '').startsWith('ec_')) done.add(m.slot);
  await stamp();
  return { sent, failed, detail };
}

module.exports = async (req, res) => {
  // 비밀키를 반드시 요구한다. 예전에는 `auth &&` 때문에 헤더가 아예 없으면 통과했다.
  //
  // 열쇠가 둘이다.
  //   CRON_SECRET — 깃허브 액션이 쓴다. 저장소 시크릿에만 있고 바깥으로 안 나간다.
  //   PING_SECRET — 바깥 스케줄러(cron-job.org)가 쓴다.
  // 굳이 나눈 이유: 깃허브 예약 실행이 몇 시간씩 밀려서 바깥 스케줄러를 붙였는데,
  // 그러려면 열쇠를 남의 서비스 설정칸에 적어 둬야 한다. 그 하나가 새더라도
  // 깃허브 쪽까지 같이 뚫리면 안 된다. 이 열쇠로 할 수 있는 일은
  // '밀린 알림을 지금 보내라' 뿐이고, 그건 어차피 곧 일어날 일이다.
  const auth  = req.headers.authorization;
  const NAMES = ['CRON_SECRET', 'PING_SECRET'];
  const have  = NAMES.filter(n => process.env[n]);
  const secrets = have.map(n => process.env[n]);
  if(!secrets.length) { res.status(500).json({error:'CRON_SECRET 미설정'}); return; }
  if(!secrets.some(x => auth === `Bearer ${x}`)) {
    // 이름만 돌려준다(값은 절대 아니다). 401 이 났을 때 '내 값이 틀렸나' 와
    // '아직 배포에 안 올라왔나' 는 고치는 방법이 완전히 다른데, 그냥 Unauthorized 만
    // 보면 구분이 안 된다. Vercel 은 환경변수를 새 배포부터 적용하므로
    // 'Redeploy 를 깜빡했다' 가 실제로 가장 흔한 원인이다.
    res.status(401).json({ error:'Unauthorized', accepts: have });
    return;
  }
  // 식단 검색 함수를 데워 둔다 — 저장해 둔 식약처 DB(30MB)를 처음 읽는 데 3초쯤 걸려서, 10분마다 한 번 불러 놓는다
  try { fetch('https://bashy.app/api/food?q=%EB%B0%A5&rows=1').catch(() => {}); } catch (e) {}

  // ?devices=1 — 아무것도 보내지 않고 '등록 상태' 를 그대로 보여 준다.
  //
  // 이게 없어서 매번 막혔다. 크론은 200 을 주고 FCM 도 200 을 주는데 폰에는 안 뜨는 상황이
  // 실제로 있는데(토큰이 죽었는데 FCM 이 아직 받아 주는 경우), 그때 물어볼 곳이 없었다.
  // 알고 싶은 건 셋이다 — 이 기기가 언제 등록됐나, 오늘 어느 칸이 처리됐나, 설정이 켜져 있나.
  //
  // 토큰 값은 절대 내보내지 않는다. 길이와 모양만 준다 — 그것만으로 '문자열인가 구버전
  // JSON인가', '길이가 그럴듯한가' 는 다 판단할 수 있고, 값은 알아 봐야 쓸 데가 없다.
  if (req.query?.devices === '1') {
    try {
      const tokens = await fbGet('/fcm_tokens.json') || {};
      const today  = dateStr();
      const out = Object.entries(tokens).map(([uid, d]) => {
        const { devices, skipped } = deviceList(d || {});
        const sent = (d && d.sent) || {};
        // 오늘 처리된 칸과, 처리된 지 오래된 칸을 갈라 준다.
        // '어제 날짜로 멈춰 있다' 는 곧 '그날 이후로 크론이 이 칸을 못 건드렸다' 는 뜻이다.
        const todayDone = Object.keys(sent).filter(k => sent[k] === today).sort();
        const stale = {};
        for (const [k, v] of Object.entries(sent)) if (v !== today) stale[k] = v;
        return {
          uid: uid.slice(0, 8) + '…',
          enabled: !!(d && d.settings && d.settings.enabled),
          settings: d && d.settings ? Object.fromEntries(
            Object.entries(d.settings).filter(([k]) => k !== 'enabled')
              .map(([k, v]) => [k, v && typeof v === 'object'
                ? { enabled: v.enabled !== false, ...Object.fromEntries(Object.entries(v).filter(([kk]) => kk !== 'enabled')) }
                : v])) : null,
          devices: devices.map(x => ({
            id: x.id,
            shape: tokenShape(x.token),
            sendable: !!toFcmToken(x.token),
            ua: x.ua || null,
            updatedAt: (d.devices && d.devices[x.id] && d.devices[x.id].updatedAt)
              ? new Date(d.devices[x.id].updatedAt).toISOString() : null,
          })),
          invalidDevices: skipped,
          today,
          sentToday: todayDone,
          sentOlder: stale,
        };
      });
      res.status(200).json({ endpoint:'cron-notify', mode:'devices', now:new Date().toISOString(), users: out });
    } catch (e) {
      res.status(500).json({ ok:false, error:e.message });
    }
    return;
  }

  // ?check=1 — 알림을 보내지 않고 DB 인증만 점검한다 (배포 검증용)
  if (req.query?.check === '1') {
    try {
      const tokens = await fbGet('/fcm_tokens.json');
      const uids   = tokens ? Object.keys(tokens) : [];
      const fresh  = {};
      for (const u of uids) {
        try { fresh[u.slice(0,6)+'…'] = await fbGet(`/users/${u}/_savedAt.json`); }
        catch (e) { fresh[u.slice(0,6)+'…'] = 'ERR: '+e.message; }
      }
      res.status(200).json({ ok:true, auth:'service-account', 등록수:uids.length, savedAt:fresh });
    } catch (e) {
      res.status(500).json({ ok:false, error:e.message });
    }
    return;
  }

  const forceAll = req.query?.force === '1';

  try {
    const tokens = await fbGet('/fcm_tokens.json');
    if(!tokens) { res.status(200).json({endpoint:'cron-notify',success:true,sent:0,failed:0,detail:['등록된 기기 없음']}); return; }
    let sent=0, failed=0; const detail=[];
    for(const [uid,data] of Object.entries(tokens)) {
      try {
        const r = await processUser(uid, forceAll ? {...data, force:true} : data);
        if (typeof r === 'number') { sent += r; continue; }   // 아무것도 보낼 게 없던 경우
        sent += r.sent; failed += r.failed; detail.push(...r.detail);
      } catch(e) { failed++; detail.push(`${uid}: 예외 ${e.message}`); console.error(uid,e.message); }
    }
    // 실패를 조용히 넘기지 않는다 — 예전에는 시도 횟수를 성공으로 보고했고,
    // 워크플로는 HTTP 200만 보므로 계속 초록불이었다. 실패가 있으면 200을 주지 않는다.
    // endpoint 를 박아 둔다. 바깥 스케줄러에 작업이 둘이라 URL 을 서로 바꿔 넣기 쉬운데,
    // 그러면 둘 다 200 이 떠서 눈치채지 못한다 — 실제로 'hevy' 라 이름 붙인 작업이
    // 이쪽을 두드리고 있었고, 응답 모양을 뜯어보고서야 알았다.
    res.status(failed ? 500 : 200)
       .json({endpoint:'cron-notify', success:failed===0, sent, failed, detail, time:new Date().toISOString()});
  } catch(e) {
    console.error('[cron]',e);
    res.status(500).json({error:e.message});
  }
};

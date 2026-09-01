// api/cron-notify.js — Web Push 알림 크론

const https = require('https');
const crypto = require('crypto');

// Firebase DB — 서비스 계정으로 인증해서 읽는다 (규칙을 잠근 뒤에도 동작)
const { fbGet, fbFetch } = require('../lib/fb-admin');

// 오늘 일정 조회 (서버에 보관된 리프레시 토큰 사용 — 앱을 열 필요가 없다)
const { todayEvents } = require('../lib/gcal');

// VAPID 서명
function urlBase64ToBuffer(base64) {
  const padding = '='.repeat((4 - base64.length%4)%4);
  const b64 = (base64+padding).replace(/-/g,'+').replace(/_/g,'/');
  return Buffer.from(b64,'base64');
}

async function getVapidHeaders(subscription, subject, publicKey, privateKey, payload) {
  const endpoint  = new URL(subscription.endpoint);
  const audience  = `${endpoint.protocol}//${endpoint.host}`;
  const now       = Math.floor(Date.now()/1000);
  const exp       = now + 43200;
  const header    = Buffer.from(JSON.stringify({typ:'JWT',alg:'ES256'})).toString('base64url');
  const claims    = Buffer.from(JSON.stringify({aud:audience,exp,sub:subject})).toString('base64url');
  const unsigned  = `${header}.${claims}`;
  const sign      = crypto.createSign('SHA256');
  sign.update(unsigned);
  const sig       = sign.sign({key:privateKey,dsaEncoding:'ieee-p1363'},'base64url');
  const jwt       = `${unsigned}.${sig}`;

  return {
    Authorization: `vapid t=${jwt},k=${publicKey}`,
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    TTL: '86400',
  };
}

// ⚠️ 현재 어디서도 호출하지 않는다. 애플(web.push.apple.com) 엔드포인트로 보내려면
// VAPID 서명 + aes128gcm 암호화가 필요한데 아래 구현은 그렇지 않다. 되살릴 땐 새로 써야 한다.
async function sendWebPush(subscriptionStr, title, body) {
  let sub;
  try { sub = JSON.parse(subscriptionStr); } catch { return null; }
  if(!sub.endpoint || sub.endpoint.includes('fcm.googleapis.com')) {
    // FCM endpoint는 별도 처리 필요 - 스킵
    return null;
  }

  const payload = JSON.stringify({ notification: { title, body, icon:'/icons/icon-192.png' } });
  const url     = new URL(sub.endpoint);

  return new Promise((resolve) => {
    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method:   'POST',
      headers:  {
        Authorization: `key=${process.env.FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      }
    }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>resolve({ status:res.statusCode, body:d }));
    });
    req.on('error', e => resolve({ error:e.message }));
    req.write(JSON.stringify({ endpoint:sub.endpoint, keys:sub.keys, notification:{title,body} }));
    req.end();
  });
}

// FCM V1으로 발송 (FCM endpoint인 경우)
async function getAccessToken() {
  const sa  = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now()/1000);
  const claim = { iss:sa.client_email, scope:'https://www.googleapis.com/auth/firebase.messaging', aud:'https://oauth2.googleapis.com/token', iat:now, exp:now+3600 };
  const header  = Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const sign    = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const jwt = `${header}.${payload}.${sign.sign(sa.private_key,'base64url')}`;
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  return new Promise((resolve,reject)=>{
    const req=https.request({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}
    },res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve(JSON.parse(d).access_token));});
    req.on('error',reject); req.write(body); req.end();
  });
}

// notification 블록을 빼고 data 로만 보낸다.
// notification 이 들어 있으면 브라우저·SDK 가 그것만으로도 알림을 띄울 수 있고,
// 우리 서비스워커도 따로 띄운다 — 같은 알림이 두 번 뜨는 흔한 원인이다.
// data 만 오는 메시지는 아무도 마음대로 띄우지 않는다. 띄우는 곳이 sw.js 한 군데로 정해진다.
//
// slot 을 같이 실어 보낸다. sw.js 가 이걸 알림 tag 로 써서,
// 같은 알림이 두 번 와도 하나로 합쳐지고 다른 알림끼리는 서로 안 덮는다.
async function sendFCM(fcmToken, title, body, slot) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const accessToken = await getAccessToken();
  const payload = JSON.stringify({ message:{ token:fcmToken,
    data:{ title:String(title), body:String(body), slot:String(slot||'') },
    webpush:{ fcm_options:{ link:'/' } } } });
  return new Promise((resolve)=>{
    const opts={hostname:'fcm.googleapis.com',path:`/v1/projects/${sa.project_id}/messages:send`,method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${accessToken}`,'Content-Length':Buffer.byteLength(payload)}};
    const r=https.request(opts,resp=>{
      let d='';
      resp.on('data',c=>d+=c);
      resp.on('end',()=>{
        let body=null; try{ body=JSON.parse(d); }catch{}
        const err = body?.error;
        resolve({
          ok:     resp.statusCode>=200 && resp.statusCode<300,
          status: resp.statusCode,
          // FCM은 죽은 토큰에 404 UNREGISTERED, 형식이 틀리면 400 INVALID_ARGUMENT 를 준다
          reason: err ? (err.details?.find(x=>x.errorCode)?.errorCode || err.status || err.message) : null,
        });
      });
    });
    r.on('error',e=>resolve({ok:false,status:0,reason:e.message})); r.write(payload); r.end();
  });
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
  const take = (id, token, ua, invalid) => {
    if (typeof token !== 'string' || !token) return;
    // 한 번 죽었다고 표시된 기기는 다시 두드리지 않는다.
    // 매번 재시도하면 매번 실패하고, 이 크론은 실패가 있으면 500 을 준다 —
    // 10분마다 도는 지금은 그게 곧 실패 메일 폭주다. 2026-08-26 에 겪었다.
    // 기기를 다시 등록하면 이 노드가 통째로 교체되면서 표식도 같이 사라진다.
    if (invalid) { skipped.push(id); return; }
    out.push({ id, token, ua: ua || '' });
  };
  if (data.devices && typeof data.devices === 'object') {
    for (const [id, d] of Object.entries(data.devices)) {
      if (d) take(id, d.token, d.ua, d.invalid);
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
  const userData = await fbGet(`/users/${uid}.json`);
  if(!userData) return { sent:0, failed:0, detail:[`${tag} 사용자 데이터 없음`] };

  const prefix = findPrefix(userData);
  if(!prefix) {
    console.error('[cron] 키 접두사를 찾지 못함, uid:', uid, '키샘플:', Object.keys(userData).slice(0,3));
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
  const habitList    = JSON.parse(userData[`${prefix}gl_habits_list`]||'[]');
  const habitChecked = JSON.parse(userData[`${prefix}gl_habits_${today}`]||'[]');

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
      const diet=JSON.parse(userData[`${prefix}gl_diet_${today}`]||'{}');
      if(!(diet[meal]?.length)) msgs.push({slot, title:`🥗 ${meal} 식단 기록`, body:`${meal}을 아직 기록하지 않으셨어요!`});
      else settle(slot);                         // 이미 먹은 걸 적었으면 끝
    }
  }
  if(settings.tasks?.enabled && due('tasks', settings.tasks.time)) {
    const dueTasks=[];
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
    const results = await Promise.all(msgs.map(m => sendFCM(fcm, m.title, m.body, m.slot).then(r => ({...r, title:m.title, slot:m.slot}))));
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

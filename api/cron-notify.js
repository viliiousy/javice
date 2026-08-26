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

async function sendFCM(fcmToken, title, body) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const accessToken = await getAccessToken();
  const payload = JSON.stringify({ message:{ token:fcmToken, notification:{title,body}, webpush:{notification:{icon:'/icons/icon-192.png'},fcm_options:{link:'/'}}} });
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
  const out = [];
  if (data.devices && typeof data.devices === 'object') {
    for (const [id, d] of Object.entries(data.devices)) {
      if (d && typeof d.token === 'string' && d.token) out.push({ id, token: d.token, ua: d.ua || '' });
    }
  }
  if (typeof data.token === 'string' && data.token) out.push({ id: 'legacy', token: data.token, ua: '' });
  return out;
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

  const devices = deviceList(tokenData);
  if(!devices.length) return { sent:0, failed:0, detail:[`${tag} 등록된 기기 없음`] };

  const now    = new Date(Date.now() + 9*3600000);
  const hour   = now.getUTCHours();
  const min    = now.getUTCMinutes();
  const today  = dateStr();
  const userData = await fbGet(`/users/${uid}.json`);
  if(!userData) return { sent:0, failed:0, detail:[`${tag} 사용자 데이터 없음`] };

  const prefix = findPrefix(userData);
  if(!prefix) {
    console.error('[cron] 키 접두사를 찾지 못함, uid:', uid, '키샘플:', Object.keys(userData).slice(0,3));
    return { sent:0, failed:1, detail:[`${tag} 키 접두사 못 찾음`] };
  }

  const force = tokenData.force === true;

  // 시:분 파싱 후 현재 시각이 설정 시간 ±5분 이내인지 확인
  function timeMatches(timeStr, hour, min) {
    const parts = (timeStr || '09:00').split(':').map(Number);
    const hh = parts[0], mm = parts[1] || 0;
    return hour === hh && min >= mm && min < mm + 5;
  }

  // 보낼 메시지를 먼저 다 만든 뒤, 등록된 모든 기기에 같은 내용을 보낸다
  const msgs  = [];
  const notes = [];        // 발송과 별개로 로그에 남길 설명 (조용히 사라지지 않게)
  let   quiet = 0;         // 알림은 못 만들었지만 "고장"인 경우의 수
  if(settings.habits?.enabled) {
    if(force || timeMatches(settings.habits.time, hour, min)) {
      const list = JSON.parse(userData[`${prefix}gl_habits_list`]||'[]');
      const done = JSON.parse(userData[`${prefix}gl_habits_${today}`]||'[]');
      const miss = list.filter(h=>!done.includes(h.id));
      if(miss.length>0) msgs.push({title:'✅ 습관 리마인더', body:`${miss.length}개 남았어요: ${miss.slice(0,2).map(h=>h.name).join(', ')}`});
    }
  }
  if(settings.diet?.enabled) {
    for(const [meal,t] of Object.entries({아침:settings.diet.아침||'09:00',점심:settings.diet.점심||'13:00',저녁:settings.diet.저녁||'19:00'})) {
      if(force || timeMatches(t, hour, min)) {
        const diet=JSON.parse(userData[`${prefix}gl_diet_${today}`]||'{}');
        if(!(diet[meal]?.length)) msgs.push({title:`🥗 ${meal} 식단 기록`, body:`${meal}을 아직 기록하지 않으셨어요!`});
      }
    }
  }
  if(settings.tasks?.enabled) {
    if(force || timeMatches(settings.tasks.time, hour, min)) {
      const due=[];
      Object.entries(userData).forEach(([k,v])=>{
        if(!k.startsWith(prefix)) return;
        try { const arr=JSON.parse(v); if(Array.isArray(arr)) arr.filter(t=>t.status==='needsAction'&&t.due?.startsWith(today)).forEach(t=>due.push(t.title)); } catch {}
      });
      if(due.length>0) msgs.push({title:'📋 오늘 마감 할일', body:`${due.length}개: ${due.slice(0,2).join(', ')}`});
    }
  }
  // 📅 오늘 일정 — 구글 캘린더를 서버에서 직접 읽는다.
  // 예전 설정에 있던 minutesBefore(몇 분 전)는 구현된 적이 없다. 크론이 매시 정각에만 도니
  // 분 단위 예고를 지킬 수 없어서, 지정한 시각에 오늘 일정을 묶어 보내는 방식으로 바꿨다.
  if(settings.calendar?.enabled) {
    const calTime = settings.calendar.time || '08:00';
    if(force || timeMatches(calTime, hour, min)) {
      const sub = googleSubFromPrefix(prefix);
      if(!sub) {
        notes.push(`${tag} 캘린더: 접두사에서 구글 ID를 못 읽음 (${prefix})`);
        quiet++;
      } else {
        try {
          const r = await todayEvents(sub);
          if(r.needConsent) {
            // 버그가 아니라 사용자 조치 사항이다 → 실패로 세지 않되 로그에는 반드시 남긴다
            notes.push(`${tag} 캘린더: 서버 동의 없음 (${r.reason}) — 앱에서 캘린더 접근을 다시 허용해야 합니다`);
          } else if(r.error) {
            notes.push(`${tag} 캘린더: ${r.error} ${r.detail||''}`);
            quiet++;
          } else if(!r.events.length) {
            notes.push(`${tag} 캘린더: 오늘(${r.date}) 일정 없음`);
          } else {
            const head = r.events.slice(0,3).map(e=>`${e.time} ${e.title}`).join(' · ');
            msgs.push({
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
  }

  if(!msgs.length) {
    return { sent:0, failed:quiet, detail:[...notes, `${tag} 지금 보낼 알림 없음 (기기 ${devices.length}대)`] };
  }

  let sent=0, failed=quiet; const detail=[...notes];
  for (const dev of devices) {
    const shape = tokenShape(dev.token);
    const fcm   = toFcmToken(dev.token);
    if(!fcm) {
      failed++;
      detail.push(`${tag}/${dev.id} ${shape} → FCM으로 보낼 수 없는 형식`);
      continue;
    }
    const results = await Promise.all(msgs.map(m => sendFCM(fcm, m.title, m.body).then(r => ({...r, title:m.title}))));
    const ok   = results.filter(r=>r.ok);
    const fail = results.filter(r=>!r.ok);
    sent += ok.length; failed += fail.length;
    detail.push(`${tag}/${dev.id} ${shape} → 성공 ${ok.length} / 실패 ${fail.length}`);
    for (const f of fail) {
      console.error('[cron] 발송 실패:', dev.id, f.title, f.status, f.reason);
      detail.push(`    ${f.title}: ${f.status} ${f.reason||''}`);
    }
    // 죽은 기기는 그 기기 칸에만 표시한다. 지우지 않는 이유는 재등록 시 통째로 교체되기 때문.
    const dead = fail.find(f => f.status === 404 || f.reason === 'UNREGISTERED' || f.reason === 'INVALID_ARGUMENT');
    if (dead) {
      const path = dev.id === 'legacy'
        ? `/fcm_tokens/${uid}/invalid.json`
        : `/fcm_tokens/${uid}/devices/${dev.id}/invalid.json`;
      await fbFetch(path, { method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ at: Date.now(), status: dead.status, reason: dead.reason || null }) }).catch(()=>{});
    }
  }

  return { sent, failed, detail };
}

module.exports = async (req, res) => {
  // 비밀키를 반드시 요구한다. 예전에는 `auth &&` 때문에 헤더가 아예 없으면 통과했다.
  const auth   = req.headers.authorization;
  const secret = process.env.CRON_SECRET;
  if(!secret) { res.status(500).json({error:'CRON_SECRET 미설정'}); return; }
  if(auth !== `Bearer ${secret}`) { res.status(401).json({error:'Unauthorized'}); return; }

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
    if(!tokens) { res.status(200).json({success:true,sent:0,failed:0,detail:['등록된 기기 없음']}); return; }
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
    res.status(failed ? 500 : 200)
       .json({success:failed===0, sent, failed, detail, time:new Date().toISOString()});
  } catch(e) {
    console.error('[cron]',e);
    res.status(500).json({error:e.message});
  }
};

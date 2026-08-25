// api/cron-notify.js — Web Push 알림 크론

const https = require('https');
const crypto = require('crypto');

// Firebase DB — 서비스 계정으로 인증해서 읽는다 (규칙을 잠근 뒤에도 동작)
const { fbGet } = require('../lib/fb-admin');

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
    const r=https.request(opts,resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{try{resolve(JSON.parse(d));}catch{resolve(null);}});});
    r.on('error',e=>resolve({error:e.message})); r.write(payload); r.end();
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

function dateStr(offsetHours=9) {
  const d = new Date(Date.now() + offsetHours*3600000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

async function processUser(uid, tokenData) {
  const { token, settings } = tokenData;
  if(!token || !settings?.enabled) return 0;
  if(token.startsWith('local_')) return 0;

  const now    = new Date(Date.now() + 9*3600000);
  const hour   = now.getUTCHours();
  const min    = now.getUTCMinutes();
  const today  = dateStr();
  const userData = await fbGet(`/users/${uid}.json`);
  if(!userData) { console.log('[cron] 사용자 데이터 없음, uid:', uid); return 0; }

  const prefix = findPrefix(userData);
  if(!prefix) {
    // 키가 하나도 없거나 형식이 바뀐 경우. 조용히 0건으로 넘기면 또 못 보고 지나친다.
    console.error('[cron] 키 접두사를 찾지 못함, uid:', uid, '키샘플:', Object.keys(userData).slice(0,3));
    return 0;
  }
  console.log('[cron] uid:', uid, 'prefix:', prefix, '키:', Object.keys(userData).length);

  const sends = [];

  console.log('[cron] processUser uid:', uid, 'token:', token?.slice(0,20), 'force:', tokenData.force);
  console.log('[cron] settings:', JSON.stringify(settings).slice(0,100));

  // 토큰 파싱 (문자열 FCM 토큰 또는 구버전 Web Push JSON 구독 객체 처리)
  let fcmToken = null;
  if(token.startsWith('{')) {
    // 구버전: JSON.stringify(PushSubscription) 형태
    try {
      const sub = JSON.parse(token);
      if(sub.endpoint?.includes('fcm.googleapis.com')) {
        // FCM endpoint URL 끝에서 토큰 추출
        // e.g. https://fcm.googleapis.com/fcm/send/TOKEN
        const parts = sub.endpoint.split('/');
        const candidate = parts[parts.length - 1];
        if(candidate && candidate.length > 30) {
          fcmToken = candidate;
        }
      }
    } catch(e) {
      console.error('[cron] 토큰 JSON 파싱 실패:', e.message);
    }
  } else if(token && !token.startsWith('local_') && token.length > 30) {
    // 신규: Firebase SDK getToken()이 반환한 순수 FCM 토큰 문자열
    fcmToken = token;
  }

  console.log('[cron] fcmToken:', fcmToken ? fcmToken.slice(0,20)+'...' : 'NULL');
  if(!fcmToken) {
    console.log('[cron] 유효한 FCM 토큰 없음, uid:', uid);
    return 0;
  }

  const push = async (title, body) => {
    return sendFCM(fcmToken, title, body);
  };

  const force = tokenData.force === true;

  // 시:분 파싱 후 현재 시각이 설정 시간 ±5분 이내인지 확인
  function timeMatches(timeStr, hour, min) {
    const parts = (timeStr || '09:00').split(':').map(Number);
    const hh = parts[0], mm = parts[1] || 0;
    return hour === hh && min >= mm && min < mm + 5;
  }

  if(settings.habits?.enabled) {
    if(force || timeMatches(settings.habits.time, hour, min)) {
      const list = JSON.parse(userData[`${prefix}gl_habits_list`]||'[]');
      const done = JSON.parse(userData[`${prefix}gl_habits_${today}`]||'[]');
      const miss = list.filter(h=>!done.includes(h.id));
      if(miss.length>0) sends.push(push('✅ 습관 리마인더',`${miss.length}개 남았어요: ${miss.slice(0,2).map(h=>h.name).join(', ')}`));
    }
  }
  if(settings.diet?.enabled) {
    for(const [meal,t] of Object.entries({아침:settings.diet.아침||'09:00',점심:settings.diet.점심||'13:00',저녁:settings.diet.저녁||'19:00'})) {
      if(force || timeMatches(t, hour, min)) {
        const diet=JSON.parse(userData[`${prefix}gl_diet_${today}`]||'{}');
        if(!(diet[meal]?.length)) sends.push(push(`🥗 ${meal} 식단 기록`,`${meal}을 아직 기록하지 않으셨어요!`));
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
      if(due.length>0) sends.push(push('📋 오늘 마감 할일',`${due.length}개: ${due.slice(0,2).join(', ')}`));
    }
  }

  await Promise.all(sends);
  return sends.length;
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
    if(!tokens) { res.status(200).json({sent:0}); return; }
    let total=0;
    for(const [uid,data] of Object.entries(tokens)) {
      try { total += await processUser(uid, forceAll ? {...data, force:true} : data); } catch(e) { console.error(uid,e.message); }
    }
    res.status(200).json({success:true,sent:total,time:new Date().toISOString()});
  } catch(e) {
    console.error('[cron]',e);
    res.status(500).json({error:e.message});
  }
};

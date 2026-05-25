// api/cron-notify.js — Web Push 알림 크론

const https = require('https');
const crypto = require('crypto');

// Firebase DB
function fbGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${process.env.FIREBASE_DB_URL}${path}`);
    https.get({ hostname:url.hostname, path:url.pathname+url.search }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve(JSON.parse(d));}catch{resolve(null);} });
    }).on('error', reject);
  });
}

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
  const prefix = `u_${uid}_`;
  const userData = await fbGet(`/users/${uid}.json`);
  if(!userData) return 0;

  const sends = [];

  const push = async (title, body) => {
    // Web Push subscription 형식인지 FCM 토큰인지 판단
    if(token.startsWith('{')) {
      const sub = JSON.parse(token);
      if(sub.endpoint?.includes('fcm.googleapis.com')) {
        // FCM endpoint → FCM V1 API 사용
        const fcmReg = sub.endpoint.split('/').pop();
        return sendFCM(fcmReg, title, body);
      }
    } else if(token.length > 100) {
      return sendFCM(token, title, body);
    }
  };

  if(settings.habits?.enabled) {
    const [hh] = (settings.habits.time||'21:00').split(':').map(Number);
    if(hour===hh && min<5) {
      const list = JSON.parse(userData[`${prefix}gl_habits_list`]||'[]');
      const done = JSON.parse(userData[`${prefix}gl_habits_${today}`]||'[]');
      const miss = list.filter(h=>!done.includes(h.id));
      if(miss.length>0) sends.push(push('✅ 습관 리마인더',`${miss.length}개 남았어요: ${miss.slice(0,2).map(h=>h.name).join(', ')}`));
    }
  }
  if(settings.diet?.enabled) {
    for(const [meal,t] of Object.entries({아침:settings.diet.아침||'09:00',점심:settings.diet.점심||'13:00',저녁:settings.diet.저녁||'19:00'})) {
      const [hh]=t.split(':').map(Number);
      if(hour===hh && min<5) {
        const diet=JSON.parse(userData[`${prefix}gl_diet_${today}`]||'{}');
        if(!(diet[meal]?.length)) sends.push(push(`🥗 ${meal} 식단 기록`,`${meal}을 아직 기록하지 않으셨어요!`));
      }
    }
  }
  if(settings.tasks?.enabled) {
    const [hh]=(settings.tasks.time||'09:00').split(':').map(Number);
    if(hour===hh && min<5) {
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
  const auth = req.headers.authorization;
  if(auth && auth!==`Bearer ${process.env.CRON_SECRET}`) { res.status(401).json({error:'Unauthorized'}); return; }

  try {
    const tokens = await fbGet('/fcm_tokens.json');
    if(!tokens) { res.status(200).json({sent:0}); return; }
    let total=0;
    for(const [uid,data] of Object.entries(tokens)) {
      try { total += await processUser(uid,data); } catch(e) { console.error(uid,e.message); }
    }
    res.status(200).json({success:true,sent:total,time:new Date().toISOString()});
  } catch(e) {
    console.error('[cron]',e);
    res.status(500).json({error:e.message});
  }
};

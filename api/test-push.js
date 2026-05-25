// api/test-push.js — 테스트 푸시 (FCM V1)
const https = require('https');
const crypto = require('crypto');

async function getAccessToken() {
  const rawSA = process.env.FIREBASE_SERVICE_ACCOUNT;
  if(!rawSA) throw new Error('FIREBASE_SERVICE_ACCOUNT 없음');
  const sa = JSON.parse(rawSA);
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
    },res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{const p=JSON.parse(d);if(!p.access_token) reject(new Error('토큰없음:'+d)); else resolve(p.access_token);});});
    req.on('error',reject); req.write(body); req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.status(200).end();return;}

  let { token } = req.body||{};
  if(!token){res.status(400).json({error:'token required'});return;}

  // Web Push subscription에서 FCM 토큰 추출
  if(token.startsWith('{')) {
    try {
      const sub = JSON.parse(token);
      if(sub.endpoint?.includes('fcm.googleapis.com')) {
        token = sub.endpoint.split('/').pop();
      } else {
        res.status(400).json({error:'FCM endpoint 아님: '+sub.endpoint?.slice(0,50)});
        return;
      }
    } catch(e) { res.status(400).json({error:'토큰 파싱 실패'}); return; }
  }

  try {
    const sa       = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const accToken = await getAccessToken();
    const payload  = JSON.stringify({
      message:{
        token,
        notification:{title:'⚡ 자비스 알림 테스트',body:'알림이 정상 작동합니다! 🎉'},
        webpush:{notification:{icon:'/icons/icon-192.png'},fcm_options:{link:'/'}}
      }
    });
    const result = await new Promise((resolve)=>{
      const opts={hostname:'fcm.googleapis.com',path:`/v1/projects/${sa.project_id}/messages:send`,method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${accToken}`,'Content-Length':Buffer.byteLength(payload)}};
      const r=https.request(opts,resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>{try{resolve(JSON.parse(d));}catch{resolve({raw:d});}});});
      r.on('error',e=>resolve({error:e.message})); r.write(payload); r.end();
    });
    console.log('[test-push] result:', JSON.stringify(result));
    res.status(200).json(result);
  } catch(e) { res.status(500).json({error:e.message}); }
};

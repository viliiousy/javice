// api/test-push.js — 테스트 푸시 (FCM V1)
// 토큰 캐시·시간 제한·응답 파싱은 lib/fcm.js 에 있다 (api/cron-notify.js 와 같이 쓴다).
// 예전 구현은 토큰 응답 파싱을 콜백 안에서 해서, 구글이 JSON 이 아닌 응답을 주면 함수가 통째로 죽었다.
const fcm = require('../lib/fcm');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.status(200).end();return;}

  let { token } = req.body||{};
  if(typeof token !== 'string' || !token){res.status(400).json({error:'token required'});return;}

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
    const r = await fcm.send({
      token,
      notification:{title:'⚡ Bashy 알림 테스트',body:'알림이 정상 작동합니다! 🎉'},
      webpush:{notification:{icon:'/icons/icon-192.png'},fcm_options:{link:'/'}}
    });
    const result = r.body || (r.error ? {error:r.error} : {raw:r.raw});
    console.log('[test-push] result:', JSON.stringify(result));
    res.status(200).json(result);
  } catch(e) { res.status(500).json({error:e.message}); }
};

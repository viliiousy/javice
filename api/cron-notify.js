// api/cron-notify.js — FCM V1 API 사용 (매시간 크론)

const https = require('https');

// Google OAuth2 액세스 토큰 발급 (서비스 계정)
async function getAccessToken() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const now   = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  };

  // JWT 생성 (간단 구현)
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const toSign  = `${header}.${payload}`;

  const crypto = require('crypto');
  const sign   = crypto.createSign('RSA-SHA256');
  sign.update(toSign);
  const sig    = sign.sign(serviceAccount.private_key, 'base64url');
  const jwt    = `${toSign}.${sig}`;

  // 토큰 교환
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).access_token); } catch { reject(new Error('토큰 파싱 실패: ' + d)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// FCM V1 발송
async function sendPush(token, title, body) {
  const sa        = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const projectId = sa.project_id;
  const accToken  = await getAccessToken();

  const payload = JSON.stringify({
    message: {
      token,
      notification: { title, body },
      webpush: {
        notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', requireInteraction: false },
        fcm_options:  { link: '/' },
      },
    },
  });

  return new Promise((resolve) => {
    const opts = {
      hostname: 'fcm.googleapis.com',
      path:     `/v1/projects/${projectId}/messages:send`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${accToken}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', e => { console.error('[FCM]', e.message); resolve(null); });
    req.write(payload);
    req.end();
  });
}

// Firebase REST
function fbGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${process.env.FIREBASE_DB_URL}${path}`);
    https.get({ hostname: url.hostname, path: url.pathname + url.search }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on('error', reject);
  });
}

function dateStr(offset = 0) {
  const d = new Date(Date.now() + (9 + offset) * 3600000); // KST
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

async function processUser(uid, tokenData) {
  const { token, settings } = tokenData;
  if (!token || !settings?.enabled) return 0;

  const now    = new Date(Date.now() + 9 * 3600000); // KST
  const hour   = now.getUTCHours();
  const min    = now.getUTCMinutes();
  const today  = dateStr();
  const prefix = `u_${uid}_`;

  const userData = await fbGet(`/users/${uid}.json`);
  if (!userData) return 0;

  const sends = [];

  // 습관 리마인더
  if (settings.habits?.enabled) {
    const [hh, mm] = (settings.habits.time || '21:00').split(':').map(Number);
    if (hour === hh && min < 5) {
      const list  = JSON.parse(userData[`${prefix}gl_habits_list`] || '[]');
      const done  = JSON.parse(userData[`${prefix}gl_habits_${today}`] || '[]');
      const miss  = list.filter(h => !done.includes(h.id));
      if (miss.length > 0)
        sends.push(sendPush(token, '✅ 습관 리마인더', `${miss.length}개 남았어요: ${miss.slice(0,2).map(h=>h.name).join(', ')}`));
    }
  }

  // 식단 기록
  if (settings.diet?.enabled) {
    const times = { 아침: settings.diet.아침||'09:00', 점심: settings.diet.점심||'13:00', 저녁: settings.diet.저녁||'19:00' };
    for (const [meal, time] of Object.entries(times)) {
      const [hh, mm] = time.split(':').map(Number);
      if (hour === hh && min < 5) {
        const diet = JSON.parse(userData[`${prefix}gl_diet_${today}`] || '{}');
        if (!(diet[meal]?.length))
          sends.push(sendPush(token, `🥗 ${meal} 식단 기록`, `${meal}을 아직 기록하지 않으셨어요!`));
      }
    }
  }

  // 오늘 마감 할일
  if (settings.tasks?.enabled) {
    const [hh, mm] = (settings.tasks.time || '09:00').split(':').map(Number);
    if (hour === hh && min < 5) {
      const due = [];
      Object.entries(userData).forEach(([k, v]) => {
        if (!k.startsWith(prefix)) return;
        try {
          const arr = JSON.parse(v);
          if (Array.isArray(arr))
            arr.filter(t => t.status==='needsAction' && t.due?.startsWith(today)).forEach(t => due.push(t.title));
        } catch {}
      });
      if (due.length > 0)
        sends.push(sendPush(token, '📋 오늘 마감 할일', `${due.length}개: ${due.slice(0,2).join(', ')}`));
    }
  }

  await Promise.all(sends);
  return sends.length;
}

module.exports = async (req, res) => {
  const auth = req.headers.authorization;
  if (auth && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }

  try {
    const tokens = await fbGet('/fcm_tokens.json');
    if (!tokens) { res.status(200).json({ sent: 0 }); return; }

    let total = 0;
    for (const [uid, data] of Object.entries(tokens)) {
      try { total += await processUser(uid, data); } catch (e) { console.error(uid, e.message); }
    }
    res.status(200).json({ success: true, sent: total, time: new Date().toISOString() });
  } catch (e) {
    console.error('[cron]', e);
    res.status(500).json({ error: e.message });
  }
};

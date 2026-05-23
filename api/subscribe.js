// api/subscribe.js — FCM 토큰 저장

const https = require('https');

// Firebase에 FCM 토큰 저장
async function saveToken(uid, token, settings) {
  const dbUrl = process.env.FIREBASE_DB_URL;
  const data  = JSON.stringify({ token, settings, updatedAt: Date.now() });

  return new Promise((resolve, reject) => {
    const url  = new URL(`${dbUrl}/fcm_tokens/${uid}.json`);
    const opts = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'PATCH',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = https.request(opts, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { uid, token, settings } = req.body;
    if (!uid || !token) { res.status(400).json({ error: 'uid and token required' }); return; }
    await saveToken(uid, token, settings || {});
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('[subscribe]', e);
    res.status(500).json({ error: e.message });
  }
};

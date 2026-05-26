// api/subscribe.js — Web Push 구독 저장

const https = require('https');

async function fbPatch(path, data) {
  const url  = new URL(`${process.env.FIREBASE_DB_URL}${path}`);
  const body = JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname, path: url.pathname,
      method: 'PUT',
      headers: { 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body) }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.write(body); req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') { res.status(200).end(); return; }
  if(req.method !== 'POST') { res.status(405).json({ error:'Method not allowed' }); return; }

  try {
    const { uid, token, settings } = req.body;
    if(!uid || !token) { res.status(400).json({ error:'uid and token required' }); return; }
    await fbPatch(`/fcm_tokens/${uid}`, { token, settings: settings||{}, updatedAt: Date.now() });
    res.status(200).json({ success: true });
  } catch(e) {
    console.error('[subscribe]', e);
    res.status(500).json({ error: e.message });
  }
};

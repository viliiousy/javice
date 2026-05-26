// api/subscribe.js
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') { res.status(200).end(); return; }
  if(req.method !== 'POST') { res.status(405).json({ error:'Method not allowed' }); return; }

  try {
    const { uid, token, settings } = req.body;
    if(!uid || !token) { res.status(400).json({ error:'uid and token required' }); return; }

    const dbUrl = process.env.FIREBASE_DB_URL;
    const data  = JSON.stringify({ token, settings: settings||{}, updatedAt: Date.now() });
    const url   = `${dbUrl}/fcm_tokens/${uid}.json`;

    const response = await fetch(url, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    data,
    });

    const result = await response.json();
    console.log('[subscribe] Firebase 응답:', response.status, JSON.stringify(result).slice(0,100));
    res.status(200).json({ success: true, status: response.status });
  } catch(e) {
    console.error('[subscribe] 오류:', e.message);
    res.status(500).json({ error: e.message });
  }
};

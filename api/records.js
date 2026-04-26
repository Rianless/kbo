export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const REDIS_URL = process.env.KV_REST_API_URL;
  const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ error: 'Redis not configured' });
  }

  async function redisCmd(...args) {
    const r = await fetch(`${REDIS_URL}/${args.map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await r.json();
    return data.result;
  }

  async function redisCmdPost(cmd, ...args) {
    const r = await fetch(`${REDIS_URL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([cmd, ...args])
    });
    const data = await r.json();
    return data.result;
  }

  try {
    const { action, key } = req.query;

    // 전체 데이터 가져오기 (초기 로드)
    if (req.method === 'GET' && action === 'getAll') {
      const keys = await redisCmd('keys', 'kbo:*');
      if (!keys || keys.length === 0) return res.status(200).json({});
      const result = {};
      await Promise.all(keys.map(async k => {
        const val = await redisCmd('get', k);
        const shortKey = k.replace('kbo:', '');
        try { result[shortKey] = JSON.parse(val); } catch { result[shortKey] = val; }
      }));
      return res.status(200).json(result);
    }

    // 단일 키 저장
    if (req.method === 'POST' && action === 'set') {
      const body = req.body;
      const value = typeof body === 'string' ? body : JSON.stringify(body);
      await redisCmdPost('set', `kbo:${key}`, value);
      return res.status(200).json({ ok: true });
    }

    // 단일 키 삭제
    if (req.method === 'DELETE' && action === 'del') {
      await redisCmdPost('del', `kbo:${key}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

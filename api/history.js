import { Redis } from '@upstash/redis';
const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { password } = req.query;
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorised' });

    try {
      const ids = await redis.lrange('search_history', 0, 199);
      const items = await Promise.all(
        ids.map(async id => {
          try {
            const val = await redis.get(id);
            return typeof val === 'string' ? JSON.parse(val) : val;
          } catch(e) { return null; }
        })
      );
      return res.json({ history: items.filter(Boolean) });
    } catch(e) {
      return res.status(500).json({ error: 'Failed to load history' });
    }
  }

  if (req.method === 'POST') {
    const { question, answer, timestamp } = req.body;
    try {
      const id = `history:${Date.now()}`;
      await redis.set(id, JSON.stringify({ question, answer, timestamp: timestamp || new Date().toISOString() }));
      await redis.lpush('search_history', id);
      await redis.ltrim('search_history', 0, 199);
      return res.json({ ok: true });
    } catch(e) {
      return res.status(500).json({ error: 'Failed to save history' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}

import { Redis } from '@upstash/redis';
const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { password } = req.query;
  if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorised' });

  try {
    const ids = await redis.lrange('feedback_list', 0, 199);
    const items = await Promise.all(
      ids.map(async id => {
        try {
          const val = await redis.get(id);
          return typeof val === 'string' ? JSON.parse(val) : val;
        } catch(e) { return null; }
      })
    );
    res.json({ feedback: items.filter(Boolean) });
  } catch(e) {
    res.status(500).json({ error: 'Failed to load feedback' });
  }
}

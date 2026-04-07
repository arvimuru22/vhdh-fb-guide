import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const data = await kv.get('vhdh_kb');
      return res.json(data || { entries: [], urls: [] });
    } catch(e) {
      return res.status(500).json({ error: 'Failed to load knowledge base' });
    }
  }

  if (req.method === 'POST') {
    const { entries, urls, password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
    try {
      await kv.set('vhdh_kb', { entries: entries || [], urls: urls || [] });
      return res.json({ ok: true });
    } catch(e) {
      return res.status(500).json({ error: 'Failed to save knowledge base' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}

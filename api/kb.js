import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Helper to upsert vectors to Upstash Vector using REST API
async function upsertVectors(entries) {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) return; // Skip if vector not configured

  // Build vectors with text for auto-embedding
  const vectors = entries.map((entry, i) => ({
    id: `entry-${i}`,
    data: `${entry.category}\n${entry.content || ''}`.slice(0, 2000),
    metadata: { category: entry.category, index: i }
  }));

  // Upsert in batches of 10
  for (let i = 0; i < vectors.length; i += 10) {
    const batch = vectors.slice(i, i + 10);
    await fetch(`${url}/upsert-data`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    });
  }
}

// Helper to delete all existing vectors
async function resetVectors() {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) return;
  await fetch(`${url}/reset`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const data = await redis.get('vhdh_kb');
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
      // Save to Redis as before
      await redis.set('vhdh_kb', { entries: entries || [], urls: urls || [] });

      // Also update vector index for semantic search
      await resetVectors();
      if (entries && entries.length > 0) {
        await upsertVectors(entries);
      }

      return res.json({ ok: true });
    } catch(e) {
      console.error('Save error:', e);
      return res.status(500).json({ error: 'Failed to save knowledge base' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}

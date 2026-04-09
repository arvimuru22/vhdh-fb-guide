import { Redis } from '@upstash/redis';
const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, answer, rating, timestamp } = req.body;
  if (!question || !rating) return res.status(400).json({ error: 'Missing fields' });

  try {
    const id = `feedback:${Date.now()}`;
    const entry = { question, answer, rating, timestamp: timestamp || new Date().toISOString() };
    await redis.set(id, JSON.stringify(entry));
    await redis.lpush('feedback_list', id);
    await redis.ltrim('feedback_list', 0, 499); // Keep last 500

    // Send email alert on thumbs down
    if (rating === 'down') {
      const resendKey = process.env.RESEND_API_KEY;
      const alertEmail = process.env.ALERT_EMAIL;
      if (resendKey && alertEmail) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'VHDH EA <onboarding@resend.dev>',
            to: alertEmail,
            subject: '👎 VHDH EA — Thumbs down flagged',
            html: `
              <h2>A response was flagged as unhelpful</h2>
              <p><strong>Question:</strong> ${question}</p>
              <p><strong>Answer:</strong> ${answer}</p>
              <p><strong>Time:</strong> ${entry.timestamp}</p>
              <p>Log in to your admin panel to review and update the knowledge base.</p>
            `
          })
        });
      }
    }

    res.json({ ok: true });
  } catch(e) {
    console.error('Feedback error:', e);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
}

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { password } = req.body;
  const teamPassword = process.env.TEAM_PASSWORD;
  if (!teamPassword) return res.status(500).json({ error: 'Team password not configured' });
  res.json({ ok: password === teamPassword });
}

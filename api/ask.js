export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, history = [], kb = {} } = req.body;
  const entries = kb.entries || [];
  const urls = kb.urls || [];

  // Fetch URL content if relevant URLs exist
  let urlContent = '';
  if (urls.length > 0) {
    const fetchResults = await Promise.allSettled(
      urls.map(async (u) => {
        try {
          const r = await fetch(u.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VHDHBot/1.0)' },
            signal: AbortSignal.timeout(6000)
          });
          if (!r.ok) return null;
          const text = await r.text();
          const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
          return `[${u.label}] (${u.url})\n${clean}`;
        } catch(e) {
          return null;
        }
      })
    );
    urlContent = fetchResults
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)
      .join('\n\n---\n\n');
  }

  const kbText = entries.map(e => `[${e.category}]\n${e.content}`).join('\n\n---\n\n');

  const systemPrompt = `You are an experienced F&B operations assistant for the VHDH hotel team. Your job is to help team members handle any situation that comes up while their manager is away.

You have access to the manager's handover notes below. Use these as your primary reference — they contain venue-specific contacts, procedures, and instructions specific to this property.

Beyond the notes, apply your broad knowledge of hotel F&B operations, hospitality best practices, and common sense reasoning to give the best possible answer. If someone describes a complex situation, reason through it step by step and give practical, actionable advice.

Only say something isn't covered if it's genuinely venue-specific information (like a supplier contact or system password) that isn't in the notes. For operational questions, always try to help even if the exact answer isn't in the notes.

Be concise, practical, and direct. If the notes cover it, mention which category the info came from.

${kbText ? `HANDOVER NOTES:\n${kbText}` : 'No handover notes loaded yet.'}
${urlContent ? `\nREFERENCE CONTENT:\n${urlContent}` : ''}`;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: question }
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('Groq error:', JSON.stringify(data.error));
      return res.status(500).json({ answer: 'AI error: ' + data.error.message });
    }

    const answer = data.choices?.[0]?.message?.content || 'No response received.';
    res.json({ answer });
  } catch(e) {
    console.error('Ask error:', e.message);
    res.status(500).json({ answer: 'Something went wrong. Please try again.' });
  }
}

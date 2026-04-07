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
          // Strip HTML tags and trim
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

  const systemPrompt = `You are a knowledgeable assistant for the VHDH F&B team. You help team members understand their responsibilities and find information while their manager is away.

Answer questions using the handover notes and reference content provided below. Be concise, practical, and specific. If a step-by-step process is relevant, list the steps clearly. Always mention which category or source the information came from.

If the answer is not covered in the notes, say clearly: "This isn't covered in the handover notes — contact your manager directly." Do not make up information.

${kbText ? `HANDOVER NOTES:\n${kbText}` : ''}
${urlContent ? `\nREFERENCE CONTENT FROM LINKED SYSTEMS:\n${urlContent}` : ''}`;

  try {
    const messages = [
      ...history.slice(0, -1),
      { role: 'user', content: question }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages
      })
    });

    const data = await response.json();
    const answer = data.content?.[0]?.text || 'No response received.';
    res.json({ answer });
  } catch(e) {
    res.status(500).json({ error: 'AI request failed', answer: 'Something went wrong. Please try again.' });
  }
}

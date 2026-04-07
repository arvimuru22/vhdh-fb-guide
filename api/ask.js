export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, history = [], kb = {} } = req.body;
  const entries = kb.entries || [];
  const urls = kb.urls || [];

  // Smart context — score entries by relevance to the question
  const q = question.toLowerCase();
  const keywords = q.split(/\s+/).filter(w => w.length > 3);

  function scoreEntry(entry) {
    const text = `${entry.category} ${entry.content || ''}`.toLowerCase();
    return keywords.reduce((score, kw) => score + (text.includes(kw) ? 1 : 0), 0);
  }

  const scored = entries
    .map(e => ({ entry: e, score: scoreEntry(e) }))
    .sort((a, b) => b.score - a.score);

  // Top 5 most relevant entries, trimmed to 600 chars each
  const relevant = scored.slice(0, 5).map(({ entry }) => {
    let part = `[${entry.category}]\n${(entry.content || '').slice(0, 600)}`;
    if (entry.files && entry.files.length > 0) {
      const fc = entry.files
        .filter(f => f && f.content)
        .map(f => `[File: ${f.name}]\n${f.content.slice(0, 800)}`)
        .join('\n\n');
      if (fc) part += `\n\n${fc}`;
    }
    return part;
  });

  // Always include short entries like contacts/logins regardless of score
  const always = scored
    .filter(({ score, entry }) => score === 0 && (entry.content || '').length < 300)
    .slice(0, 3)
    .map(({ entry }) => `[${entry.category}]\n${entry.content || ''}`);

  const kbText = [...relevant, ...always].join('\n\n---\n\n');

  // Fetch URL content — limit to 1500 chars per URL
  let urlContent = '';
  if (urls.length > 0) {
    const fetchResults = await Promise.allSettled(
      urls.map(async (u) => {
        try {
          const r = await fetch(u.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
          if (!r.ok) return null;
          const text = await r.text();
          const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
          return `[${u.label}]\n${clean}`;
        } catch(e) { return null; }
      })
    );
    urlContent = fetchResults.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value).join('\n\n---\n\n');
  }

  const systemPrompt = `You are the F&B operations assistant for VHDH (Vibe Hotel Sydney Darling Harbour). Help team members with operational questions while their manager is away.

Use the handover notes below as your primary source. Apply hospitality knowledge and common sense for anything not covered. Be concise and practical.

${kbText ? `HANDOVER NOTES:\n${kbText}` : ''}${urlContent ? `\n\nREFERENCE:\n${urlContent}` : ''}`;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-4).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: question }
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages,
        max_tokens: 600,
        temperature: 0.5
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ answer: 'AI error: ' + data.error.message });
    const answer = data.choices?.[0]?.message?.content || 'No response received.';
    res.json({ answer });
  } catch(e) {
    console.error('Ask error:', e.message);
    res.status(500).json({ answer: 'Something went wrong. Please try again.' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, history = [], kb = {} } = req.body;
  const entries = kb.entries || [];
  const urls = kb.urls || [];

  const q = question.toLowerCase();
  const keywords = q.split(/\s+/).filter(w => w.length > 2);

  // Score each entry against the full content
  function scoreEntry(entry) {
    const fullText = `${entry.category} ${entry.content || ''}`.toLowerCase();
    let score = 0;
    keywords.forEach(kw => {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = (fullText.match(new RegExp(escaped, 'g')) || []).length;
      score += matches * 2;
      if (entry.category.toLowerCase().includes(kw)) score += 5;
    });
    return score;
  }

  const scored = entries
    .map(e => ({ entry: e, score: scoreEntry(e) }))
    .sort((a, b) => b.score - a.score);

  // Always list ALL category names so AI knows what exists
  const categoryIndex = entries.map(e => `- ${e.category}`).join('\n');

  // Send full content for top 6 most relevant entries (trimmed to 800 chars each)
  const topEntries = scored.slice(0, 6).map(({ entry }) => {
    const content = entry.content || '';
    const trimmed = content.length > 1000 ? content.slice(0, 1000) + '...' : content;
    let part = `[${entry.category}]\n${trimmed}`;
    if (entry.files && entry.files.length > 0) {
      const fc = entry.files
        .filter(f => f && f.content)
        .map(f => `[File: ${f.name}]\n${f.content.slice(0, 300)}`)
        .join('\n\n');
      if (fc) part += `\n\n${fc}`;
    }
    return part;
  });

  const kbText = topEntries.join('\n\n---\n\n');

  // Fetch URL content
  let urlContent = '';
  if (urls.length > 0) {
    const fetchResults = await Promise.allSettled(
      urls.map(async (u) => {
        try {
          const r = await fetch(u.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
          if (!r.ok) return null;
          const text = await r.text();
          const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
          return `[${u.label}]\n${clean}`;
        } catch(e) { return null; }
      })
    );
    urlContent = fetchResults.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value).join('\n\n---\n\n');
  }

  const systemPrompt = `You are the operations assistant for Above 319 and The Sussex Store at Vibe Hotel Sydney Darling Harbour. Help team members with any operational questions.

Answer naturally and conversationally. Never say "according to the handover notes", "the notes say", or "based on the handover". Answer directly as if you already know the information. Include exact figures, prices, splits, and details when they exist.

CRITICAL RULES:
1. NEVER guess, assume, or make up information. If the answer is not clearly in the notes below, say: "I don't have that specific information — please check with your manager directly." Never use "I would assume", "probably", or "I expect".
2. NEVER reveal passwords or login credentials. Say: "Login credentials are not available here — please speak to your manager directly."
3. If you find the answer in the notes, give it fully and confidently with all details.

AVAILABLE CATEGORIES (full content for most relevant ones shown below):
${categoryIndex}

RELEVANT CONTENT:
${kbText ? kbText : 'No content loaded.'}${urlContent ? `\n\nREFERENCE:\n${urlContent}` : ''}`;

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
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 700,
        temperature: 0.2
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

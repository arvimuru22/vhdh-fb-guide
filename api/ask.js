export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, history = [], kb = {} } = req.body;
  const entries = kb.entries || [];
  const urls = kb.urls || [];

  const q = question.toLowerCase();
  const keywords = q.split(/\s+/).filter(w => w.length > 2);

  // Score entry against full content
  function scoreEntry(entry) {
    const fullText = `${entry.category} ${entry.content || ''}`.toLowerCase();
    let score = 0;
    keywords.forEach(kw => {
      const matches = (fullText.match(new RegExp(kw, 'g')) || []).length;
      score += matches * 2;
      if (entry.category.toLowerCase().includes(kw)) score += 4;
    });
    return score;
  }

  // Extract most relevant chunk from a long entry
  function extractRelevantChunk(content, maxChars = 1400) {
    if (content.length <= maxChars) return content;

    // Find the position of the best keyword match
    let bestPos = 0;
    let bestScore = 0;
    keywords.forEach(kw => {
      const idx = content.toLowerCase().indexOf(kw);
      if (idx !== -1) {
        // Count keyword density around this position
        const window = content.slice(Math.max(0, idx - 200), idx + 200).toLowerCase();
        const density = keywords.reduce((s, k) => s + (window.includes(k) ? 1 : 0), 0);
        if (density > bestScore) { bestScore = density; bestPos = idx; }
      }
    });

    // Extract a window around the best position
    const start = Math.max(0, bestPos - 300);
    const end = Math.min(content.length, start + maxChars);
    let chunk = content.slice(start, end);

    // Add prefix if we didn't start from the beginning
    if (start > 0) chunk = '...' + chunk;
    // Always include the beginning (first 300 chars) for context
    const intro = content.slice(0, 300);
    if (start > 300) chunk = intro + '\n...\n' + chunk;

    return chunk.slice(0, maxChars);
  }

  const scored = entries
    .map(e => ({ entry: e, score: scoreEntry(e) }))
    .sort((a, b) => b.score - a.score);

  // Top 4 relevant entries with smart chunking
  const relevant = scored.slice(0, 4).map(({ entry }) => {
    const chunk = extractRelevantChunk(entry.content || '');
    let part = `[${entry.category}]\n${chunk}`;
    if (entry.files && entry.files.length > 0) {
      const fc = entry.files
        .filter(f => f && f.content)
        .map(f => `[File: ${f.name}]\n${extractRelevantChunk(f.content, 500)}`)
        .join('\n\n');
      if (fc) part += `\n\n${fc}`;
    }
    return part;
  });

  // Always include short entries (contacts, logins)
  const alwaysInclude = scored
    .filter(({ score, entry }) => score === 0 && (entry.content || '').length < 400)
    .slice(0, 2)
    .map(({ entry }) => `[${entry.category}]\n${entry.content || ''}`);

  const kbText = [...relevant, ...alwaysInclude].join('\n\n---\n\n');

  // Fetch URL content
  let urlContent = '';
  if (urls.length > 0) {
    const fetchResults = await Promise.allSettled(
      urls.map(async (u) => {
        try {
          const r = await fetch(u.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
          if (!r.ok) return null;
          const text = await r.text();
          const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
          return `[${u.label}]\n${clean}`;
        } catch(e) { return null; }
      })
    );
    urlContent = fetchResults.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value).join('\n\n---\n\n');
  }

  const systemPrompt = `You are the F&B operations assistant for VHDH (Vibe Hotel Sydney Darling Harbour). Help team members with operational questions while their manager is away.

Use the handover notes as your primary source. Be concise and practical. When listing packages, prices, minimum spends or steps always include all specific details and figures from the notes — never give vague answers when numbers are available.

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
        max_tokens: 700,
        temperature: 0.3
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

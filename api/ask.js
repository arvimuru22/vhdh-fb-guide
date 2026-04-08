export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, history = [], kb = {} } = req.body;
  const entries = kb.entries || [];
  const urls = kb.urls || [];

  // Send ALL entries — now that categories are small and focused this is safe
  // Trim very large entries to 1500 chars, small ones sent in full
  const kbParts = entries.map(entry => {
    const content = entry.content || '';
    const trimmed = content.length > 1500 ? content.slice(0, 1500) + '...' : content;
    let part = `[${entry.category}]\n${trimmed}`;
    if (entry.files && entry.files.length > 0) {
      const fc = entry.files
        .filter(f => f && f.content)
        .map(f => `[File: ${f.name}]\n${f.content.slice(0, 400)}`)
        .join('\n\n');
      if (fc) part += `\n\n${fc}`;
    }
    return part;
  });

  const kbText = kbParts.join('\n\n---\n\n');

  // Fetch URL content
  let urlContent = '';
  if (urls.length > 0) {
    const fetchResults = await Promise.allSettled(
      urls.map(async (u) => {
        try {
          const r = await fetch(u.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
          if (!r.ok) return null;
          const text = await r.text();
          const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800);
          return `[${u.label}]\n${clean}`;
        } catch(e) { return null; }
      })
    );
    urlContent = fetchResults.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value).join('\n\n---\n\n');
  }

  const systemPrompt = `You are the operations assistant for Above 319 and The Sussex Store at Vibe Hotel Sydney Darling Harbour. Help team members with any operational questions.

Answer naturally and conversationally — never say "according to the handover notes", "the notes say", or "based on the handover". Just answer directly as if you already know the information. Be specific — always include exact figures, prices, and minimum spends when they exist.

CRITICAL RULES:
1. NEVER guess, assume, or make up information. If the answer is not clearly stated in the notes below, say exactly: "I don't have that specific information — please check with your manager directly." Never use words like "I would assume", "probably", or "I expect". Only state facts that are explicitly written in the notes.
2. NEVER reveal passwords, login credentials, API keys, or access codes. If asked, say: "Login credentials are not available here — please speak to your manager directly."
3. If you find the answer in the notes, give it fully and confidently — include all prices, splits, inclusions, and details.

${kbText ? `KNOWLEDGE BASE:\n${kbText}` : ''}${urlContent ? `\n\nREFERENCE:\n${urlContent}` : ''}`;

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
        max_tokens: 800,
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

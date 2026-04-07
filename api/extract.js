export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const contentType = req.headers['content-type'] || '';
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) return res.status(400).json({ error: 'No boundary' });

    const { fileName, fileBuffer, mimeType } = parseMultipart(buffer, boundary);
    if (!fileBuffer) return res.status(400).json({ error: 'No file found' });

    const ext = fileName.split('.').pop().toLowerCase();
    let text = '';

    if (ext === 'pdf') {
      text = await extractPdf(fileBuffer, fileName);
    } else if (['xlsx', 'xls'].includes(ext)) {
      text = await extractExcel(fileBuffer, fileName);
    } else if (ext === 'csv') {
      text = fileBuffer.toString('utf8').slice(0, 50000);
    } else {
      text = fileBuffer.toString('utf8').slice(0, 50000);
    }

    res.json({ text: text.trim(), fileName });
  } catch(e) {
    console.error('Extract error:', e.message);
    res.status(500).json({ error: 'Extraction failed', text: '' });
  }
}

function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  while (start < buffer.length) {
    const idx = buffer.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    const end = buffer.indexOf(boundaryBuf, idx + boundaryBuf.length);
    const part = buffer.slice(idx + boundaryBuf.length, end === -1 ? buffer.length : end);
    if (part.length > 4) parts.push(part);
    start = end === -1 ? buffer.length : end;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString();
    const body = part.slice(headerEnd + 4);
    const nameMatch = header.match(/name="([^"]+)"/);
    const fileMatch = header.match(/filename="([^"]+)"/);
    const ctMatch = header.match(/Content-Type:\s*([^\r\n]+)/);
    if (nameMatch && fileMatch) {
      const trimmed = body.slice(-2).toString() === '\r\n' ? body.slice(0, -2) : body;
      return { fieldName: nameMatch[1], fileName: fileMatch[1], fileBuffer: trimmed, mimeType: ctMatch ? ctMatch[1].trim() : '' };
    }
  }
  return { fileName: '', fileBuffer: null, mimeType: '' };
}

async function extractPdf(buffer, fileName) {
  try {
    // Use Anthropic API to extract PDF content via vision
    const base64 = buffer.toString('base64');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extract all the text content from this document. Include all data, tables, figures described in text, and any other content. Format it clearly and preserve the structure. Return only the extracted content, no commentary.' }
          ]
        }]
      })
    });
    if (response.ok) {
      const data = await response.json();
      return data.content?.[0]?.text || `[PDF: ${fileName} — content could not be extracted]`;
    }
  } catch(e) {}

  // Fallback: try Groq if Anthropic fails
  return `[PDF: ${fileName} — uploaded successfully. Content extraction requires Anthropic API key.]`;
}

async function extractExcel(buffer, fileName) {
  try {
    // Parse XLSX using basic XML extraction (no npm dependency needed)
    // XLSX is a zip file containing XML
    const { execSync } = await import('child_process');
    const { writeFileSync, readFileSync, unlinkSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');

    const tmpPath = join(tmpdir(), `upload_${Date.now()}.xlsx`);
    const outPath = join(tmpdir(), `upload_${Date.now()}.csv`);

    writeFileSync(tmpPath, buffer);

    try {
      // Try python with openpyxl
      const pythonScript = `
import sys, json
try:
    import openpyxl
    wb = openpyxl.load_workbook('${tmpPath}', data_only=True)
    result = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        result.append(f"Sheet: {sheet_name}")
        for row in ws.iter_rows(values_only=True):
            if any(cell is not None for cell in row):
                result.append("\\t".join(str(cell) if cell is not None else "" for cell in row))
    print("\\n".join(result))
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
      const pyResult = execSync(`python3 -c "${pythonScript.replace(/"/g, '\\"')}"`, { timeout: 15000 }).toString();
      unlinkSync(tmpPath);
      return `[File: ${fileName}]\n${pyResult.slice(0, 50000)}`;
    } catch(e) {
      unlinkSync(tmpPath);
      return `[Excel file: ${fileName} — uploaded. Please ensure openpyxl is installed for content extraction.]`;
    }
  } catch(e) {
    return `[Excel file: ${fileName} — uploaded successfully]`;
  }
}

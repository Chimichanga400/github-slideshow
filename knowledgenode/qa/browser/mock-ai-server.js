/**
 * mockai.js — serves the app AND a fake OpenAI-compatible AI endpoint from the
 * SAME origin (the app's CSP allows connect-src 'self', so a same-origin
 * endpoint is reachable where a random localhost port would be blocked).
 *
 * This exercises the app's real network path — request building, HTTP, JSON
 * parsing, tag extraction, error handling — with deterministic replies and no
 * API key, no cost, no rate limits. It cannot judge answer QUALITY; that is the
 * one thing that needs a real key.
 *
 *   node mockai.js [port] [wwwdir]
 *   POST /v1/chat/completions   → canned reply chosen by prompt content
 *   POST /__fail/<code>/v1/...  → forces an HTTP error, to test failure paths
 */
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +(process.argv[2] || 8099);
const WWW = process.argv[3] || require('path').join(__dirname,'..','..','www');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
               '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webmanifest':'application/manifest+json' };

let calls = [];   // every request the app made, for assertions

/** Pick a canned reply based on what the app asked for. */
function reply(body) {
  const msgs = body.messages || [];
  const sys = String((body.system) || msgs.filter(m => m.role === 'system').map(m => m.content).join('\n'));
  const user = String(msgs.filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n'));
  const all = sys + '\n' + user;

  // Study coach — must exercise the FACT/SIGNAL/ACTION tag pipeline.
  if (/study coach|CONFIRMED FACTS|\[\[SIGNAL:/.test(all)) {
    let out = 'Start with Gross Income — it is your weakest topic and it is due for review today. Do one 30-minute pass tonight.';
    if (/december|exam date|how many hours|how much time/i.test(user))
      out += '\n[[FACT: exam dates = first week of December]]\n[[FACT: daily study time = 30 min morning + 30 min evening]]';
    if (/start|where should i/i.test(user)) out += '\n[[ACTION:startGuided|node=Gross Income]]';
    out += '\n[[SIGNAL:Student wants a concrete starting point; weakest area is Gross Income.]]';
    return out;
  }
  // Question extraction from an upload (revision questions / past paper).
  if (/Extract EVERY question|"questions":\[/.test(all)) {
    return JSON.stringify({ questions: [
      { question: 'Define gross income.', answer: 'The total amount received by or accrued to a resident, excluding capital receipts.' },
      { question: 'Match: 1. Dividends withholding tax\nA — 50%\nB — 20%\nC — 0%', answer: 'B — 20%' },
      { question: 'Calculate the taxable income of a resident earning R500 000 with R36 000 deductions.', answer: 'R464 000' },
    ] });
  }
  // Marking. The app states its output contract in the prompt, so honour that:
  // a batch call asks for {"results":[...]}, a single answer asks for a flat object.
  if (/"results"\s*:/.test(all)) {
    const n = Math.max(1, (all.match(/^\s*\d+\.\s+Question:/gm) || ['x']).length);
    return JSON.stringify({ results: Array.from({ length: n }, () => (
      { score: 82, correct: true, feedback: 'Good — you captured the key elements.', keyPointsMissed: [] })) });
  }
  if (/"keyPointsMissed"/.test(all)) {
    return JSON.stringify({ correct: true, score: 82, feedback: 'Good — you captured the key elements.', keyPointsMissed: [] });
  }
  // Lecture slides.
  if (/slide/i.test(all)) {
    return JSON.stringify({ slides: [
      { title: 'Gross Income', bullets: ['Total amount received or accrued', 'Excludes capital receipts'], narration: 'Gross income is the starting point of the tax calculation.' },
      { title: 'Worked example', bullets: ['Salary R360 000 is income', 'House sale is capital'], narration: 'Classify each receipt before summing.' },
    ] });
  }
  // Understanding check.
  if (/understanding|evaluate their answer|gaps/i.test(all)) {
    return JSON.stringify({ score: 70, feedback: 'Solid grasp of the definition; be clearer on the capital exclusion.', keyPointsMissed: ['capital nature exclusion'] });
  }
  // Note processing / generated questions.
  if (/recall|application/.test(all)) {
    return JSON.stringify({ recall: [{ question: 'What is gross income?', answer: 'Total received or accrued, excluding capital.', accept: ['total amount received'] }],
                            application: [{ question: 'A resident sells a factory. Is it gross income?', answer: 'No — capital in nature.' }] });
  }
  return 'Mock reply.';
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = u.pathname;

  // Forced-failure route so error handling can be tested.
  const failMatch = p.match(/^\/__fail\/(\d{3})(\/.*)$/);
  const forcedCode = failMatch ? +failMatch[1] : 0;
  if (failMatch) p = failMatch[2];

  if (req.method === 'POST' && /\/(chat\/completions|messages|generateContent)$/.test(p)) {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      let body = {}; try { body = JSON.parse(raw || '{}'); } catch (e) {}
      calls.push({ at: Date.now(), path: p, body });
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (forcedCode) { res.writeHead(forcedCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'Forced ' + forcedCode + ' for testing' } })); }
      const text = reply(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'mock', object: 'chat.completion', model: body.model || 'mock',
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        content: [{ type: 'text', text }],                       // Anthropic shape too
        candidates: [{ content: { parts: [{ text }] } }],        // Gemini shape too
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }));
    });
    return;
  }
  if (p === '/__calls') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(calls)); }
  if (p === '/__reset') { calls = []; res.writeHead(200); return res.end('ok'); }
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); return res.end(); }

  // Static files
  if (p === '/') p = '/index.html';
  const file = path.join(WWW, decodeURIComponent(p));
  if (!file.startsWith(WWW) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('mock AI + app on http://127.0.0.1:' + PORT));

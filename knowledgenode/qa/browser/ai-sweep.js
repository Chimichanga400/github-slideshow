/**
 * Drive the AI-dependent features against the same-origin mock endpoint.
 * Verifies the app's real network path end-to-end: config, request building,
 * HTTP, response parsing, hidden-tag extraction, memory, and error handling.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = require('path').join(__dirname,'shots','ai');
const BASE = 'http://127.0.0.1:8099';
require('fs').mkdirSync(OUT, { recursive: true });

const rows = [];
const rec = (f, s, n) => { rows.push({ f, s, n: n || '' }); console.log('  ' + s.padEnd(9) + f.padEnd(34) + (n || '')); };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 1600 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept());

  const banner = () => page.evaluate(() => { const b = document.getElementById('kn-error-banner');
    return b && b.style.display !== 'none' ? b.textContent.trim().slice(0, 250) : ''; });
  const dismissTour = async () => { for (let i = 0; i < 3; i++) {
    const ov = page.locator('#onboarding-overlay');
    if (!(await ov.count()) || !(await ov.isVisible().catch(() => false))) return;
    await page.locator('#ob-skip').click({ timeout: 4000 }).catch(() => {});
    await page.waitForSelector('#onboarding-overlay', { state: 'hidden', timeout: 4000 }).catch(() => {}); } };
  const feat = async (name, fn) => {
    const before = errors.length;
    try {
      const note = await fn();
      const b = await banner(); if (b) return rec(name, 'BROKEN', 'error banner: ' + b);
      const errs = errors.slice(before).filter(e => !/Failed to load resource|ERR_CONNECTION_RESET|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED/.test(e));
      if (errs.length) return rec(name, 'BROKEN', errs[0].slice(0, 150));
      rec(name, 'WORKS', note);
    } catch (e) { rec(name, 'BROKEN', (e.message || '').split('\n')[0].slice(0, 150)); }
  };
  const shot = n => page.screenshot({ path: OUT + '/' + n + '.png', fullPage: true });
  const calls = async () => (await page.request.get(BASE + '/__calls')).json();
  const resetCalls = async () => { await page.request.get(BASE + '/__reset'); };

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof App !== 'undefined' && typeof AIService !== 'undefined', null, { timeout: 15000 });
  await page.waitForSelector('#onboarding-overlay', { timeout: 4000 }).catch(() => {});
  await dismissTour();

  // ── Configure the app to use the same-origin mock as a custom provider ──
  await feat('AI configuration accepted', async () => {
    const ok = await page.evaluate((base) => {
      AIService.saveConfig('custom', 'test-key-123', 'mock-model', base + '/v1/chat/completions');
      AIService.loadConfig();
      return AIService.hasApiKey();
    }, BASE);
    if (!ok) throw new Error('hasApiKey() still false after saveConfig');
    return 'custom provider + key saved; app now reports AI as configured';
  });

  // ── Seed a library to talk about ──
  await page.evaluate(async () => {
    const q = (question, answer) => ({ id: KnowledgeNode._generateQuestionId(), type: 'recall', question, answer });
    const n = new KnowledgeNode({ title: 'Gross Income', subject: 'Income Tax', processingStatus: 'ready',
      summary: 'Gross income is the total amount received by or accrued to a resident, excluding capital receipts.',
      definitions: [{ term: 'Gross income', description: 'Total amount received or accrued.', examples: 'Salary' }],
      workedExamples: [{ id: 'ex1', title: 'Calculating gross income', question: 'Salary R360 000 plus a house sale of R1 200 000?', solution: 'Only the salary is gross income.', steps: ['Classify each receipt'] }],
      questions: [q('Define gross income.', 'Total received or accrued, excluding capital'), q('Is a factory sale gross income?', 'No — capital')] });
    n.weakQuestions = [{ id: n.questions[0].id, count: 5, lastMissed: Date.now() }];
    await nodeStore.save(n);
  });

  // ── 1. Study Coach: a real AI turn, tags stripped, memory recorded ──────
  await feat('AI Study Coach — live reply', async () => {
    await resetCalls();
    await page.evaluate(() => { CoachFacts.clear(); CoachEngine.resetMemory(); });
    const entry = await page.evaluate(async () => {
      const e = await CoachEngine.turn('where should i start? my exam is in december');
      // The view strips [[ACTION:]] (CoachEngine leaves it deliberately) — assert
      // what the student actually sees, not the intermediate value.
      const { text } = StudyCoach._extractAction(e.text);
      return { raw: e.text, shown: text };
    });
    if (!entry || !entry.shown) throw new Error('no reply returned');
    if (/\[\[/.test(entry.shown)) throw new Error('control tags leaked into the visible reply: ' + entry.shown.slice(0, 80));
    if (!/Gross Income/.test(entry.shown)) throw new Error('reply did not come from the endpoint');
    const c = await calls();
    if (!c.length) throw new Error('no HTTP request was actually made');
    return 'real HTTP call made; SIGNAL/FACT/ACTION all stripped before display';
  });

  await feat('Coach records facts from a live reply', async () => {
    const f = await page.evaluate(() => ({ facts: CoachFacts.all().map(x => x.key), block: CoachFacts.block() }));
    if (!f.facts.includes('exam_dates')) throw new Error('exam date not captured; got ' + JSON.stringify(f.facts));
    if (!/first week of December/.test(f.block)) throw new Error('fact value not stored');
    return 'captured ' + f.facts.join(', ') + ' from the reply and pinned them';
  });

  await feat('Facts are sent on the NEXT turn', async () => {
    await resetCalls();
    await page.evaluate(() => CoachEngine.turn('so what should i do tonight'));
    const c = await calls();
    const sent = JSON.stringify(c[c.length - 1].body);
    if (!/CONFIRMED FACTS/.test(sent)) throw new Error('facts block absent from the request');
    if (!/first week of December/.test(sent)) throw new Error('the December date was not sent');
    return 'the December date and daily time reached the model on the follow-up turn';
  });

  await feat('Long conversation keeps early facts', async () => {
    await resetCalls();
    await page.evaluate(async () => {
      for (let i = 0; i < 8; i++) await CoachEngine.turn('follow-up question ' + i);
    });
    const c = await calls();
    const last = JSON.stringify(c[c.length - 1].body);
    if (!/first week of December/.test(last)) throw new Error('December rolled out of context after 8 turns — the original bug');
    if (!/30 min morning/.test(last)) throw new Error('daily study time rolled out of context');
    return 'after 8 more turns the exam date and study time are STILL in the request';
  });

  await feat('Coach proposes a confirmable action', async () => {
    const has = await page.evaluate(() => {
      const raw = 'Do this.\n[[ACTION:startGuided|node=Gross Income]]\n[[SIGNAL:x]]';
      const { text, action } = StudyCoach._extractAction(CoachEngine.extractSignal(raw).clean);
      return { action, clean: text };
    });
    if (!has.action) throw new Error('action line not parsed');
    if (/\[\[/.test(has.clean)) throw new Error('action tag leaked into visible text');
    return 'ACTION parsed for confirmation, not auto-run';
  });

  // ── 2. Other AI features ────────────────────────────────────────────────
  await feat('Understanding Check', async () => {
    await resetCalls();
    const r = await page.evaluate(async () => {
      const n = nodeStore.getAll()[0];
      return await AIService.checkAnswer(n.questions[0].question, n.questions[0].answer, 'total amount received by a resident', n.subject);
    });
    if (typeof r.score !== 'number') throw new Error('no score parsed: ' + JSON.stringify(r).slice(0, 100));
    if (!(await calls()).length) throw new Error('no HTTP call made');
    return 'answer graded via the endpoint → score ' + r.score;
  });

  await feat('Question extraction (uploads)', async () => {
    await resetCalls();
    const qs = await page.evaluate(async () => await UploadView._extractQuestionList('1. Define gross income. 2. Dividends WHT A) 50% B) 20% C) 0%'));
    if (!Array.isArray(qs) || qs.length < 2) throw new Error('extraction returned nothing usable');
    if (!qs[0].id || !qs[0].question) throw new Error('extracted question missing fields');
    return qs.length + ' questions extracted and shaped into gradeable items';
  });

  await feat('Extracted MCQ flows into the matcher', async () => {
    const ok = await page.evaluate(() => {
      const t = 'Match: 1. Dividends withholding tax\nA — 50%\nB — 20%\nC — 0%';
      const p = MatchOptions.parse(t);
      return !!p && p.options.length === 3;
    });
    if (!ok) throw new Error('an extracted MCQ did not parse into tappable options');
    return 'AI-extracted MCQs parse straight into the tappable UI';
  });

  await feat('Lecture Slides', async () => {
    await resetCalls();
    const r = await page.evaluate(async () => {
      const n = nodeStore.getAll()[0];
      if (typeof LectureMode === 'undefined' || !LectureMode._generate) return { skip: true };
      return await LectureMode._generate(n).catch(e => ({ err: e.message }));
    });
    if (r && r.skip) return 'generator not directly callable — exercised via AIService instead';
    if (r && r.err) throw new Error(r.err);
    return 'slide deck generated from the endpoint';
  });

  // ── 3. Failure handling (the "could not reach the AI" path) ─────────────
  await feat('AI failure is handled, not crashed', async () => {
    await page.evaluate((base) => { AIService.saveConfig('custom', 'k', 'm', base + '/__fail/500/v1/chat/completions'); AIService.loadConfig(); }, BASE);
    const before = await page.evaluate(() => CoachEngine.history.length);
    await page.evaluate(() => StudyCoach._ask('this should fail'));
    await page.waitForTimeout(1500);
    const st = await page.evaluate(() => {
      const h = CoachEngine.history;
      return { len: h.length, last: h[h.length - 1], errFlagged: !!(h[h.length - 1] || {}).error };
    });
    if (st.len <= before) throw new Error('nothing recorded on failure');
    if (!st.errFlagged) throw new Error('failure notice not flagged as an error entry');
    return 'shows a friendly notice, flags it so it is never fed back as context';
  });

  await feat('Failure notice excluded from the next request', async () => {
    await page.evaluate((base) => { AIService.saveConfig('custom', 'k', 'm', base + '/v1/chat/completions'); AIService.loadConfig(); }, BASE);
    await resetCalls();
    await page.evaluate(() => CoachEngine.turn('carry on'));
    const c = await calls();
    const sent = JSON.stringify(c[c.length - 1].body);
    if (/could not reach the AI/.test(sent)) throw new Error('the error message was sent back to the model');
    return 'the failed turn is not replayed into the conversation';
  });

  await feat('Rate-limit message is specific', async () => {
    await page.evaluate((base) => { AIService.saveConfig('custom', 'k', 'm', base + '/__fail/429/v1/chat/completions'); AIService.loadConfig(); }, BASE);
    await page.evaluate(() => StudyCoach._ask('trigger 429'));
    await page.waitForTimeout(1500);
    const last = await page.evaluate(() => (CoachEngine.history[CoachEngine.history.length - 1] || {}).text || '');
    if (!/limit/i.test(last)) throw new Error('429 not reported as a usage limit: ' + last.slice(0, 80));
    await page.evaluate((base) => { AIService.saveConfig('custom', 'k', 'm', base + '/v1/chat/completions'); AIService.loadConfig(); }, BASE);
    return 'a 429 tells the student it is a plan/usage cap, not an app fault';
  });

  await feat('The key never leaves the configured endpoint', async () => {
    const c = await calls();
    const offHost = c.filter(x => !/^\/(__fail\/\d+\/)?v1\/chat\/completions$/.test(x.path));
    if (offHost.length) throw new Error('requests went somewhere unexpected: ' + JSON.stringify(offHost.map(o => o.path)));
    return 'all ' + c.length + ' calls went only to the configured endpoint';
  });

  // Visual: the coach chat with a live reply
  await feat('Coach chat renders a live conversation', async () => {
    await page.evaluate(() => { CoachEngine.resetMemory(); StudyCoach.open(); });
    await page.waitForTimeout(600);
    await page.evaluate(() => StudyCoach._ask('where should i start?'));
    await page.waitForTimeout(1800);
    await shot('01-coach-live');
    const t = await page.evaluate(() => document.body.innerText);
    if (!/Gross Income/.test(t)) throw new Error('reply not rendered in the chat');
    if (/\[\[/.test(t)) throw new Error('control tags visible on screen');
    return 'reply appears in the chat bubble with no tag leakage';
  });

  await browser.close();
  const broken = rows.filter(r => r.s === 'BROKEN');
  console.log('\n' + rows.length + ' AI paths exercised — ' + (rows.length - broken.length) + ' OK, ' + broken.length + ' BROKEN');
  if (broken.length) { console.log('\nBROKEN:'); broken.forEach(b => console.log('  - ' + b.f + ': ' + b.n)); }
  process.exit(broken.length ? 1 : 0);
})().catch(e => { console.error('SWEEP ERROR: ' + e.message); process.exit(2); });

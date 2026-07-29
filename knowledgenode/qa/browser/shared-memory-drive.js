/**
 * Shared memory: what the student tells the coach must be known by EVERY AI
 * surface — the tutor, the Director, gap analysis, understanding checks — not
 * just the chat it was said in. Nothing already explained should be asked twice
 * by any part of the app.
 *
 *   node mock-ai-server.js 8099 &
 *   node shared-memory-drive.js
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const BASE = 'http://127.0.0.1:8099';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.error('  ✗ ' + n + (x ? '  → ' + x : ''))); };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept());

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof AIService !== 'undefined' && typeof LearnerContext !== 'undefined', null, { timeout: 15000 });
  await page.evaluate(async (base) => {
    AIService.saveConfig('custom', 'k', 'm', base + '/v1/chat/completions');
    AIService.loadConfig();
    await nodeStore.save(new KnowledgeNode({ title: 'Gross Income', subject: 'Income Tax', processingStatus: 'ready',
      summary: 'Gross income is the total received or accrued.',
      questions: [{ id: KnowledgeNode._generateQuestionId(), type: 'recall', question: 'Define gross income.', answer: 'Total received or accrued' }] }));
    CoachFacts.clear(); CoachEngine.resetMemory();
  }, BASE);
  const calls = async () => (await page.request.get(BASE + '/__calls')).json();
  const reset = async () => { await page.request.get(BASE + '/__reset'); };

  console.log('Shared AI memory');

  console.log('1) The student tells the coach something once');
  await page.evaluate(() => CoachEngine.turn('my exams are in december and i can do 30 minutes morning and evening'));
  const facts = await page.evaluate(() => CoachFacts.all().map(f => f.key + '=' + f.value));
  ok('the coach recorded it', facts.some(f => /december/i.test(f)), JSON.stringify(facts));

  console.log('2) It is in the SHARED context every AI surface builds from');
  const inShared = await page.evaluate(() => LearnerContext.forSession());
  ok('LearnerContext.forSession() carries the facts', /CONFIRMED FACTS/.test(inShared));
  ok('the December date is in the shared context', /first week of December/.test(inShared));
  ok('the study time is in the shared context', /30 min morning/.test(inShared));

  console.log('3) Other AI features therefore know it too');
  await reset();
  await page.evaluate(async () => {
    try { await AIService.analyzeSessionGaps({ topic: 'Gross Income', score: 40 }, nodeStore.getAll()); } catch (e) {}
  });
  let c = await calls();
  ok('gap analysis made a call', c.length > 0);
  ok('gap analysis was told the December date', /first week of December/.test(JSON.stringify(c)), 'facts missing from gap analysis');

  await reset();
  await page.evaluate(async () => {
    const n = nodeStore.getAll()[0];
    try { await AIService.checkAnswer(n.questions[0].question, n.questions[0].answer, 'total received', n.subject, n); } catch (e) {}
  });
  c = await calls();
  ok('the understanding check made a call', c.length > 0);

  console.log('4) The tutor shares the same memory as the chat');
  await reset();
  await page.evaluate(async () => {
    const n = nodeStore.getAll()[0];
    CoachEngine.startTutor(n.id);
    await CoachEngine.turn('tutor me through this');
  });
  c = await calls();
  ok('tutoring is told the same facts', /first week of December/.test(JSON.stringify(c)), 'tutor did not receive the facts');
  const shared = await page.evaluate(() => ({ len: CoachEngine.history.length, mode: CoachEngine.mode.kind }));
  ok('tutoring runs on the same single conversation, not a separate one',
     shared.len >= 2 && shared.mode === 'tutor', JSON.stringify(shared));
  await page.evaluate(() => CoachEngine.end());

  console.log('5) Memory survives a full app restart');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof CoachFacts !== 'undefined', null, { timeout: 15000 });
  const after = await page.evaluate(() => {
    CoachEngine.loadHistory();
    return { facts: CoachFacts.all().length, ctx: LearnerContext.forSession(), hist: CoachEngine.history.length };
  });
  ok('facts survive the restart', after.facts >= 2, 'facts=' + after.facts);
  ok('every AI surface still sees them after the restart', /first week of December/.test(after.ctx));
  ok('the conversation survives the restart', after.hist >= 2, 'messages=' + after.hist);

  console.log('6) A correction replaces, so no AI is left with the stale value');
  await page.evaluate(() => CoachFacts.set('exam dates', 'moved to 15 January'));
  const corrected = await page.evaluate(() => LearnerContext.forSession());
  ok('the new value is in the shared context', /15 January/.test(corrected));
  ok('the old value is gone everywhere', !/first week of December/.test(corrected));

  console.log('7) Nothing broke');
  const b = await page.evaluate(() => { const el = document.getElementById('kn-error-banner');
    return el && el.style.display !== 'none' ? el.textContent.trim().slice(0, 200) : ''; });
  ok('no JS error banner', !b, b);
  ok('no uncaught page errors', errors.length === 0, errors[0] || '');

  await browser.close();
  console.log('\n' + (fail ? 'FAIL: ' + fail : 'ALL ' + pass + ' shared-memory checks passed'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });

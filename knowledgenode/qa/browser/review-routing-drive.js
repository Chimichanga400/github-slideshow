/**
 * Full calculations are hidden from review and kept for the exam.
 *
 * The important half of this is the second half: hiding them must not make them
 * disappear from the app, and every "due" counter must agree with what review
 * will actually serve — otherwise the app promises cards it then refuses to show.
 *
 *   node mock-ai-server.js 8099 &
 *   node review-routing-drive.js
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const OUT = path.join(__dirname, 'shots', 'routing');
const BASE = 'http://127.0.0.1:8099';
require('fs').mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.error('  ✗ ' + n + (x ? '  → ' + x : ''))); };

const CHRIS = 'Chris, whose age next birthday will be 65, donated a usufructuary interest in a house in East London '
  + 'valued at R 3 250 000 to his sister, Catherine (aged 57) and the bare dominium to his son Nicholas. '
  + 'Chris made no other donations in the year.\n\nCalculate the donations tax payable by Chris.';
const CHRIS_A = 'Value of usufruct:\nAnnual Value: 12% x R 3 250 000 = R 390 000\nPresent value based on life expectancy\nDonations tax = R 626 000';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 1400 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept());

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof App !== 'undefined' && typeof QuestionKind !== 'undefined', null, { timeout: 15000 });
  await page.waitForSelector('#onboarding-overlay', { timeout: 4000 }).catch(() => {});
  for (let i = 0; i < 3; i++) {
    const ov = page.locator('#onboarding-overlay');
    if (!(await ov.count()) || !(await ov.isVisible().catch(() => false))) break;
    await page.locator('#ob-skip').click({ timeout: 4000 }).catch(() => {});
    await page.waitForSelector('#onboarding-overlay', { state: 'hidden', timeout: 4000 }).catch(() => {});
  }

  // A topic holding both kinds, every card already due so nothing is hidden by scheduling.
  await page.evaluate(async ({ cq, ca }) => {
    const DAY = 86400000, now = Date.now();
    const q = (question, answer) => ({ id: KnowledgeNode._generateQuestionId(), type: 'recall', question, answer });
    const n = new KnowledgeNode({ title: 'Revision question 3', subject: 'Income Tax Returns', processingStatus: 'ready',
      questions: [
        q('Define gross income.', 'Total amount received or accrued, excluding capital receipts'),
        q('What annual value percentage is used to value a usufruct?', '12%'),
        q('Name one exclusion from gross income.', 'Receipts of a capital nature'),
        q(cq, ca),
      ] });
    n.questions.forEach(x => { n.srsState[x.id] = { repetitions: 2, interval: 3, ease: 2.4, nextReview: now - DAY, lastReview: now - 4 * DAY }; });
    n.weakQuestions = [{ id: n.questions[3].id, count: 5, lastMissed: now }];   // the calculation, previously struggled
    await nodeStore.save(n);
  }, { cq: CHRIS, ca: CHRIS_A });

  console.log('Routing calculations out of review');

  console.log('1) The node itself splits the two streams');
  const split = await page.evaluate(() => {
    const n = nodeStore.getAll()[0];
    return { review: n.reviewableQuestions().length, calc: n.calculationQuestions().length, total: n.questions.length };
  });
  ok('3 reviewable, 1 calculation, 4 in total', split.review === 3 && split.calc === 1 && split.total === 4, JSON.stringify(split));

  console.log('2) Review never serves the calculation');
  const sessions = await page.evaluate(() => {
    const nodes = nodeStore.getAll();
    const has = s => s.some(i => /Calculate the donations tax/.test(i.question.question));
    return {
      due:  has(ReviewView._buildDueSession(nodes)),
      all:  has(ReviewView._buildAllSession(nodes)),
      weak: has(ReviewView._buildWeakSession(nodes)),
      dueLen: ReviewView._buildDueSession(nodes).length,
    };
  });
  ok('not in today\'s session', sessions.due === false);
  ok('not in the All session', sessions.all === false);
  ok('not in Weak Spots, despite an old struggle record', sessions.weak === false);
  ok('the other three cards are still served', sessions.dueLen === 3, 'due session length=' + sessions.dueLen);

  console.log('3) Every due counter agrees with what review will serve');
  const counts = await page.evaluate(() => {
    const n = nodeStore.getAll()[0];
    const now = Date.now();
    let dash = 0;
    for (const q of n.reviewableQuestions()) {
      const s = n.srsState[q.id];
      if (s && s.repetitions > 0 && s.nextReview <= now) dash++;
    }
    return { due: n.dueQuestions().length, dash };
  });
  ok('dueQuestions() counts 3, not 4', counts.due === 3, 'due=' + counts.due);
  ok('the dashboard tally matches', counts.dash === counts.due, JSON.stringify(counts));

  await page.evaluate(() => App.navigateTo('review'));
  await page.waitForTimeout(900);
  const shown = await page.evaluate(() => document.body.innerText);
  ok('review tells the student where the calculation went', /kept out of review/i.test(shown), shown.slice(0, 200));
  ok('and points them at the exam', /Exam tab/i.test(shown));
  await page.screenshot({ path: OUT + '/01-review-note.png', fullPage: true });

  console.log('4) The exam still has it — nothing is lost');
  const inExam = await page.evaluate(() => {
    const nodes = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
    const s = CompetencyView._buildSession(nodes, 8);
    return { total: s.length, hasCalc: s.some(x => /Calculate the donations tax/.test(x.q.question)) };
  });
  ok('the calculation is in the exam paper', inExam.hasCalc, JSON.stringify(inExam));
  ok('the exam draws on all four questions', inExam.total === 4, 'paper=' + inExam.total);

  console.log('5) Mastery is not left permanently stuck');
  const mast = await page.evaluate(() => {
    const n = nodeStore.getAll()[0];
    return { score: n.computeMastery(), reviewable: n.reviewableQuestions().length };
  });
  ok('mastery still computes from reviewed cards', typeof mast.score === 'number' && mast.score >= 0, JSON.stringify(mast));

  console.log('6) Nothing broke');
  const b = await page.evaluate(() => { const el = document.getElementById('kn-error-banner');
    return el && el.style.display !== 'none' ? el.textContent.trim().slice(0, 200) : ''; });
  ok('no JS error banner', !b, b);
  ok('no uncaught page errors', errors.length === 0, errors[0] || '');

  await browser.close();
  console.log('\n' + (fail ? 'FAIL: ' + fail : 'ALL ' + pass + ' routing checks passed'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });

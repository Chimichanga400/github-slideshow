/**
 * Two display fixes, driven in a real browser:
 *
 *   1. Option letters get a closing bracket — "A Employees…" used to run the
 *      letter straight into the text; it now reads "A) Employees…".
 *   2. Weak-topic names on the exam Report Card are separate pills. They had no
 *      styling at all, so they collapsed into one unreadable run
 *      ("Revision question 8Revision question 7Revision question 6…").
 *
 *   node mock-ai-server.js 8099 &
 *   node option-labels-drive.js
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const OUT = path.join(__dirname, 'shots', 'labels');
const BASE = 'http://127.0.0.1:8099';
require('fs').mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.error('  ✗ ' + n + (x ? '  → ' + x : ''))); };

const BARE = 'Provisional tax is payable by:\n'
  + 'A Employees who earn salary income above R 1 million\n'
  + 'B Sole proprietors\n'
  + 'C Individuals (over the age of 65) who earn rental, interest or dividends of R 100 000\n'
  + 'D All of the above';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 1400 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept());

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof App !== 'undefined' && typeof KNText !== 'undefined', null, { timeout: 15000 });
  await page.waitForSelector('#onboarding-overlay', { timeout: 4000 }).catch(() => {});
  for (let i = 0; i < 3; i++) {
    const ov = page.locator('#onboarding-overlay');
    if (!(await ov.count()) || !(await ov.isVisible().catch(() => false))) break;
    await page.locator('#ob-skip').click({ timeout: 4000 }).catch(() => {});
    await page.waitForSelector('#onboarding-overlay', { state: 'hidden', timeout: 4000 }).catch(() => {});
  }

  console.log('Option labels and topic pills');

  console.log('1) Bare-letter options are labelled "A)" when shown as text');
  const labelled = await page.evaluate(t => KNText.html(t), BARE);
  ok('"A)" appears', /A\)/.test(labelled), labelled.slice(0, 90));
  ok('every option is bracketed', ['A','B','C','D'].every(L => labelled.includes(L + ')')));
  ok('the letter no longer runs into the option text', !/A Employees/.test(labelled));
  ok('the option text itself is intact', /Employees who earn salary income/.test(labelled));
  ok('the stem is untouched', /Provisional tax is payable by:/.test(labelled));
  const prose = await page.evaluate(() => KNText.html('A resident must pay tax.\nBecause of the rule.\nCarry on.'));
  ok('ordinary prose is not relabelled', !/A\)/.test(prose), prose.slice(0, 70));

  console.log('2) The same question becomes tappable choices in a quiz');
  // Seed the whole library once — a worksheet imported as eight separate
  // "Revision question N" topics, which is what the student actually has.
  await page.evaluate(async (q) => {
    for (let i = 1; i <= 8; i++) {
      await nodeStore.save(new KnowledgeNode({
        title: 'Revision question ' + i, subject: 'Income Tax Returns', processingStatus: 'ready',
        questions: [{ id: KnowledgeNode._generateQuestionId(), type: 'recall',
                      question: i === 1 ? q : 'Question ' + i, answer: i === 1 ? 'D All of the above' : 'a' }],
      }));
    }
  }, BARE);
  await page.evaluate(() => App.navigateTo('competency'));
  await page.waitForSelector('#comp-content', { timeout: 10000 });
  await page.locator('.comp-mode-btn[data-mode="ai-quiz"]').click();
  await page.locator('#comp-start-btn').click();
  await page.waitForSelector('#ai-jump', { timeout: 10000 });
  // Smart selection may not put the multiple-choice question first — jump to it.
  const at = await page.evaluate(() => CompetencyView._session
    .findIndex(s => !s.match && MatchOptions.parse(s.q.question)));
  if (at < 0) throw new Error('the MCQ was not in the paper');
  await page.locator('#ai-jump [data-q="' + at + '"]').click();
  await page.waitForSelector('.match-opt', { timeout: 10000 });
  const opts = await page.locator('.match-opt').count();
  ok('the question renders as tappable options, not a text blob', opts === 4, 'options=' + opts);
  const badges = await page.locator('.match-opt span:first-child').allInnerTexts();
  ok('each badge shows the bracket', badges.join(',') === 'A),B),C),D)', badges.join(','));
  // Scope to the quiz card — other views keep hidden textareas in the DOM.
  const noBox = await page.locator('.quiz-card textarea[placeholder]').count();
  ok('no "write your answer" box for a multiple-choice question', noBox === 0, 'found ' + noBox);
  await page.screenshot({ path: OUT + '/01-bracketed-options.png', fullPage: true });

  console.log('3) Report Card topic names are separate, readable pills');
  // Leave the exam and come back so the panel is not left mid-session.
  await page.evaluate(() => App.navigateTo('library'));
  await page.waitForTimeout(500);
  await page.evaluate(() => { App.navigateTo('competency'); CompetencyView._started = false; CompetencyView.refresh(); });
  await page.waitForSelector('.comp-mode-btn[data-mode="report"]', { timeout: 10000 });
  await page.locator('.comp-mode-btn[data-mode="report"]').click();
  await page.locator('#comp-start-btn').click();
  await page.waitForSelector('.comp-topic-pill', { timeout: 15000 });
  const pills = await page.locator('.comp-topic-pill').count();
  ok('weak topics render as individual pills', pills >= 3, 'pills=' + pills);
  const spaced = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.comp-topic-pill')].slice(0, 2);
    if (els.length < 2) return { ok: false, why: 'not enough pills' };
    const a = els[0].getBoundingClientRect(), b = els[1].getBoundingClientRect();
    const apart = (b.left >= a.right - 1) || (b.top >= a.bottom - 1);
    const styled = getComputedStyle(els[0]).borderRadius !== '0px';
    return { ok: apart && styled, apart, styled };
  });
  ok('pills are visually separated, not run together', spaced.ok, JSON.stringify(spaced));
  const runOn = await page.evaluate(() => /question \d+Revision/.test(document.body.innerText));
  ok('topic names no longer collide ("…8Revision question 7")', !runOn);
  await page.screenshot({ path: OUT + '/02-topic-pills.png', fullPage: true });

  console.log('4) Nothing broke');
  const b = await page.evaluate(() => { const el = document.getElementById('kn-error-banner');
    return el && el.style.display !== 'none' ? el.textContent.trim().slice(0, 200) : ''; });
  ok('no JS error banner', !b, b);
  ok('no uncaught page errors', errors.length === 0, errors[0] || '');

  await browser.close();
  console.log('\n' + (fail ? 'FAIL: ' + fail : 'ALL ' + pass + ' label checks passed'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });

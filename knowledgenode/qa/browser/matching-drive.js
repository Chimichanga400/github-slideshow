/**
 * Drive the real app in Chromium: seed a matching worksheet, play the exam,
 * and verify coach memory survives a genuine page reload.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = require('path').join(__dirname,'shots','matching');
const URL = 'http://127.0.0.1:8099/index.html';

const OPTS = 'A — 50%\nB — Medical aid contribution paid on behalf of an employee\nC — 20%\nD — 0%\nE — Allowable retirement contributions';
const INSTR = 'Match the items in COLUMN B with those in COLUMN A:';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 1600 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  const step = [];
  const log = (n, ok, x) => { step.push({ n, ok, x }); console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (x ? '  → ' + x : '')); };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof App!=='undefined' && typeof nodeStore!=='undefined' && typeof CompetencyView!=='undefined', null, { timeout: 15000 });
  log('app boots in a real browser', true);

  // The red diagnostic banner is the app's own "something threw" signal.
  const banner = await page.evaluate(() => {
    const b = document.getElementById('kn-error-banner');
    return b && b.style.display !== 'none' ? b.textContent.trim() : '';
  });
  log('no JS error banner on load', !banner, banner);

  // ── Seed a matching worksheet the way an import would ──
  await page.evaluate(async ({ OPTS, INSTR }) => {
    const mk = (p, a) => ({ id: KnowledgeNode._generateQuestionId(), type: 'recall', question: INSTR + '\n' + p + '\n' + OPTS, answer: a });
    const n = new KnowledgeNode({
      title: 'Income Tax — Revision Questions', subject: 'Income Tax', processingStatus: 'ready',
      questions: [
        mk('7. Inclusion rate of travel allowance for PAYE purposes when employee uses vehicle 50% for business purposes', 'A — 50%'),
        mk('8. Current withholding tax on dividends', 'C — 20%'),
        mk('9. Fringe benefit example', 'B — Medical aid contribution paid on behalf of an employee'),
        mk('10. Deductible against retirement funding income', 'E — Allowable retirement contributions'),
      ],
    });
    await nodeStore.save(n);
  }, { OPTS, INSTR });
  log('a matching worksheet was imported', true);

  // First run shows the onboarding tour (it can appear a moment after load, and
  // again once a topic exists) — dismiss it the way a user would, whenever it shows.
  const dismissTour = async () => {
    for (let i = 0; i < 3; i++) {
      const ov = page.locator('#onboarding-overlay');
      if (!(await ov.count()) || !(await ov.isVisible().catch(() => false))) return false;
      await page.locator('#ob-skip').click({ timeout: 5000 }).catch(() => {});
      await page.waitForSelector('#onboarding-overlay', { state: 'hidden', timeout: 5000 }).catch(() => {});
    }
    return true;
  };
  await page.waitForSelector('#onboarding-overlay', { timeout: 4000 }).catch(() => {});
  await dismissTour();
  log('the first-run tour can be dismissed', !(await page.locator('#onboarding-overlay').isVisible().catch(() => false)));

  // ── Navigate to the Exam tab the way the nav button does ──
  await page.evaluate(() => App.navigateTo('competency'));
  await page.waitForSelector('#comp-content', { timeout: 10000 });
  log('the Exam tab opens', true);
  await page.screenshot({ path: OUT + '/shot-0-exam-tab.png', fullPage: true });

  // ── Start the AI Exam by clicking the real buttons ──
  await page.locator('.comp-mode-btn[data-mode="ai-quiz"]').click();
  log('the AI Exam mode button selects', await page.locator('.comp-mode-btn[data-mode="ai-quiz"].active').count() === 1);
  await page.locator('#comp-start-btn').click();
  await page.waitForSelector('#mp-rows .mp-row', { timeout: 10000 });

  const rows = await page.locator('#mp-rows .mp-row').count();
  const bank = await page.locator('#mp-bank .mp-opt').count();
  log('Column A renders one row per item', rows === 4, 'rows=' + rows);
  log('Column B renders the shared answer bank', bank === 5, 'options=' + bank);
  const headings = await page.evaluate(() => document.body.innerText);
  log('the two columns are labelled', /COLUMN A/i.test(headings) && /COLUMN B/i.test(headings));
  log('the instruction shows once as a heading', (headings.match(/Match the items in COLUMN B/g) || []).length === 1);
  await page.screenshot({ path: OUT + '/shot-1-unanswered.png', fullPage: true });

  await dismissTour();
  // ── Tap to match: item then option ──
  await page.locator('#mp-rows .mp-row').nth(0).click();
  await page.locator('#mp-bank .mp-opt[data-letter="A"]').click();
  await page.locator('#mp-rows .mp-row').nth(1).click();
  await page.locator('#mp-bank .mp-opt[data-letter="C"]').click();
  await page.locator('#mp-rows .mp-row').nth(2).click();
  await page.locator('#mp-bank .mp-opt[data-letter="B"]').click();
  await page.locator('#mp-rows .mp-row').nth(3).click();
  await page.locator('#mp-bank .mp-opt[data-letter="D"]').click();   // deliberately WRONG (should be E)

  const badges = await page.locator('#mp-rows .mp-badge').allInnerTexts();
  log('each tapped item shows its assigned letter', badges.join('') === 'ACBD', 'badges=' + badges.join(''));
  await page.screenshot({ path: OUT + '/shot-2-matched.png', fullPage: true });

  // ── Change of mind on the last one ──
  await page.locator('#mp-rows .mp-row').nth(3).click();
  await page.locator('#mp-bank .mp-opt[data-letter="E"]').click();
  const after = await page.locator('#mp-rows .mp-badge').allInnerTexts();
  log('re-tapping changes a choice (D → E)', after.join('') === 'ACBE', 'badges=' + after.join(''));

  // ── Submit: must mark with ZERO network calls ──
  let requests = 0;
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:8099')) requests++; });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => CompetencyView._finishAIExam());
  await page.waitForSelector('text=AI Exam Results', { timeout: 15000 });
  const resultText = await page.evaluate(() => document.body.innerText);
  log('the exam is marked and results shown', /AI Exam Results/.test(resultText));
  log('all four pairs marked correct (100 average)', /100\/100 average/.test(resultText), (resultText.match(/\d+\/100 average/) || [])[0]);
  log('marking made no outbound network call', requests === 0, 'external requests=' + requests);
  await page.screenshot({ path: OUT + '/shot-3-results.png', fullPage: true });

  // ── Coach memory across a REAL reload ──
  await page.evaluate(() => {
    CoachFacts.clear(); CoachEngine.resetMemory();
    CoachEngine.extractSignal('Noted.\n[[FACT: exam dates = 31 August]]\n[[SIGNAL:x]]');
    CoachEngine.extractSignal('Corrected.\n[[FACT: exam dates = first week of December]]\n[[SIGNAL:x]]');
    CoachEngine.extractSignal('Got it.\n[[FACT: daily study time = 30 min morning + 30 min evening]]\n[[SIGNAL:x]]');
    CoachEngine.history = [{ role: 'user', text: 'i can do 30 minutes morning and evening' }, { role: 'coach', text: 'Noted.' }];
    CoachEngine.saveHistory();
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof CoachFacts!=='undefined' && typeof CoachEngine!=='undefined', null, { timeout: 15000 });
  const mem = await page.evaluate(() => {
    CoachEngine.loadHistory();
    return { facts: CoachFacts.all(), block: CoachFacts.block(), hist: CoachEngine.history.length };
  });
  log('facts survive a real page reload', mem.facts.length === 2, JSON.stringify(mem.facts.map(f => f.key)));
  log('the corrected exam date replaced the old one', /first week of December/.test(mem.block) && !/31 August/.test(mem.block));
  log('the conversation survives a reload', mem.hist === 2, 'messages=' + mem.hist);

  const banner2 = await page.evaluate(() => {
    const b = document.getElementById('kn-error-banner');
    return b && b.style.display !== 'none' ? b.textContent.trim() : '';
  });
  log('no JS error banner after the whole run', !banner2, banner2);
  // This sandbox blocks outbound CDNs (Google Fonts, pdf.js, tesseract), so
  // those load failures are environmental, not app faults. Everything else counts.
  const appErrors = errors.filter(e => !/Failed to load resource|ERR_CONNECTION_RESET|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED/.test(e));
  log('no app-level console errors (CDN blocks in this sandbox ignored)', appErrors.length === 0, appErrors.slice(0, 3).join(' | '));

  await browser.close();
  const failed = step.filter(s => !s.ok).length;
  console.log('\n' + (failed ? failed + ' CHECK(S) FAILED' : 'ALL ' + step.length + ' real-browser checks passed'));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });

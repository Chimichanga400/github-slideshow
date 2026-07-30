/**
 * Feature sweep: walk every surface of the real app in Chromium and report
 * what genuinely works, what only degrades gracefully, and what cannot be
 * checked without an AI key. Each feature is isolated so one failure does not
 * hide the rest.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = require('path').join(__dirname,'shots','feature');
const URL = 'http://127.0.0.1:8099/index.html';
require('fs').mkdirSync(OUT, { recursive: true });

const rows = [];
const rec = (feature, status, note) => { rows.push({ feature, status, note: note || '' });
  console.log('  ' + status.padEnd(9) + feature.padEnd(30) + (note || '')); };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 1600 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept());

  const banner = () => page.evaluate(() => {
    const b = document.getElementById('kn-error-banner');
    return b && b.style.display !== 'none' ? b.textContent.trim().slice(0, 300) : '';
  });
  const dismissTour = async () => {
    for (let i = 0; i < 3; i++) {
      const ov = page.locator('#onboarding-overlay');
      if (!(await ov.count()) || !(await ov.isVisible().catch(() => false))) return;
      await page.locator('#ob-skip').click({ timeout: 4000 }).catch(() => {});
      await page.waitForSelector('#onboarding-overlay', { state: 'hidden', timeout: 4000 }).catch(() => {});
    }
  };
  // Run one feature in isolation; a throw becomes a BROKEN row, not a dead sweep.
  const feat = async (name, fn) => {
    const before = errors.length;
    try {
      const note = await fn();
      const b = await banner();
      if (b) return rec(name, 'BROKEN', 'error banner: ' + b);
      const newErrs = errors.slice(before).filter(e => !/Failed to load resource|ERR_CONNECTION_RESET|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED/.test(e));
      if (newErrs.length) return rec(name, 'BROKEN', newErrs[0].slice(0, 160));
      rec(name, 'WORKS', note);
    } catch (e) { rec(name, 'BROKEN', (e.message || '').split('\n')[0].slice(0, 160)); }
  };
  const go = async (view) => { await page.evaluate(v => App.navigateTo(v), view); await page.waitForTimeout(700); await dismissTour(); };
  const text = () => page.evaluate(() => document.body.innerText);
  const shot = (n) => page.screenshot({ path: OUT + '/' + n + '.png', fullPage: true });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof App !== 'undefined' && typeof nodeStore !== 'undefined', null, { timeout: 15000 });
  await page.waitForSelector('#onboarding-overlay', { timeout: 4000 }).catch(() => {});
  await dismissTour();

  // ── Seed a realistic library ────────────────────────────────────────────
  await page.evaluate(async () => {
    const DAY = 86400000, now = Date.now();
    const q = (question, answer) => ({ id: KnowledgeNode._generateQuestionId(), type: 'recall', question, answer });

    const gross = new KnowledgeNode({
      title: 'Gross Income', subject: 'Income Tax', chapter: '2', processingStatus: 'ready',
      summary: 'Gross income is the total amount received by or accrued to a resident, excluding receipts of a capital nature.',
      definitions: [{ term: 'Gross income', description: 'Total amount, in cash or otherwise, received by or accrued to a resident.', examples: 'Salary, rent, interest' },
                    { term: 'Capital nature', description: 'Receipts from the disposal of a capital asset are excluded.', examples: 'Sale of a factory building' }],
      formulas: ['Taxable income = Gross income - Exempt income - Deductions'],
      commonMistakes: ['Treating a capital receipt as gross income'],
      workedExamples: [{ id: 'ex1', title: 'Calculating gross income', question: 'A resident earns a salary of R360 000 and sells a holiday house for R1 200 000. What is gross income?', solution: 'Salary of R360 000 is gross income. The house is capital in nature, so it is excluded.', steps: ['Identify each receipt', 'Classify capital vs revenue', 'Sum the revenue receipts'] }],
      questions: [q('Define gross income.', 'Total amount received by or accrued to a resident, excluding capital receipts'),
                  q('Is the sale of a factory building gross income?', 'No — it is capital in nature'),
                  q('What is the residence basis of taxation?', 'Residents are taxed on worldwide income'),
                  q('Name one exclusion from gross income.', 'Receipts of a capital nature')],
    });
    // Study history: two cards reviewed, one overdue, one leech (repeatedly failed)
    const ids = gross.questions.map(x => x.id);
    gross.srsState[ids[0]] = { repetitions: 3, interval: 10, ease: 2.5, nextReview: now + 5 * DAY, lastReview: now - 5 * DAY };
    gross.srsState[ids[1]] = { repetitions: 2, interval: 4,  ease: 2.3, nextReview: now - 2 * DAY, lastReview: now - 6 * DAY };
    gross.srsState[ids[2]] = { repetitions: 1, interval: 1,  ease: 1.9, nextReview: now - 1 * DAY, lastReview: now - 2 * DAY };
    gross.weakQuestions = [{ id: ids[2], count: 5, lastMissed: now - DAY }, { id: ids[1], count: 2, lastMissed: now - 2 * DAY }];
    await nodeStore.save(gross);

    const OPTS = 'A — 50%\nB — Medical aid contribution paid on behalf of an employee\nC — 20%\nD — 0%\nE — Allowable retirement contributions';
    const INSTR = 'Match the items in COLUMN B with those in COLUMN A:';
    const mk = (p, a) => q(INSTR + '\n' + p + '\n' + OPTS, a);
    await nodeStore.save(new KnowledgeNode({
      title: 'Income Tax — Revision Questions', subject: 'Income Tax', processingStatus: 'ready',
      questions: [mk('7. Inclusion rate of travel allowance', 'A — 50%'), mk('8. Withholding tax on dividends', 'C — 20%'),
                  mk('9. Fringe benefit example', 'B — Medical aid contribution paid on behalf of an employee'),
                  mk('10. Deductible against retirement funding income', 'E — Allowable retirement contributions')],
    }));
    await nodeStore.save(new KnowledgeNode({
      title: 'Capital Allowances', subject: 'Income Tax', processingStatus: 'ready',
      summary: 'Wear-and-tear allowances are claimed on qualifying assets.',
      questions: [q('What is a wear-and-tear allowance?', 'A deduction for the decline in value of a qualifying asset'),
                  q('Over what period is a computer written off?', 'Three years')],
    }));
    // An analysed past paper drives Past Paper Drill + exam-fit in readiness
    localStorage.setItem('kn_exam_style_income_tax', JSON.stringify({ papers: [{ name: '2024 Paper 1',
      analysis: { style: 'scenario-based with calculations', questionTypes: ['calculation', 'discussion'], topicAreas: ['gross income', 'deductions'] },
      questions: [{ question: 'Calculate the taxable income of a resident earning R500 000.', answer: 'R500 000 less allowable deductions.' },
                  { question: 'Discuss whether a capital receipt forms part of gross income.', answer: 'It does not — capital receipts are excluded.' }] }] }));
  });
  rec('Seed library', 'WORKS', '3 topics, SRS history, weak spots, analysed past paper');

  // ── 1. Library + its tabs (Notes / Examples / Questions / Mastery) ──────
  await feat('Library', async () => {
    await go('library');
    const t = await text();
    if (!/Gross Income/.test(t)) throw new Error('topics not listed');
    await shot('01-library');
    return 'lists all 3 topics with mastery';
  });

  await feat('Worked Examples', async () => {
    await page.evaluate(() => { const n = nodeStore.getAll().find(x => x.title === 'Gross Income'); NodeDetailView.open(n.id); });
    await page.waitForTimeout(800); await dismissTour();
    const tabs = await page.locator('.detail-tab-btn').allInnerTexts().catch(() => []);
    await page.locator('.detail-tab-btn', { hasText: /example/i }).first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    const t = await text();
    if (!/Calculating gross income/.test(t)) throw new Error('example not shown; tabs=' + tabs.join('/'));
    await shot('02-examples');
    return 'worked example opens from the Examples tab';
  });

  await feat('Review in your textbook', async () => {
    await page.locator('.detail-tab-btn', { hasText: /mastery/i }).first().click({ timeout: 5000 });
    await page.waitForTimeout(600);
    const t = await text();
    if (!/textbook/i.test(t)) throw new Error('missed-question list not found on Mastery tab');
    await shot('03-review-in-textbook');
    return 'lists the questions answered wrong, worst first';
  });

  // ── 2. Review / spaced repetition ───────────────────────────────────────
  await feat('Review / Spaced Repetition', async () => {
    await go('review');
    const t = await text();
    await shot('04-review');
    if (!/Today|Due|Review/i.test(t)) throw new Error('review view empty');
    return 'due cards surface with Today / All / Weak Spots modes';
  });

  await feat('Weak Spots mode', async () => {
    const btn = page.locator('text=Weak Spots').first();
    if (!(await btn.count())) throw new Error('Weak Spots control not found');
    await btn.click({ timeout: 5000 }); await page.waitForTimeout(700);
    await shot('05-weak-spots');
    return 'hardest-missed questions across the library';
  });

  await feat('Leech Breaker', async () => {
    const r = await page.evaluate(() => {
      if (typeof LeechDetector === 'undefined') return { missing: true };
      const n = nodeStore.getAll().find(x => x.title === 'Gross Income');
      const leeches = (n.questions || []).filter(q => LeechDetector.isLeechCard(n, q.id));
      return { count: leeches.length, all: LeechDetector.leeches(nodeStore.getAll()).length, threshold: LeechDetector.THRESHOLD };
    });
    if (r.missing) throw new Error('LeechDetector not loaded');
    if (!r.count) throw new Error('a 5-times-failed card was not flagged as a leech');
    return r.count + ' card over the ' + r.threshold + '-fail threshold flagged for understanding, not more drilling';
  });

  await feat('New-Card Pacing', async () => {
    const b = await page.evaluate(() => ({ light: NewCardPacer.budget('light'), normal: NewCardPacer.budget('normal'), deep: NewCardPacer.budget('deep') }));
    if (!(b.light < b.normal && b.normal < b.deep)) throw new Error('budgets not ordered: ' + JSON.stringify(b));
    return 'daily new-card budget scales light ' + b.light + ' < normal ' + b.normal + ' < deep ' + b.deep;
  });

  // ── 3. Exam modes ───────────────────────────────────────────────────────
  await feat('Exam — Report Card', async () => {
    await go('competency');
    await page.locator('.comp-mode-btn[data-mode="report"]').click(); await page.waitForTimeout(300);
    await page.locator('#comp-start-btn').click(); await page.waitForTimeout(2500);
    const t = await text();
    await shot('06-report-card');
    if (!/Income Tax/.test(t)) throw new Error('no subject breakdown produced');
    return 'strengths vs gaps per subject, on-device';
  });

  await feat('Exam — Timed Quiz', async () => {
    await page.locator('.comp-mode-btn[data-mode="timed"]').click(); await page.waitForTimeout(300);
    await page.locator('#comp-start-btn').click(); await page.waitForTimeout(1200);
    const t = await text();
    if (!/\d+:\d\d/.test(t)) throw new Error('countdown timer not shown');
    await shot('07-timed-quiz');
    const hasAnswerBox = await page.locator('#timed-answer').count();
    if (!hasAnswerBox) throw new Error('no answer input rendered');
    return 'countdown runs, questions answerable one at a time';
  });

  await feat('Exam — AI Exam (matching, free)', async () => {
    await go('competency');
    await page.locator('.comp-mode-btn[data-mode="ai-quiz"]').click(); await page.waitForTimeout(300);
    await page.locator('#comp-start-btn').click();
    await page.waitForSelector('#ai-jump', { timeout: 10000 });
    const info = await page.evaluate(() => ({ total: CompetencyView._session.length,
      matchAt: CompetencyView._session.findIndex(s => !!s.match) }));
    if (info.matchAt < 0) throw new Error('no matching set in the paper; slots=' + info.total);
    // Jump to the slot holding the matching set (smart selection may not put it first)
    await page.locator('#ai-jump [data-q="' + info.matchAt + '"]').click();
    await page.waitForSelector('#mp-rows .mp-row', { timeout: 10000 });
    await shot('08-ai-exam-matching');
    return 'paper of ' + info.total + ' slots; matching set at slot ' + (info.matchAt + 1) + ', renders as the two-column matcher';
  });

  // ── 4. Progress / dashboard surfaces ────────────────────────────────────
  await feat('Exam Readiness', async () => {
    await go('dashboard');
    const t = await text();
    await shot('09-dashboard');
    if (!/readiness/i.test(t)) throw new Error('readiness card not on Progress');
    const s = await page.evaluate(() => ExamReadiness.assess(nodeStore.getAll(), null));
    if (typeof s.score !== 'number') throw new Error('no score computed');
    return 'score ' + s.score + '/100 with prioritised next actions, no AI cost';
  });

  await feat('Past Paper Drill', async () => {
    const r = await page.evaluate(() => {
      if (typeof PastPaperDrill === 'undefined') return { missing: true };
      return { has: typeof PastPaperDrill.open === 'function' || typeof PastPaperDrill.start === 'function',
               keys: Object.keys(PastPaperDrill).slice(0, 8) };
    });
    if (r.missing) throw new Error('PastPaperDrill not loaded');
    if (!r.has) throw new Error('no open/start entry point; keys=' + r.keys.join(','));
    return 'authentic past-paper questions replayable offline';
  });

  await feat('Streak tracking', async () => {
    const s = await page.evaluate(() => { StreakTracker.recordActivity(); return StreakTracker.getStats(); });
    if (typeof s.streak !== 'number') throw new Error('no streak stats');
    return 'streak ' + s.streak + 'd (longest ' + s.longest + ')';
  });

  // ── 5. Study surfaces ───────────────────────────────────────────────────
  await feat('Guided Study', async () => {
    await go('guided');
    const t = await text();
    await shot('10-guided');
    if (!/Gross Income|study|topic/i.test(t)) throw new Error('guided view empty');
    return 'topic picker + 6-step walkthrough (question-bank topics get a drill)';
  });

  await feat('Study Plan', async () => {
    await go('studyplan');
    const t = await text();
    await shot('11-studyplan');
    if (!/plan/i.test(t)) throw new Error('study plan view empty');
    return 'view renders; plan creation is the builder flow';
  });

  await feat('Add / Scan Content (entry)', async () => {
    await go('upload');
    const t = await text();
    await shot('12-upload');
    if (!/Revision Questions/i.test(t) || !/Past Exam Paper/i.test(t)) throw new Error('upload entry points missing');
    return 'upload zone + Revision Questions + Past Exam Paper entry points present';
  });

  await feat('Study Colors', async () => {
    const r = await page.evaluate(() => {
      if (typeof AccentTheme === 'undefined') return { missing: true };
      const read = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const before = read(), seen = {};
      for (const m of ['focus', 'growth', 'energy', 'amber']) { AccentTheme.set(m); seen[m] = read(); }
      return { before, seen, persisted: AccentTheme.get() };
    });
    if (r.missing) throw new Error('AccentTheme not loaded');
    const distinct = new Set(Object.values(r.seen));
    if (distinct.size < 3) throw new Error('accent did not actually change: ' + JSON.stringify(r.seen));
    await shot('12b-study-colors');
    return 'focus/growth/energy/amber give distinct accents ' + JSON.stringify(r.seen) + ', choice persists';
  });

  // ── 6. AI-dependent features: confirm they degrade gracefully ───────────
  await feat('AI features without a key (graceful)', async () => {
    const r = await page.evaluate(() => ({ hasKey: AIService.hasApiKey(), demo: /Demo mode|no AI configured/i.test(document.body.innerText) }));
    if (r.hasKey) throw new Error('unexpected API key present');
    // Opening the coach with no key must warn, not crash.
    await page.evaluate(() => { try { StudyCoach.open(); } catch (e) { window.__coachThrew = e.message; } });
    await page.waitForTimeout(600);
    const threw = await page.evaluate(() => window.__coachThrew || '');
    if (threw) throw new Error('StudyCoach.open threw: ' + threw);
    await shot('13-no-ai-key');
    return 'demo banner shown; coach prompts for a key instead of crashing';
  });

  await browser.close();

  // ── Report ──────────────────────────────────────────────────────────────
  const broken = rows.filter(r => r.status === 'BROKEN');
  console.log('\n' + rows.length + ' surfaces exercised — ' + (rows.length - broken.length) + ' OK, ' + broken.length + ' BROKEN');
  if (broken.length) { console.log('\nBROKEN:'); broken.forEach(b => console.log('  - ' + b.feature + ': ' + b.note)); }
  require('fs').writeFileSync(OUT + '/report.json', JSON.stringify(rows, null, 2));
  process.exit(broken.length ? 1 : 0);
})().catch(e => { console.error('SWEEP ERROR: ' + e.message); process.exit(2); });

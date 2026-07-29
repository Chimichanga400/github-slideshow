/**
 * The coach composer: a text box that grows with what you type (instead of a
 * one-line field that scrolls sideways), and an attach button that lets the
 * coach read a photo. Driven in a real browser against the mock AI server.
 *
 *   node mock-ai-server.js 8099 &
 *   node composer-drive.js
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const OUT = path.join(__dirname, 'shots', 'composer');
const BASE = 'http://127.0.0.1:8099';
require('fs').mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.error('  ✗ ' + n + (x ? '  → ' + x : ''))); };

// A tiny valid PNG so the attach path has a real file to read.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept());

  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof App !== 'undefined' && typeof AIService !== 'undefined', null, { timeout: 15000 });
  await page.waitForSelector('#onboarding-overlay', { timeout: 4000 }).catch(() => {});
  for (let i = 0; i < 3; i++) {
    const ov = page.locator('#onboarding-overlay');
    if (!(await ov.count()) || !(await ov.isVisible().catch(() => false))) break;
    await page.locator('#ob-skip').click({ timeout: 4000 }).catch(() => {});
    await page.waitForSelector('#onboarding-overlay', { state: 'hidden', timeout: 4000 }).catch(() => {});
  }

  await page.evaluate(async (base) => {
    AIService.saveConfig('custom', 'test-key', 'mock-model', base + '/v1/chat/completions');
    AIService.loadConfig();
    await nodeStore.save(new KnowledgeNode({ title: 'Gross Income', subject: 'Income Tax', processingStatus: 'ready',
      questions: [{ id: KnowledgeNode._generateQuestionId(), type: 'recall', question: 'Define gross income.', answer: 'Total received or accrued' }] }));
    CoachEngine.resetMemory(); StudyCoach.open();
  }, BASE);
  await page.waitForSelector('#coach-input', { timeout: 10000 });

  console.log('Coach composer');

  console.log('1) It is a growing text box, not a one-line field');
  const tag = await page.evaluate(() => document.getElementById('coach-input').tagName);
  ok('the input is a textarea', tag === 'TEXTAREA', 'got ' + tag);
  const h1 = await page.evaluate(() => document.getElementById('coach-input').offsetHeight);
  await page.fill('#coach-input', 'This is a much longer question about how I should plan my studying for the December exams, given that I work Monday to Friday and only have thirty minutes in the morning and thirty at night.');
  await page.waitForTimeout(250);
  const h2 = await page.evaluate(() => document.getElementById('coach-input').offsetHeight);
  ok('the box grows as the text wraps', h2 > h1 + 10, 'height ' + h1 + ' → ' + h2);
  const noSideScroll = await page.evaluate(() => { const el = document.getElementById('coach-input'); return el.scrollWidth <= el.clientWidth + 2; });
  ok('text wraps instead of scrolling sideways', noSideScroll);
  await page.screenshot({ path: OUT + '/01-grown.png' });

  console.log('2) It stops growing and scrolls instead of taking over the screen');
  await page.fill('#coach-input', Array.from({ length: 40 }, (_, i) => 'line ' + i).join('\n'));
  await page.waitForTimeout(250);
  const capped = await page.evaluate(() => { const el = document.getElementById('coach-input');
    return { h: el.offsetHeight, oy: getComputedStyle(el).overflowY }; });
  ok('height is capped', capped.h <= 170, 'height=' + capped.h);
  ok('it scrolls inside once capped', capped.oy === 'auto', 'overflowY=' + capped.oy);
  const logVisible = await page.evaluate(() => document.getElementById('coach-log').offsetHeight > 80);
  ok('the conversation above stays visible', logVisible);

  console.log('3) Shift+Enter makes a new line; Enter sends (desktop)');
  await page.fill('#coach-input', 'first line');
  await page.click('#coach-input');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('second line');
  const twoLines = await page.evaluate(() => document.getElementById('coach-input').value);
  ok('Shift+Enter inserts a new line', /first line\nsecond line/.test(twoLines), JSON.stringify(twoLines));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1800);
  const afterSend = await page.evaluate(() => ({ val: document.getElementById('coach-input').value,
    log: document.getElementById('coach-log').innerText }));
  ok('Enter sends the message', afterSend.val === '', 'box not cleared');
  ok('the message appears in the conversation', /second line/.test(afterSend.log));
  const keptBreak = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.coach-msg.user')].pop();
    return b ? b.innerHTML : '';
  });
  ok('a multi-line question keeps its line breaks in the bubble', /first line<br>second line/.test(keptBreak), keptBreak.slice(0, 60));
  ok('the coach replied', /Gross Income/.test(afterSend.log));
  await page.screenshot({ path: OUT + '/02-sent.png' });

  console.log('4) The attach button lets the coach read a photo');
  ok('an attach button is present', await page.locator('#coach-attach').count() === 1);
  await page.setInputFiles('#coach-file', { name: 'worksheet.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForTimeout(600);
  ok('a removable thumbnail appears before sending', await page.locator('.coach-chip').count() === 1);
  ok('the thumbnail names the file', /worksheet/.test(await page.locator('.coach-chip').innerText()));
  await page.screenshot({ path: OUT + '/03-attached.png' });

  console.log('5) An attachment can be removed before sending');
  await page.locator('.coach-chip [data-rm]').click();
  await page.waitForTimeout(300);
  ok('removing the chip clears it', await page.locator('.coach-chip').count() === 0);

  console.log('6) Sending a photo scans it and asks the coach about it');
  // Tesseract is loaded from a CDN, which this sandbox blocks, so stand in for
  // it to prove the on-device fallback is wired correctly.
  await page.evaluate(() => {
    window.Tesseract = { recognize: async () => ({ data: { text: '7. Inclusion rate of travel allowance\nA — 50%\nB — 20%' } }) };
  });
  await page.setInputFiles('#coach-file', { name: 'q7.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForTimeout(500);
  await page.request.get(BASE + '/__reset');
  await page.fill('#coach-input', 'help me with this question');
  await page.click('#coach-send');
  await page.waitForTimeout(2500);
  const calls = await (await page.request.get(BASE + '/__calls')).json();
  // The mock is configured as a `custom` provider, which cannot see images (its
  // image blocks are stripped before sending). The app must NOT ask a blind
  // provider to read a picture — it should fall back to on-device OCR instead.
  const vision = await page.evaluate(() => AIService.supportsVision());
  ok('this provider is correctly reported as unable to see images', vision === false);
  const askedBlindProvider = calls.some(c => /You are an OCR system/.test(JSON.stringify(c.body)));
  ok('it does NOT ask a blind provider to read the photo', !askedBlindProvider,
     'sent an OCR prompt with no image attached');
  const askedAbout = calls.some(c => /TEXT THE STUDENT PHOTOGRAPHED/.test(JSON.stringify(c.body)));
  ok('on-device OCR is used instead, and its text reaches the coach', askedAbout);
  ok('the actual scanned words are what got sent',
     calls.some(c => /Inclusion rate of travel allowance/.test(JSON.stringify(c.body))));
  const log = await page.evaluate(() => document.getElementById('coach-log').innerText);
  ok('the chat shows the question, not the raw scan dump', /help me with this question/.test(log) && !/TEXT THE STUDENT PHOTOGRAPHED/.test(log));
  ok('the attachment tray is cleared after sending', await page.locator('.coach-chip').count() === 0);
  await page.screenshot({ path: OUT + '/04-photo-sent.png' });

  console.log('7) Nothing broke');
  const b = await page.evaluate(() => { const el = document.getElementById('kn-error-banner');
    return el && el.style.display !== 'none' ? el.textContent.trim().slice(0, 200) : ''; });
  ok('no JS error banner', !b, b);
  ok('no uncaught page errors', errors.length === 0, errors[0] || '');

  await browser.close();
  console.log('\n' + (fail ? 'FAIL: ' + fail : 'ALL ' + pass + ' composer checks passed'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });

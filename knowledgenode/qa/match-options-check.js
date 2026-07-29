// Interactive matching / lettered-option questions: a worksheet item whose
// options (Column B) are flattened into the question text becomes structured,
// tappable choices instead of an unusable "write a thorough answer" box. The
// chosen option is stored as "LETTER — text" so the FREE LocalGrader marks it
// with no AI call. This verifies the parser + that a tapped choice grades free,
// and that ordinary open questions are left completely alone.
const path = require('path');
const WWW = process.env.WWW || path.join(__dirname,'..','www');
const MO = require(path.join(WWW, 'js/core/MatchOptions.js'));
const LG = require(path.join(WWW, 'js/core/LocalGrader.js'));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.error('  ✗ ' + n + (x ? '  → ' + x : ''))); };

console.log('Interactive matching questions');

console.log('1) A real matching item (Column A prompt + many lettered options) parses');
const q1 = `10. Current withholding tax on dividends
A — 50%
B — Medical aid contributions
C — 20%
D — 15%
E — 18%`;
const p1 = MO.parse(q1);
ok('parses (not null)', !!p1);
ok('stem is the Column A prompt', p1 && p1.stem === '10. Current withholding tax on dividends', p1 && JSON.stringify(p1.stem));
ok('all five options captured', p1 && p1.options.length === 5, p1 && p1.options.length);
ok('letters read A,B,C,D,E', p1 && p1.options.map(o => o.letter).join('') === 'ABCDE');
ok('option text is clean (no letter prefix)', p1 && p1.options[2].text === '20%', p1 && p1.options[2].text);
ok('raw is "LETTER — text"', p1 && p1.options[2].raw === 'C — 20%', p1 && p1.options[2].raw);

console.log('1b) The real screenshot shape: a long A…Q matching list');
const AQ = '10. Current withholding tax on dividends\n' +
  'ABCDEFGHIJKLMNOPQ'.split('').map((L, i) => L + ' — value ' + i).join('\n');
const pAQ = MO.parse(AQ);
ok('17 consecutive options (A…Q) all captured', pAQ && pAQ.options.length === 17, pAQ && pAQ.options.length);
ok('last letter is Q', pAQ && pAQ.options[16].letter === 'Q');


console.log('1c) Worksheets that write options as a bare letter, no bracket or dash');
const BARE = 'Provisional tax is payable by:\n'
  + 'A Employees who earn salary income above R 1 million\n'
  + 'B Sole proprietors\n'
  + 'C Individuals (over the age of 65) who earn rental, interest or dividends of R 100 000\n'
  + 'D All of the above';
const pB = MO.parse(BARE);
ok('"A Employees who…" (no separator) parses', !!pB);
ok('all four options captured', pB && pB.options.length === 4, pB && pB.options.length);
ok('the stem is kept separate', pB && pB.stem === 'Provisional tax is payable by:', pB && JSON.stringify(pB.stem));
ok('the letter is not left inside the option text', pB && pB.options[0].text === 'Employees who earn salary income above R 1 million', pB && pB.options[0].text);
ok('an option containing brackets survives intact', pB && /over the age of 65/.test(pB.options[2].text));
ok('prose beginning with a lone capital letter is NOT mistaken for options',
   MO.parse('A resident must pay tax.\nBecause the rule says so.\nCarry on reading.') === null);
ok('lowercase prose after a bare letter is rejected',
   MO.parse('Q\nA company sells goods\nB widget makers\nC traders here') === null);

console.log('2) Different separators and single-line OCR blobs');
ok('"A) x  B) y  C) z" (no newlines) still parses', (() => { const p = MO.parse('Pick one A) apple B) pear C) plum'); return p && p.options.length === 3; })());
ok('"A. x" dotted separators parse', (() => { const p = MO.parse('Q\nA. one\nB. two\nC. three'); return p && p.options.length === 3; })());
ok('lowercase letters parse', (() => { const p = MO.parse('Q\na — one\nb — two\nc — three'); return p && p.options[0].letter === 'A'; })());

console.log('3) Conservative — ordinary questions are NOT treated as options');
ok('a normal open question → null', MO.parse('Explain the difference between gross income and taxable income.') === null);
ok('two options only → null (needs ≥3 in order)', MO.parse('Q\nA — one\nB — two') === null);
ok('out-of-order letters → null', MO.parse('Q\nB — two\nD — four\nF — six') === null);
ok('empty/blank → null', MO.parse('') === null && MO.parse(null) === null);

console.log('4) A tapped choice is stored so the FREE grader marks it correct');
ok('answerFor(C) → "C — 20%"', MO.answerFor(p1, 'C') === 'C — 20%');
// stored model answer shaped like the import ("C — 20%") → free correct
ok('tap C grades correct vs "C — 20%"', LG.match(MO.answerFor(p1, 'C'), ['C — 20%']).verdict === 'correct');
// stored model answer as a bare letter → still free correct
ok('tap C grades correct vs bare "C"', LG.match(MO.answerFor(p1, 'C'), ['C']).verdict === 'correct');
// stored model answer as just the value → still free correct (containment)
ok('tap C grades correct vs value "20%"', LG.match(MO.answerFor(p1, 'C'), ['20%']).verdict === 'correct');
// a WRONG tap must not be marked correct
ok('tap A (wrong) does NOT match "C — 20%"', LG.match(MO.answerFor(p1, 'A'), ['C — 20%']).verdict === 'unknown');

console.log('5) Re-highlighting a revisited answer');
ok('letterOf("C — 20%") → C', MO.letterOf(p1, 'C — 20%') === 'C');
ok('letterOf("C") → C', MO.letterOf(p1, 'C') === 'C');
ok('letterOf("20%") → C (matches body)', MO.letterOf(p1, '20%') === 'C');
ok('letterOf("") → null', MO.letterOf(p1, '') === null);
ok('letterOf(unknown text) → null', MO.letterOf(p1, 'something else entirely') === null);

console.log('6) Wrapped option bodies are joined, not dropped');
const p6 = MO.parse('Q\nA — the first option that wraps\nonto a second line\nB — second\nC — third');
ok('wrapped body is appended to option A', p6 && /wraps onto a second line/.test(p6.options[0].text), p6 && p6.options[0].text);
ok('still three options (wrap line not counted)', p6 && p6.options.length === 3);

console.log('\n' + (fail ? 'FAIL: ' + fail : 'ALL ' + pass + ' checks passed'));
process.exit(fail ? 1 : 0);

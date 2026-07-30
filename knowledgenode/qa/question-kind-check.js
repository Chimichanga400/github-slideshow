// Full calculations were being scheduled as flashcards: a ten-minute multi-part
// computation would surface mid-review, get skipped, rated Again, and eventually
// be flagged as a leech on a question the student never attempted. Review is for
// fast retrieval; calculations belong in the exam. This checks the split is
// right — and, just as importantly, that it stays biased toward keeping cards IN
// review, since wrongly hiding a recall card costs real practice.
const path = require('path');
const WWW = process.env.WWW || path.join(__dirname, '..', 'www');
const QK = require(path.join(WWW, 'js/core/QuestionKind.js'));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.error('  ✗ ' + n + (x ? '  → ' + x : ''))); };

console.log('Telling calculations apart from recall');

console.log('1) The real case that started this');
const CHRIS = {
  question: 'Chris, whose age next birthday will be 65, donated a usufructuary interest in a house in East London '
    + 'valued at R 3 250 000 to his sister, Catherine (aged 57) and the bare dominium to his son Nicholas. '
    + 'Chris made no other donations in the year.\n\nCalculate the donations tax payable by Chris.',
  answer: 'Value of usufruct:\nAnnual Value: 12% x R 3 250 000 = R 390 000\nPresent value based on life expectancy\nDonations tax = 20% x R 3 130 000 = R 626 000',
};
ok('the donations tax question is a calculation', QK.of(CHRIS) === 'calculation', QK.of(CHRIS));
ok('it is kept out of review', QK.isReviewable(CHRIS) === false);

console.log('2) Short recall questions stay in review');
[
  { question: 'Define gross income.', answer: 'The total amount received by or accrued to a resident, excluding capital receipts.' },
  { question: 'What is the residence basis of taxation?', answer: 'Residents are taxed on worldwide income.' },
  { question: 'Name one exclusion from gross income.', answer: 'Receipts of a capital nature' },
  { question: 'What rate of donations tax applies below R30 million?', answer: '20%' },
  { question: 'Is the sale of a factory building gross income?', answer: 'No — it is capital in nature.' },
  { question: 'What annual value percentage is used to value a usufruct?', answer: '12%' },
].forEach(q => ok('recall: "' + q.question.slice(0, 44) + '"', QK.of(q) === 'recall', QK.of(q)));

console.log('3) Multiple choice is always quick, even about amounts');
const MCQ = {
  question: 'Provisional tax is payable by:\nA Employees who earn salary income above R 1 million\n'
    + 'B Sole proprietors\nC Individuals (over the age of 65) who earn rental, interest or dividends of R 100 000\nD All of the above',
  answer: 'D All of the above',
};
ok('a lettered multiple-choice question stays in review', QK.of(MCQ) === 'recall', QK.of(MCQ));

console.log('4) Other genuine calculations are caught');
[
  { question: 'Calculate the taxable income of a resident who earned a salary of R500 000 and incurred R36 000 of allowable deductions during the year of assessment.',
    answer: 'Salary R500 000\nLess deductions R36 000\nTaxable income = R464 000' },
  { question: 'During the current year of assessment Sipho sold shares for R1 250 000 which he had bought for R400 000. Assume that the shares were capital in nature. Determine the amount of capital gains tax payable.',
    answer: 'Proceeds R1 250 000\nLess base cost R400 000\nCapital gain = R850 000\nInclusion rate 40% = R340 000' },
].forEach((q, i) => ok('calculation ' + (i + 1) + ' is routed to the exam', QK.of(q) === 'calculation', QK.of(q)));

console.log('5) Biased toward keeping cards in review');
ok('a short question merely mentioning an amount stays', QK.of({ question: 'What is the annual donations tax exemption?', answer: 'R100 000' }) === 'recall');
ok('a long theory question with no amounts stays', QK.of({
  question: 'Explain in detail the difference between the residence basis and the source basis of taxation, '
    + 'setting out how each determines which amounts fall into gross income and why South Africa moved between them.',
  answer: 'Residents are taxed on worldwide income; non-residents only on South African source income.' }) === 'recall');
ok('an empty or malformed question does not crash', QK.of({}) === 'recall' && QK.of(null) === 'recall');

console.log('6) split() separates the two streams');
const s = QK.split([CHRIS, MCQ, { question: 'Define gross income.', answer: 'total received' }]);
ok('one calculation, two recall', s.calculation.length === 1 && s.recall.length === 2,
   JSON.stringify({ calc: s.calculation.length, recall: s.recall.length }));

console.log('\n' + (fail ? 'FAIL: ' + fail : 'ALL ' + pass + ' checks passed'));
process.exit(fail ? 1 : 0);

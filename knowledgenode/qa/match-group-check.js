// Match-and-Pair reassembly: the individual per-item questions an import
// produced (each with the same shared Column B option list) are grouped back
// into ONE interactive two-column set, and every pair is graded on-device for
// free (a wrong match is definitively wrong — no AI). This checks the grouping
// core; a companion jsdom test drives the actual tap-to-match UI.
const path = require('path');
const WWW = process.env.WWW || path.join(__dirname,'..','www');
const MG = require(path.join(WWW, 'js/core/MatchGroup.js'));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.error('  ✗ ' + n + (x ? '  → ' + x : ''))); };

// Build a node whose questions are a matching set (shared A–E option list),
// plus one unrelated open question that must NOT be pulled into the group.
const OPTS = 'A — 50%\nB — Medical aid contribution paid on behalf of an employee\nC — 20%\nD — 0%\nE — Allowable retirement contributions';
const instr = 'Match the items in COLUMN B with those in COLUMN A:';
const mk = (id, prompt, ans) => ({ id, type: 'recall', question: instr + '\n' + prompt + '\n' + OPTS, answer: ans });
const node = { id: 'tax1', subject: 'Tax', questions: [
  mk('q7',  '7. Inclusion rate of travel allowance for PAYE purposes', 'A — 50%'),
  mk('q8',  '8. Dividends withholding tax rate', 'C — 20%'),
  mk('q9',  '9. Fringe benefit example', 'B — Medical aid contribution paid on behalf of an employee'),
  { id: 'open1', type: 'recall', question: 'Explain the residence basis of taxation.', answer: 'worldwide income' },
] };

console.log('Match-and-Pair grouping');

console.log('1) The three sibling items form ONE group; the open question is left out');
const groups = MG.detect(node);
ok('exactly one group detected', groups.length === 1, 'got ' + groups.length);
const g = groups[0];
ok('group has all three prompts', g && g.prompts.length === 3, g && g.prompts.length);
ok('the open question is NOT in the group', g && !g.prompts.some(p => p.q.id === 'open1'));
ok('group carries the shared five options', g && g.options.length === 5, g && g.options.length);

console.log('2) The generic instruction is lifted out; each row shows only its item');
ok('instruction captured once', g && /Match the items/.test(g.instruction), g && g.instruction);
ok('prompt row is just the numbered item (no instruction, no options)',
  g && g.prompts[0].prompt === '7. Inclusion rate of travel allowance for PAYE purposes', g && JSON.stringify(g.prompts[0].prompt));

console.log('3) Pairs grade for free and definitively');
ok('correctLetter(q7) → A', MG.correctLetter(g, g.prompts[0].answer) === 'A', MG.correctLetter(g, g.prompts[0].answer));
ok('correctLetter(q8) → C', MG.correctLetter(g, g.prompts[1].answer) === 'C');
ok('answerFor(A) → full "A — 50%"', MG.answerFor(g, 'A') === 'A — 50%', MG.answerFor(g, 'A'));
// simulate marking: right letter is correct, wrong letter is wrong — both free
const mark = (p, chosen) => chosen === MG.correctLetter(g, p.answer);
ok('choosing A for q7 marks correct', mark(g.prompts[0], 'A') === true);
ok('choosing D for q7 marks wrong (definitive, no AI)', mark(g.prompts[0], 'D') === false);

console.log('4) indexByQuestion maps every set member to its group');
const idx = MG.indexByQuestion(node);
ok('q7,q8,q9 all map to a group', idx.get('q7') && idx.get('q8') && idx.get('q9'));
ok('the open question maps to nothing', !idx.get('open1'));
ok('all members map to the SAME group object', idx.get('q7') === idx.get('q8') && idx.get('q8') === idx.get('q9'));

console.log('5) Conservative — a node without a matching set yields no groups');
const plain = { id: 'n2', questions: [
  { id: 'a', question: 'What is gross income?', answer: 'total amount received' },
  { id: 'b', question: 'Define an asset.', answer: 'a resource controlled by the entity' },
] };
ok('no groups from ordinary questions', MG.detect(plain).length === 0);
// a lone matching item (siblings not present) is not a "set"
ok('a single lettered question alone is not grouped', MG.detect({ id: 'n3', questions: [ mk('solo', '1. only one', 'A — 50%') ] }).length === 0);

console.log('\n' + (fail ? 'FAIL: ' + fail : 'ALL ' + pass + ' checks passed'));
process.exit(fail ? 1 : 0);

// Gap fix: the free on-device grader now understands thousands-separators
// (spaces/commas) in amounts — "R 100 000", "R1 385 600", "100,000" — so the
// numeric answers this app is full of grade instantly for free instead of
// wrongly falling through to a paid AI call. Must stay conservative: a genuinely
// wrong amount must NOT match.
const path=require('path');
const WWW = process.env.WWW || path.join(__dirname,'..','www');
const LG=require(path.join(WWW,'js/core/LocalGrader.js'));
let pass=0,fail=0; const ok=(n,c,x='')=>{ c?(pass++,console.log('  ✓ '+n)):(fail++,console.error('  ✗ '+n+(x?'  → '+x:''))); };

console.log('Free grading of separated amounts');

console.log('1) _num parses grouped amounts as one number');
ok('"R 100 000" → 100000', JSON.stringify(LG._num('R 100 000'))==='[100000]');
ok('"R1 385 600" → 1385600', JSON.stringify(LG._num('R1 385 600'))==='[1385600]');
ok('"1 000 000" (multi-group) → 1000000', JSON.stringify(LG._num('1 000 000'))==='[1000000]');
ok('"100,000.50" → 100000.5', JSON.stringify(LG._num('100,000.50'))==='[100000.5]');
ok('percentages still work (15% → 0.15)', JSON.stringify(LG._num('15%'))==='[0.15]');

console.log('2) These now grade FREE (correct answers)');
[
  ['R 100 000', ['100000']],
  ['R36 000',   ['36000']],
  ['100,000',   ['100000']],
  ['the answer is R 5 000', ['5000']],
  ['R 1 385 600', ['1385600']],
  ['R 100 000', ['R 100 000']],
  ['1 000 000', ['1000000']],
].forEach(([s,a]) => ok('"'+s+'" vs '+JSON.stringify(a)+' → correct', LG.match(s,a).verdict==='correct'));

console.log('3) Still conservative — wrong amounts do NOT match');
ok('"R 99 000" vs 100000 stays unknown', LG.match('R 99 000',['100000']).verdict==='unknown');
ok('"R 10 000" vs 100000 stays unknown (missing a group)', LG.match('R 10 000',['100000']).verdict==='unknown');
ok('empty answer stays unknown', LG.match('',['100000']).verdict==='unknown');

console.log('4) No regression on existing rules');
ok('exact text still matches', LG.match('an asset',['An asset']).verdict==='correct');
ok('term containment still matches', LG.match('it is an asset',['asset']).verdict==='correct');
ok('MCQ letter still matches', LG.match('a',['A — worldwide income']).verdict==='correct');
ok('plain prose with no numbers is untouched', LG.match('gross income means total received',['asset']).verdict==='unknown');

console.log('\n'+(fail? 'FAIL: '+fail : 'ALL '+pass+' checks passed'));
process.exit(fail?1:0);

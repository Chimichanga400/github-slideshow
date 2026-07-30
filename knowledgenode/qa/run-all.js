/**
 * run-all.js — run every KnowledgeNode check suite and summarise.
 *
 *   npm install && npm test                  # tests the app in ../www
 *   WWW=/path/to/other/www npm test          # test a different build
 *
 * Exits non-zero if any suite fails, so it is safe to use in CI.
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

const suites = fs.readdirSync(__dirname)
  .filter(f => /-check\.js$/.test(f))
  .sort((a, b) => (a === 'boot-smoke-check.js' ? -1 : b === 'boot-smoke-check.js' ? 1 : a.localeCompare(b)));

let failed = 0, total = 0;
for (const s of suites) {
  let out = '', okRun = true;
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, s)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    okRun = false;
    out = (e.stdout || '') + (e.stderr || '');
  }
  const last = out.trim().split('\n').filter(Boolean).pop() || '(no output)';
  const n = (last.match(/ALL (\d+)/) || [])[1];
  if (n) total += parseInt(n, 10);
  if (!okRun) failed++;
  console.log((okRun ? '  PASS  ' : '  FAIL  ') + s.padEnd(34) + last);
  if (!okRun) console.log(out.split('\n').filter(l => /✗/.test(l)).map(l => '        ' + l).join('\n'));
}

console.log('\n' + (failed
  ? failed + ' of ' + suites.length + ' suite(s) FAILED'
  : 'All ' + suites.length + ' suites passed (' + total + ' checks)'));
process.exit(failed ? 1 : 0);

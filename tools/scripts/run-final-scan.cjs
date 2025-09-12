/**
 * Final repo scan before push.
 * Succeeds if EITHER web/jest.config.(ts|js) OR web/vitest.config.ts exists.
 * Also surfaces latest outputs from /scans if present.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const scansDir = path.join(ROOT, 'scans');

function has(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function hasAny(paths) { return paths.some(has); }
function latestMatch(dir, re) {
  if (!has(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => re.test(f));
  if (!files.length) return null;
  files.sort((a,b) => fs.statSync(path.join(dir,b)).mtimeMs - fs.statSync(path.join(dir,a)).mtimeMs);
  return path.join(dir, files[0]);
}

// Optionally run sub-scans if they exist (non-fatal if missing)
function runIfExists(rel) {
  const p = path.join(ROOT, rel);
  if (!has(p)) return { ok: false, msg: `Skipped: ${rel} not found` };
  const r = cp.spawnSync('node', [p], { stdio: 'inherit' });
  return { ok: r.status === 0, msg: `${rel} exited ${r.status}` };
}

console.log('→ Running repo health scan…');
runIfExists('tools/scripts/repo-health.cjs');

console.log('→ Running web tRPC scan…');
runIfExists('tools/scripts/trpc-web-scan.cjs');

// Accept Vitest OR Jest config for web app
const jestTs = path.join(ROOT, 'web/jest.config.ts');
const jestJs = path.join(ROOT, 'web/jest.config.js');
const vitestTs = path.join(ROOT, 'web/vitest.config.ts');

const missing = [];
if (!hasAny([jestTs, jestJs, vitestTs])) {
  missing.push('• web/jest.config.(ts|js) OR web/vitest.config.ts');
  missing.push('• WEB_TEST_CONFIG_MISSING');
}

// Summaries from /scans (best-effort)
const healthJson = latestMatch(scansDir, /^repo-health-.*\.json$/);
const trpcJson   = latestMatch(scansDir, /^trpc-scan-report-.*\.json$/);

console.log('\n================ FINAL SCAN SUMMARY ================');
if (missing.length) {
  console.log('Missing / Blocking:');
  for (const line of missing) console.log('  ' + line);
} else {
  console.log('No blocking items ���');
}
console.log(`\nhealth JSON: ${healthJson || '(none found)'}`);
console.log(`trpc   JSON: ${trpcJson || '(none found)'}`);
console.log('====================================================\n');

process.exit(missing.length ? 2 : 0);

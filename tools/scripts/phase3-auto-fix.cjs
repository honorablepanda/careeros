/* tools/scripts/phase3-auto-fix.cjs
 * - Patches apps/api/src/router/summary.ts:
 *    • Replaces statusMap reduce (with TS generic) -> simple for..of accumulator (no generics)
 *    • Replaces Object.entries(statusMap) mapping -> Object.keys(statusMap) mapping to keep 'count' as number
 * - Fixes web/vitest.config.ts include glob (removes stray space after "spec")
 * - With --verify, runs pnpm -w build && pnpm -w test and logs a short summary
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const repo = process.cwd();
const apiSummary = path.join(repo, 'apps/api/src/router/summary.ts');
const webVitest = path.join(repo, 'web/vitest.config.ts');

function backup(file) {
  const bak = file + '.' + Date.now() + '.bak';
  fs.copyFileSync(file, bak);
  return bak;
}

function safeRead(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  console.log('✓ wrote', file);
}

function patchSummary(src) {
  let changed = false;
  let out = src;

  // --- Patch A: Replace statusMap reduce<> with a for..of aggregation (avoids "Untyped function calls may not accept type arguments")
  // Match the entire "const statusMap = statuses.reduce<...>(...);" block, being tolerant of whitespace/newlines.
  const reduceBlockRe =
    /const\s+statusMap\s*=\s*statuses\.reduce\s*<\s*Record\s*<\s*string\s*,\s*number\s*>\s*>\s*\(\s*\(\s*acc\s*,\s*\{\s*status\s*\}\s*\)\s*=>\s*\{\s*([\s\S]*?)\}\s*\)\s*;?/m;

  if (reduceBlockRe.test(out)) {
    out = out.replace(
      reduceBlockRe,
      `const statusMap: Record<string, number> = {};
for (const { status } of statuses) {
  const key = status ?? "UNKNOWN";
  statusMap[key] = (statusMap[key] ?? 0) + 1;
}`
    );
    console.log(
      '• summary.ts: replaced statuses.reduce<...> with for..of accumulator'
    );
    changed = true;
  } else {
    // Fallback: catch any reduce with generic OR reduce without initial value
    const anyReduceRe =
      /const\s+statusMap\s*=\s*statuses\.reduce\s*\(\s*\(\s*acc\s*,\s*\{\s*status\s*\}\s*\)\s*=>\s*\{\s*([\s\S]*?)\}\s*\)\s*;?/m;
    if (anyReduceRe.test(out)) {
      out = out.replace(
        anyReduceRe,
        `const statusMap: Record<string, number> = {};
for (const { status } of statuses) {
  const key = status ?? "UNKNOWN";
  statusMap[key] = (statusMap[key] ?? 0) + 1;
}`
      );
      console.log(
        '• summary.ts: replaced statuses.reduce(...) with for..of accumulator'
      );
      changed = true;
    }
  }

  // --- Patch B: Replace Object.entries(statusMap).map(([status, count]) => ({ status, count }))
  // with Object.keys(statusMap).map(status => ({ status, count: statusMap[status] ?? 0 }))
  const entriesMapRe =
    /const\s+statusCounts\s*:\s*StatusCount\[\]\s*=\s*Object\.entries\(\s*statusMap\s*\)\.map\(\s*\(\s*\[\s*status\s*,\s*count\s*\]\s*\)\s*=>\s*\(\s*\{\s*status\s*,\s*count\s*\}\s*\)\s*\)\s*;?/m;

  if (entriesMapRe.test(out)) {
    out = out.replace(
      entriesMapRe,
      `const statusCounts: StatusCount[] = Object.keys(statusMap).map((status) => ({
  status,
  count: statusMap[status] ?? 0,
}));`
    );
    console.log(
      '• summary.ts: swapped Object.entries(...) for Object.keys(...) to keep count:number'
    );
    changed = true;
  }

  return { changed, out };
}

function patchVitestConfig(src) {
  let changed = false;
  let out = src;

  // Fix include: src/**/*.{test,spec }.{ts,tsx}  ->  src/**/*.{test,spec}.{ts,tsx}
  out = out.replace(/(\{\s*test\s*,\s*spec)\s+\}\.\{ts,tsx\}/g, '$1}.{ts,tsx}');

  if (out !== src) {
    console.log(
      '• vitest.config.ts: fixed include glob (removed stray space after "spec")'
    );
    changed = true;
  }

  // Optional: also ensure it’s an array if it was a bare string
  out = out.replace(
    /include\s*:\s*(['"])([^'"]+)\1\s*,/m,
    (_m, _q, p1) => `include: ["${p1}"],`
  );

  return { changed, out };
}

function run(cmd, args) {
  return cp.spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

// ---- Run patches
let summaryPatched = false;
let vitestPatched = false;

if (fs.existsSync(apiSummary)) {
  const src = safeRead(apiSummary);
  const { changed, out } = patchSummary(src);
  if (changed) {
    const bak = backup(apiSummary);
    write(apiSummary, out);
    console.log('  backup:', bak);
  } else {
    console.log('• summary.ts: no change needed');
  }
  summaryPatched = changed;
} else {
  console.log('! summary.ts not found at', apiSummary);
}

if (fs.existsSync(webVitest)) {
  const src = safeRead(webVitest);
  const { changed, out } = patchVitestConfig(src);
  if (changed) {
    const bak = backup(webVitest);
    write(webVitest, out);
    console.log('  backup:', bak);
  } else {
    console.log('• vitest.config.ts: no change needed');
  }
  vitestPatched = changed;
} else {
  console.log('! vitest.config.ts not found at', webVitest);
}

const verify = process.argv.includes('--verify');
if (verify) {
  console.log('\n→ Verifying: pnpm -w build');
  const b = run('pnpm', ['-w', 'build']);
  console.log('\n→ Verifying: pnpm -w test');
  const t = run('pnpm', ['-w', 'test']);

  const bexit = b.status ?? 1;
  const texit = t.status ?? 1;
  console.log('\n———— Summary ————');
  console.log('summary.ts patched:', summaryPatched ? 'yes' : 'no');
  console.log('vitest.config.ts patched:', vitestPatched ? 'yes' : 'no');
  console.log('build exit:', bexit);
  console.log('test exit:', texit);
}

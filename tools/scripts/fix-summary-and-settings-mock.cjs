const fs = require('fs');
const path = require('path');

const repo = process.cwd();
const exists = p => fs.existsSync(p);
const read = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); console.log('✓', p); };

/**
 * 1) Patch apps/api/src/router/summary.ts
 *    - Replace any "select: { source: true }" + reduce over { source }
 *      with a safe status-based aggregation that returns the same shape.
 */
(function patchSummary() {
  const file = path.join(repo, 'apps/api/src/router/summary.ts');
  if (!exists(file)) { console.log('• summary.ts not found, skip'); return; }
  let src = read(file);

  // If it already uses status, skip
  if (src.includes("select: { status: true }")) {
    console.log('• summary.ts already uses status aggregation, skip');
    return;
  }

  // Replace findMany select with status
  src = src.replace(/select:\s*\{\s*source:\s*true\s*\}/g, "select: { status: true }");

  // Replace reduce destructuring over { source } to { status }
  src = src.replace(
    /reduce<[^>]*>\(\s*([^,]+)\s*,\s*\{\s*source\s*\}\s*\)\s*\{/g,
    'reduce<$1>((acc, { status }) => {'
  );
  // Replace uses of "source" key in the reducer (key = source ?? 'Unknown')
  src = src.replace(/const\s+key\s*=\s*source\s*\?\?\s*['"]Unknown['"]/g, "const key = status ?? 'UNKNOWN'");

  // Replace map to maintain "sourceGrp" shape if present
  // If there's a construction of entries mapped to { source, _count: { _all } }
  // leave it as-is, since we’re still naming the left key "source".
  write(file, src);
  console.log('• Patched summary.ts to use status aggregation');
})();

/**
 * 2) Extend web/vitest.setup.ts mock with `settings`
 */
(function patchVitestMock() {
  const file = path.join(repo, 'web/vitest.setup.ts');
  if (!exists(file)) { console.log('• web/vitest.setup.ts not found, skip'); return; }
  let src = read(file);

  // If settings already present, skip
  if (/trpc:\s*\{\s*[^}]*settings\s*:\s*\{/.test(src)) {
    console.log('• vitest.setup.ts already mocks settings, skip');
    return;
  }

  // Add settings mocks to the returned object
  src = src.replace(
    /return\s*\{\s*trpc:\s*\{/,
    `return { trpc: { settings: { get: { useQuery: () => ({ data: { theme: 'system', timezone: 'UTC', notifications: true }, isLoading: false, isSuccess: true }) }, update: { useMutation: () => ({ isLoading: false, isSuccess: true, error: undefined, mutate: () => {} }) } },`
  );

  write(file, src);
  console.log('• Added settings mocks to web/vitest.setup.ts');
})();

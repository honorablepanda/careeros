/**
 * normalize-activity-repo.cjs
 * - Convert 'CREATED' → 'CREATE'
 * - Ensure payload shapes:
 *     createApplication → payload: { data: input }
 *     updateApplication → payload: { to: <status> }
 * - Move stray top-level by/from/to into payload or drop if redundant
 * - Replace select { role: true } → { title: true } in helper scripts
 * - Enforce findMany(... orderBy: { createdAt: 'desc' })
 *
 * Targets derived from your scan output.
 */
const fs = require('fs');
const path = require('path');

const files = [
  // Router
  'apps/api/src/trpc/routers/tracker.router.ts',

  // Tooling & patchers referenced in your logs
  'tools/scripts/auto-wire-activity.cjs',
  'tools/scripts/check-activity-readiness.cjs',
  'tools/scripts/deep-scan-activity.cjs',
  'tools/scripts/dev-activity.cjs',
  'tools/scripts/fix-tracker-activity.cjs',
  'tools/scripts/patch-activity-router.cjs',
  'tools/scripts/patch-next15-activity-pages.cjs',
  'tools/scripts/scaffold-application-activity.cjs',
  'tools/scripts/scan-tracker-activity.cjs',
  'tools/scripts/seed-activity.cjs',
  'tools/scripts/seed-and-verify-activity.cjs',
  'tools/scripts/try-activity-variants.cjs',

  // Pages you showed (defensive; no-ops if already correct)
  'web/app/tracker/activity/page.tsx',
  'web/app/tracker/[id]/activity/page.tsx',
];

function readMaybe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function w(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, 'utf8');
}

let changed = 0, skipped = 0;
for (const f of files) {
  const body = readMaybe(f);
  if (body == null) { skipped++; continue; }
  let s = body;

  // 1) Normalize enum value to 'CREATE'
  s = s.replace(/type:\s*'CREATED'/g, "type: 'CREATE'");

  // 2) Ensure create payload shape: payload: { data: input }
  //    (covers prismaAny.applicationActivity.create({... created.id ...}))
  s = s.replace(
    /applicationActivity\.create\(\s*\{\s*data\s*:\s*\{\s*applicationId\s*:\s*created\.id\s*,\s*type\s*:\s*'CREATE'[^}]*\}\s*\}\s*\)/g,
    m => {
      // If already has payload: { data: input }, leave it.
      if (/payload\s*:\s*\{\s*data\s*:\s*input\s*\}/.test(m)) return m;
      // Replace whatever payload is with the canonical shape
      return "applicationActivity.create({\n        data: { applicationId: created.id, type: 'CREATE', payload: { data: input } },\n      })";
    }
  );

  // 3) Ensure update payload shape: payload: { to: nextStatus }
  s = s.replace(
    /applicationActivity\.create\(\s*\{\s*data\s*:\s*\{\s*applicationId\s*:\s*input\.id\s*,\s*type\s*:\s*'STATUS_CHANGE'[^}]*\}\s*\}\s*\)/g,
    m => {
      // Try to find explicit variable/expr after "to:"
      let toExpr = 'nextStatus';
      const mTo = m.match(/to\s*:\s*([a-zA-Z0-9_.$]+)/);
      if (mTo) toExpr = mTo[1];
      return `applicationActivity.create({
        data: { applicationId: input.id, type: 'STATUS_CHANGE', payload: { to: ${toExpr} } },
      })`;
    }
  );

  // 4) Remove/relocate stray top-level fields by/from/to → into payload or drop
  // These appear in try-activity-variants.cjs older branches.
  s = s
    // created branch with by
    .replace(
      /applicationActivity\.create\(\s*\{\s*data\s*:\s*\{\s*applicationId\s*:\s*created\.id\s*,\s*type\s*:\s*'CREATE'[^}]*by\s*:\s*['"][^'"]+['"][^}]*\}\s*\}\s*\)/g,
      "applicationActivity.create({\n        data: { applicationId: created.id, type: 'CREATE', payload: { data: input } },\n      })"
    )
    // status change with from/to/by
    .replace(
      /applicationActivity\.create\(\s*\{\s*data\s*:\s*\{\s*applicationId\s*:\s*input\.id\s*,\s*type\s*:\s*'STATUS_CHANGE'[^}]*\}\s*\}\s*\)/g,
      `applicationActivity.create({
        data: { applicationId: input.id, type: 'STATUS_CHANGE', payload: { to: nextStatus } },
      })`
    );

  // 5) Ensure findMany sorts desc by createdAt (if not already)
  s = s.replace(
    /applicationActivity\.findMany\(\s*\{\s*where\s*:\s*\{\s*applicationId\s*:\s*([^)]+?)\}\s*(?:,\s*orderBy\s*:\s*\{\s*createdAt\s*:\s*'desc'\s*\})?/g,
    "applicationActivity.findMany({ where: { applicationId: $1}, orderBy: { createdAt: 'desc' }"
  );

  // 6) Replace role→title in select objects inside helper scripts/pages
  s = s.replace(/select\s*:\s*\{\s*([^}]*)\}/g, (m, inner) => {
    // Cheap and safe: swap "role: true" → "title: true" if present
    const fixed = inner.replace(/\brole\s*:\s*true\b/g, 'title: true');
    return `select: { ${fixed} }`;
  });

  if (s !== body) { w(f, s); changed++; } else { skipped++; }
}

console.log(`normalize-activity-repo: changed ${changed}, skipped ${skipped}`);

#!/usr/bin/env node
/**
 * Loud, idempotent scanner for Tracker Activity integration.
 * - Crawls the repo (excluding node_modules/.git/.next/dist/out/build/.turbo)
 * - Logs every relevant match with context lines
 * - Summarizes PASS/WARN/FAIL per check
 *
 * Usage:
 *   node tools/scripts/scan-tracker-activity.cjs         # verbose log
 *   node tools/scripts/scan-tracker-activity.cjs --quiet # summary only
 */
const fs = require('fs');
const path = require('path');

const QUIET = process.argv.includes('--quiet');
const ROOT = process.cwd();
const EXCLUDES = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.turbo',
  'out',
]);

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function log(...a) {
  if (!QUIET) console.log(...a);
}
function section(t) {
  console.log('\n' + cyan(`== ${t} ==`));
}
function ok(t) {
  console.log(green('✓ ') + t);
}
function warn(t) {
  console.log(yellow('⚠ ') + t);
}
function fail(t) {
  console.log(red('✗ ') + t);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDES.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}
function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function contextSnippet(norm, idx, len = 120) {
  const start = Math.max(0, idx - len);
  const end = Math.min(norm.length, idx + len);
  return norm.slice(start, end).replace(/\t/g, '  ');
}

function findFirstFile(names) {
  for (const n of names) {
    const p = path.join(ROOT, n);
    if (exists(p)) return p;
  }
  // fallback: crawl and look for the filename tail
  const all = walk(ROOT);
  const cand = all.find((f) => names.some((n) => f.endsWith(n)));
  return cand || null;
}

// ---------- 1) Tracker router checks ----------
section('API: tracker.router.ts');

const routerFile = findFirstFile([
  path.join('apps', 'api', 'norm', 'trpc', 'routers', 'tracker.router.ts'),
  path.join('packages', 'api', 'norm', 'trpc', 'routers', 'tracker.router.ts'),
  'tracker.router.ts',
]);

if (!routerFile) {
  fail('tracker.router.ts not found anywhere.');
} else {
  ok(`router found -> ${path.relative(ROOT, routerFile)}`);
  const norm = read(routerFile);

  // getApplicationActivity presence + prisma call + orderBy createdAt
  const hasGetActivity = /getApplicationActivity\s*:\s*publicProcedure/.test(
    norm
  );
  if (hasGetActivity) {
    ok('getApplicationActivity: symbol present');
    const m =
      /applicationActivity\s*\.\s*findMany\s*\(\s*\{[\s\S]*?where\s*:\s*\{\s*applicationId\s*:\s*input\.id\s*\}[\s\S]*?orderBy\s*:\s*\{\s*createdAt\s*:\s*'desc'\s*\}[\s\S]*?\}\s*\)/m.exec(
        norm
      );
    if (m) {
      const idx = m.index;
      ok(
        'getApplicationActivity: calls prisma.applicationActivity.findMany with orderBy createdAt desc'
      );
      log(dim(contextSnippet(norm, idx)));
    } else {
      warn(
        'getApplicationActivity: could not verify prisma call + orderBy createdAt desc (pattern not found).'
      );
    }
  } else {
    fail('getApplicationActivity: NOT present.');
  }

  // createApplication writes CREATED activity
  const createBlock =
    /createApplication\s*:\s*publicProcedure[\s\S]*?\.mutation\([\s\S]*?\{([\s\S]*?)\}\s*\)\s*,?/m.exec(
      norm
    );
  if (!createBlock) {
    warn('createApplication: block not found (name or structure differs).');
  } else {
    const body = createBlock[1];
    const hasCreate =
      /applicationActivity\s*\.\s*create\s*\([\s\S]*type\s*:\s*['"]CREATED['"]/.test(
        body
      );
    if (hasCreate) {
      ok('createApplication: writes activity type "CREATED".');
      log(
        dim(
          contextSnippet(body, body.search(/applicationActivity\s*\.\s*create/))
        )
      );
    } else {
      fail('createApplication: NO activity write detected (type "CREATED").');
    }
  }

  // updateApplication writes STATUS_CHANGE when status present
  const updateBlock =
    /updateApplication\s*:\s*publicProcedure[\s\S]*?\.mutation\([\s\S]*?\{([\s\S]*?)\}\s*\)\s*,?/m.exec(
      norm
    );
  if (!updateBlock) {
    warn('updateApplication: block not found (name or structure differs).');
  } else {
    const body = updateBlock[1];
    const hasStatusChange =
      /applicationActivity\s*\.\s*create\s*\([\s\S]*type\s*:\s*['"]STATUS_CHANGE['"]/.test(
        body
      );
    if (hasStatusChange) {
      ok(
        'updateApplication: writes activity type "STATUS_CHANGE" (status change).'
      );
      log(
        dim(
          contextSnippet(body, body.search(/applicationActivity\s*\.\s*create/))
        )
      );
    } else {
      fail('updateApplication: NO status-change activity write detected.');
    }
  }
}

// ---------- 2) Prisma schema checks ----------
section('Prisma: ApplicationActivity model');

const schemaFile = findFirstFile([
  path.join('apps', 'api', 'prisma', 'schema.prisma'),
  path.join('prisma', 'schema.prisma'),
]);

if (!schemaFile) {
  warn('schema.prisma not found (cannot verify ApplicationActivity model).');
} else {
  ok(`schema found -> ${path.relative(ROOT, schemaFile)}`);
  const schema = read(schemaFile);
  const modelMatch = /model\s+ApplicationActivity\s*\{([\s\S]*?)\}/m.exec(
    schema || ''
  );
  if (!modelMatch) {
    warn(
      'No "model ApplicationActivity" in schema.prisma (router will gracefully no-op).'
    );
  } else {
    ok('model ApplicationActivity exists.');
    const modelBody = modelMatch[1];
    const hasAppId = /applicationId\s*:\s*\w+/.test(modelBody);
    const hasCreatedAt = /createdAt\s*:\s*DateTime/.test(modelBody);
    const hasType = /type\s*:\s*\w+/.test(modelBody);
    if (hasAppId && hasCreatedAt && hasType) {
      ok(
        'ApplicationActivity: has applicationId, createdAt, type (basic fields present).'
      );
    } else {
      warn(
        'ApplicationActivity: missing one of applicationId/createdAt/type fields.'
      );
    }
    log(dim(modelBody.trim()));
  }
}

// ---------- 3) Web activity page checks ----------
section('Web: tracker/activity page');

const pageFile = findFirstFile([
  path.join('web', 'norm', 'app', 'tracker', 'activity', 'page.tsx'),
  path.join('apps', 'web', 'norm', 'app', 'tracker', 'activity', 'page.tsx'),
]);
if (!pageFile) {
  warn('web tracker activity page not found.');
} else {
  ok(`activity page -> ${path.relative(ROOT, pageFile)}`);
  const pageSrc = read(pageFile) || '';
  if (/<h1>\s*Tracker Activity\s*<\/h1>/.test(pageSrc)) {
    ok('page renders <h1>Tracker Activity</h1>');
  } else {
    fail('page does NOT render the expected <h1> heading.');
  }
  if (/No activity/i.test(pageSrc)) {
    ok('page contains "No activity" fallback text.');
  } else {
    warn('page is missing "No activity" fallback text (or text differs).');
  }

  // import alias check
  const importMatch = /from\s+['"](@\/trpc\/react)['"]/.exec(pageSrc);
  const usesAlias = !!importMatch;
  const alias = usesAlias ? importMatch[1] : null;
  if (usesAlias) {
    ok(`page imports TRPC via alias: ${alias}`);
  } else {
    warn('page does not import TRPC via "@/trpc/react" alias.');
  }

  // tsconfig paths & actual trpc file
  const tsconfigs = [
    path.join('web', 'tsconfig.json'),
    path.join('web', 'tsconfig.app.json'),
    path.join('apps', 'web', 'tsconfig.json'),
    path.join('apps', 'web', 'tsconfig.app.json'),
  ].map((p) => ({ p: path.join(ROOT, p), j: read(path.join(ROOT, p)) }));

  const present = tsconfigs
    .filter((t) => t.j)
    .map((t) => {
      try {
        return { p: t.p, json: JSON.parse(t.j) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  let hasAlias = false;
  for (const t of present) {
    const paths = t.json?.compilerOptions?.paths || {};
    if (paths['@/*']) hasAlias = true;
    log(
      dim(
        `tsconfig: ${path.relative(ROOT, t.p)} paths keys: ${
          Object.keys(paths).join(', ') || '(none)'
        }`
      )
    );
  }
  if (hasAlias) ok('tsconfig paths includes "@/*" -> "norm/*" (or similar).');
  else
    warn(
      'tsconfig paths does NOT include "@/*" mapping; alias may fail to resolve.'
    );

  // Actual TRPC client file existence
  const trpcCandidates = [
    path.join('web', 'norm', 'trpc', 'react.ts'),
    path.join('web', 'norm', 'trpc', 'react-client.ts'),
    path.join('apps', 'web', 'norm', 'trpc', 'react.ts'),
    path.join('apps', 'web', 'norm', 'trpc', 'react-client.ts'),
  ];
  const foundTrpc = trpcCandidates.find(exists);
  if (foundTrpc)
    ok(`TRPC client file found -> ${path.relative(ROOT, foundTrpc)}`);
  else
    warn(
      'No TRPC client file found under web/norm/trpc/*.ts (alias will fail).'
    );
}

// ---------- Summary ----------
section('Summary');

const notes = [];
function collect(line) {
  notes.push(line);
  console.log(line);
}

// We’ll re-run the quick checks and convert them into PASS/FAIL/WARN lines.
(function summarize() {
  // Router existence
  if (!routerFile) collect(red('FAIL') + ' tracker.router.ts not found.');
  // Nothing else to re-run here since we printed above already.
})();

console.log(
  '\n' +
    cyan(
      'Done. If any FAIL/WARN appear above, they are the exact fixes tests are expecting.'
    )
);

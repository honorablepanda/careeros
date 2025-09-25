/* Super-verbose verifier for Tracker Activity (API + Web)
 * Checks (aligned with tests):
 *  - createApplication: permissive input + CREATE with payload.data
 *  - updateApplication: STATUS_CHANGE with payload.to
 *  - getApplicationActivity: findMany ordered by createdAt desc
 *  - Web alias @/trpc/react and activity page basics
 *  - Prints every applicationActivity.* use with context
 * CLI:
 *   node tools/scripts/verify-activity.cjs [--json] [--quiet]
 * Exit code: 0 when all pass; 1 when any fail; 0 for --json (always)
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const QUIET = process.argv.includes('--quiet');
const JSON_OUT = process.argv.includes('--json');

const P = (...p) => path.join(ROOT, ...p);
const globby = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, name.name);
      if (name.isDirectory()) walk(fp);
      else out.push(fp);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
};
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

const COLORS = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const ok = (msg) => !QUIET && console.log(COLORS.g('✓'), msg);
const warn = (msg) => !QUIET && console.log(COLORS.y('⚠'), msg);
const fail = (msg) => !QUIET && console.log(COLORS.r('✗'), msg);
const title = (t) => !QUIET && console.log(`\n== ${t} ==`);
const block = (s) => !QUIET && console.log(COLORS.dim(s));

const result = {
  api: {
    trackerFile: null,
    createOk: false,
    updateOk: false,
    getActivityOk: false,
    previews: { create: '', update: '', get: '' },
  },
  web: {
    tsconfigOk: false,
    aliasOk: false,
    trpcStubOk: false,
    activityPageOk: false,
    issues: [],
  },
  refs: [],
  pass: true,
};
// Fallback: look into compiled Next route for evidence of correct shapes
const ROUTE_FALLBACK_OK = (needle) => {
  try {
    const paths = [
      'web/.next/server/app/api/trpc/[trpc]/route.js',
      '.nx/cache', // search cache bundle as seen in logs
    ];
    for (const p of paths) {
      if (!fs.existsSync(p)) continue;
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        // naive directory walk
        const stack = [p];
        while (stack.length) {
          const d = stack.pop();
          for (const f of fs.readdirSync(d)) {
            const full = d + '/' + f;
            const st = fs.statSync(full);
            if (st.isDirectory()) stack.push(full);
            else if (f === 'route.js') {
              const js = fs.readFileSync(full, 'utf8');
              if (needle.test(js)) return true;
            }
          }
        }
      } else {
        const js = fs.readFileSync(p, 'utf8');
        if (needle.test(js)) return true;
      }
    }
  } catch {}
  return false;
};

function snippet(norm, i, span = 140) {
  const a = Math.max(0, i - span);
  const b = Math.min(norm.length, i + span);
  return norm.slice(a, b);
}

// Find tracker router (prefer apps/api)
let trackerPath = null;
const candidates = globby(P('apps')).filter((p) =>
  /tracker\.router\.ts$/.test(p)
);
trackerPath =
  candidates.find((p) => /apps[\/\\]api[\/\\]/.test(p)) || candidates[0];

title('API: tracker.router.ts');
if (!trackerPath) {
  result.pass = false;
  fail('router not found anywhere under apps/*');
} else {
  result.api.trackerFile = path.relative(ROOT, trackerPath);
  ok(`router found -> ${result.api.trackerFile}`);
  const norm = read(trackerPath);

  // getApplicationActivity
  {
    const sym = /getApplicationActivity\s*:\s*publicProcedure/i.test(norm);
    const fm = norm.match(
      /applicationActivity\s*\.\s*findMany\s*\(\s*\{\s*where\s*:\s*\{\s*applicationId\s*:\s*input\.id\s*\}\s*,\s*orderBy\s*:\s*\{\s*createdAt\s*:\s*'desc'\s*\}\s*\}\s*\)/m
    );
    if (sym && fm) {
      result.api.getActivityOk = true;
      ok('getApplicationActivity present + ordered by createdAt desc');
      result.api.previews.get = snippet(norm, fm.index);
    } else {
      result.pass = false;
      fail(
        'getApplicationActivity missing or not calling findMany with createdAt desc'
      );
      result.api.previews.get = snippet(
        norm,
        norm.indexOf('getApplicationActivity') || 0
      );
    }
  }

  // createApplication: permissive input + CREATE with payload.data
  {
    const blockMatch = norm.match(
      /createApplication\s*:\s*publicProcedure[\s\S]*?\.mutation\([\s\S]*?\}\),/m
    );
    if (!blockMatch) {
      result.pass = false;
      fail('createApplication block not found');
    } else {
      const blockSrc = blockMatch[0];
      result.api.previews.create = blockSrc;
      const permissive =
        /\.input\(\s*z\.object\(\{\}\)\.passthrough\(\)\s*\)/m.test(blockSrc);
      const activity =
        /applicationActivity\s*\.\s*create\s*\(\s*\{\s*data\s*:\s*\{\s*applicationId\s*:\s*.*?,\s*type\s*:\s*'CREATE'\s*,\s*payload\s*:\s*\{\s*data\s*:\s*input\s*\}\s*\}\s*\}\s*\)/m.test(
          blockSrc
        );
      if (permissive) ok('createApplication: permissive input');
      else {
        result.pass = false;
        fail(
          'createApplication: input is NOT permissive (.passthrough missing)'
        );
      }
      if (activity)
        ok(
          "createApplication: writes { type: 'CREATE', payload: { data: input } }"
        );
      else {
        result.pass = false;
        fail(
          "createApplication: activity shape mismatch — expected type 'CREATE' with payload.data"
        );
      }
      result.api.createOk = permissive && activity;
    }
  }

  // updateApplication: STATUS_CHANGE + payload.to
  {
    const blockMatch = norm.match(
      /updateApplication\s*:\s*publicProcedure[\s\S]*?\.mutation\([\s\S]*?\}\),/m
    );
    if (!blockMatch) {
      result.pass = false;
      fail('updateApplication block not found');
    } else {
      const blockSrc = blockMatch[0];
      result.api.previews.update = blockSrc;
      const statusChange =
        /applicationActivity\s*\.\s*create\s*\(\s*\{\s*data\s*:\s*\{\s*applicationId\s*:\s*.*?,\s*type\s*:\s*'STATUS_CHANGE'\s*,\s*payload\s*:\s*\{\s*to\s*:\s*.*?\}\s*\}\s*\}\s*\)/m.test(
          blockSrc
        );
      if (statusChange)
        ok(
          "updateApplication: writes { type: 'STATUS_CHANGE', payload: { to } }"
        );
      else {
        result.pass = false;
        fail(
          'updateApplication: activity shape mismatch — expected STATUS_CHANGE with payload.to'
        );
      }
      result.api.updateOk = statusChange;
    }
  }
}

// Prisma model (optional)
title('Prisma: ApplicationActivity model');
{
  const schema = P('prisma/schema.prisma');
  if (!exists(schema)) {
    warn('schema.prisma not found');
  } else {
    const s = read(schema);
    if (/model\s+ApplicationActivity\b/.test(s)) {
      ok('ApplicationActivity model present (optional)');
    } else {
      warn('No model ApplicationActivity (router guards; tests still pass)');
    }
  }
}

// Web checks
title('Web: TRPC + Activity page');
{
  const tsconfig = P('web/tsconfig.json');
  if (exists(tsconfig)) {
    result.web.tsconfigOk = true;
    const j = JSON.parse(read(tsconfig));
    const paths = (j.compilerOptions && j.compilerOptions.paths) || {};
    if (paths['@/*'] && Array.isArray(paths['@/*'])) {
      ok('tsconfig: "@/*" alias present');
      result.web.aliasOk = true;
    } else {
      result.web.issues.push('Missing "@/*" path alias in web/tsconfig.json');
      fail('tsconfig: missing "@/*" alias');
      result.pass = false;
    }
  } else {
    result.web.issues.push('web/tsconfig.json missing');
    fail('web/tsconfig.json missing');
    result.pass = false;
  }

  const trpcStub = P('web/norm/trpc/react.ts');
  if (exists(trpcStub)) {
    ok('TRPC stub present -> web/norm/trpc/react.ts');
    result.web.trpcStubOk = true;
  } else {
    result.web.issues.push('web/norm/trpc/react.ts missing');
    fail('TRPC stub missing (alias "@/trpc/react" will fail)');
    result.pass = false;
  }

  const activityPage = P('web/norm/app/tracker/activity/page.tsx');
  if (exists(activityPage)) {
    const s = read(activityPage);
    const heading = /<h1>\s*Tracker Activity\s*<\/h1>/i.test(s);
    const fallback = /No activity/i.test(s);
    if (heading) ok('activity page: renders <h1>Tracker Activity</h1>');
    else {
      fail('activity page: heading missing');
      result.pass = false;
    }
    if (fallback) ok('activity page: contains "No activity" fallback');
    else {
      fail('activity page: "No activity" fallback missing');
      result.pass = false;
    }
    result.web.activityPageOk = heading && fallback;
  } else {
    fail('activity page missing at web/norm/app/tracker/activity/page.tsx');
    result.web.activityPageOk = false;
    result.pass = false;
  }
}

// Print all applicationActivity.* refs with context
title('Repo: applicationActivity.* references');
{
  const files = globby(ROOT).filter(
    (p) =>
      /\.(ts|tsx|cjs|mjs|js)$/.test(p) &&
      !/node_modules/.test(p) &&
      !/dist\//.test(p)
  );
  const refs = [];
  for (const fp of files) {
    const s = read(fp);
    const re = /applicationActivity\.(create|findMany)/g;
    let m;
    while ((m = re.exec(s))) {
      refs.push({
        file: path.relative(ROOT, fp),
        index: m.index,
        kind: m[1],
        context: snippet(s, m.index),
      });
    }
  }
  result.refs = refs;
  if (!QUIET) {
    if (refs.length === 0) warn('• no references found');
    else {
      for (const r of refs) {
        console.log('→', r.file);
        block(r.context);
      }
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

title('Summary');
if (result.pass) ok('All checks passed');
else fail('One or more checks failed');
process.exit(result.pass ? 0 : 1);

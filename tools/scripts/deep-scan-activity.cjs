#!/usr/bin/env node
/**
 * Deep scanner for Application Activity + Tracker module.
 * - Recursively scans the entire repo (excludes node_modules/.git/dist/build)
 * - Finds and prints:
 *    • tracker.router.ts existence and the exact mutation blocks
 *    • Whether createApplication input is permissive (no required userId)
 *    • Whether createApplication writes activity with EXACT test shape:
 *        { data: { applicationId, type: 'CREATE', payload: { data: <input> } } }
 *    • Whether updateApplication writes activity with EXACT test shape:
 *        { data: { applicationId, type: 'STATUS_CHANGE', payload: { to: <status> } } }
 *    • Any applicationActivity.* calls anywhere in the repo (with line snippets)
 *    • Prisma model existence
 *    • Web TRPC alias + stub client
 * - Outputs rich logs by default, or JSON with --json, or minimal with --quiet
 *
 * Exit code is always 0 — this is a diagnostics tool, not a gate.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const QUIET = process.argv.includes('--quiet');
const AS_JSON = process.argv.includes('--json');

const COLORS = {
  gray: (s) => (QUIET || AS_JSON ? s : `\x1b[90m${s}\x1b[0m`),
  red: (s) => (QUIET || AS_JSON ? s : `\x1b[31m${s}\x1b[0m`),
  yellow: (s) => (QUIET || AS_JSON ? s : `\x1b[33m${s}\x1b[0m`),
  green: (s) => (QUIET || AS_JSON ? s : `\x1b[32m${s}\x1b[0m`),
  cyan: (s) => (QUIET || AS_JSON ? s : `\x1b[36m${s}\x1b[0m`),
  bold: (s) => (QUIET || AS_JSON ? s : `\x1b[1m${s}\x1b[0m`),
};

const P = (...p) => path.join(ROOT, ...p);
const has = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};
const read = (p) => fs.readFileSync(p, 'utf8');

/* -------------------------------- utils ----------------------------------- */

function walk(dir, out = []) {
  const ents = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of ents) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      // skip heavy/irrelevant dirs
      if (
        /(^|[\\/])(?:node_modules|.git|dist|build|.next|out|coverage)([\\/]|$)/.test(
          fp
        )
      )
        continue;
      walk(fp, out);
    } else {
      out.push(fp);
    }
  }
  return out;
}

function grepFile(file, pat) {
  const norm = read(file);
  const lines = norm.split(/\r?\n/);
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    if (pat.test(lines[i])) {
      const from = Math.max(0, i - 2);
      const to = Math.min(lines.length - 1, i + 2);
      results.push({
        line: i + 1,
        context: lines.slice(from, to + 1).join('\n'),
      });
    }
  }
  return results;
}

function blockBetween(norm, startIdx) {
  // heuristic: find `.mutation(` ... ending `}),`
  const mIdx = norm.indexOf('.mutation', startIdx);
  if (mIdx === -1) return null;
  const end = norm.indexOf('}),', mIdx);
  if (end === -1) return null;
  return norm.slice(mIdx, end + 3);
}

function logTitle(title) {
  if (AS_JSON) return;
  console.log('\n' + COLORS.bold(`== ${title} ==`));
}

function logLine(msg) {
  if (AS_JSON) return;
  console.log(msg);
}

/* ----------------------------- scan definitions --------------------------- */

const trackerPath = P(
  'apps',
  'api',
  'norm',
  'trpc',
  'routers',
  'tracker.router.ts'
);
const prismaSchema = P('prisma', 'schema.prisma');
const webTsconfig = P('web', 'tsconfig.json');
const webTrpcStub = P('web', 'norm', 'trpc', 'react.ts');

const EXPECT = {
  createActivity:
    /applicationActivity\.create\(\s*\{\s*data:\s*\{\s*applicationId:\s*[^}]+type:\s*'CREATE'\s*,\s*payload:\s*\{\s*data:\s*[^}]+\}\s*\}\s*\}\s*\)/m,
  updateActivity:
    /applicationActivity\.create\(\s*\{\s*data:\s*\{\s*applicationId:\s*[^}]+type:\s*'STATUS_CHANGE'\s*,\s*payload:\s*\{\s*to:\s*[^}]+\}\s*\}\s*\}\s*\)/m,
  inputPermissive:
    /\.input\(\s*z\.object\(\s*\{\s*\}\s*\)\.passthrough\(\)\s*\)/m,
  inputRequiresUserId: /z\.object\([\s\S]*userId:\s*z\.string\(\)/m,
};

function scanTrackerRouter() {
  const result = {
    exists: has(trackerPath),
    getActivitySymbol: false,
    create: {
      found: false,
      inputPermissive: null,
      writesExpectedActivity: null,
      preview: '',
    },
    update: { found: false, writesExpectedActivity: null, preview: '' },
    rawPreview: '',
  };

  if (!result.exists) return result;

  const norm = read(trackerPath);
  result.getActivitySymbol =
    /getApplicationActivity\s*:\s*publicProcedure/.test(norm);

  // Grab createApplication block
  const createIdx = norm.indexOf('createApplication:');
  if (createIdx !== -1) {
    result.create.found = true;
    const block = blockBetween(norm, createIdx) || '';
    result.create.preview = block.slice(0, 800);
    result.create.inputPermissive =
      EXPECT.inputPermissive.test(block) &&
      !EXPECT.inputRequiresUserId.test(block);
    result.create.writesExpectedActivity = EXPECT.createActivity.test(block);
  }

  // Grab updateApplication block
  const updateIdx = norm.indexOf('updateApplication:');
  if (updateIdx !== -1) {
    result.update.found = true;
    const block = blockBetween(norm, updateIdx) || '';
    result.update.preview = block.slice(0, 800);
    result.update.writesExpectedActivity = EXPECT.updateActivity.test(block);
  }

  result.rawPreview = norm.slice(0, 1200);
  return result;
}

function scanPrisma() {
  const out = { exists: has(prismaSchema), hasModel: false, modelPreview: '' };
  if (!out.exists) return out;
  const norm = read(prismaSchema);
  out.hasModel = /model\s+ApplicationActivity\s+\{[\s\S]*?\}/m.test(norm);
  if (out.hasModel) {
    out.modelPreview = (norm.match(
      /model\s+ApplicationActivity\s+\{[\s\S]*?\}/m
    ) || [''])[0];
  }
  return out;
}

function scanWeb() {
  const out = {
    tsconfigExists: has(webTsconfig),
    aliasOk: false,
    trpcStubExists: has(webTrpcStub),
    aliasPreview: '',
  };
  if (out.tsconfigExists) {
    try {
      const ts = JSON.parse(read(webTsconfig));
      const paths = ts?.compilerOptions?.paths || {};
      out.aliasOk = typeof paths['@/*']?.[0] === 'string';
      out.aliasPreview = JSON.stringify(paths, null, 2);
    } catch {}
  }
  return out;
}

function scanRepoForActivity() {
  const files = walk(ROOT).filter((f) => /\.(ts|tsx|js|cjs|mjs)$/.test(f));
  const hits = [];
  for (const f of files) {
    const norm = read(f);
    if (/applicationActivity\./.test(norm)) {
      const contexts = grepFile(f, /applicationActivity\./);
      hits.push({ file: path.relative(ROOT, f), contexts });
    }
  }
  return hits;
}

/* --------------------------------- run it --------------------------------- */

const report = {
  tracker: scanTrackerRouter(),
  prisma: scanPrisma(),
  web: scanWeb(),
  repoActivityRefs: scanRepoForActivity(),
};

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

/* ------------------------------ pretty output ----------------------------- */

logTitle('API: tracker.router.ts');
if (!report.tracker.exists) {
  logLine(
    COLORS.red(`✗ router not found -> ${path.relative(ROOT, trackerPath)}`)
  );
} else {
  logLine(
    COLORS.green(`✓ router found -> ${path.relative(ROOT, trackerPath)}`)
  );
  logLine(
    `${
      report.tracker.getActivitySymbol ? COLORS.green('✓') : COLORS.red('✗')
    } getApplicationActivity symbol`
  );
  if (report.tracker.create.found) {
    logLine('\n' + COLORS.bold('— createApplication —'));
    logLine(
      `${
        report.tracker.create.inputPermissive
          ? COLORS.green('✓')
          : COLORS.red('✗')
      } input is permissive (no required userId)`
    );
    logLine(
      `${
        report.tracker.create.writesExpectedActivity
          ? COLORS.green('✓')
          : COLORS.red('✗')
      } writes expected CREATE activity with payload.data`
    );
    if (!QUIET) {
      logLine(COLORS.gray('Preview:\n' + report.tracker.create.preview));
    }
  } else {
    logLine(COLORS.red('✗ createApplication not found'));
  }

  if (report.tracker.update.found) {
    logLine('\n' + COLORS.bold('— updateApplication —'));
    logLine(
      `${
        report.tracker.update.writesExpectedActivity
          ? COLORS.green('✓')
          : COLORS.red('✗')
      } writes expected STATUS_CHANGE with payload.to`
    );
    if (!QUIET) {
      logLine(COLORS.gray('Preview:\n' + report.tracker.update.preview));
    }
  } else {
    logLine(COLORS.red('✗ updateApplication not found'));
  }
}

logTitle('Prisma: ApplicationActivity model');
if (!report.prisma.exists) {
  logLine(
    COLORS.red(`✗ schema not found -> ${path.relative(ROOT, prismaSchema)}`)
  );
} else {
  logLine(
    report.prisma.hasModel
      ? COLORS.green('✓ model ApplicationActivity present')
      : COLORS.yellow(
          '⚠ No model ApplicationActivity (router guards with as any; tests are fine)'
        )
  );
  if (report.prisma.modelPreview && !QUIET) {
    logLine(COLORS.gray('Preview:\n' + report.prisma.modelPreview));
  }
}

logTitle('Web: TRPC alias + stub');
logLine(
  report.web.tsconfigExists
    ? COLORS.green(`✓ web tsconfig -> ${path.relative(ROOT, webTsconfig)}`)
    : COLORS.red(`✗ missing -> ${path.relative(ROOT, webTsconfig)}`)
);
logLine(
  report.web.aliasOk
    ? COLORS.green('✓ "@/*" path alias present')
    : COLORS.red('✗ "@/*" path alias missing')
);
logLine(
  report.web.trpcStubExists
    ? COLORS.green(`✓ trpc stub -> ${path.relative(ROOT, webTrpcStub)}`)
    : COLORS.red(`✗ no trpc stub at ${path.relative(ROOT, webTrpcStub)}`)
);
if (!QUIET && report.web.aliasPreview) {
  logLine(COLORS.gray('paths preview:\n' + report.web.aliasPreview));
}

logTitle('Repo: applicationActivity.* references');
if (report.repoActivityRefs.length === 0) {
  logLine(COLORS.yellow('• no references found'));
} else {
  for (const h of report.repoActivityRefs) {
    logLine(COLORS.cyan('→ ' + h.file));
    if (!QUIET) {
      for (const c of h.contexts) {
        logLine(
          COLORS.gray(`  [${c.line}] ${c.context.replace(/\n/g, '\n       ')}`)
        );
      }
    }
  }
}

logTitle('Summary');
const okCreatePayload = report.tracker.create.writesExpectedActivity === true;
const okUpdatePayload = report.tracker.update.writesExpectedActivity === true;
const okInput = report.tracker.create.inputPermissive === true;

if (okCreatePayload && okUpdatePayload && okInput) {
  logLine(COLORS.green('All good: router matches test expectations ✅'));
} else {
  if (!okInput)
    logLine(
      COLORS.red(
        '✗ createApplication input is not permissive (tests pass { company, role } without userId).'
      )
    );
  if (!okCreatePayload)
    logLine(
      COLORS.red(
        `✗ createApplication should write: { data: { applicationId, type: 'CREATE', payload: { data: <input> } } }`
      )
    );
  if (!okUpdatePayload)
    logLine(
      COLORS.red(
        `✗ updateApplication should write: { data: { applicationId, type: 'STATUS_CHANGE', payload: { to: <status> } } }`
      )
    );
}

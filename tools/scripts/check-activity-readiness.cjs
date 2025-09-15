#!/usr/bin/env node
/**
 * tools/scripts/check-activity-readiness.cjs
 *
 * What it does (in order):
 *  1) Detects your Next.js web app directory (apps/web/src/app, apps/web/app, or web/app)
 *  2) Verifies route files exist and have a default export
 *  3) Pings the dev server (HEAD /)
 *  4) (Optional) Uses Prisma to confirm the Application exists and counts its activity rows
 *  5) Fetches both pages:
 *       - /tracker/activity?id=<ID>
 *       - /tracker/<ID>/activity
 *     and checks HTTP status + simple content markers
 *  6) Logs any issues and exits 1 if found; prints a JSON summary with --json
 *
 * Usage:
 *   node tools/scripts/check-activity-readiness.cjs --id <APP_ID> [--host http://localhost] [--port 3000] [--json]
 *
 * Examples:
 *   pnpm -w exec node tools/scripts/check-activity-readiness.cjs --id cmfc...d3z
 *   pnpm -w exec node tools/scripts/check-activity-readiness.cjs --id cmfc...d3z --json > activity-readiness.json
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// --- arg parsing (no deps) ---
const argv = process.argv.slice(2);
function getArg(name, def) {
  const i = argv.findIndex(a => a === `--${name}`);
  if (i >= 0) return argv[i + 1];
  const flag = argv.find(a => a.startsWith(`--${name}=`));
  if (flag) return flag.split('=').slice(1).join('=');
  return def;
}
function hasFlag(name) { return argv.includes(`--${name}`); }

const APP_ID = getArg('id', process.env.APP_ID || '');
const HOST = (getArg('host', 'http://localhost') || 'http://localhost').replace(/\/$/, '');
const PORT = Number(getArg('port', '3000'));
const OUTPUT_JSON = hasFlag('json');
const VERBOSE = hasFlag('verbose');

// --- tiny logger helpers ---
const issues = [];
const log = (...a) => console.log(...a);
const info = (m) => console.log('•', m);
const ok = (m) => console.log('✓', m);
const warn = (m) => { console.warn('!', m); };
const fail = (m) => { console.error('✗', m); issues.push(m); };

// --- helpers ---
function jsonOut(obj) {
  console.log(JSON.stringify(obj, null, 2));
}
function rel(p) { return path.relative(process.cwd(), p); }

function hasDefaultExport(file) {
  try {
    const s = fs.readFileSync(file, 'utf8');
    // crude but effective default export detection
    return /export\s+default\s+(async\s+)?function\s+/m.test(s)
        || /export\s+default\s+\w+/m.test(s)
        || /export\s+default\s*\(/m.test(s);
  } catch {
    return false;
  }
}

// Try Nx to detect project; otherwise fallback to common locations
function detectWebProject() {
  // Try: nx show project web --json
  try {
    const out = cp.execSync('pnpm -w exec nx show project web --json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const j = JSON.parse(out);
    const root = path.resolve(process.cwd(), j.root);
    const sourceRoot = j.sourceRoot ? path.resolve(process.cwd(), j.sourceRoot) : root;
    const appDir = path.join(sourceRoot, 'app');
    return { webPath: root, sourceRoot, appDir, via: 'nx' };
  } catch {
    // ignore and fall back
  }

  const candidates = [
    path.join(process.cwd(), 'apps', 'web', 'src', 'app'),
    path.join(process.cwd(), 'apps', 'web', 'app'),
    path.join(process.cwd(), 'web', 'app'),
  ];
  for (const appDir of candidates) {
    if (fs.existsSync(appDir)) {
      const maybeSrc = appDir.endsWith(path.join('src', 'app'));
      const projectRoot = maybeSrc ? path.dirname(path.dirname(appDir)) : path.dirname(appDir);
      const sourceRoot = maybeSrc ? path.dirname(appDir) : projectRoot;
      return { webPath: projectRoot, sourceRoot, appDir, via: 'fallback' };
    }
  }
  return null;
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  return { res, text };
}

(async function main() {
  if (!APP_ID) {
    fail('Missing --id <ApplicationId> (or set APP_ID env var).');
  }

  const proj = detectWebProject();
  if (!proj) {
    fail('Could not detect a Next.js app directory for the web project (tried apps/web/src/app, apps/web/app, web/app).');
  } else {
    ok(`Detected web project: ${rel(proj.webPath)} (app dir: ${rel(proj.appDir)})`);
  }

  // Route files to check
  const files = [];
  if (proj) {
    files.push({
      role: 'query',
      file: path.join(proj.appDir, 'tracker', 'activity', 'page.tsx'),
    });
    files.push({
      role: 'dynamic',
      file: path.join(proj.appDir, 'tracker', '[id]', 'activity', 'page.tsx'),
    });
  }

  // 1) Files exist + default export
  for (const f of files) {
    if (!fs.existsSync(f.file)) {
      fail(`Missing route file: ${rel(f.file)}`);
    } else {
      ok(`Found ${f.role} page: ${rel(f.file)}`);
      if (!hasDefaultExport(f.file)) {
        fail(`No "export default" React component in ${rel(f.file)}`);
      } else {
        ok(`Default export present in ${rel(f.file)}`);
      }
    }
  }

  // 2) Dev server ping
  let serverOk = false;
  if (proj) {
    const url = `${HOST}:${PORT}/`;
    try {
      const ping = await fetch(url, { method: 'HEAD' });
      if (!ping.ok) {
        fail(`Dev server reachable but returned ${ping.status} for HEAD /`);
      } else {
        ok(`Dev server OK at ${HOST}:${PORT}`);
        serverOk = true;
      }
    } catch (e) {
      fail(`Dev server not reachable at ${HOST}:${PORT} (${e.message})`);
    }
  }

  // 3) Prisma checks (optional but helpful)
  let prismaChecked = false;
  let applicationExists = false;
  let activityCount = 0;
  if (APP_ID) {
    try {
      const { PrismaClient } = require('@prisma/client');
      const p = new PrismaClient();
      const app = await p.application.findUnique({ where: { id: APP_ID }, select: { id: true } });
      applicationExists = !!app;
      if (applicationExists) ok(`Application exists in DB: ${APP_ID}`);
      else fail(`No Application found with id ${APP_ID} (Prisma)`);
      activityCount = await p.applicationActivity.count({ where: { applicationId: APP_ID } });
      prismaChecked = true;
      await p.$disconnect();
      info(`Prisma activity count: ${activityCount}`);
    } catch (e) {
      warn(`Prisma check skipped/failed: ${e.message}`);
    }
  }

  // 4) Fetch both pages if server ok
  const results = {};
  if (serverOk && proj) {
    const endpoints = [
      { role: 'query', url: `${HOST}:${PORT}/tracker/activity?id=${encodeURIComponent(APP_ID)}` },
      { role: 'dynamic', url: `${HOST}:${PORT}/tracker/${encodeURIComponent(APP_ID)}/activity` },
    ];

    for (const ep of endpoints) {
      try {
        const { res, text } = await fetchText(ep.url, { redirect: 'manual' });
        results[ep.role] = { status: res.status, url: ep.url };
        if (res.status !== 200) {
          fail(`${ep.role} route returned HTTP ${res.status}: ${ep.url}`);
        } else {
          ok(`${ep.role} route OK: ${ep.url}`);
        }
        // very simple content checks
        const hasHeader = /Tracker Activity/i.test(text);
        if (!hasHeader) {
          fail(`${ep.role} route content did not contain "Tracker Activity".`);
        }
        const hasNoActivity = /No activity yet/i.test(text);
        results[ep.role].hasNoActivity = !!hasNoActivity;
      } catch (e) {
        fail(`${ep.role} fetch failed: ${e.message}`);
      }
    }
  }

  // 5) Summarize & exit code
  const summary = {
    id: APP_ID,
    server: { host: HOST, port: PORT, ok: serverOk },
    web: proj ? { webPath: rel(proj.webPath), appDir: rel(proj.appDir) } : null,
    prisma: { checked: prismaChecked, applicationExists, activityCount },
    results,
    issues,
  };

  if (OUTPUT_JSON) {
    jsonOut(summary);
  } else {
    console.log('\n=== Summary ===');
    jsonOut(summary);
  }

  process.exit(issues.length ? 1 : 0);
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});

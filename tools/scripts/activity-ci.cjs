#!/usr/bin/env node
/**
 * tools/scripts/activity-ci.cjs
 * Gate + verify Activity pages. Exits non-zero if issues are found.
 *
 * Usage:
 *   node tools/scripts/activity-ci.cjs --host http://localhost --port 3000
 *   node tools/scripts/activity-ci.cjs --id <APP_ID> --host http://localhost --port 3000 --strict
 */

const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : def;
}
const HOST = arg('--host', 'http://localhost');
const PORT = Number(arg('--port', '3000'));
const INPUT_ID = arg('--id', null);
const STRICT = process.argv.includes('--strict'); // fail if "no activity" is detected

const ROOT = process.cwd();
const scripts = (p) => path.join(ROOT, 'tools', 'scripts', p);
const outFile = path.join(ROOT, 'activity-ci-report.json');

function log(msg) {
  console.log(msg);
}
function warn(msg) {
  console.warn(msg);
}
function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function run(cmd, opts = {}) {
  const res = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', ...opts });
  if (res.error) throw res.error;
  return res;
}

function extractLastJsonBlock(text) {
  // Pull the last {...} block from mixed CLI output
  let lastOpen = text.lastIndexOf('{');
  if (lastOpen === -1) return null;
  // Naive brace match forward from lastOpen
  let depth = 0;
  for (let i = lastOpen; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const slice = text.slice(lastOpen, i + 1);
        try {
          return JSON.parse(slice);
        } catch (_) {
          /* fallthrough */
        }
      }
    }
  }
  return null;
}

async function httpHead(url) {
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve) => {
    const req = client.request(url, { method: 'HEAD' }, (res) => {
      resolve({ ok: true, status: res.statusCode });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.end();
  });
}

(async () => {
  const issues = [];
  const steps = [];

  // 1) Scan web activity structure (logs issues if pages / exports are missing)
  steps.push('scan-web-activity');
  const scan = run(['node', scripts('scan-web-activity.cjs'), '--json']);
  const scanJson = extractLastJsonBlock(scan.stdout || '');
  if (!scanJson) {
    issues.push('scan-web-activity: could not parse JSON output');
  } else {
    // Collect any failed checks
    const failed = (scanJson.checks || [])
      .filter((c) => c.ok === false)
      .map((c) => c.message);
    issues.push(...failed);
  }

  // 2) Get/seed an Application id
  steps.push('get-application-id');
  let appId = INPUT_ID;
  if (!appId) {
    try {
      const seeded = run(['node', scripts('seed-activity.cjs')]);
      appId = (seeded.stdout || '').trim();
      if (!appId)
        issues.push('seed-activity: did not return an application id');
    } catch (e) {
      issues.push(`seed-activity: ${e.message}`);
    }
  }

  // 3) Check dev server
  steps.push('ping-server');
  const base = `${HOST}:${PORT}`;
  const head = await httpHead(`${base}/`);
  if (!head.ok) {
    issues.push(
      `server not reachable at ${base}${head.error ? ` (${head.error})` : ''}`
    );
  }

  // If we already have structural/server issues, stop here (before fetch)
  if (issues.length) {
    const report = {
      id: appId || null,
      server: { host: HOST, port: PORT, ok: head.ok === true },
      scan: scanJson || null,
      results: null,
      issues,
      steps,
    };
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    warn('❌ Issues detected. See activity-ci-report.json for details.');
    return die(issues.join('\n'), 1);
  }

  // 4) Fetch both pages (machine-readable)
  steps.push('fetch-pages');
  let fetchJson = null;
  try {
    const fetched = run([
      'node',
      scripts('fetch-activity-pages.cjs'),
      '--id',
      appId,
      '--host',
      HOST,
      '--port',
      String(PORT),
    ]);
    fetchJson = JSON.parse(fetched.stdout || '{}');
  } catch (e) {
    issues.push(`fetch-activity-pages failed: ${e.message}`);
  }

  // 5) Validate results
  if (fetchJson?.results) {
    const { query, dynamic } = fetchJson.results;
    if (!query || query.status !== 200) {
      issues.push(
        `query route returned ${query ? query.status : 'N/A'} (${
          fetchJson?.results?.query?.url || ''
        })`
      );
    }
    if (!dynamic || dynamic.status !== 200) {
      issues.push(
        `dynamic route returned ${dynamic ? dynamic.status : 'N/A'} (${
          fetchJson?.results?.dynamic?.url || ''
        })`
      );
    }
    // Optional: treat "no activity rows" as an issue in strict mode
    if (STRICT) {
      if (query?.hasNoActivity)
        issues.push('query route shows — No activity yet —');
      if (dynamic?.hasNoActivity)
        issues.push('dynamic route shows — No activity yet —');
    }
  } else {
    issues.push('fetch-activity-pages: no results in JSON');
  }

  const finalReport = {
    id: appId,
    server: { host: HOST, port: PORT, ok: true },
    scan: scanJson,
    results: fetchJson?.results || null,
    issues,
    steps,
  };
  fs.writeFileSync(outFile, JSON.stringify(finalReport, null, 2));

  if (issues.length) {
    warn('❌ Issues detected. See activity-ci-report.json for details.');
    return die(issues.join('\n'), 2);
  }

  log(
    '✅ Activity flow looks good. See activity-ci-report.json for the report.'
  );
  process.exit(0);
})();

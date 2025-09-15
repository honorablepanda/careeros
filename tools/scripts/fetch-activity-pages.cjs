#!/usr/bin/env node
/* fetch-activity-pages.cjs
 * Usage:
 *   node tools/scripts/fetch-activity-pages.cjs --id <APP_ID> [--port 3000] [--host http://localhost]
 * Notes:
 *   - Requires your dev server to be running.
 *   - If --id is omitted, we try to call tools/scripts/seed-activity.cjs to get one.
 */

const { execSync } = require('node:child_process');
const { URL } = require('node:url');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}

function bool(name) {
  return process.argv.includes(name);
}

async function main() {
  const host = (arg('--host', 'http://localhost')).replace(/\/$/, '');
  const port = arg('--port', '3000');
  let id = arg('--id', '');

  if (!id) {
    // Try to seed (or fetch) an application id if the helper exists
    try {
      id = execSync('node tools/scripts/seed-activity.cjs', {
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
      }).trim();
    } catch {
      // ignore; will error out below if still missing
    }
  }

  if (!id) {
    console.error('Missing --id and unable to get one from tools/scripts/seed-activity.cjs');
    process.exit(2);
  }

  const base = `${host}:${port}`;
  const urlQuery = `${base}/tracker/activity?id=${encodeURIComponent(id)}`;
  const urlDynamic = `${base}/tracker/${encodeURIComponent(id)}/activity`;

  const out = {
    timestamp: new Date().toISOString(),
    host,
    port: Number(port),
    id,
    urls: { query: urlQuery, dynamic: urlDynamic },
    results: {}
  };

  async function hit(url) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      const text = await res.text();
      const bodyPreview = text.replace(/\s+/g, ' ').slice(0, 400);

      // very lightweight parsers for the demo pages we generated
      const pick = (re) => {
        const m = text.match(re);
        return m ? m[1].trim() : null;
      };

      const company = pick(/Company:\s*([^\n<]+)/i);
      const role = pick(/Role:\s*([^\n<]+)/i);
      const status = pick(/Status:\s*([^\n<]+)/i);
      const noActivity = /No activity yet/i.test(text);
      const hasActivity = !noActivity;

      return {
        ok: res.ok,
        status: res.status,
        redirected: res.redirected,
        company,
        role,
        statusText: status,
        hasActivity,
        bodyPreview
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: String(err)
      };
    }
  }

  out.results.query = await hit(urlQuery);
  out.results.dynamic = await hit(urlDynamic);

  // Print machine-readable JSON only
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

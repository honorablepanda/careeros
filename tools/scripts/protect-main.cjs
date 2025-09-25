#!/usr/bin/env node
const https = require('https');
const cp = require('child_process');

const args = process.argv.slice(2);
const get = (f, d) => {
  const i = args.indexOf(f);
  return i > -1 ? args[i + 1] || d : d;
};

const branch = get('--branch', 'main');
const contexts = get(
  '--checks',
  'CI / build_test,release-verify / verify_release'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function token() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    return cp
      .execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}
const t = token();
if (!t) {
  console.error(
    'No token. Set ADMIN_TOKEN (repo admin scope) or run: gh auth login'
  );
  process.exit(2);
}

const repo =
  process.env.GITHUB_REPOSITORY ||
  JSON.parse(
    cp
      .execSync('gh repo view --json nameWithOwner', {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .toString()
  ).nameWithOwner;
const [owner, name] = repo.split('/');

const body = JSON.stringify({
  required_status_checks: { strict: true, contexts },
  enforce_admins: true,
  required_pull_request_reviews: null,
  restrictions: null,
});

const opt = {
  hostname: 'api.github.com',
  path: `/repos/${owner}/${name}/branches/${branch}/protection`,
  method: 'PUT',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `token ${t}`,
    'User-Agent': 'release-automation',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-GitHub-Api-Version': '2022-11-28',
  },
};

const req = https.request(opt, (res) => {
  let d = '';
  res.on('data', (c) => (d += c));
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(
        '✓ Branch protection updated for',
        branch,
        'checks=',
        contexts.join(', ')
      );
    } else {
      console.error('✗ Failed:', res.statusCode, d);
      process.exit(1);
    }
  });
});
req.on('error', (e) => {
  console.error('✗ Error:', e.message);
  process.exit(1);
});
req.end(body);

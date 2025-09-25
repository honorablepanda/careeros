#!/usr/bin/env node
const cp = require('child_process');

function sh(cmd) {
  return cp
    .execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim();
}
function hasGh() {
  try {
    sh('gh --version');
    return true;
  } catch {
    return false;
  }
}

if (!hasGh()) {
  console.error('Missing GitHub CLI (gh). Install it and run: gh auth login');
  process.exit(2);
}

const repo =
  process.env.GITHUB_REPOSITORY ||
  JSON.parse(sh('gh repo view --json nameWithOwner')).nameWithOwner;

const tag = process.argv[2] || sh('git describe --tags --abbrev=0');

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function viewRelease() {
  try {
    return JSON.parse(
      sh(
        `gh release view ${tag} --repo ${repo} --json tagName,url,isDraft,isPrerelease,assets,body`
      )
    );
  } catch {
    return null;
  }
}

const timeoutMs = 15 * 60 * 1000;
const stepMs = 5000;
const start = Date.now();
let rel = null;
while (Date.now() - start < timeoutMs) {
  rel = viewRelease();
  if (rel) break;
  sleep(stepMs);
}
if (!rel) {
  console.error('[verify-release] Release not found for', tag);
  process.exit(1);
}

const names = (rel.assets || []).map((a) => a.name);
const hasHealth = names.some((n) => n.includes('repo-health'));
const hasTrpc = names.some((n) => n.includes('trpc-scan'));

if (!hasHealth || !hasTrpc) {
  console.error(
    '[verify-release] Missing expected assets. Saw:',
    names.join(', ')
  );
  process.exit(1);
}
if (!rel.body || rel.body.trim().length < 20) {
  console.error('[verify-release] Release notes look too short.');
  process.exit(1);
}
console.log('✓ Release verified:', rel.url);

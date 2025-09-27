#!/usr/bin/env node
/* Run CI on a PR, watch ONLY the latest commit's checks, auto-merge when green. */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const CI_WORKFLOW_NAME = 'CI';
const EXTRA_WORKFLOWS = ['Activity CI','Activity Check','Activity logging guard'];

function sh(cmd, opts = {}) {
  return cp.execSync(cmd, { stdio: ['ignore','pipe','pipe'], ...opts }).toString().trim();
}
function root() { return sh('git rev-parse --show-toplevel'); }

function addDispatchIfMissing(ymlPath) {
  if (!fs.existsSync(ymlPath)) return false;
  const s = fs.readFileSync(ymlPath, 'utf8');
  if (/^\s*workflow_dispatch\s*:/m.test(s)) return false;
  const out = s.replace(/(^on:\s*(?:\r?\n))/m, `$1  workflow_dispatch: {}\n`);
  if (out !== s) { fs.writeFileSync(ymlPath, out); return true; }
  return false;
}

function ensureDispatchOnAll() {
  const ws = [
    '.github/workflows/ci.yml',
    '.github/workflows/activity-ci.yml',
    '.github/workflows/activity-check.yml',
    '.github/workflows/activity-guard.yml',
  ];
  let changed = false;
  for (const w of ws) changed = addDispatchIfMissing(path.join(root(), w)) || changed;
  if (changed) {
    sh('git add .github/workflows/*.yml');
    sh('git commit -m "ci: enable workflow_dispatch (auto)"');
    sh('git push');
  }
}

function getPrNumberFromArgOrHead() {
  const arg = process.argv.find(x => /^\d+$/.test(x));
  if (arg) return arg;
  try {
    return sh(`gh pr list --state open --head $(git rev-parse --abbrev-ref HEAD) --json number -q '.[0].number'`);
  } catch { return null; }
}

function getHeadSha(pr) {
  return sh(`gh pr view ${pr} --json headRefOid -q .headRefOid`);
}

function dispatchAll(ref) {
  try { sh(`gh workflow run "${CI_WORKFLOW_NAME}" --ref ${ref}`); } catch {}
  for (const wf of EXTRA_WORKFLOWS) { try { sh(`gh workflow run "${wf}" --ref ${ref}`); } catch {} }
}

function getCheckRunsForSha(sha) {
  try {
    const j = sh(`gh api repos/:owner/:repo/commits/${sha}/check-runs -q '.check_runs | map({name,status,conclusion})'`);
    return JSON.parse(j);
  } catch { return null; }
}
function summarize(runs) {
  return runs.map(r => `${r.name}: ${r.conclusion || r.status}`).join(' | ');
}
function allPassed(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return false;
  const pending = runs.find(r => ['QUEUED','IN_PROGRESS','REQUESTED','WAITING'].includes((r.status||'').toUpperCase()));
  const failed  = runs.find(r => (r.conclusion||'').toUpperCase() === 'FAILURE');
  const cancelled = runs.find(r => (r.conclusion||'').toUpperCase() === 'CANCELLED' || (r.conclusion||'').toUpperCase() === 'TIMED_OUT');
  return !pending && !failed && !cancelled;
}

(async function main() {
  process.chdir(root());
  ensureDispatchOnAll();

  const pr = getPrNumberFromArgOrHead();
  if (!pr) { console.error('No open PR found for this branch.'); process.exit(2); }
  const sha = getHeadSha(pr);
  console.log(`PR #${pr} head SHA: ${sha}`);

  // Kick runs on this SHA
  dispatchAll(sh('git rev-parse --abbrev-ref HEAD'));

  const start = Date.now(), timeoutMs = 45*60*1000, tick = 10*1000;
  while (true) {
    const runs = getCheckRunsForSha(sha);
    if (runs) {
      console.log(`⏱  ${new Date().toLocaleTimeString()} → ${summarize(runs)}`);
      if (allPassed(runs)) break;

      // Only treat as failure if ALL required CI names exist for this SHA and any is FAILURE.
      const names = runs.map(r => r.name);
      const required = ['build_test','activity','check-activity']; // job names across our workflows
      const haveAll = required.every(n => names.includes(n));
      const anyFail = runs.some(r => (r.conclusion||'').toUpperCase() === 'FAILURE');
      if (haveAll && anyFail) { console.error('❌ Latest SHA has failing checks.'); process.exit(1); }
    } else {
      console.log('… waiting for check runs …');
    }
    if (Date.now() - start > timeoutMs) { console.error('⏰ Timeout waiting for checks.'); process.exit(3); }
    await new Promise(r => setTimeout(r, tick));
  }

  console.log('✅ Checks green for latest commit. Merging…');
  sh(`gh pr merge ${pr} --squash --delete-branch --match-head-commit`);
  console.log('🎉 Merged & branch deleted.');
})();

#!/usr/bin/env node
/* Auto-finalize CI repo chores:
 * - Ensure .gitattributes and renormalize (fix CRLF warnings)
 * - Ensure .gitignore has CI artifacts/backups
 * - Inject README badge for Activity E2E
 * - (optional) Make the CI check required via GitHub API (needs GH_TOKEN)
 *
 * Usage (from repo root):
 *   node tools/scripts/auto-finalize-ci.cjs --apply \
 *     --owner honorablepanda --repo careeros --branch main \
 *     --check-name "Activity E2E"
 *
 * Flags:
 *   --apply            actually write & commit changes (otherwise dry-run)
 *   --no-commit        write files but don't git commit
 *   --owner, --repo    fallback if we can't parse remote.origin.url
 *   --branch           branch to protect (default: main)
 *   --check-name       status check name (default: Activity E2E)
 *   --no-api           skip GitHub API branch protection
 */

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const CWD = process.cwd();
const args = process.argv.slice(2);

function getFlag(name, def = false) {
  const on = args.includes(`--${name}`);
  const off = args.includes(`--no-${name}`);
  if (on && off) return def;
  if (on) return true;
  if (off) return false;
  return def;
}
function getArg(name, def = undefined) {
  const i = args.findIndex(a => a === `--${name}`);
  if (i !== -1 && args[i+1] && !args[i+1].startsWith('--')) return args[i+1];
  return def;
}

const APPLY = getFlag('apply', false);
const NO_COMMIT = getFlag('no-commit', false);
const NO_API = getFlag('no-api', false);
const BRANCH = getArg('branch', 'main');
const CHECK_NAME = getArg('check-name', 'Activity E2E');

function log(...m){ console.log(...m); }
function warn(...m){ console.warn(...m); }
function run(cmd, opts={stdio:'inherit'}) {
  return cp.execSync(cmd, {cwd:CWD, ...opts});
}
function readFile(p){ return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; }
function writeFileIfChanged(p, content) {
  const exists = fs.existsSync(p);
  if (exists && fs.readFileSync(p, 'utf8') === content) return false;
  if (!APPLY) { log(`• [dry-run] would write ${p}`); return true; }
  fs.mkdirSync(path.dirname(p), {recursive:true});
  fs.writeFileSync(p, content);
  log(`✓ wrote ${p}`);
  return true;
}

function guessOwnerRepo() {
  try {
    const url = run('git config --get remote.origin.url', {stdio:['ignore','pipe','pipe']}).toString().trim();
    // handle https and ssh
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    let m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (m) return {owner:m[1], repo:m[2]};
  } catch {}
  return null;
}

(async function main(){
  log('— Auto Finalize CI —');

  // Resolve owner/repo
  const guessed = guessOwnerRepo() || {};
  const OWNER = getArg('owner', guessed.owner);
  const REPO  = getArg('repo',  guessed.repo);

  if (!OWNER || !REPO) {
    warn('! Could not determine GitHub owner/repo from origin. Pass --owner and --repo.');
  } else {
    log(`• Repo: ${OWNER}/${REPO}`);
  }

  // 1) .gitattributes
  const gaPath = path.join(CWD, '.gitattributes');
  const desiredGA = [
    '# Normalize line endings',
    '* text=auto eol=lf',
    '',
    '# Keep Windows scripts with CRLF',
    '*.bat eol=crlf',
    '*.cmd eol=crlf',
    '*.ps1 eol=crlf',
    '',
  ].join('\n');

  let changed = false;
  if (fs.existsSync(gaPath)) {
    const cur = fs.readFileSync(gaPath,'utf8');
    const needLines = [
      '* text=auto eol=lf',
      '*.bat eol=crlf',
      '*.cmd eol=crlf',
      '*.ps1 eol=crlf',
    ];
    const missing = needLines.filter(l => !cur.includes(l));
    if (missing.length) {
      const next = cur.trimEnd() + '\n' + missing.join('\n') + '\n';
      changed = writeFileIfChanged(gaPath, next) || changed;
    } else {
      log('• .gitattributes already OK');
    }
  } else {
    changed = writeFileIfChanged(gaPath, desiredGA) || changed;
  }

  // 2) .gitignore updates
  const giPath = path.join(CWD, '.gitignore');
  const giAdd = [
    '# local CI outputs',
    '/activity-ci-report.json',
    '/activity-readiness.json',
    '/activity-report.json',
    '',
    '# Next/Nx caches (if ever run at repo root)',
    '/.next',
    '/.nx/',
    '',
    '# tool backups',
    '*.bak.*',
    'apps/web._archived_*/',
    '',
  ];
  if (fs.existsSync(giPath)) {
    const cur = fs.readFileSync(giPath,'utf8');
    const missing = giAdd.filter(line => line && !cur.split(/\r?\n/).includes(line));
    if (missing.length) {
      const next = cur.trimEnd() + '\n' + missing.join('\n') + '\n';
      changed = writeFileIfChanged(giPath, next) || changed;
    } else {
      log('• .gitignore already OK');
    }
  } else {
    changed = writeFileIfChanged(giPath, giAdd.join('\n')) || changed;
  }

  // 3) README badge injection
  const readmePath = path.join(CWD, 'README.md');
  let badgeOk = false;
  let badgeLine = null;
  if (OWNER && REPO) {
    const badgeUrl = `https://github.com/${OWNER}/${REPO}/actions/workflows/activity-ci.yml/badge.svg`;
    const badgeHref = `https://github.com/${OWNER}/${REPO}/actions/workflows/activity-ci.yml`;
    badgeLine = `[![Activity E2E](${badgeUrl})](${badgeHref})`;
  }
  if (badgeLine) {
    const cur = readFile(readmePath) ?? '';
    if (cur.includes('actions/workflows/activity-ci.yml')) {
      log('• README badge already present');
    } else {
      const next = (badgeLine + '\n\n' + cur).trim() + '\n';
      changed = writeFileIfChanged(readmePath, next) || changed;
    }
  } else {
    warn('! Skipping README badge (owner/repo unknown).');
  }

  // 4) git renormalize & commit
  if (APPLY && !NO_COMMIT) {
    try {
      if (changed) {
        run('git add --renormalize .');
        run('git add -A');
        run('git commit -m "chore(repo): normalize line endings, ignore CI artifacts, add CI badge"');
        log('✓ committed repo housekeeping changes');
      } else {
        log('• No file changes detected — skipping commit');
      }
    } catch (e) {
      warn('! git commit step failed (maybe nothing to commit?)');
    }
  } else if (!APPLY) {
    log('• [dry-run] would run: git add --renormalize . && git add -A && git commit -m "chore(...)"');
  }

  // 5) GitHub branch protection (required check)
  const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (NO_API) {
    log('• Skipping branch protection (—no-api)');
  } else if (!GH_TOKEN) {
    warn('! No GH_TOKEN env var detected — skipping branch protection API call.');
  } else if (!OWNER || !REPO) {
    warn('! Missing owner/repo — cannot call protection API.');
  } else {
    try {
      const url = `https://api.github.com/repos/${OWNER}/${REPO}/branches/${encodeURIComponent(BRANCH)}/protection`;
      const body = {
        required_status_checks: {
          strict: false,
          contexts: [CHECK_NAME], // legacy field still accepted
        },
        enforce_admins: true,
        required_pull_request_reviews: {
          required_approving_review_count: 1,
        },
        restrictions: null
      };
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${GH_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'auto-finalize-ci-script'
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        log(`✓ Branch protection updated on ${OWNER}/${REPO}@${BRANCH} (required: ${CHECK_NAME})`);
      } else {
        const text = await res.text();
        warn(`! Branch protection API failed [${res.status}] — ${text.slice(0,200)}…`);
      }
    } catch (e) {
      warn('! Branch protection API error:', e.message);
    }
  }

  // Links / hints
  if (OWNER && REPO) {
    log('');
    log('Next:');
    log(`• Actions page: https://github.com/${OWNER}/${REPO}/actions`);
    log(`• Workflow runs: https://github.com/${OWNER}/${REPO}/actions/workflows/activity-ci.yml`);
    log(`• Branch protection (manual UI): https://github.com/${OWNER}/${REPO}/settings/branches`);
  }
  log('✓ Done.');
})();

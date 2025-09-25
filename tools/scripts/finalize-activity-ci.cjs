#!/usr/bin/env node
/* finalize-activity-ci.cjs
 * One-shot hardening script for Activity pages + CI.
 * - Align Nx "web" project to ./web
 * - Archive legacy apps/web if it exists and is not used by Nx
 * - Ensure CI scripts + devDeps
 * - Optionally upgrade React Query to v5
 * - Optionally run the local CI loop
 *
 * Usage:
 *   node tools/scripts/finalize-activity-ci.cjs --apply --run
 * Options:
 *   --port <n>                 Port for dev server & checks (default: 3000)
 *   --upgrade-react-query      Upgrade @tanstack/react-query to ^5
 *   --no-install               Skip pnpm installs (assumes deps already present)
 *   --apply                    Actually write files/changes (otherwise dry-run)
 *   --run                      Run `pnpm run ci:web` at the end
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return def;
};

const APPLY = has('--apply');
const RUN = has('--run');
const NO_INSTALL = has('--no-install');
const UPGRADE_RQ = has('--upgrade-react-query');
const PORT = parseInt(getArg('--port', '3000'), 10) || 3000;

const log = (...m) => console.log(...m);
const warn = (...m) => console.warn(...m);
const err = (...m) => console.error(...m);

function sh(cmd, opts = {}) {
  return cp.execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts });
}
function shInherit(cmd, opts = {}) {
  return cp.execSync(cmd, { stdio: 'inherit', ...opts });
}
function safeWrite(p, content) {
  if (!APPLY) {
    log(`• [dry-run] would write ${p}`);
    return;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  log(`✓ wrote ${p}`);
}
function safeRename(from, to) {
  if (!APPLY) {
    log(`• [dry-run] would move ${from} → ${to}`);
    return;
  }
  try {
    // Prefer git mv if in a repo
    if (fs.existsSync('.git')) {
      shInherit(`git mv "${from}" "${to}"`);
    } else {
      fs.renameSync(from, to);
    }
    log(`✓ moved ${from} → ${to}`);
  } catch (e) {
    // Fallback to fs.rename if git mv failed
    try {
      fs.renameSync(from, to);
      log(`✓ moved ${from} → ${to}`);
    } catch (e2) {
      err(`✗ move failed: ${from} → ${to}\n${e2.message}`);
    }
  }
}

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJSON(p, obj) {
  const txt = JSON.stringify(obj, null, 2) + '\n';
  safeWrite(p, txt);
}

function patchPackageJsonScripts(rootPkgPath, port) {
  const pkg = readJSON(rootPkgPath);
  pkg.scripts ||= {};
  const must = {
    'activity:ci:auto': `node tools/scripts/seed-and-verify-activity.cjs --host http://localhost --port ${port} --out activity-ci-report.json`,
    'ci:web': `start-server-and-test "pnpm -w exec nx run web:serve" http://localhost:${port} "pnpm run activity:ci:auto"`,
  };
  let changed = false;
  for (const [k, v] of Object.entries(must)) {
    if (pkg.scripts[k] !== v) {
      pkg.scripts[k] = v;
      changed = true;
      log(`• scripts["${k}"] set → ${v}`);
    }
  }
  if (changed) writeJSON(rootPkgPath, pkg);
  else log('• package.json scripts already OK');
}

function ensureWorkflow(port) {
  const p = path.join('.github', 'workflows', 'activity-ci.yml');
  if (!fs.existsSync(p)) {
    const yml = `name: Activity E2E

on:
  push:
  pull_request:

jobs:
  activity-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile=false
      - name: Run Activity Quick Loop
        run: npx -y start-server-and-test "pnpm -w exec nx run web:serve" http://localhost:${port} "pnpm run activity:ci:auto"
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: activity-ci-report
          path: activity-ci-report.json
`;
    safeWrite(p, yml);
    return;
  }
  // Patch the port if needed (simple replace on common patterns)
  let txt = fs.readFileSync(p, 'utf8');
  const before = txt;
  txt = txt.replace(/http:\/\/localhost:\d+/g, `http://localhost:${port}`);
  txt = txt.replace(/nx run web:serve(?:\s+--port=\d+)?/g, `nx run web:serve`);
  if (txt !== before) {
    safeWrite(p, txt);
  } else {
    log('• workflow already present (port looks OK)');
  }
}

function ensureDevDeps({ port, upgradeRQ, noInstall }) {
  if (noInstall) {
    log('• Skipping installs (--no-install)');
    return;
  }
  const rootPkg = readJSON('package.json');
  const have = (name) =>
    (rootPkg.devDependencies && rootPkg.devDependencies[name]) ||
    (rootPkg.dependencies && rootPkg.dependencies[name]);

  const wants = [
    'start-server-and-test',
    '@vitejs/plugin-react-swc',
    'jsdom',
    '@testing-library/react',
    '@testing-library/jest-dom',
  ].filter((d) => !have(d));

  if (wants.length) {
    log(`→ Installing devDeps: ${wants.join(', ')}`);
    shInherit(`pnpm -w add -D ${wants.join(' ')}`);
  } else {
    log('• devDeps already OK');
  }

  if (upgradeRQ) {
    // optional upgrade
    if (
      !have('@tanstack/react-query') ||
      !/^5\./.test(
        rootPkg.dependencies?.['@tanstack/react-query'] ||
          rootPkg.devDependencies?.['@tanstack/react-query'] ||
          ''
      )
    ) {
      log('→ Upgrading @tanstack/react-query to ^5 (optional)');
      try {
        shInherit(`pnpm -w add @tanstack/react-query@^5`);
      } catch (e) {
        warn('! React Query upgrade failed — you can retry later.');
      }
    } else {
      log('• React Query already on v5');
    }
  }
}

function main() {
  log('— Finalize Activity CI —');
  // 1) Nx project “web”
  let nxInfoRaw;
  try {
    nxInfoRaw = sh(`pnpm -w exec nx show project web --json`, {
      encoding: 'utf8',
    });
  } catch (e) {
    err('✗ Could not read Nx project "web". Ensure it exists.');
    process.exit(1);
  }
  let nxInfo;
  try {
    nxInfo = JSON.parse(nxInfoRaw);
  } catch (e) {
    err('✗ Failed to parse Nx JSON. Output was:\n' + nxInfoRaw);
    process.exit(1);
  }
  const projectRoot = path.resolve(nxInfo.root || 'web');
  const sourceRoot = path.resolve(nxInfo.sourceRoot || nxInfo.root || 'web');
  log(`• Nx "web" root: ${projectRoot}`);
  log(`• Nx "web" sourceRoot: ${sourceRoot}`);

  // 2) Archive legacy apps/web if present and different from Nx root
  const legacy = path.resolve('apps/web');
  if (fs.existsSync(legacy) && legacy !== projectRoot) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.resolve(`apps/web._archived_${stamp}`);
    log(`→ Archiving legacy ${legacy} → ${dest}`);
    safeRename(legacy, dest);
  } else {
    log('• No legacy apps/web to archive (or already aligned)');
  }

  // 3) Ensure package.json scripts
  patchPackageJsonScripts('package.json', PORT);

  // 4) Ensure workflow (port)
  ensureWorkflow(PORT);

  // 5) Ensure devDeps (and optional React Query upgrade)
  ensureDevDeps({ port: PORT, upgradeRQ: UPGRADE_RQ, noInstall: NO_INSTALL });

  // 6) Optional quick loop
  if (RUN) {
    log('→ Running local quick loop: pnpm run ci:web');
    try {
      shInherit(`pnpm run ci:web`);
    } catch (e) {
      err('✗ Local CI loop failed.');
      process.exit(1);
    }
  }

  log('\n✓ Done.');
  log('\nNext steps:');
  log(`• Push and watch GitHub Actions → Activity E2E job`);
  log(`• (Optional) Make the CI job required on your main branch`);
  log(
    '• If you later want to fully delete the archived folder, do it in a follow-up PR'
  );
}

main();

// tools/scripts/wire-tracker-and-scan.cjs
/**
 * Idempotently:
 *  1) Ensures trackerRouter is exported with the right name & type in apps/api/src/trpc/routers/tracker.router.ts
 *  2) Wires tracker: trackerRouter into apps/api/src/trpc/root.ts (creates file if missing)
 *  3) Ensures apps/api/src/trpc/index.ts re-exports root and trpc
 *  4) Optionally runs API tests and activity scanners (pass --run to execute)
 *
 * Usage:
 *   node tools/scripts/wire-tracker-and-scan.cjs
 *   node tools/scripts/wire-tracker-and-scan.cjs --run
 *
 * Safe to run multiple times. Creates timestamped .bak files when it edits.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const apiTrpcDir = path.join(ROOT, 'apps', 'api', 'src', 'trpc');
const routersDir = path.join(apiTrpcDir, 'routers');
const trackerPath = path.join(routersDir, 'tracker.router.ts');
const rootPath = path.join(apiTrpcDir, 'root.ts');
const indexPath = path.join(apiTrpcDir, 'index.ts');
const trpcCorePath = path.join(apiTrpcDir, 'trpc.ts');

const RUN = process.argv.includes('--run');

function exists(p) {
  try { fs.statSync(p); return true; } catch { return false; }
}

function backup(p) {
  if (!exists(p)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = p + `.bak-${ts}`;
  fs.copyFileSync(p, bak);
  return bak;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function logTitle(t) {
  console.log(`\n— ${t} —`);
}

function editFile(p, mutator) {
  const before = exists(p) ? fs.readFileSync(p, 'utf8') : '';
  const after = mutator(before);
  if (after !== before) {
    const bak = backup(p);
    fs.writeFileSync(p, after, 'utf8');
    console.log(`✓ updated ${path.relative(ROOT, p)}${bak ? ` (backup: ${path.relative(ROOT, bak)})` : ''}`);
    return true;
  } else {
    console.log(`= no changes ${path.relative(ROOT, p)}`);
    return false;
  }
}

function run(cmd, opts = {}) {
  try {
    console.log(`\n$ ${cmd}`);
    const out = cp.execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts });
    process.stdout.write(out);
    return { ok: true, out };
  } catch (e) {
    const msg = e.stdout?.toString?.() || e.message || String(e);
    process.stderr.write(msg + '\n');
    return { ok: false, out: msg };
  }
}

(function main() {
  logTitle('Validating repo structure');
  if (!exists(apiTrpcDir) || !exists(routersDir)) {
    console.error(`✗ Expected TRPC folders missing: ${path.relative(ROOT, apiTrpcDir)} and/or ${path.relative(ROOT, routersDir)}`);
    process.exit(1);
  }
  if (!exists(trpcCorePath)) {
    console.error(`✗ Missing ${path.relative(ROOT, trpcCorePath)} (your TRPC init). Please create it then re-run.`);
    process.exit(1);
  }

  // 1) Ensure tracker.router.ts exports the right symbol and type
  logTitle('Ensuring tracker.router.ts exports');
  if (!exists(trackerPath)) {
    console.error(`✗ Missing ${path.relative(ROOT, trackerPath)}. Create the router file first.`);
    process.exit(1);
  }

  editFile(trackerPath, (s) => {
    let t = s;

    // Ensure "export const trackerRouter = router({"
    // Accept small spacing variations
    const hasExportedRouter = /export\s+const\s+trackerRouter\s*=\s*router\s*\(\s*\{/.test(t);
    if (!hasExportedRouter) {
      // Try to convert "const trackerRouter = router({" to "export const ..."
      t = t.replace(
        /(^|\n)\s*const\s+trackerRouter\s*=\s*router\s*\(\s*\{/,
        (m) => m.replace('const', 'export const')
      );
    }

    // Ensure "export type TrackerRouter = typeof trackerRouter;"
    if (!/export\s+type\s+TrackerRouter\s*=\s*typeof\s+trackerRouter\s*;/.test(t)) {
      // Append near the end (but before any default export)
      if (!/\n$/.test(t)) t += '\n';
      t += '\nexport type TrackerRouter = typeof trackerRouter;\n';
    }

    return t;
  });

  // 2) Wire into root.ts (create if missing)
  logTitle('Wiring trackerRouter into appRouter (root.ts)');
  const baselineRoot = `import { router } from './trpc';
import { trackerRouter } from './routers/tracker.router';

export const appRouter = router({
  tracker: trackerRouter,
  // add other routers here
});

export type AppRouter = typeof appRouter;
`;

  if (!exists(rootPath)) {
    ensureDir(path.dirname(rootPath));
    fs.writeFileSync(rootPath, baselineRoot, 'utf8');
    console.log(`✓ created ${path.relative(ROOT, rootPath)}`);
  } else {
    editFile(rootPath, (s) => {
      let t = s;

      // Ensure import for { router } from './trpc'
      if (!/from\s+'\.\/trpc'/.test(t)) {
        t = `import { router } from './trpc';\n` + t;
      }

      // Ensure import for trackerRouter
      if (!/from\s+'\.\/routers\/tracker\.router'/.test(t)) {
        t = `import { trackerRouter } from './routers/tracker.router';\n` + t;
      }

      // Ensure appRouter definition exists
      if (!/export\s+const\s+appRouter\s*=\s*router\s*\(\s*\{[\s\S]*?\}\s*\)\s*;/.test(t)) {
        // Replace everything with baseline if malformed
        t = baselineRoot;
      } else {
        // Ensure tracker: trackerRouter present inside router({...})
        t = t.replace(
          /(export\s+const\s+appRouter\s*=\s*router\s*\(\s*\{\s*)([\s\S]*?)(\}\s*\)\s*;)/m,
          (m, p1, body, p3) => {
            const hasTracker = /(^|\n)\s*tracker\s*:\s*trackerRouter\s*,?/.test(body);
            if (!hasTracker) {
              // add tracker at the top of the map
              const updatedBody = `tracker: trackerRouter,\n` + body;
              return p1 + updatedBody + p3;
            }
            return m;
          }
        );
      }

      // Ensure type export
      if (!/export\s+type\s+AppRouter\s*=\s*typeof\s+appRouter\s*;/.test(t)) {
        if (!/\n$/.test(t)) t += '\n';
        t += `\nexport type AppRouter = typeof appRouter;\n`;
      }

      return t;
    });
  }

  // 3) Ensure index.ts re-exports root & trpc
  logTitle('Ensuring trpc/index.ts re-exports');
  const idxContent = `export * from './root';
export * from './trpc';
`;
  if (!exists(indexPath)) {
    fs.writeFileSync(indexPath, idxContent, 'utf8');
    console.log(`✓ created ${path.relative(ROOT, indexPath)}`);
  } else {
    editFile(indexPath, (s) => {
      let t = s;
      if (!/export\s+\*\s+from\s+'\.\/root'/.test(t)) t += (t.endsWith('\n') ? '' : '\n') + `export * from './root';\n`;
      if (!/export\s+\*\s+from\s+'\.\/trpc'/.test(t)) t += `export * from './trpc';\n`;
      return t;
    });
  }

  // 4) Optionally run tests + scanners
  if (RUN) {
    logTitle('Running API tests');
    run('pnpm -w test:api');

    logTitle('Running scanners: verify-activity');
    run('node tools/scripts/verify-activity.cjs --json || true');

    logTitle('Running scanners: deep-scan-activity');
    run('node tools/scripts/deep-scan-activity.cjs --json || true');
  }

  console.log('\n✓ Done. If you passed --run, check the summaries above. Otherwise, run tests/scanners when ready.');
})();

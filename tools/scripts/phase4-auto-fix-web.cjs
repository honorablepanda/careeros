/* phase4-auto-fix-web.cjs
 * - Patch TRPC mock in web/vitest.setup.ts to provide settings.update.useMutation()
 * - Patch web/app/tracker/[id]/activity/page.tsx to remove Prisma select 'role'
 *   and make any `application.role` references compile safely.
 * - With --verify, runs pnpm -w build && pnpm -w test
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const repo = process.cwd();
const vitestSetup = path.join(repo, 'web/vitest.setup.ts');
const activityPage = path.join(repo, 'web/app/tracker/[id]/activity/page.tsx');

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
function write(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, 'utf8');
  console.log('✓ wrote', p);
}
function backup(p) {
  const b = p + '.' + Date.now() + '.bak';
  fs.copyFileSync(p, b);
  console.log('  backup:', b);
}

function ensureTrpcMock(src) {
  // If there's already a vi.mock for "@/trpc", replace it; else, append one.
  const hasMock = /vi\.mock\(['"]@\/trpc['"]/.test(src);
  const block = `
import { vi } from 'vitest';
vi.mock('@/trpc', () => {
  const makeQuery = (data) => ({
    useQuery: () => ({ data, isLoading: false, error: undefined }),
  });
  const makeMutation = () => ({
    useMutation: () => ({ mutate: vi.fn(), isLoading: false, error: undefined }),
  });

  const trpc = {
    settings: {
      get: makeQuery({ theme: 'system', timezone: 'UTC', emailNotifications: true }),
      update: makeMutation(),
    },
    auth: {
      getSession: makeQuery({ user: { id: 'test-user', email: 'test@example.com' } }),
    },
    tracker: {
      list: makeQuery([]),
      add: makeMutation(),
      update: makeMutation(),
      remove: makeMutation(),
    },
  };

  // Some tests may import a provider – return a passthrough if needed.
  const TRPCProvider = ({ children }) => children;

  return { trpc, TRPCProvider };
});
`.trim();

  if (hasMock) {
    // Replace the whole mock block (best-effort) or append a fresh one at end.
    let out = src.replace(
      /vi\.mock\(['"]@\/trpc['"][\s\S]*?\);\s*/m,
      block + '\n'
    );
    if (out === src) out = src.trimEnd() + '\n' + block + '\n';
    if (out !== src) {
      console.log(
        '• vitest.setup.ts: refreshed "@/trpc" mock (ensures update.useMutation)'
      );
      return out;
    }
  } else {
    console.log(
      '• vitest.setup.ts: added "@/trpc" mock (settings.get + settings.update)'
    );
    return src.trimEnd() + '\n' + block + '\n';
  }
  console.log('• vitest.setup.ts: "@/trpc" mock already present (no change)');
  return src;
}

function patchActivityPage(src) {
  let out = src;
  let changed = false;

  // 1) Remove 'role: true' from Prisma select
  const selRe = /select:\s*\{\s*([^}]*?)\}/m;
  const match = selRe.exec(out);
  if (match) {
    const inner = match[1];
    const inner2 = inner.replace(/\brole\s*:\s*true\s*,?\s*/g, '');
    if (inner2 !== inner) {
      out = out.replace(match[0], `select: { ${inner2} }`);
      console.log('• activity page: removed select.role (field not in model)');
      changed = true;
    }
  }

  // 2) Make any application.role read compile (in case UI references it)
  //    Replace 'application.role' with '(application as any)?.role'
  const before = out;
  out = out.replace(/\bapplication\.role\b/g, '(application as any)?.role');
  if (out !== before) {
    console.log(
      '• activity page: made application.role access optional and untyped-safe'
    );
    changed = true;
  }

  return { changed, out };
}

function run(cmd, args) {
  return cp.spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

// --- vitest.setup.ts
if (fs.existsSync(vitestSetup)) {
  const src = read(vitestSetup);
  const next = ensureTrpcMock(src);
  if (next !== src) {
    backup(vitestSetup);
    write(vitestSetup, next);
  }
} else {
  console.log('! Not found:', vitestSetup);
}

// --- activity page patch
if (fs.existsSync(activityPage)) {
  const src = read(activityPage);
  const { changed, out } = patchActivityPage(src);
  if (changed) {
    backup(activityPage);
    write(activityPage, out);
  } else console.log('• activity page: no change needed');
} else {
  console.log('! Not found:', activityPage);
}

if (process.argv.includes('--verify')) {
  console.log('\n→ Verifying: pnpm -w build');
  const b = run('pnpm', ['-w', 'build']);
  console.log('\n→ Verifying: pnpm -w test');
  const t = run('pnpm', ['-w', 'test']);
  console.log('\n———— Done ————');
}

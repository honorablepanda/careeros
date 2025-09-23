#!/usr/bin/env node
/**
 * Fix web build & tests for typed tRPC client:
 * - Ensure deps: @trpc/react-query, @tanstack/react-query, @trpc/client
 *   (installs to ./web if web/package.json exists, otherwise to workspace root)
 * - Ensure Jest maps "@/trpc" (and "@careeros/trpc") to a stable mock
 * - Ensure mock file exists with a minimal tracker shape
 * - Idempotent: safe to re-run
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const WEB_DIR = path.join(ROOT, 'web');
const PKG_WEB = path.join(WEB_DIR, 'package.json');
const JEST_WEB = path.join(WEB_DIR, 'jest.config.ts');
const MOCK_DIR = path.join(WEB_DIR, 'specs', '__mocks__');
const MOCK_TRPC = path.join(MOCK_DIR, 'trpc.ts');

function sh(cmd, cwd = ROOT) {
  cp.execSync(cmd, { stdio: 'inherit', cwd, windowsHide: true });
}

function upsertDeps() {
  const deps = ['@trpc/react-query', '@tanstack/react-query', '@trpc/client'];
  const webPkgExists = fs.existsSync(PKG_WEB);

  // Read whichever package.json we’ll install into to detect if missing
  const pkgPath = webPkgExists ? PKG_WEB : path.join(ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error('! package.json not found at', pkgPath);
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const have = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const missing = deps.filter((d) => !have[d]);

  if (missing.length) {
    console.log(
      `→ Installing deps ${missing.join(', ')} ` +
        (webPkgExists ? 'to ./web' : 'to workspace root')
    );
    const cmd = webPkgExists
      ? `pnpm -F ./web add ${missing.join(' ')}`
      : `pnpm -w add ${missing.join(' ')}`;
    sh(cmd);
  } else {
    console.log('= TRPC/React Query deps already present');
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function upsertMock() {
  ensureDir(MOCK_DIR);
  const content = `// web/specs/__mocks__/trpc.ts
export const trpc = {
  tracker: {
    getApplications: { useQuery: () => ({ data: [] }) },
    createApplication: { useMutation: () => ({ mutate: () => {} }) },
    updateApplication: { useMutation: () => ({ mutate: () => {} }) },
    deleteApplication: { useMutation: () => ({ mutate: () => {} }) },
  },
};
`;
  const cur = fs.existsSync(MOCK_TRPC)
    ? fs.readFileSync(MOCK_TRPC, 'utf8')
    : '';
  if (cur !== content) {
    fs.writeFileSync(MOCK_TRPC, content, 'utf8');
    console.log(`✓ wrote ${path.relative(ROOT, MOCK_TRPC)}`);
  } else {
    console.log(`= up-to-date ${path.relative(ROOT, MOCK_TRPC)}`);
  }
}

function patchJestConfig() {
  if (!fs.existsSync(JEST_WEB)) {
    console.warn('! web/jest.config.ts not found; skipping jest patch');
    return;
  }
  let src = fs.readFileSync(JEST_WEB, 'utf8');
  const before = src;

  // Ensure moduleNameMapper exists
  if (!/moduleNameMapper\s*:\s*\{/.test(src)) {
    src = src.replace(/export default\s*\{/, (m) => {
      return `${m}
  moduleNameMapper: {},
`;
    });
  }

  // Ensure '^@/(.*)$' → '<rootDir>/src/$1'
  if (!/['"]\^@\/\(.\*\)\$['"]\s*:\s*['"]<rootDir>\/src\/\$1['"]/.test(src)) {
    src = src.replace(/moduleNameMapper\s*:\s*\{/, (m) => {
      return `${m}
    '^@/(.*)$': '<rootDir>/src/$1',`;
    });
  }

  // Map '@/trpc' to our mock (so tests don’t pull the real client)
  if (
    !/['"]\^@\/trpc\$['"]\s*:\s*['"]<rootDir>\/specs\/__mocks__\/trpc\.ts['"]/.test(
      src
    )
  ) {
    src = src.replace(/moduleNameMapper\s*:\s*\{/, (m) => {
      return `${m}
    '^@/trpc$': '<rootDir>/specs/__mocks__/trpc.ts',`;
    });
  }

  // Keep old mapping for @careeros/trpc (some specs may still import it)
  if (
    !/['"]@careeros\/trpc['"]\s*:\s*['"]<rootDir>\/specs\/__mocks__\/trpc\.ts['"]/.test(
      src
    )
  ) {
    src = src.replace(/moduleNameMapper\s*:\s*\{/, (m) => {
      return `${m}
    '@careeros/trpc': '<rootDir>/specs/__mocks__/trpc.ts',`;
    });
  }

  if (src !== before) {
    fs.writeFileSync(JEST_WEB, src, 'utf8');
    console.log(
      `✓ patched ${path.relative(ROOT, JEST_WEB)} (moduleNameMapper)`
    );
  } else {
    console.log(`= up-to-date ${path.relative(ROOT, JEST_WEB)}`);
  }
}

(function main() {
  console.log('--- fix-web-trpc-build-and-tests ---');
  upsertDeps();
  upsertMock();
  patchJestConfig();

  console.log('→ Reinstall & run tests/build');
  try {
    sh('pnpm -w install');
  } catch {}
  try {
    sh('pnpm run test:web');
  } catch {}
  try {
    sh('pnpm -w build');
  } catch {}

  console.log('Done.');
})();

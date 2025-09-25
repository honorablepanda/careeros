#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const INSTALL = !process.argv.includes("--no-install"); // pass --no-install to skip pnpm add
const RUN_TESTS = process.argv.includes("--run-tests"); // pass --run-tests to kick tests at the end

const root = process.cwd();
const webDir = path.join(root, "web");
const testDir = path.join(webDir, "test");
const rootSetup = path.join(root, "test", "setup-tests.ts");
const webSetup = path.join(testDir, "setup-tests.ts");
const webStub = path.join(testDir, "trpc.stub.ts");
const vitestConfig = path.join(webDir, "vitest.config.ts");

function log(msg) {
  console.log(`▶ ${msg}`);
}

function writeFileEnsured(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  log(`wrote ${path.relative(root, file)}`);
}

function deleteIfExists(p) {
  try {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      fs.rmSync(p, { recursive: true, force: true });
    } else {
      fs.unlinkSync(p);
    }
    log(`removed ${path.relative(root, p)}`);
  } catch (_) {
    // ignore
  }
}

function ensureVitestConfig() {
  if (!fs.existsSync(vitestConfig)) {
    console.error(`✖ Missing ${path.relative(root, vitestConfig)} — are you in the repo root?`);
    process.exit(1);
  }
  let src = fs.readFileSync(vitestConfig, "utf8");

  // Ensure "test: { ... }" block exists
  if (!/test\s*:\s*{/.test(src)) {
    // naive insert inside defineConfig(...)
    src = src.replace(
      /defineConfig\s*\(\s*{?/,
      (m) => `${m}\n  test: {\n    environment: 'jsdom',\n    setupFiles: ['./test/setup-tests.ts'],\n  },\n`
    );
    log("added test block to vitest.config.ts");
  } else {
    // Ensure environment: 'jsdom'
    if (!/environment\s*:\s*['"]jsdom['"]/.test(src)) {
      src = src.replace(/test\s*:\s*{/, (m) => `${m}\n    environment: 'jsdom',`);
      log("set test.environment = 'jsdom'");
    }
    // Ensure setupFiles includes our file
    if (/setupFiles\s*:/.test(src)) {
      // append if not present
      if (!/setupFiles\s*:\s*\[[^\]]*['"]\.\/test\/setup-tests\.ts['"]/.test(src)) {
        src = src.replace(
          /setupFiles\s*:\s*\[/,
          (m) => `${m}'./test/setup-tests.ts', `
        );
        log("added './test/setup-tests.ts' to test.setupFiles[]");
      }
    } else {
      // insert setupFiles
      src = src.replace(/test\s*:\s*{/, (m) => `${m}\n    setupFiles: ['./test/setup-tests.ts'],`);
      log("added test.setupFiles to vitest.config.ts");
    }
  }

  fs.writeFileSync(vitestConfig, src, "utf8");
  log(`updated ${path.relative(root, vitestConfig)}`);
}

const SETUP_TS = `import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';

// clean up DOM between tests
afterEach(() => cleanup());

// mock TRPC client imports to a simple stub (no provider/context needed)
vi.mock('@/trpc', () => import('./trpc.stub'));
vi.mock('@/trpc/react', () => import('./trpc.stub'));
vi.mock('@careeros/trpc', () => import('./trpc.stub'));
vi.mock('@careeros/trpc/react', () => import('./trpc.stub'));
`;

const TRPC_STUB_TS = `type HookResult<T> = { data: T; isLoading: boolean; error: unknown };
const ok = <T,>(data: T): HookResult<T> => ({ data, isLoading: false, error: null });

const sampleApplications = [
  { id: '1', company: 'Acme', role: 'Frontend Engineer', status: 'Applied', createdAt: new Date().toISOString() },
  { id: '2', company: 'Globex', role: 'Backend Engineer', status: 'Interview', createdAt: new Date().toISOString() },
];

const trpc = {
  tracker: {
    getApplications: {
      useQuery: (_args?: unknown) => ok(sampleApplications),
    },
    createApplication: {
      useMutation: () => ({
        mutate: (_input: unknown) => {},
        mutateAsync: async (_input: unknown) => ({ id: 'new' }),
        isLoading: false,
        error: null as unknown,
      }),
    },
    getActivity: {
      useQuery: () => ok([] as Array<{ id: string }>)
    }
  },
  settings: {
    get: {
      useQuery: () =>
        ok({
          name: 'Jane Doe',
          email: 'jane@example.com',
          theme: 'light',
          timezone: 'UTC',
          notifications: true,
        }),
    },
    update: {
      useMutation: () => ({
        mutate: (_input: unknown) => {},
        mutateAsync: async (_input: unknown) => ({}),
        isLoading: false,
        error: null as unknown,
      }),
    },
  },
} as const;

export type TrpcStub = typeof trpc;
export { trpc };
export default trpc;
`;

function ensureDeps() {
  if (!INSTALL) {
    log("skipping dependency install ( --no-install )");
    return;
  }
  try {
    log("ensuring @testing-library deps are present…");
    cp.execSync("pnpm -w add -D @testing-library/jest-dom @testing-library/react", {
      stdio: "inherit",
      cwd: root,
    });
  } catch (e) {
    console.warn("⚠️  pnpm add failed (continuing):", e.message);
  }
}

function clearVitestCache() {
  deleteIfExists(path.join(root, "node_modules", ".vitest"));
  deleteIfExists(path.join(webDir, "node_modules", ".vitest"));
}

function main() {
  log("Repairing Vitest setup for web…");

  // 1) Make sure vitest config points to the setup file + jsdom
  ensureVitestConfig();

  // 2) Remove stray root-level setup (if any)
  deleteIfExists(rootSetup);

  // 3) Write setup + stub in web/test
  writeFileEnsured(webSetup, SETUP_TS);
  writeFileEnsured(webStub, TRPC_STUB_TS);

  // 4) Clear Vitest cache
  clearVitestCache();

  // 5) Ensure deps (jest-dom, testing-library/react)
  ensureDeps();

  log("✅ Done. You can now run: pnpm -w test:web");
  if (RUN_TESTS) {
    log("Running tests (pnpm -w test:web)…");
    cp.execSync("pnpm -w test:web", { stdio: "inherit", cwd: root });
  }
}

main();

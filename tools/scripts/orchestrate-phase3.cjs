#!/usr/bin/env node
/**
 * Orchestrate Phase 3 setup for CareerOS (idempotent).
 * - Ensures Prisma env + scripts + seed
 * - Installs deps
 * - Validates & generates Prisma; migrates first time only
 * - Optionally seeds demo data
 * - Adds root scan script and a minimal CI workflow if missing
 * - Runs final scan + web tests
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = process.cwd();
const apiDir = path.join(root, 'apps', 'api');
const prismaDir = path.join(root, 'prisma');
const prismaSchema = path.join(prismaDir, 'schema.prisma');
const prismaEnv = path.join(prismaDir, '.env');
const prismaSeed = path.join(prismaDir, 'seed.cjs');
const apiPkgPath = path.join(apiDir, 'package.json');
const rootPkgPath = path.join(root, 'package.json');
const scansDir = path.join(root, 'scans');

function log(msg) { console.log(msg); }
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function writeJSON(p, obj) {
  const current = exists(p) ? fs.readFileSync(p, 'utf8') : null;
  const next = JSON.stringify(obj, null, 2) + '\n';
  if (current !== next) {
    fs.writeFileSync(p, next, 'utf8');
    return true;
  }
  return false;
}
function writeIfDiff(p, content) {
  const current = exists(p) ? fs.readFileSync(p, 'utf8') : null;
  if (current !== content) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
    return true;
  }
  return false;
}
function run(cmd, opts = {}) {
  log(`$ ${cmd}`);
  try {
    cp.execSync(cmd, { stdio: 'inherit', ...opts });
    return 0;
  } catch (e) {
    return e.status || 1;
  }
}

function ensurePrismaEnv() {
  if (!exists(prismaEnv)) {
    writeIfDiff(
      prismaEnv,
      'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/careeros?schema=public\n'
    );
    log(`✓ Created prisma/.env with default DATABASE_URL`);
  } else {
    log(`= prisma/.env present`);
  }
}

function ensureApiPackage() {
  if (!exists(apiPkgPath)) {
    fs.mkdirSync(apiDir, { recursive: true });
    writeJSON(apiPkgPath, {
      name: "@careeros/api",
      version: "0.0.0",
      private: true,
      scripts: {
        "prisma": "prisma",
        "prisma:migrate": "prisma migrate dev --schema ../../prisma/schema.prisma",
        "prisma:generate": "prisma generate --schema ../../prisma/schema.prisma",
        "prisma:format": "prisma format --schema ../../prisma/schema.prisma",
        "prisma:validate": "prisma validate --schema ../../prisma/schema.prisma",
        "prisma:reset": "prisma migrate reset --schema ../../prisma/schema.prisma --force",
        "prisma:seed": "node ../../prisma/seed.cjs"
      },
      dependencies: { "@prisma/client": "^6.15.0" },
      devDependencies: { "prisma": "^6.15.0" }
    });
    log(`✓ Created apps/api/package.json`);
    return;
  }
  const pkg = readJSON(apiPkgPath) || {};
  pkg.scripts = Object.assign({}, pkg.scripts, {
    "prisma": "prisma",
    "prisma:migrate": "prisma migrate dev --schema ../../prisma/schema.prisma",
    "prisma:generate": "prisma generate --schema ../../prisma/schema.prisma",
    "prisma:format": "prisma format --schema ../../prisma/schema.prisma",
    "prisma:validate": "prisma validate --schema ../../prisma/schema.prisma",
    "prisma:reset": "prisma migrate reset --schema ../../prisma/schema.prisma --force",
    "prisma:seed": "node ../../prisma/seed.cjs"
  });
  pkg.dependencies = Object.assign({ "@prisma/client": "^6.15.0" }, pkg.dependencies || {});
  pkg.devDependencies = Object.assign({ "prisma": "^6.15.0" }, pkg.devDependencies || {});
  if (writeJSON(apiPkgPath, pkg)) log(`✓ Updated apps/api/package.json scripts/deps`);
  else log(`= apps/api/package.json OK`);
}

function ensureSeedFile() {
  const seedBody = `// prisma/seed.cjs
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const userId = 'demo-user';
  await db.application.createMany({
    data: [
      { userId, company: 'Acme',    role: 'SWE',    status: 'APPLIED',   source: 'JOB_BOARD',  notes: 'Applied via board' },
      { userId, company: 'Globex',  role: 'FE Dev', status: 'INTERVIEW', source: 'REFERRAL',   notes: 'Phone screen done' },
      { userId, company: 'Initech', role: 'BE Dev', status: 'OFFER',     source: 'RECRUITER',  notes: 'Offer pending' }
    ],
  });
  console.log('Seed complete.');
}

main().finally(() => db.$disconnect());
`;
  if (writeIfDiff(prismaSeed, seedBody)) log(`✓ Wrote prisma/seed.cjs`);
  else log(`= prisma/seed.cjs present`);
}

function ensureRootScanScript() {
  const rootPkg = readJSON(rootPkgPath) || { name: "@careeros/source", private: true, version: "0.0.0" };
  rootPkg.scripts = Object.assign({}, rootPkg.scripts, {
    "scan:final": "node tools/scripts/run-final-scan.cjs"
  });
  if (writeJSON(rootPkgPath, rootPkg)) log(`✓ Upserted root package.json with scan:final`);
  else log(`= root package.json scan:final OK`);
}

function ensureCI() {
  const ciPath = path.join(root, '.github', 'workflows', 'ci.yml');
  const ciBody = `name: CI

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Install
        run: pnpm -w install

      - name: Repo scan
        run: pnpm run scan:final

      - name: Web tests
        run: pnpm run test:web
`;
  if (!exists(ciPath)) {
    fs.mkdirSync(path.dirname(ciPath), { recursive: true });
    fs.writeFileSync(ciPath, ciBody, 'utf8');
    log(`✓ Created .github/workflows/ci.yml`);
  } else {
    log(`= CI workflow present`);
  }
}

function ensureScansDir() {
  if (!exists(scansDir)) fs.mkdirSync(scansDir, { recursive: true });
}

async function main() {
  log('--- Orchestrate Phase 3 ---');

  // Safety checks
  if (!exists(prismaSchema)) {
    log(`✗ prisma/schema.prisma not found. Please add it first.`);
    process.exit(2);
  }
  if (!exists(apiDir)) fs.mkdirSync(apiDir, { recursive: true });

  ensurePrismaEnv();
  ensureApiPackage();
  ensureSeedFile();
  ensureRootScanScript();
  ensureCI();
  ensureScansDir();

  // Deps
  run('pnpm -w add -D prisma');
  run('pnpm -F ./apps/api add @prisma/client');

  // Prisma validate & generate
  if (run('pnpm -F ./apps/api run prisma:validate') !== 0) {
    log('! prisma:validate failed (check DATABASE_URL in prisma/.env)');
    process.exitCode = 2;
  }
  run('pnpm -F ./apps/api run prisma:generate');

  // First migration only if no migrations exist
  const migrationsDir = path.join(prismaDir, 'migrations');
  const needFirstMigration =
    !exists(migrationsDir) || fs.readdirSync(migrationsDir).filter(n => !n.startsWith('.')).length === 0;

  if (needFirstMigration) {
    log('= No migrations found. Creating init migration...');
    run('pnpm -F ./apps/api run prisma:migrate -n init_tracker');
  } else {
    log('= Migrations present. Skipping migrate step.');
  }

  // Optional seed (always safe; creates duplicates only if your schema allows)
  run('pnpm -F ./apps/api run prisma:seed');

  // Final scan + web tests
  if (exists(path.join(root, 'tools', 'scripts', 'run-final-scan.cjs'))) {
    run('node tools/scripts/run-final-scan.cjs');
  } else {
    log('~ final-scan script missing (tools/scripts/run-final-scan.cjs). Skipping.');
  }
  run('pnpm run test:web');

  log('--- Done ---');
}

main();

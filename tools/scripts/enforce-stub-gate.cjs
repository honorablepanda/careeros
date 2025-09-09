#!/usr/bin/env node
/**
 * enforce-stub-gate.cjs
 * Idempotently enforces a stub cleanup gate in CI (.github/workflows/ci.yml).
 * - Adds/keeps root script `scan:stubs`
 * - Creates CI if missing (canonical template)
 * - Inserts "Stub gate (enforce after deadline)" step before "Web tests"
 * - Optional: also keep a non-blocking "Stub report" step
 *
 * Usage:
 *   node tools/scripts/enforce-stub-gate.cjs
 *   node tools/scripts/enforce-stub-gate.cjs --deadline=2025-10-01
 *   node tools/scripts/enforce-stub-gate.cjs --deadline=2025-10-01 --keep-report
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const deadlineArg = (args.find(a => a.startsWith('--deadline=')) || '').split('=')[1];
const KEEP_REPORT = args.includes('--keep-report');
const DEADLINE = deadlineArg || '2025-10-01';

const ROOT = process.cwd();
const CI_DIR = path.join(ROOT, '.github', 'workflows');
const CI_FILE = path.join(CI_DIR, 'ci.yml');
const ROOT_PKG = path.join(ROOT, 'package.json');

function exists(p){ try { return fs.existsSync(p); } catch { return false; } }
function read(p){ try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function write(p, s){ fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); }
function backup(p){ if (exists(p)) fs.copyFileSync(p, p + '.bak'); }

function ensureRootScanScript() {
  let pkg = {};
  if (exists(ROOT_PKG)) {
    try { pkg = JSON.parse(read(ROOT_PKG)); } catch {}
  }
  pkg.name ||= '@careeros/source';
  pkg.version ||= '0.0.0';
  pkg.private = pkg.private ?? true;
  pkg.scripts ||= {};
  if (!pkg.scripts['scan:stubs']) {
    pkg.scripts['scan:stubs'] = 'node tools/scripts/scan-stubs.cjs';
    write(ROOT_PKG, JSON.stringify(pkg, null, 2) + '\n');
    console.log('✓ Added root script: scan:stubs');
  } else {
    console.log('= Root script scan:stubs present');
  }
}

function canonicalCI(deadline, keepReport) {
  const reportStep = keepReport ? `
      - name: Stub report (non-blocking)
        run: pnpm run scan:stubs
` : '';
  return `name: CI

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    env:
      CI: true

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.x'

      - name: Install deps
        run: pnpm -w install

      - name: Final repo scan
        run: pnpm run scan:final

      - name: Phase 3 module scan
        run: pnpm run scan:modules
${reportStep}      - name: Stub gate (enforce after deadline)
        run: pnpm run scan:stubs -- --fail-after=${deadline}

      - name: Web tests
        run: pnpm run test:web

      - name: Upload scan artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: scans-and-module-reports
          path: |
            scans/**
            tools/module-scan-output/**
          if-no-files-found: ignore
`;
}

function ensureCI(deadline, keepReport) {
  if (!exists(CI_FILE)) {
    write(CI_FILE, canonicalCI(deadline, keepReport));
    console.log('✓ Created .github/workflows/ci.yml with stub gate');
    return;
  }
  const src = read(CI_FILE) || '';
  if (/Stub gate \(enforce after deadline\)/.test(src)) {
    // Update the deadline if different
    const updated = src.replace(/--fail-after=\d{4}-\d{2}-\d{2}/, `--fail-after=${deadline}`);
    if (updated !== src) {
      backup(CI_FILE);
      write(CI_FILE, updated);
      console.log(`✓ Updated stub gate deadline to ${deadline}`);
    } else {
      console.log('= Stub gate already present (deadline unchanged)');
    }
    if (keepReport && !/Stub report \(non-blocking\)/.test(updated)) {
      // Insert report step before gate
      const gateAnchor = updated.indexOf('- name: Stub gate (enforce after deadline)');
      const before = updated.slice(0, gateAnchor);
      const after = updated.slice(gateAnchor);
      const report = `      - name: Stub report (non-blocking)\n        run: pnpm run scan:stubs\n\n`;
      backup(CI_FILE);
      write(CI_FILE, before + report + after);
      console.log('✓ Inserted non-blocking stub report step');
    }
    return;
  }

  // No stub gate yet: insert before "Web tests" if possible, else append to steps.
  const gateBlock = `${keepReport ? `      - name: Stub report (non-blocking)\n        run: pnpm run scan:stubs\n\n` : ''}      - name: Stub gate (enforce after deadline)\n        run: pnpm run scan:stubs -- --fail-after=${deadline}\n\n`;
  let next = src;
  const anchor = '\n      - name: Web tests';
  if (src.includes(anchor)) {
    const idx = src.indexOf(anchor);
    next = src.slice(0, idx) + '\n' + gateBlock + src.slice(idx);
  } else {
    // Fallback: append near end of file (may require manual review)
    next = src.trimEnd() + '\n' + gateBlock;
  }
  if (next !== src) {
    backup(CI_FILE);
    write(CI_FILE, next);
    console.log('✓ Inserted stub gate into existing CI workflow');
  } else {
    console.log('! Could not insert stub gate automatically. Please review .github/workflows/ci.yml');
  }
}

(function main() {
  console.log('--- enforce-stub-gate ---');
  ensureRootScanScript();
  ensureCI(DEADLINE, KEEP_REPORT);
  console.log('Done.');
})();

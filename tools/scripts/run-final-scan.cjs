#!/usr/bin/env node
/**
 * run-final-scan.cjs
 * Runs all project scanners and prints a single missing-items summary.
 * Read-only (no changes). Robust to logs vs JSON files.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (e) {
    return e.stdout?.toString?.() || e.message;
  }
}

// Prefer the newest *JSON* file with a given prefix in a directory
function findNewestJson(dir, startsWith) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter(f => f.startsWith(startsWith) && f.toLowerCase().endsWith('.json'))
    .sort(); // ISO timestamps sort correctly as strings
  if (!files.length) return null;
  return path.join(dir, files[files.length - 1]);
}

(function main() {
  const scansDir = path.join(process.cwd(), 'scans');
  if (!fs.existsSync(scansDir)) fs.mkdirSync(scansDir, { recursive: true });

  // 1) Run the repo health scan
  console.log('→ Running repo health scan…');
  run('node tools/scripts/scan-repo-health.cjs');

  // 2) Run the web tRPC scan (optional but helpful)
  if (fs.existsSync('tools/scripts/scan-trpc-web.cjs')) {
    console.log('→ Running web tRPC scan…');
    run('node tools/scripts/scan-trpc-web.cjs');
  }

  // 3) Load newest JSON reports and summarize
  const healthJsonPath = findNewestJson(scansDir, 'repo-health-');
  const trpcJsonPath   = findNewestJson(scansDir, 'trpc-scan-report-');

  const summary = { missing: [], warnings: [], notes: [] };

  // Helper to safely read JSON
  function readJsonSafe(p) {
    try {
      if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) {}
    return null;
  }

  const healthJson = readJsonSafe(healthJsonPath);
  const trpcJson   = readJsonSafe(trpcJsonPath);

  if (healthJson) {
    const loc = healthJson.locations || {};
    const issues = healthJson.issues || [];
    const checks = healthJson.checks || [];

    // Required bits we care about most
    if (!loc.prismaSchema)   summary.missing.push('prisma/schema.prisma (root)');
    if (!loc.apiPackageJson) summary.missing.push('apps/api/package.json');
    if (!loc.webJestConfig)  summary.missing.push('web/jest.config.ts');
    if (!loc.webTsSpec)      summary.missing.push('web/tsconfig.spec.json');
    if (!loc.webSetupTests)  summary.missing.push('web/test/setupTests.ts');
    if (!loc.webTrpcMock)    summary.missing.push('web/test/trpc.mock.ts');

    // Explicit issues
    for (const i of issues) {
      if (i.severity === 'error') {
        summary.missing.push(`${i.code}: ${i.message}`);
      } else if (i.severity === 'warn') {
        summary.warnings.push(`${i.code}: ${i.message}`);
      }
    }

    // Nice notes
    for (const c of checks) {
      if (c.ok && /WEB_JEST_TRPC_MAPPED|WEB_JEST_AT_ALIAS/.test(c.code)) {
        summary.notes.push(`OK: ${c.message}`);
      }
    }
  } else {
    summary.missing.push('No repo-health JSON found. Did scan-repo-health run?');
  }

  if (trpcJson && trpcJson.resolution?.issues?.length) {
    for (const i of trpcJson.resolution.issues) {
      summary.missing.push(
        `TRPC: ${i.message}${i.missingFor ? ` [${i.missingFor.join(', ')}]` : ''}`
      );
    }
  }

  // 4) Print final summary
  console.log('\n================ FINAL SCAN SUMMARY ================');
  if (summary.missing.length) {
    console.log('Missing / Blocking:');
    summary.missing.forEach(m => console.log('  •', m));
  } else {
    console.log('No blocking items detected ✅');
  }
  if (summary.warnings.length) {
    console.log('\nWarnings:');
    summary.warnings.forEach(w => console.log('  •', w));
  }
  if (summary.notes.length) {
    console.log('\nNotes:');
    summary.notes.forEach(n => console.log('  •', n));
  }

  if (healthJsonPath) console.log('\nhealth JSON:', path.relative(process.cwd(), healthJsonPath));
  if (trpcJsonPath)   console.log('trpc   JSON:', path.relative(process.cwd(), trpcJsonPath));
  console.log('====================================================\n');

  // Non-zero exit if anything blocking is missing
  if (summary.missing.length) process.exitCode = 2;
})();

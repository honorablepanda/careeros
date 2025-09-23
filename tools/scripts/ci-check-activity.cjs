#!/usr/bin/env node
// tools/scripts/ci-check-activity.cjs
const { spawnSync } = require('node:child_process');

const run = spawnSync('node', ['tools/scripts/runtime-activity-check.cjs'], {
  stdio: 'pipe',
  encoding: 'utf8',
});

process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');

if (run.status !== 0) {
  // If the underlying script already failed, fail CI.
  process.exit(run.status);
}

// Treat any ✗/ERROR/FAIL in output as a failure so CI goes red on mismatch.
const out = `${run.stdout}\n${run.stderr}`;
const failedPattern = /(✗|ERROR|FAIL)/i;

if (failedPattern.test(out)) {
  console.error('\nDetected failures in runtime activity check.');
  process.exit(1);
}

console.log('\nRuntime activity check passed with no failures.');

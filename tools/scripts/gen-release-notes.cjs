#!/usr/bin/env node
/* gen-release-notes.cjs
 * Usage: node tools/scripts/gen-release-notes.cjs vX.Y[.Z]
 * Prints release notes to stdout.
 */
const { execSync } = require('child_process');

const TAG = process.argv[2] || process.env.TAG || '';
if (!TAG) {
  console.error('Usage: node tools/scripts/gen-release-notes.cjs vX.Y[.Z]');
  process.exit(1);
}

// Find previous tag (if any)
let prevTag = '';
try {
  prevTag = execSync('git describe --tags --abbrev=0 --exclude=' + TAG, {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
} catch (_) {
  /* first tag */
}

function log(range) {
  try {
    return execSync(
      `git log --no-merges --pretty=format:"- %s (%h) [%an]" ${range}`,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString();
  } catch {
    return '';
  }
}

const range = prevTag ? `${prevTag}..${TAG}` : TAG;
const commits = log(range);

console.log(
  `# ${TAG}\n\n${
    prevTag ? `Changes since ${prevTag}:` : 'Initial release:'
  }\n\n${commits || '- (no notable changes)'}\n`
);

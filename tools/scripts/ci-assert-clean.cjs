#!/usr/bin/env node
const fs = require('fs');
const r = JSON.parse(
  fs.readFileSync('tools/logs/repo-health-report.json', 'utf8')
);
const counts = r.summary.issueCounts;
const total = counts.jest + counts.tsconfig + counts.swcrc + counts.nx;
if (total > 0) {
  console.error('Repo health scan found issues:', counts);
  process.exit(1);
}
console.log('Repo health clean:', counts);

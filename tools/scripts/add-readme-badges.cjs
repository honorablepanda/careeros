#!/usr/bin/env node
const fs = require('fs');
const cp = require('child_process');

let repo = process.env.GITHUB_REPOSITORY;
if (!repo) {
  try { repo = JSON.parse(cp.execSync('gh repo view --json nameWithOwner',{stdio:['ignore','pipe','ignore']}).toString()).nameWithOwner; }
  catch { repo = ''; }
}
if (!repo) {
  console.error('Could not determine repo; set GITHUB_REPOSITORY=owner/name or login with gh');
  process.exit(2);
}

const p = 'README.md';
let s = fs.existsSync(p) ? fs.readFileSync(p,'utf8') : '# Project\n\n';
const releaseBadge = `[![Release](https://img.shields.io/github/v/release/${repo}?sort=semver)](https://github.com/${repo}/releases)`;
const ciBadge = `[![CI](https://github.com/${repo}/actions/workflows/ci.yml/badge.svg)](https://github.com/${repo}/actions/workflows/ci.yml)`;

if (!s.includes(releaseBadge) || !s.includes(ciBadge)) {
  if (!/^#\s/m.test(s)) s = '# Project\n\n' + s;
  s = s.replace(/^# .+\n?/, (m) => m + '\n' + releaseBadge + ' ' + ciBadge + '\n\n');
  fs.writeFileSync(p, s, 'utf8');
  console.log('✓ badges ensured in README.md');
} else {
  console.log('= badges already present');
}

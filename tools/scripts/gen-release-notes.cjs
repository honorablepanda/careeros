#!/usr/bin/env node
/**
 * gen-release-notes.cjs
 * Usage: node tools/scripts/gen-release-notes.cjs v1.2.3 > RELEASE_NOTES.md
 * Builds a simple changelog between previous tag and current tag.
 */
const cp=require('child_process');
const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
if(!tag) { console.error('Missing tag'); process.exit(1); }
function sh(cmd){ return cp.execSync(cmd,{encoding:'utf8'}).trim(); }

let prev;
try {
  prev = sh(`git describe --tags --abbrev=0 ${tag}^ --match "v*"`);
} catch {
  // first tag? fall back to initial commit
  prev = sh('git rev-list --max-parents=0 HEAD');
}

const range = prev && prev.startsWith('v') ? `${prev}..${tag}` : prev ? `${prev}..${tag}` : tag;
const commits = sh(`git log --pretty=format:"- %h %s" ${range}`);

console.log(`## ${tag}\n\n### Changes\n${commits || '- (no commit messages found)'}\n\n### Build Health\n- Repo health & tRPC scan reports attached (see assets).\n`);

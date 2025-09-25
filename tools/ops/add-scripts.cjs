const fs = require('fs');
const p = 'package.json';
const j = JSON.parse(fs.readFileSync(p,'utf8'));
j.scripts = j.scripts || {};
j.scripts['ops:close-pr']    = 'node tools/ops/close-pr-if-open.cjs';
j.scripts['ops:protect:off'] = 'node tools/ops/set-branch-protection.cjs off main';
j.scripts['ops:protect:on']  = 'node tools/ops/set-branch-protection.cjs on main "CI / build_test"';
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
console.log('✓ package.json scripts added');
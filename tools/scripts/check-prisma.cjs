#!/usr/bin/env node
// Runs prisma format + validate using workspace dlx (no local install required)
const cp = require('child_process'); const fs = require('fs');
if (!fs.existsSync('prisma/schema.prisma')) {
  console.log('No prisma/schema.prisma found; skipping.'); process.exit(0);
}
function run(cmd) {
  console.log(' $ ' + cmd);
  cp.execSync(cmd, { stdio: 'inherit', shell: true });
}
try {
  run('pnpm -w dlx prisma format --schema prisma/schema.prisma');
  run('pnpm -w dlx prisma validate --schema prisma/schema.prisma');
  console.log('Prisma format/validate OK.');
} catch (e) {
  process.exit(1);
}

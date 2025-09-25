#!/usr/bin/env node
const fs = require('fs'),
  path = require('path'),
  cp = require('child_process');
function root() {
  try {
    return cp
      .execSync('git rev-parse --show-toplevel', {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .toString()
      .trim();
  } catch {
    return process.cwd();
  }
}
const R = root();
const pkgPath = path.join(R, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error('package.json not found');
  process.exit(1);
}

function detectApiDir() {
  if (fs.existsSync(path.join(R, 'api', 'jest.config.ts'))) return 'api';
  if (fs.existsSync(path.join(R, 'apps', 'api', 'jest.config.ts')))
    return 'apps/api';
  return 'api';
}
const apiDir = detectApiDir();
const jestCfg = path.join(apiDir, 'jest.config.ts').replace(/\\/g, '/');

const j = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
j.scripts = j.scripts || {};
j.scripts.prepare = j.scripts.prepare || 'husky';
j.scripts[
  'test:api'
] = `pnpm -w jest --clearCache --config ${jestCfg} && pnpm -w exec nx run api:test --verbose`;
j.scripts['test:api:guarded'] =
  'node tools/scripts/guard-jest-config.cjs && pnpm run test:api';
j.scripts['test:e2e'] = j.scripts['test:e2e'] || 'playwright test';

fs.writeFileSync(pkgPath, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('✓ patched root scripts (apiDir=%s)', apiDir);

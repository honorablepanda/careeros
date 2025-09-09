#!/usr/bin/env node
/* Idempotent fixer for TRPC mock + imports in web app tests */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const jestCfg = path.join(ROOT, 'web', 'jest.config.ts');
const mockDir = path.join(ROOT, 'web', 'test');
const mockFile = path.join(mockDir, 'trpc.mock.js');
const pageFile = path.join(ROOT, 'web', 'src', 'app', 'tracker', 'page.tsx');

const log = (...a) => console.log('[trpc-fix]', ...a);
const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
const write = (p, s) => fs.writeFileSync(p, s, 'utf8');

const MOCK_CONTENT = `// web/test/trpc.mock.js (auto-generated)
const mockQuery = (data = []) => ({ data });
const mockMutation = () => ({ mutate: () => {} });

const tracker = {
  getApplications: { useQuery: (_args) => mockQuery([]) },
  createApplication: { useMutation: () => mockMutation() },
  updateApplication: { useMutation: () => mockMutation() },
  deleteApplication: { useMutation: () => mockMutation() },
};

const trpc = { tracker };

// Support default, named, and namespace imports
module.exports = {
  __esModule: true,
  default: trpc,
  trpc,
  tracker,
};
`;

function step1_mock() {
  ensureDir(mockDir);
  const cur = read(mockFile);
  if (!cur || !/module\.exports\s*=\s*\{[\s\S]*__esModule/.test(cur)) {
    write(mockFile, MOCK_CONTENT);
    log('wrote mock -> web/test/trpc.mock.js');
  } else {
    log('mock ok -> web/test/trpc.mock.js');
  }
}

function injectMapperBlock(cfg) {
  // ensure a moduleNameMapper exists; insert after opening of config object
  const open = /const\s+config\s*=\s*\{\s*/m;
  if (!open.test(cfg)) return cfg; // give up if unexpected
  const mapperLine =
    `  moduleNameMapper: {\n` +
    `    '^@careeros/trpc$': '<rootDir>/test/trpc.mock.js',\n` +
    `    '^@careeros/trpc/.*$': '<rootDir>/test/trpc.mock.js'\n` +
    `  },\n`;
  return cfg.replace(open, (m) => m + mapperLine);
}

function step2_jestConfig() {
  const s = read(jestCfg);
  if (!s) { log(`WARN: ${jestCfg} not found; skipping mapper fix.`); return; }

  let out = s;

  // normalize any previous .ts mapping to .js
  out = out.replace(/<rootDir>\/test\/trpc\.mock\.ts/g, '<rootDir>/test/trpc.mock.js');

  const hasExact = /['"]\^@careeros\/trpc\$/m.test(out);
  const hasGlob  = /['"]\^@careeros\/trpc\/\.\*\$/m.test(out);

  if (!/moduleNameMapper\s*:/.test(out)) {
    out = injectMapperBlock(out);
    log('added moduleNameMapper to web/jest.config.ts');
  } else {
    // has a mapper; ensure entries present/point to JS
    if (!hasExact) {
      out = out.replace(/moduleNameMapper\s*:\s*\{/, (m) =>
        `${m}\n    '^@careeros/trpc$': '<rootDir>/test/trpc.mock.js',`
      );
      log('added exact mapper in web/jest.config.ts');
    }
    if (!hasGlob) {
      out = out.replace(/moduleNameMapper\s*:\s*\{/, (m) =>
        `${m}\n    '^@careeros/trpc/.*$': '<rootDir>/test/trpc.mock.js',`
      );
      log('added glob mapper in web/jest.config.ts');
    }
  }

  if (out !== s) {
    write(jestCfg, out);
    log('updated web/jest.config.ts');
  } else {
    log('jest config ok -> web/jest.config.ts');
  }
}

function step3_pageImport() {
  const s = read(pageFile);
  if (!s) { log(`WARN: ${pageFile} not found; skipping page import fix.`); return; }

  let out = s;

  // If there is a default import from '@careeros/trpc', switch to named.
  // e.g., `import trpc from '@careeros/trpc'` -> `import { trpc } from '@careeros/trpc'`
  out = out.replace(
    /import\s+trpc\s+from\s+['"]@careeros\/trpc['"];?/,
    `import { trpc } from '@careeros/trpc';`
  );

  // If no import exists at all but code uses trpc., add a named import at top
  if (!/from\s+['"]@careeros\/trpc['"]/.test(out) && /\btrpc\./.test(out)) {
    out = `import { trpc } from '@careeros/trpc';\n` + out;
  }

  if (out !== s) {
    write(pageFile, out);
    log('ensured named import in web/src/app/tracker/page.tsx');
  } else {
    log('page import ok -> web/src/app/tracker/page.tsx');
  }
}

(function main(){
  step1_mock();
  step2_jestConfig();
  step3_pageImport();
  log('done.');
})();

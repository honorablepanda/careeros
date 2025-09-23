#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function guessWebPath() {
  const candidates = [
    path.join(ROOT, 'apps', 'web'),
    path.join(ROOT, 'packages', 'web'),
    path.join(ROOT, 'web'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, 'project.json')))
      return p;
    if (fs.existsSync(p) && fs.existsSync(path.join(p, 'src'))) return p;
  }
  return candidates[0];
}

function getSourceRoot(webPath) {
  const pj = path.join(webPath, 'project.json');
  if (fs.existsSync(pj)) {
    try {
      const json = JSON.parse(fs.readFileSync(pj, 'utf8'));
      if (json.sourceRoot) return json.sourceRoot; // e.g. "apps/web/src"
    } catch {}
  }
  // fallback
  if (fs.existsSync(path.join(webPath, 'src')))
    return path
      .join(webPath, 'src')
      .replace(ROOT + path.sep, '')
      .replace(/\\/g, '/');
  return path.basename(webPath) + '/src';
}

function pickAppDir(webPath, sourceRoot) {
  const isSrc = /\/src$/.test(sourceRoot.replace(/\\/g, '/'));
  const a = path.join(webPath, 'src', 'app');
  const b = path.join(webPath, 'app');
  if (isSrc && fs.existsSync(a)) return a;
  if (!isSrc && fs.existsSync(b)) return b;
  // prefer src/app if present
  return fs.existsSync(a) ? a : b;
}

function insertAfterUseClientOrTop(code, linesToInsert) {
  // keep 'use client' at very top if present
  const m = code.match(/^\s*['"]use client['"];?\s*\r?\n/);
  if (m) {
    return code.slice(0, m[0].length) + linesToInsert + code.slice(m[0].length);
  }
  return linesToInsert + code;
}

function ensureExports(code) {
  let changed = false;

  // Normalize and/or add: export const dynamic = 'force-dynamic'
  if (/export\s+const\s+dynamic\s*=/.test(code)) {
    const next = code.replace(
      /export\s+const\s+dynamic\s*=\s*['"][^'"]+['"]\s*;?/,
      "export const dynamic = 'force-dynamic';"
    );
    if (next !== code) {
      code = next;
      changed = true;
    }
  } else {
    code = insertAfterUseClientOrTop(
      code,
      "export const dynamic = 'force-dynamic';\n"
    );
    changed = true;
  }

  // Add/normalize: export const revalidate = 0
  if (/export\s+const\s+revalidate\s*=/.test(code)) {
    const next = code.replace(
      /export\s+const\s+revalidate\s*=\s*[^;]+;?/,
      'export const revalidate = 0;'
    );
    if (next !== code) {
      code = next;
      changed = true;
    }
  } else {
    code = insertAfterUseClientOrTop(code, 'export const revalidate = 0;\n');
    changed = true;
  }

  // Add/normalize: export const dynamicParams = true
  if (/export\s+const\s+dynamicParams\s*=/.test(code)) {
    const next = code.replace(
      /export\s+const\s+dynamicParams\s*=\s*false\s*;?/,
      'export const dynamicParams = true;'
    );
    if (next !== code) {
      code = next;
      changed = true;
    }
  } else {
    code = insertAfterUseClientOrTop(
      code,
      'export const dynamicParams = true;\n'
    );
    changed = true;
  }

  return { code, changed };
}

function commentOutGenerateStaticParams(code) {
  const re =
    /export\s+async\s+function\s+generateStaticParams\s*\([^)]*\)\s*\{\s*[\s\S]*?\}\s*/m;
  if (re.test(code)) {
    const next = code.replace(re, (match) => {
      const commented = match
        .split('\n')
        .map((l) => `// ${l}`)
        .join('\n');
      return `/* dynamic route; static params disabled */\n${commented}\n`;
    });
    return { code: next, changed: true, found: true };
  }
  return { code, changed: false, found: false };
}

function hasDefaultExport(code) {
  return /export\s+default\s+function|export\s+default\s*\(|export\s+default\s+[A-Za-z0-9_$]+/.test(
    code
  );
}

function main() {
  const webPath = guessWebPath();
  const sourceRoot = getSourceRoot(webPath);
  const appDir = pickAppDir(webPath, sourceRoot);
  const pagePath = path.join(appDir, 'tracker', '[id]', 'activity', 'page.tsx');

  console.log(`• Web path: ${webPath}`);
  console.log(`• Source root: ${sourceRoot}`);
  console.log(`• App dir: ${appDir}`);
  console.log(`• Target: ${pagePath}`);

  if (!fs.existsSync(pagePath)) {
    console.error(
      '✗ Dynamic activity page not found. Expected at the path above.'
    );
    process.exit(1);
  }

  let code = fs.readFileSync(pagePath, 'utf8');

  // Warn on notFound usage/import
  const importsNotFound =
    /from\s+['"]next\/navigation['"]/.test(code) && /notFound\s*\(/.test(code);
  if (importsNotFound) {
    console.warn(
      '! This page imports/uses notFound() — that can cause 404 if data fetch fails.'
    );
  }

  const before = code;

  // Ensure exports
  let { code: code1 } = ensureExports(code);
  code = code1;

  // Comment out generateStaticParams
  const gsp = commentOutGenerateStaticParams(code);
  code = gsp.code;

  // Sanity: default export exists
  if (!hasDefaultExport(code)) {
    console.warn(
      '! No default export detected — this will 404. Please ensure the page exports a React component as default.'
    );
  }

  if (code !== before) {
    fs.writeFileSync(pagePath, code, 'utf8');
    console.log('✓ Patched dynamic settings for the activity route.');
    if (gsp.found) console.log('✓ Commented out generateStaticParams().');
  } else {
    console.log('• No changes were necessary.');
  }

  console.log('\nNext steps:');
  console.log('  1) Clear Next cache: rimraf apps/web/.next .nx/cache');
  console.log(
    '  2) Rebuild once:     pnpm -w exec nx run web:build --filter ./apps/web'
  );
  console.log(
    '  3) Serve:            pnpm -w exec nx run web:serve --filter ./apps/web'
  );
  console.log(
    '  4) Visit:            http://localhost:3000/tracker/<APP_ID>/activity'
  );
}

main();

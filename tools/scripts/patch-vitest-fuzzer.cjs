#!/usr/bin/env node
/* Patches tools/scripts/fuzz-web-vitest.cjs with:
 *  - S0 bulletproof setup variant (jest-dom v5/v6, React global, cleanup)
 *  - First-error hint after each run
 *  - Strict winner selection (needs totals + exit code 0)
 *  - Apply-best only if succeeded
 *  - Optional: env URL + aliases in vitest config template
 */
const fs = require('fs');
const path = require('path');

const fuzzerPath = path.join(process.cwd(), 'tools', 'scripts', 'fuzz-web-vitest.cjs');
if (!fs.existsSync(fuzzerPath)) {
  console.error(`✖ Not found: ${fuzzerPath}`);
  process.exit(1);
}

const original = fs.readFileSync(fuzzerPath, 'utf8');
let content = original;
let changed = false;
const notes = [];

// --- A) Insert S0 variant at the top of setupVariants ------------------------
const s0Block = `
{
  id: 'S0-bulletproof-jestdom',
  content: \`import React from 'react';
(globalThis as any).React = React;

import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';

// Handle both jest-dom v6 (".../vitest") and v5 ("matchers" + manual extend)
async function installJestDom() {
  try {
    await import('@testing-library/jest-dom/vitest'); // v6+
    return;
  } catch {
    try {
      const matchers = await import('@testing-library/jest-dom/matchers');
      // @ts-ignore - matchers shape differs across versions
      expect.extend(matchers);
      await import('@testing-library/jest-dom'); // ensure side-effects loaded
    } catch {
      // Last resort: continue without extra matchers
    }
  }
}
await installJestDom();

afterEach(() => cleanup());
\`,
},`;

if (!content.includes("S0-bulletproof-jestdom")) {
  const m = content.match(/(?:const|let|var)\s+setupVariants\s*=\s*\[/);
  if (m) {
    const insertAt = m.index + m[0].length;
    content = content.slice(0, insertAt) + `\n${s0Block}\n` + content.slice(insertAt);
    changed = true;
    notes.push('added S0-bulletproof-jestdom to setupVariants');
  } else {
    notes.push('WARN: could not find setupVariants array — skipped S0 insert');
  }
} else {
  notes.push('S0 already present — OK');
}

// --- B1) Print first-error hint after each run() -----------------------------
if (!content.includes('first error hint')) {
  const runMatch = content.match(/const\s+res\s*=\s*run\([^)]*\);?/);
  if (runMatch) {
    const after = runMatch.index + runMatch[0].length;
    const snippet = `
  // quick hint printed to console
  const firstErrLine =
    (res.stderr || res.stdout).split(/\\r?\\n/).find(l =>
      /error|failed|cannot|not found|referenceerror|typeerror/i.test(l)
    ) || '(no obvious first error line)';
  console.log(\`   ↳ first error hint: \${firstErrLine}\`);
`;
    content = content.slice(0, after) + snippet + content.slice(after);
    changed = true;
    notes.push('added first error hint after run()');
  } else {
    notes.push('WARN: could not locate "const res = run(...)" — skipped hint insert');
  }
} else {
  notes.push('first error hint already present — OK');
}

// --- B2) Tighten winner selection (needs totals + exit code 0) ---------------
if (!content.includes('gotTotals') || !content.includes('succeeded')) {
  // Replace the score line that references passedTests with the strict version
  const scoreRegex = /const\s+score\s*=\s*[^;]*passedTests[^;]*;/;
  if (scoreRegex.test(content)) {
    content = content.replace(
      scoreRegex,
      `const gotTotals = Number.isFinite(parsed?.totalFiles) || Number.isFinite(parsed?.totalTests);
const succeeded = res.code === 0 && gotTotals;
const score = succeeded
  ? (parsed.passedTests ?? 0) * 1e6 + (parsed.passedFiles ?? 0) * 1e3
  : -1; // hard fail`
    );
    changed = true;
    notes.push('replaced score formula with strict (totals + code===0)');
  } else {
    notes.push('WARN: could not find score formula using passedTests — skipped');
  }

  // Make sure best object stores succeeded
  if (!/best\s*=\s*\{\s*succeeded\s*,/m.test(content)) {
    content = content.replace(/best\s*=\s*\{\s*/m, 'best = { succeeded, ');
    changed = true;
    notes.push('ensure best object includes succeeded');
  }
} else {
  notes.push('strict winner selection already present — OK');
}

// --- B3) Apply best only if succeeded ----------------------------------------
if (!content.includes('No successful run to apply')) {
  // Replace the entire if (APPLY_BEST) { ... } else { ... } block
  const startIdx = content.indexOf('if (APPLY_BEST)');
  if (startIdx !== -1) {
    // naive brace matcher
    let i = startIdx;
    let depth = 0;
    let endIdx = -1;
    for (; i < content.length; i++) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
    if (endIdx !== -1) {
      const newBlock = `
if (APPLY_BEST) {
  const ok = !!(best && (best.succeeded ?? (best.parsed && (Number.isFinite(best.parsed.totalFiles) || Number.isFinite(best.parsed.totalTests)))) && best.code === 0);
  if (ok) {
    console.log('▶ Applying best combo to working tree…');
    writeFile(setupTestsPath, best.setup.content);
    writeFile(vitestConfigPath, vitestConfigTemplate(best.config));
  } else {
    console.log('▶ No successful run to apply (no totals or nonzero exit). Keeping originals.');
  }
} else {
  console.log('▶ Restoring originals (pass --apply-best to keep the winner).');
}
`;
      content = content.slice(0, startIdx) + newBlock + content.slice(endIdx);
      changed = true;
      notes.push('updated APPLY_BEST block to require success');
    } else {
      notes.push('WARN: could not match braces for APPLY_BEST block — skipped');
    }
  } else {
    notes.push('WARN: could not find APPLY_BEST block — skipped');
  }
} else {
  notes.push('APPLY_BEST block already guarded — OK');
}

// --- C) Optional: tweak vitestConfigTemplate (env URL + aliases) -------------
if (!content.includes(`jsdom: { url: 'http://localhost' }`)) {
  // Insert environmentOptions after setupFiles line inside the template, if present
  const reSetupFiles = /(setupFiles:\s*\[[^\]]*\]\s*,?)/;
  if (reSetupFiles.test(content)) {
    content = content.replace(
      reSetupFiles,
      `$1\n    environmentOptions: { jsdom: { url: 'http://localhost' } },`
    );
    changed = true;
    notes.push('added environmentOptions.jsdom.url to template');
  } else {
    notes.push('INFO: did not find setupFiles in template — skipped env URL');
  }
}

if (!content.includes(`'@/trpc': path.resolve(__dirname, 'test/trpc.stub.ts')`)) {
  // If there's a resolve alias block, extend it; else try to add a simple one near test: { ... },
  const hasResolveBlock = /resolve:\s*\{[\s\S]*?\}/m.test(content);
  if (hasResolveBlock) {
    // add keys if missing
    let before = content;
    content = content
      .replace(/alias:\s*\{\s*/m, (m) => m)
      .replace(/alias:\s*\{\s*/m, (m) => {
        if (before.includes(`'@': path.resolve(__dirname, 'src')`) &&
            before.includes(`'@/trpc': path.resolve(__dirname, 'test/trpc.stub.ts')`) &&
            before.includes(`'react/jsx-runtime': 'react/jsx-runtime'`)) return m;
        return `${m}
      '@': path.resolve(__dirname, 'src'),
      '@/trpc': path.resolve(__dirname, 'test/trpc.stub.ts'),
      'react/jsx-runtime': 'react/jsx-runtime',`;
      });
    if (content !== before) {
      changed = true;
      notes.push('extended resolve.alias in template');
    } else {
      notes.push('resolve.alias already contains entries — OK');
    }
  } else {
    // Best effort: insert a resolve block after the test block closing brace
    const testBlockEnd = content.indexOf('},', content.indexOf('test:'));
    if (testBlockEnd !== -1) {
      const insertPos = testBlockEnd + 2;
      const block = `
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@/trpc': path.resolve(__dirname, 'test/trpc.stub.ts'),
      'react/jsx-runtime': 'react/jsx-runtime',
    },
  },`;
      content = content.slice(0, insertPos) + block + content.slice(insertPos);
      changed = true;
      notes.push('inserted resolve.alias block into template');
    } else {
      notes.push('INFO: could not locate end of test block — skipped alias insert');
    }
  }
}

// --- Write backup + save ------------------------------------------------------
if (changed) {
  const backupDir = path.join(process.cwd(), 'tools', 'scripts', '.backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `fuzz-web-vitest.${stamp}.bak.cjs`);
  fs.writeFileSync(backupPath, original, 'utf8');
  fs.writeFileSync(fuzzerPath, content, 'utf8');
  console.log('✅ Patched tools/scripts/fuzz-web-vitest.cjs');
  console.log('   Backup:', path.relative(process.cwd(), backupPath));
} else {
  console.log('ℹ No changes needed (already patched).');
}

notes.forEach(n => console.log(' -', n));

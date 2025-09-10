#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FIX = process.argv.includes('--fix');

const rel = p => path.join(ROOT, p);
const readIf = p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const readJSON = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const writeJSON = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2));
const ensureDir = p => fs.mkdirSync(p, { recursive: true });

let errors = [];
let fixes = [];

/** 1) Root tsconfig.base.json aliases */
{
  const p = rel('tsconfig.base.json');
  const json = readJSON(p);
  if (!json) {
    errors.push(`Missing tsconfig.base.json at ${p}`);
  } else {
    json.compilerOptions = json.compilerOptions || {};
    json.compilerOptions.paths = json.compilerOptions.paths || {};
    const paths = json.compilerOptions.paths;

    const want = {
      '@careeros/api': ['apps/api/src/trpc/root.ts'],
      '@careeros/types': ['libs/types/src/index.ts'],
    };

    for (const [k, v] of Object.entries(want)) {
      const same =
        Array.isArray(paths[k]) &&
        paths[k].length === v.length &&
        paths[k].every((a, i) => a === v[i]);
      if (!same) {
        if (FIX) {
          paths[k] = v;
          fixes.push(`tsconfig.base.json: set paths["${k}"] -> ${JSON.stringify(v)}`);
        } else {
          errors.push(`tsconfig.base.json: paths["${k}"] is missing or different (want ${JSON.stringify(v)})`);
        }
      }
    }
    if (FIX) writeJSON(p, json);
  }
}

/** 2) web/tsconfig.json alias @/* -> src/* */
{
  const p = rel('web/tsconfig.json');
  let json = readJSON(p);

  if (!json) {
    if (FIX) {
      ensureDir(path.dirname(p));
      json = {
        extends: '../tsconfig.base.json',
        compilerOptions: { baseUrl: '.', jsx: 'react-jsx', paths: { '@/*': ['src/*'] } },
        include: ['next-env.d.ts', 'src/**/*', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      };
      writeJSON(p, json);
      fixes.push('created web/tsconfig.json with @/* alias');
    } else {
      errors.push('web/tsconfig.json missing');
    }
  } else {
    json.compilerOptions = json.compilerOptions || {};
    json.compilerOptions.baseUrl = '.';
    json.compilerOptions.jsx = json.compilerOptions.jsx || 'react-jsx';
    json.compilerOptions.paths = json.compilerOptions.paths || {};
    const paths = json.compilerOptions.paths;
    const want = { '@/*': ['src/*'] };

    for (const [k, v] of Object.entries(want)) {
      const same =
        Array.isArray(paths[k]) &&
        paths[k].length === v.length &&
        paths[k].every((a, i) => a === v[i]);
      if (!same) {
        if (FIX) {
          paths[k] = v;
          fixes.push(`web/tsconfig.json: set paths["${k}"] -> ${JSON.stringify(v)}`);
        } else {
          errors.push(`web/tsconfig.json: paths["${k}"] missing or different (want ${JSON.stringify(v)})`);
        }
      }
    }
    if (FIX) writeJSON(p, json);
  }
}

/** 3) web/src/trpc.ts typed client */
{
  const p = rel('web/src/trpc.ts');
  const content = readIf(p);
  const wanted = `'use client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@careeros/api';

export const trpc = createTRPCReact<AppRouter>();
`;

  if (!content) {
    if (FIX) {
      ensureDir(path.dirname(p));
      fs.writeFileSync(p, wanted);
      fixes.push('created web/src/trpc.ts');
    } else {
      errors.push('web/src/trpc.ts missing');
    }
  } else {
    const ok =
      content.includes("createTRPCReact") &&
      content.includes("from '@trpc/react-query'") &&
      content.includes("type { AppRouter } from '@careeros/api'") &&
      content.includes('createTRPCReact<AppRouter>()');

    if (!ok) {
      if (FIX) {
        fs.writeFileSync(p, wanted);
        fixes.push('rewrote web/src/trpc.ts to standard client');
      } else {
        errors.push('web/src/trpc.ts exists but does not export a typed TRPC client (AppRouter)');
      }
    }
  }
}

/** 4) providers imports { trpc } from '@/trpc' */
{
  const p = rel('web/src/app/providers.tsx');
  const content = readIf(p);
  if (!content) {
    // We won't create providers.tsx automatically; just report.
    errors.push('web/src/app/providers.tsx missing (expected to import { trpc } from "@/trpc")');
  } else if (!/import\s*\{\s*trpc\s*\}\s*from\s*['"]@\/trpc['"]/.test(content)) {
    if (FIX) {
      // Insert the import after the first 'use client' or at top
      let updated = content;
      const line = `import { trpc } from '@/trpc';\n`;
      if (/^'use client';/m.test(updated) && !updated.includes(line)) {
        updated = updated.replace(/^'use client';\s*\n?/, m => m + line);
      } else if (!updated.includes(line)) {
        updated = line + updated;
      }
      fs.writeFileSync(p, updated);
      fixes.push('patched web/src/app/providers.tsx to import { trpc } from "@/trpc"');
    } else {
      errors.push('providers.tsx does not import { trpc } from "@/trpc"');
    }
  }
}

/** Output summary & exit */
if (!FIX && errors.length) {
  console.error('‚ùå TRPC wiring check failed:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

if (FIX) {
  if (fixes.length) {
    console.log('Ìª†  Applied fixes:');
    for (const f of fixes) console.log(' -', f);
  } else {
    console.log('‚úì Nothing to fix; configuration already correct.');
  }
  if (errors.length) {
    console.log('\n‚ÑπÔ∏è  Notes:');
    for (const e of errors) console.log(' -', e);
  }
} else {
  console.log('‚úì TRPC wiring looks good.');
}

#!/usr/bin/env node
/**
 * Wire a typed tRPC client into the web app (idempotent).
 * - web/src/trpc/index.ts
 * - web/src/app/providers.tsx
 * - web/src/app/layout.tsx (wrap with <Providers>)
 * - web/src/app/tracker/page.tsx (ensure import { trpc } from '@/trpc')
 * - web/tsconfig.json (or tsconfig.app.json) -> paths: { "@/*": ["src/*"], "@careeros/trpc": ["src/trpc"] }
 * - Add root npm script "wire:trpc-web" if missing
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const W = p => path.join(ROOT, 'web', p);
const trpcClientPath = W('src/trpc/index.ts');
const providersPath  = W('src/app/providers.tsx');
const layoutPath     = W('src/app/layout.tsx');
const trackerPage    = W('src/app/tracker/page.tsx');
const tsconfigPath   = fs.existsSync(W('tsconfig.json')) ? W('tsconfig.json') : W('tsconfig.app.json');
const rootPkgPath    = path.join(ROOT, 'package.json');

function ensureDir(p){ fs.mkdirSync(path.dirname(p), { recursive: true }); }
function writeIfChanged(p, content){
  ensureDir(p);
  const exists = fs.existsSync(p);
  if (exists && fs.readFileSync(p, 'utf8') === content) return false;
  fs.writeFileSync(p, content, 'utf8');
  return true;
}

function upsertTrpcClient(){
  const content = `\
'use client';

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../apps/api/src/router/root';

export const trpc = createTRPCReact<AppRouter>();
`;
  const changed = writeIfChanged(trpcClientPath, content);
  console.log(changed ? `✓ wrote ${path.relative(ROOT, trpcClientPath)}` : `= up-to-date ${path.relative(ROOT, trpcClientPath)}`);
}

function upsertProviders(){
  const content = `\
'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/trpc';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
`;
  const changed = writeIfChanged(providersPath, content);
  console.log(changed ? `✓ wrote ${path.relative(ROOT, providersPath)}` : `= up-to-date ${path.relative(ROOT, providersPath)}`);
}

function patchLayout(){
  if (!fs.existsSync(layoutPath)) {
    console.warn(`! missing ${path.relative(ROOT, layoutPath)} (skipping)`);
    return;
  }
  const before = fs.readFileSync(layoutPath, 'utf8');

  let src = before;

  // ensure Providers import
  if (!/from\s+['"]\.\/providers['"]/.test(src)) {
    // insert after first import or at top
    if (/^import .+/m.test(src)) {
      src = src.replace(/^import .+\n/, m => m + `import { Providers } from './providers';\n`);
    } else {
      src = `import { Providers } from './providers';\n` + src;
    }
  }

  // wrap <body>{children}</body> with Providers
  if (/<body>\s*\{children\}\s*<\/body>/.test(src)) {
    src = src.replace(
      /<body>\s*\{children\}\s*<\/body>/,
      `<body>\n        <Providers>{children}</Providers>\n      </body>`
    );
  } else if (!/Providers>/.test(src)) {
    // best-effort: wrap first occurrence of <body>...</body>
    src = src.replace(
      /<body>([\s\S]*?)<\/body>/,
      (_m, inner) => `<body>\n        <Providers>${inner.trim()}</Providers>\n      </body>`
    );
  }

  if (src !== before) {
    fs.writeFileSync(layoutPath, src, 'utf8');
    console.log(`✓ updated ${path.relative(ROOT, layoutPath)} to wrap with <Providers>`);
  } else {
    console.log(`= up-to-date ${path.relative(ROOT, layoutPath)}`);
  }
}

function patchTrackerPage(){
  if (!fs.existsSync(trackerPage)) {
    console.log(`= tracker page not found (${path.relative(ROOT, trackerPage)}), skipping`);
    return;
  }
  const before = fs.readFileSync(trackerPage, 'utf8');
  let src = before;

  // If there's an existing "import { trpc } from '...';", ensure it's from '@/trpc'
  if (/import\s*\{\s*trpc\s*\}\s*from\s*['"][^'"]+['"]/.test(src)) {
    src = src.replace(/import\s*\{\s*trpc\s*\}\s*from\s*['"][^'"]+['"]/, `import { trpc } from '@/trpc'`);
  } else if (!/from\s+['"]@\/trpc['"]/.test(src)) {
    // Add an import near the top
    if (/^import .+/m.test(src)) {
      src = src.replace(/^import .+\n/, m => m + `import { trpc } from '@/trpc';\n`);
    } else {
      src = `import { trpc } from '@/trpc';\n` + src;
    }
  }

  if (src !== before) {
    fs.writeFileSync(trackerPage, src, 'utf8');
    console.log(`✓ ensured import { trpc } from '@/trpc' in ${path.relative(ROOT, trackerPage)}`);
  } else {
    console.log(`= up-to-date ${path.relative(ROOT, trackerPage)}`);
  }
}

function upsertTsconfigPaths(){
  if (!tsconfigPath || !fs.existsSync(tsconfigPath)) {
    console.warn('! web tsconfig not found (web/tsconfig.json or web/tsconfig.app.json), skipping');
    return;
  }
  const json = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  json.compilerOptions = json.compilerOptions || {};
  json.compilerOptions.baseUrl = json.compilerOptions.baseUrl || '.';
  json.compilerOptions.paths = json.compilerOptions.paths || {};
  const paths = json.compilerOptions.paths;

  // Ensure @/* -> src/*
  if (!paths['@/*']) paths['@/*'] = ['src/*'];

  // Ensure @careeros/trpc -> src/trpc (keeps tests green that mock this path)
  paths['@careeros/trpc'] = ['src/trpc'];

  const after = JSON.stringify(json, null, 2) + '\n';
  const before = fs.readFileSync(tsconfigPath, 'utf8');
  if (after !== before) {
    fs.writeFileSync(tsconfigPath, after, 'utf8');
    console.log(`✓ updated ${path.relative(ROOT, tsconfigPath)} paths`);
  } else {
    console.log(`= up-to-date ${path.relative(ROOT, tsconfigPath)} paths`);
  }
}

function ensureRootScript(){
  if (!fs.existsSync(rootPkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
  pkg.scripts = pkg.scripts || {};
  if (!pkg.scripts['wire:trpc-web']) {
    pkg.scripts['wire:trpc-web'] = 'node tools/scripts/wire-trpc-web.cjs';
    fs.writeFileSync(rootPkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log('✓ added root script: wire:trpc-web');
  } else {
    console.log('= root script wire:trpc-web present');
  }
}

(function main(){
  console.log('--- wire-trpc-web ---');
  upsertTrpcClient();
  upsertProviders();
  patchLayout();
  patchTrackerPage();
  upsertTsconfigPaths();
  ensureRootScript();
  console.log('Done.');
})();

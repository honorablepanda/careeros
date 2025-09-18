/**
 * restore-web.cjs
 * - Finds latest web._archived_* (root or apps/)
 * - Moves it back to apps/web (backs up existing apps/web if present)
 * - Ensures minimal Next/TS config + TRPC wiring + Vitest setup
 * - Adds Nx project.json if missing
 * - Wraps layout with <Providers> if layout.tsx exists (best effort)
 */
const fs = require('fs');
const path = require('path');

const repo = process.cwd();
const log = (...a) => console.log(...a);
const exists = p => fs.existsSync(p);
const read = p => fs.readFileSync(p,'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); };
const mv = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.renameSync(src, dst); };

function findArchived() {
  const candidates = [
    ...globNames(repo, /^web\._archived_/),
    ...globNames(path.join(repo, 'apps'), /^web\._archived_/).map(n => path.join('apps', n)),
  ].sort().reverse();
  return candidates[0] || null;
}
function globNames(dir, regex) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).filter(n => regex.test(n) && fs.statSync(path.join(dir, n)).isDirectory());
}

function backupIfExists(dstDir) {
  if (!exists(dstDir)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  const bak = `${dstDir}._backup_${stamp}`;
  mv(dstDir, bak);
  log(`↪️  Backed up existing ${dstDir} -> ${bak}`);
  return bak;
}

function ensureFile(file, content) {
  if (!exists(file)) {
    write(file, content);
    log(`+ ${file}`);
  }
}

function patchLayout(layoutPath) {
  if (!exists(layoutPath)) return;
  let body = read(layoutPath);
  if (!/Providers/.test(body)) {
    // import
    if (!/^import Providers from .\/providers.;$/m.test(body)) {
      body = `import Providers from "./providers";\n` + body;
    }
    // wrap body tag
    body = body.replace(/(<body[^>]*>)/, `$1\n      <Providers>`).replace(/(<\/body>)/, `      </Providers>\n$1`);
    write(layoutPath, body);
    log(`~ wrapped <body> with <Providers> in ${layoutPath}`);
  }
}

function main() {
  const archived = findArchived();
  if (!archived) {
    log('⚠️  No web._archived_* folder found. Creating a fresh apps/web skeleton instead.');
  } else {
    log(`���️  Found archived: ${archived}`);
  }

  const target = path.join('apps','web');
  backupIfExists(target);

  if (archived) {
    mv(path.join(repo, archived), target);
    log(`✅ Restored ${archived} -> ${target}`);
  } else {
    fs.mkdirSync(target, { recursive: true });
  }

  // Minimal Next + TS config
  ensureFile(path.join(target,'package.json'), JSON.stringify({
    name: "@careeros/web",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start", test: "vitest" },
    dependencies: {
      next: "14.2.4",
      react: "18.3.1",
      "react-dom": "18.3.1",
      "@tanstack/react-query": "^5.51.1",
      "@trpc/client": "^11.0.0-rc.486",
      "@trpc/react-query": "^11.0.0-rc.486",
      superjson: "^2.2.1"
    },
    devDependencies: { vitest: "^3.2.4", typescript: "^5.5.4" }
  }, null, 2));

  ensureFile(path.join(target,'next.config.js'),
`const path = require('path');
/** @type {import('next').NextConfig} */
module.exports = { experimental: { outputFileTracingRoot: path.join(__dirname, '../../') } };
`);

  ensureFile(path.join(target,'tsconfig.json'),
`{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "jsx": "preserve",
    "allowJs": true,
    "types": ["vitest/globals"]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
`);

  // Minimal app scaffold
  ensureFile(path.join(target,'src','app','page.tsx'), `export default function Home(){return <main className="p-6">CareerOS Web — restored</main>};\n`);

  // TRPC wiring
  ensureFile(path.join(target,'src','trpc','index.ts'),
`import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@careeros/trpc';
export const trpc = createTRPCReact<AppRouter>();
export default trpc;
`);

  ensureFile(path.join(target,'src','app','providers.tsx'),
`'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/trpc';
import { useState } from 'react';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  const [client] = useState(() => trpc.createClient({ links: [httpBatchLink({ url: '/api/trpc' })] }));
  return (
    <trpc.Provider client={client} queryClient={qc}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
`);

  // Vitest resolve + setup mock
  ensureFile(path.join(target,'vitest.config.ts'),
`import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  test: { globals: true, environment: 'jsdom', setupFiles: ['./vitest.setup.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
`);
  ensureFile(path.join(target,'vitest.setup.ts'),
`vi.mock('@/trpc', () => {
  const noop = () => ({ data: undefined, isLoading: false, isSuccess: true, mutate: () => {} });
  const tracker = { getApplications: { useQuery: noop }, createApplication: { useMutation: noop }, updateApplication: { useMutation: noop }, deleteApplication: { useMutation: noop } };
  return { trpc: { auth: { reset: { useMutation: noop }, verifyToken: { useMutation: noop } }, tracker } };
});
`);

  // Nx project.json
  ensureFile(path.join(target,'project.json'),
`{
  "name": "web",
  "root": "apps/web",
  "sourceRoot": "apps/web/src",
  "projectType": "application",
  "targets": {
    "build": { "executor": "nx:run-commands", "options": { "command": "pnpm -C apps/web build" } },
    "dev":   { "executor": "nx:run-commands", "options": { "command": "pnpm -C apps/web dev" } },
    "test":  { "executor": "nx:run-commands", "options": { "command": "pnpm -C apps/web test" } }
  }
}
`);

  // Best-effort: wrap layout with Providers
  const layoutPath = path.join(target,'src','app','layout.tsx');
  patchLayout(layoutPath);

  log('✅ apps/web restored/prepared');
}
main();

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const name = (process.argv[2] || '').trim();
if (!name || !/^[a-z][a-z0-9\-]*$/.test(name)) {
  console.error('Usage: node tools/scripts/gen-module.cjs <kebab-name>');
  process.exit(1);
}
const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const RouterName = `${camel.charAt(0).toUpperCase()}${camel.slice(1)}Router`;

const apiRoot = path.join('apps', 'api', 'src');
const trpcUtil = path.join(apiRoot, 'trpc', 'trpc.ts');
const routerDir = path.join(apiRoot, 'router');
const rootFile = path.join(routerDir, 'root.ts');
const modFile = path.join(routerDir, `${name}.ts`);
const specDir = path.join(routerDir, '__tests__');
const specFile = path.join(specDir, `${name}.spec.ts`);

function ensure(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}
function write(p, s) {
  ensure(p);
  fs.writeFileSync(p, s, 'utf8');
  console.log('✓ wrote', p);
}
function read(p) {
  return fs.readFileSync(p, 'utf8');
}
function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

if (!exists(trpcUtil)) {
  console.error('! Missing', trpcUtil);
  process.exit(1);
}

// 1) router file
if (!exists(modFile)) {
  const modSrc = `import { router, publicProcedure } from '../trpc/trpc';
import { z } from 'zod';

export const ${RouterName} = router({
  ping: publicProcedure.query(() => ({ ok: true })),
  // example input → echo
  echo: publicProcedure
    .input(z.object({ msg: z.string() }))
    .mutation(({ input }) => ({ msg: input.msg })),
});
`;
  write(modFile, modSrc);
} else {
  console.log('= exists', modFile);
}

// 2) wire into root router
if (exists(rootFile)) {
  let s = read(rootFile);
  if (!new RegExp(`\\b${RouterName}\\b`).test(s)) {
    // import line: try various relative paths
    const importLine =
      s.includes("from './router/") || s.includes("from './routers/")
        ? `import { ${RouterName} } from './router/${name}';\n`
        : s.includes("from '../router/")
        ? `import { ${RouterName} } from '../router/${name}';\n`
        : `import { ${RouterName} } from './${name}';\n`;
    s = s.replace(/(^import[\s\S]*?;[\r\n]+)/, '$1' + importLine);
    s = s.replace(
      /router\(\s*{\s*/m,
      (m) => m + `  ${camel}: ${RouterName},\n`
    );
    write(rootFile, s);
  } else {
    console.log('= already wired in root');
  }
} else {
  console.log('= skip wiring: root router not found at', rootFile);
}

// 3) spec
if (!exists(specFile)) {
  const specSrc = `import { router } from '../../trpc/trpc';
import { ${RouterName} } from '../${name}';

describe('${camel}.ping', () => {
  it('returns ok true', async () => {
    const r = router({ ${camel}: ${RouterName} });
    const caller = r.createCaller({} as any);
    const res = await caller.${camel}.ping();
    expect(res.ok).toBe(true);
  });
});
`;
  write(specFile, specSrc);
} else {
  console.log('= exists', specFile);
}

console.log('✔ Module scaffolded:', name);

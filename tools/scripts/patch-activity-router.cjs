const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const DO_COMMIT = process.argv.includes('--commit');
const FILE = path.join(ROOT, 'apps', 'api', 'src', 'trpc', 'routers', 'tracker.router.ts');

const has = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);

if (!has(FILE)) {
  console.log('• tracker.router.ts not found, nothing to patch.');
  process.exit(0);
}

let s = read(FILE);

// 1) Ensure z import (once)
if (!/from 'zod'/.test(s)) {
  s = `import { z } from 'zod';\n` + s;
}

// 2) Replace any existing getApplicationActivity with a canonical impl
const procKey = 'getApplicationActivity';
const procImpl =
`  ${procKey}: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const prismaAny = ctx.prisma as any;
      if (!prismaAny?.applicationActivity?.findMany) return [];
      return await prismaAny.applicationActivity.findMany({ where: { applicationId: input.id }, orderBy: { createdAt: 'desc' },
      });
    }),`;

// Try “surgical replace” of existing block
const procRegex = new RegExp(`${procKey}\\s*:\\s*publicProcedure[\\s\\S]*?\\),\\s*`, 'm');
if (procRegex.test(s)) {
  s = s.replace(procRegex, procImpl + '\n');
} else {
  // Insert into createTRPCRouter({...})
  s = s.replace(/createTRPCRouter\(\{\s*/m, (m) => m + procImpl + '\n');
}

// 3) Instrument createApplication – replace "return await create" with guarded activity
s = s.replace(
  /return\s+await\s+ctx\.prisma\.application\.create\(\{([\s\S]*?)\}\);/m,
  (_m, body) => `
      const created = await ctx.prisma.application.create({${body}});
      try {
        const prismaAny = ctx.prisma as any;
        await prismaAny?.applicationActivity?.create?.({
          data: {
            applicationId: created.id,
            type: 'CREATE',
            payload: { data: input },
          }
        });
      } catch {}
      return created;`
);

// 4) Instrument updateApplication – replace "return await update" with guarded activity
s = s.replace(
  /return\s+await\s+ctx\.prisma\.application\.update\(\{([\s\S]*?)\}\);/m,
  (_m, body) => `
      const updated = await ctx.prisma.application.update({${body}});
      try {
        const prismaAny = ctx.prisma as any;
        const kind = (input.data as any)?.status ? 'STATUS_CHANGE' : 'UPDATE';
        await prismaAny?.applicationActivity?.create?.({
          data: {
            applicationId: updated.id,
            type: kind,
            payload: (input.data as any)?.status
              ? { to: (input.data as any).status }
              : { changed: Object.keys(input.data as any || {}) },
          }
        });
      } catch {}
      return updated;`
);

write(FILE, s);
console.log('✓ Patched tracker.router.ts (activity ensured)');

if (DO_COMMIT) {
  try {
    cp.execFileSync('git', ['add', FILE], { stdio: 'inherit' });
    cp.execFileSync('git', ['commit', '-m', 'fix(tracker): ensure application activity calls prisma (router patch)'], { stdio: 'inherit' });
    console.log('✓ committed router patch');
  } catch (e) {
    console.log('⚠️  commit skipped:', e?.message || e);
  }
}

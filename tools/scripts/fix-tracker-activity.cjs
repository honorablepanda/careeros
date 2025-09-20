#!/usr/bin/env node
/**
 * tools/scripts/fix-tracker-activity.cjs
 *
 * Idempotent, future-proof normalizer for tracker activity shapes.
 * It enforces:
 *   - createApplication:
 *       .input(z.object({}).passthrough())
 *       activity write: { data: { applicationId, type: 'CREATE', payload: { data: input } } }
 *   - updateApplication:
 *       when status present, activity write: { data: { applicationId, type: 'STATUS_CHANGE', payload: { to: <status> } } }
 *   - getApplicationActivity:
 *       present + findMany orderBy createdAt desc
 *
 * Will NOT “revert” the shapes once correct. Safe to run multiple times.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const API_ROUTER = path.join(ROOT, 'apps/api/src/trpc/routers/tracker.router.ts');

const COLORS = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function has(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, s) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); }

if (!has(API_ROUTER)) {
  console.log(COLORS.red(`✗ router not found -> ${API_ROUTER}`));
  process.exit(1);
}

let src = read(API_ROUTER);
let changed = false;

function replaceOnce(label, from, to) {
  const before = src;
  src = src.replace(from, to);
  if (src !== before) {
    changed = true;
    console.log(COLORS.green(`✓ ${label}`));
  } else {
    console.log(COLORS.dim(`• ${label} (no change)`));
  }
}

/* 0) Ensure we have z import (defensive, no-op if present) */
if (!/from\s+['"]zod['"]/.test(src)) {
  replaceOnce(
    'add z import',
    /(^\s*import[^\n]+\n)/m,
    `$1import { z } from 'zod';\n`
  );
}

/* 1) Ensure createApplication input is permissive */
replaceOnce(
  'createApplication → input(z.object({}).passthrough())',
  /createApplication\s*:\s*publicProcedure[\s\S]*?\.input\s*\([\s\S]*?\)\s*\.mutation/m,
  (m) => m.replace(
    /\.input\s*\([\s\S]*?\)\s*\.mutation/,
    `.input(z.object({}).passthrough()).mutation`
  )
);

/* If there was no .input at all, inject it */
if (/createApplication\s*:\s*publicProcedure\s*\.mutation/.test(src)) {
  replaceOnce(
    'createApplication → inject permissive input (no previous .input)',
    /createApplication\s*:\s*publicProcedure\s*\.mutation/,
    `createApplication: publicProcedure.input(z.object({}).passthrough()).mutation`
  );
}

/* 2) Normalize createApplication activity write to canonical “CREATE + payload.data” */
{
  // a) If already writing activity but with old shape (CREATED/by/etc.), canonicalize it
  replaceOnce(
    "createApplication activity: convert 'CREATED'→'CREATE' (payload.data)",
    /applicationActivity\.create\(\s*\{\s*data\s*:\s*\{\s*applicationId\s*:\s*created\.id\s*,\s*type\s*:\s*'CREATED'[\s\S]*?\}\s*\}\s*\)\s*;/m,
    `applicationActivity.create({
        data: { applicationId: created.id, type: 'CREATE', payload: { data: input } },
      });`
  );

  // b) If it's writing 'CREATE' with a different payload shape, normalize to payload.data = input
  replaceOnce(
    "createApplication activity: normalize any 'CREATE' payload shape to payload.data=input",
    /applicationActivity\.create\(\s*\{\s*data\s*:\s*\{\s*applicationId\s*:\s*created\.id\s*,\s*type\s*:\s*'CREATE'[\s\S]*?\}\s*\}\s*\)\s*;/m,
    `applicationActivity.create({
        data: { applicationId: created.id, type: 'CREATE', payload: { data: input } },
      });`
  );

  // c) If there's NO activity write at all, rewrite create body to canonical block
  // We look for the createApplication mutation body and ensure the pattern exists
  if (!/applicationActivity\.create\([\s\S]*applicationId\s*:\s*created\.id[\s\S]*type\s*:\s*'CREATE'[\s\S]*payload\s*:\s*\{\s*data\s*:\s*input\s*\}/m.test(src)) {
    // Replace "return await prismaAny?.application?.create?.({ data: input });"
    // or any 'return prismaAny.application.create' variants with canonical block.
    replaceOnce(
      'createApplication activity: ensure canonical block after create',
      /return\s+await\s+prismaAny\??\.application\??\.create\??\(\s*\{\s*data\s*:\s*input\s*\}\s*\)\s*;/m,
      `const created = await prismaAny?.application?.create?.({ data: input });
      if (prismaAny?.applicationActivity?.create && created?.id) {
        await prismaAny.applicationActivity.create({
          data: { applicationId: created.id, type: 'CREATE', payload: { data: input } },
        });
      }
      return created;`
    );
    // Also handle the generic create call assigned to a variable (ensure the post block exists)
    replaceOnce(
      'createApplication activity: add post-create block if missing',
      /const\s+created\s*=\s*await\s+prismaAny\??\.application\??\.create\??\(\s*\{\s*data\s*:\s*input\s*\}\s*\)\s*;\s*return\s+created\s*;/m,
      `const created = await prismaAny?.application?.create?.({ data: input });
      if (prismaAny?.applicationActivity?.create && created?.id) {
        await prismaAny.applicationActivity.create({
          data: { applicationId: created.id, type: 'CREATE', payload: { data: input } },
        });
      }
      return created;`
    );
  }
}

/* 3) Normalize updateApplication status-change activity to canonical payload.to */
{
  // a) Convert old shapes like { type:'STATUS_CHANGE', from:'APPLIED', to: X, by:'system' }
  replaceOnce(
    "updateApplication activity: convert old STATUS_CHANGE shape to payload.to",
    /applicationActivity\.create\(\s*\{\s*data\s*:\s*\{\s*applicationId\s*:\s*input\.id\s*,[\s\S]*?type\s*:\s*'STATUS_CHANGE'[\s\S]*?\}\s*\}\s*\)\s*;/m,
    (m) => {
      // capture "to: <expr>" in the old blob; if not found we fallback to nextStatus
      const toMatch = m.match(/to\s*:\s*([a-zA-Z0-9_.]+)/);
      const toExpr = toMatch ? toMatch[1] : 'nextStatus';
      return `applicationActivity.create({
        data: { applicationId: input.id, type: 'STATUS_CHANGE', payload: { to: ${toExpr} } },
      });`;
    }
  );

  // b) If no activity write at all, add a canonical post-update block
  if (!/applicationActivity\.create\([\s\S]*applicationId\s*:\s*input\.id[\s\S]*type\s*:\s*'STATUS_CHANGE'[\s\S]*payload\s*:\s*\{\s*to\s*:\s*[a-zA-Z0-9_.]+\s*\}/m.test(src)) {
    // Insert canonical detection for status & activity create after the update call
    replaceOnce(
      'updateApplication activity: ensure canonical block after update',
      /const\s+updated\s*=\s*await\s+prismaAny\??\.application\??\.update\??\(\s*\{\s*where\s*:\s*\{\s*id\s*:\s*input\.id\s*\}\s*,\s*data\s*:\s*input\.data\s*\}\s*\)\s*;\s*/m,
      `const updated = await prismaAny?.application?.update?.({
        where: { id: input.id },
        data: input.data,
      });

      const nextStatus = (input?.data as any)?.status;
      if (prismaAny?.applicationActivity?.create && nextStatus) {
        await prismaAny.applicationActivity.create({
          data: { applicationId: input.id, type: 'STATUS_CHANGE', payload: { to: nextStatus } },
        });
      }
      `
    );
  }
}

/* 4) Ensure getApplicationActivity exists and uses orderBy createdAt desc */
if (!/getApplicationActivity\s*:\s*publicProcedure/.test(src)) {
  replaceOnce(
    'add getApplicationActivity query',
    /router\(\s*\{\s*/m,
    (m) => `${m}  getApplicationActivity: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const prismaAny = ctx.prisma as any;
      if (!prismaAny?.applicationActivity?.findMany) return [];
      return await prismaAny.applicationActivity.findMany({ where: { applicationId: input.id }, orderBy: { createdAt: 'desc' },
      });
    }),
`
  );
} else {
  // Make sure it orders correctly
  replaceOnce(
    'getApplicationActivity → orderBy createdAt desc',
    /applicationActivity\.findMany\(\s*\{\s*where\s*:\s*\{\s*applicationId\s*:\s*input\.id\s*\}\s*,\s*orderBy\s*:\s*\{[^}]*\}\s*\}\s*\)/m,
    `applicationActivity.findMany({ where: { applicationId: input.id }, orderBy: { createdAt: 'desc' },
      })`
  );
}

/* 5) Defensive: normalize accidental duplicate closers "}), }), });" */
replaceOnce(
  'normalize duplicate router closers',
  /\}\),\s*\}\),\s*\}\);\s*$/m,
  `}),\n});\n`
);
replaceOnce(
  'normalize triple closer variant',
  /\}\),\s*\}\);\s*\}\);\s*$/m,
  `}),\n});\n`
);

if (changed) {
  write(API_ROUTER, src);
  console.log(COLORS.cyan(`\nUpdated -> ${API_ROUTER}`));
} else {
  console.log(COLORS.yellow('\nNo changes were required.'));
}

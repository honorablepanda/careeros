#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const PRISMA = path.join(ROOT, 'prisma', 'schema.prisma');
const ROUTER = path.join(
  ROOT,
  'apps',
  'api',
  'src',
  'trpc',
  'routers',
  'tracker.router.ts'
);
const LOGDIR = path.join(ROOT, 'tools', 'logs');
const APPLY = process.argv.includes('--apply-best');

if (!fs.existsSync(LOGDIR)) fs.mkdirSync(LOGDIR, { recursive: true });

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
};

// ---------------- Parse Prisma schema ----------------
const schema = read(PRISMA);
if (!schema) {
  console.error('! prisma/schema.prisma not found');
  process.exit(2);
}

function parseEnums(src) {
  const enums = {};
  const re = /enum\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const body = m[2];
    const values = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'))
      .map((l) => l.replace(/[, ]+$/, ''));
    enums[name] = values;
  }
  return enums;
}
function parseModelFields(src, modelName) {
  const out = [];
  const start = src.indexOf(`model ${modelName}`);
  if (start === -1) return out;
  const rest = src.slice(start);
  const open = rest.indexOf('{');
  if (open === -1) return out;
  let i = open + 1,
    depth = 1;
  for (; i < rest.length && depth > 0; i++) {
    const ch = rest[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  const body = rest.slice(open + 1, i - 1);
  body.split('\n').forEach((line) => {
    const l = line.trim();
    if (!l || l.startsWith('//') || l.startsWith('@@')) return;
    const [name, type] = l.split(/\s+/);
    if (!name || !type) return;
    out.push({ name, type });
  });
  return out;
}

const enums = parseEnums(schema);
const fields = parseModelFields(schema, 'Application');
const fieldNames = new Set(fields.map((f) => f.name));
const getFieldType = (f) => (fields.find((x) => x.name === f) || {}).type || '';

const has = (f) => fieldNames.has(f);
const titleKey = has('role') ? 'role' : has('title') ? 'title' : null;

const schemaHas = {
  id: has('id'),
  userId: has('userId'),
  company: has('company'),
  status: has('status'),
  notes: has('notes'),
  location: has('location'),
  source: has('source'),
  createdAt: has('createdAt'),
  updatedAt: has('updatedAt'),
};

const statusEnumName = enums['ApplicationStatus'] ? 'ApplicationStatus' : null;
const sourceEnumName = enums['ApplicationSource'] ? 'ApplicationSource' : null;

// --------------- helpers to build safe code ---------------
function objLiteral(entries, indent = '          ') {
  const lines = entries.filter(Boolean).map(([k, v]) => `${indent}${k}: ${v}`);
  return lines.join(',\n');
}
function zObjectLiteral(lines, indent = '      ') {
  const body = lines
    .filter(Boolean)
    .map((l) => `${indent}${l}`)
    .join(',\n');
  return `z.object({\n${body}\n${indent.slice(0, -2)}})`;
}

function buildVariantCode({ statusKind, sourceKind }) {
  // Always import Prisma as a TYPE for casts; never use runtime $Enums.
  const preImports = `import { router, procedure } from '../trpc';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
`;

  const topConsts = [];
  if (schemaHas.status) {
    if (statusKind === 'literal' && statusEnumName) {
      topConsts.push(
        `const StatusZ = z.enum(${JSON.stringify(enums[statusEnumName])});`
      );
    } else if (statusKind === 'string' || !statusEnumName) {
      topConsts.push(`const StatusZ = z.string().min(1);`);
    } else {
      // avoid z.nativeEnum; Prisma doesn't export runtime enums
      topConsts.push(
        `const StatusZ = z.enum(${JSON.stringify(
          enums[statusEnumName] || []
        )});`
      );
    }
  }
  if (schemaHas.source && sourceKind !== 'omit') {
    if (sourceKind === 'literal' && sourceEnumName) {
      topConsts.push(
        `const SourceZ = z.enum(${JSON.stringify(enums[sourceEnumName])});`
      );
    } else if (sourceKind === 'string' || !sourceEnumName) {
      topConsts.push(`const SourceZ = z.string().min(1);`);
    } else {
      topConsts.push(
        `const SourceZ = z.enum(${JSON.stringify(
          enums[sourceEnumName] || []
        )});`
      );
    }
  }

  // create input
  const createZ = [];
  if (schemaHas.userId) createZ.push(`userId: z.string().min(1)`);
  if (schemaHas.company) createZ.push(`company: z.string().min(1)`);
  if (titleKey) createZ.push(`${titleKey}: z.string().min(1)`);
  if (schemaHas.status) createZ.push(`status: StatusZ`);
  if (schemaHas.notes) createZ.push(`notes: z.string().optional()`);
  if (schemaHas.location) createZ.push(`location: z.string().optional()`);
  if (schemaHas.source && sourceKind !== 'omit')
    createZ.push(`source: SourceZ.optional()`);

  // update input
  const updateZ = [];
  if (schemaHas.company) updateZ.push(`company: z.string().min(1).optional()`);
  if (titleKey) updateZ.push(`${titleKey}: z.string().min(1).optional()`);
  if (schemaHas.status) updateZ.push(`status: StatusZ.optional()`);
  if (schemaHas.notes) updateZ.push(`notes: z.string().optional()`);
  if (schemaHas.location) updateZ.push(`location: z.string().optional()`);
  if (schemaHas.source && sourceKind !== 'omit')
    updateZ.push(`source: SourceZ.optional()`);

  // create data
  const createData = [];
  if (schemaHas.userId) createData.push(['userId', 'input.userId']);
  if (schemaHas.company) createData.push(['company', 'input.company']);
  if (titleKey) createData.push([titleKey, `input.${titleKey}`]);
  if (schemaHas.status) {
    createData.push([
      'status',
      `input.status as Prisma.${statusEnumName || 'ApplicationStatus'}`,
    ]);
  }
  if (schemaHas.notes) createData.push(['notes', 'input.notes ?? undefined']);
  if (schemaHas.location)
    createData.push(['location', 'input.location ?? undefined']);
  if (schemaHas.source && sourceKind !== 'omit') {
    createData.push([
      'source',
      `(input.source as Prisma.${
        sourceEnumName || 'ApplicationSource'
      } | undefined)`,
    ]);
  }

  // update data
  const updateData = [];
  if (schemaHas.company)
    updateData.push(['company', 'input.data.company ?? undefined']);
  if (titleKey)
    updateData.push([titleKey, `input.data.${titleKey} ?? undefined`]);
  if (schemaHas.status) {
    updateData.push([
      'status',
      `(input.data.status as Prisma.${
        statusEnumName || 'ApplicationStatus'
      } | undefined) ?? undefined`,
    ]);
  }
  if (schemaHas.notes)
    updateData.push(['notes', 'input.data.notes ?? undefined']);
  if (schemaHas.location)
    updateData.push(['location', 'input.data.location ?? undefined']);
  if (schemaHas.source && sourceKind !== 'omit') {
    updateData.push([
      'source',
      `(input.data.source as Prisma.${
        sourceEnumName || 'ApplicationSource'
      } | undefined) ?? undefined`,
    ]);
  }

  // select
  const select = [];
  if (schemaHas.id) select.push(['id', 'true']);
  if (schemaHas.userId) select.push(['userId', 'true']);
  if (schemaHas.company) select.push(['company', 'true']);
  if (titleKey) select.push([titleKey, 'true']);
  if (schemaHas.status) select.push(['status', 'true']);
  if (schemaHas.notes) select.push(['notes', 'true']);
  if (schemaHas.location) select.push(['location', 'true']);
  if (schemaHas.source && sourceKind !== 'omit')
    select.push(['source', 'true']);
  if (schemaHas.createdAt) select.push(['createdAt', 'true']);
  if (schemaHas.updatedAt) select.push(['updatedAt', 'true']);

  return `${preImports}
${topConsts.join('\n')}

export const trackerRouter = router({
  getApplications: procedure
    .input(${zObjectLiteral(['userId: z.string().min(1)'])})
    .query(({ ctx, input }) =>
      ctx.prisma.application.findMany({
        where: { userId: input.userId },
        orderBy: { updatedAt: 'desc' },
        select: {
${objLiteral(select)}
        }
      })
    ),

  createApplication: procedure
    .input(${zObjectLiteral(createZ)})
    .mutation(({ ctx, input }) =>
      ctx.prisma.application.create({
        data: {
${objLiteral(createData)}
        },
        select: {
${objLiteral(select)}
        }
      })
    ),

  updateApplication: procedure
    .input(z.object({
      id: z.string().min(1),
      data: ${zObjectLiteral(updateZ)}.partial()
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.application.update({
        where: { id: input.id },
        data: {
${objLiteral(updateData)}
        },
        select: {
${objLiteral(select)}
        }
      })
    ),

  deleteApplication: procedure
    .input(${zObjectLiteral(['id: z.string().min(1)'])})
    .mutation(({ ctx, input }) =>
      ctx.prisma.application.delete({ where: { id: input.id } })
    ),
});
`;
}

// variants (status: literal|string; source: literal|string|omit)
function buildVariants() {
  const statusKinds = schemaHas.status
    ? statusEnumName
      ? ['literal', 'string']
      : ['string']
    : ['absent'];
  const sourceKinds = schemaHas.source
    ? sourceEnumName
      ? ['literal', 'string', 'omit']
      : ['string', 'omit']
    : ['absent'];
  const out = [];
  let i = 1;
  for (const s of statusKinds)
    for (const src of sourceKinds)
      out.push({
        id: `v${String(i++).padStart(2, '0')}`,
        statusKind: s,
        sourceKind: src,
      });
  return out;
}

const variants = buildVariants();

// Run TS check
function tscCheck() {
  const r = spawnSync(
    'pnpm',
    ['-w', 'exec', 'tsc', '-p', 'web/tsconfig.json', '--noEmit'],
    { cwd: ROOT, shell: true, encoding: 'utf8' }
  );
  return { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') };
}

// Try all
const original = read(ROUTER);
if (!original) {
  console.error(`! Router not found at ${ROUTER}`);
  process.exit(2);
}
write(`${ROUTER}.bak`, original);

const results = [];
for (const v of variants) {
  const label = `${v.id} [status:${v.statusKind}${
    statusEnumName ? `(${statusEnumName})` : ''
  } | source:${v.sourceKind}${sourceEnumName ? `(${sourceEnumName})` : ''}]`;
  write(ROUTER, buildVariantCode(v));
  const { code: exit, out } = tscCheck();
  const firstErr = (out.match(/error TS[0-9]+:[\s\S]*?(?=\n\s*\n|$)/) || [
    '(no error captured)',
  ])[0];
  results.push({ label, exit, firstErr });
  console.log(`${exit === 0 ? '✓' : '✗'} ${label} -> exit ${exit}`);
  if (exit !== 0) console.log('  first error:', firstErr.split('\n')[0]);
}

// Log
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const logPath = path.join(LOGDIR, `try-tracker-router-${stamp}.log`);
let log = `# Tracker Router Variant Results  ${new Date().toISOString()}\n`;
log += `Schema fields: ${[...fieldNames].sort().join(', ')}\n`;
log += `Enums: ${
  Object.keys(enums)
    .map((n) => `${n}[${enums[n].join('|')}]`)
    .join(', ') || '(none)'
}\n\n`;
for (const r of results) {
  log += `== ${r.label} ==\nexit: ${r.exit}\n${r.firstErr}\n\n`;
}
const ok = results.find((r) => r.exit === 0);
log += `Best: ${ok ? ok.label : '(none passed)'}\n`;
write(logPath, log);
console.log(`\nLog written to: ${logPath}`);

// Apply or restore
if (APPLY && ok) {
  const best = variants.find((x) => ok.label.startsWith(x.id));
  write(ROUTER, buildVariantCode(best));
  console.log(`Kept best variant: ${ok.label}`);
} else {
  write(ROUTER, original);
  console.log('Restored original router file.');
  if (APPLY && !ok) console.log('No passing variant to apply.');
}

#!/usr/bin/env node
/**
 * tools/scripts/try-summary-variants.cjs
 *
 * Tries multiple implementations of apps/api/src/router/summary.ts:
 *  - Different TRPC import shapes
 *  - Safe, non-groupBy aggregation
 * For each variant:
 *  - run `pnpm -w test:api`
 *  - if pass -> `pnpm -w exec nx run web:build`
 * Picks the first variant that passes both. Otherwise restores original.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = process.cwd();
const target = path.join(repo, 'apps/api/src/router/summary.ts');
const reportsDir = path.join(repo, 'tools/reports');
fs.mkdirSync(reportsDir, { recursive: true });

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '-')
  .slice(0, 19);
const reportPath = path.join(reportsDir, `summary-variants-${timestamp}.log`);

const log = (...args) => {
  const line = args.join(' ');
  console.log(line);
  fs.appendFileSync(reportPath, line + '\n', 'utf8');
};

const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, 'utf8');
};

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: repo,
    env: process.env,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: opts.timeout ?? 10 * 60 * 1000, // 10 min safety net
    shell: process.platform === 'win32', // make it work in Git Bash/Windows
  });
  return {
    status: res.status,
    stdout: (res.stdout || '').toString(),
    stderr: (res.stderr || '').toString(),
    error: res.error,
  };
}

function shorten(s, max = 200) {
  const lines = s.split(/\r?\n/);
  if (lines.length <= max) return s;
  return (
    lines.slice(0, max).join('\n') +
    `\n... (truncated ${lines.length - max} lines) ...`
  );
}

/**
 * Common implementation fragment (no Prisma groupBy)
 * - Status counts via findMany + reduce
 * - Latest 10 minimal fields
 * - Defensive user id lookup
 */
const implBody = `
type StatusCount = { status: string; count: number };
type LatestItem = { id: string | number; status: string | null; updatedAt: Date | string | null };

export const summaryRouter = ROUTER({
  /**
   * Returns status aggregates and the latest 10 applications for the current user.
   */
  get: PROC.query(async ({ ctx }: any) => {
    const userId: string | undefined =
      ctx?.session?.user?.id ??
      ctx?.user?.id ??
      ctx?.auth?.userId ??
      undefined;

    if (!userId) {
      return { statusCounts: [] as StatusCount[], latest: [] as LatestItem[] };
    }

    // 1) Status counts
    const statuses = await ctx.prisma.application.findMany({
      where: { userId },
      select: { status: true },
    });

    const statusMap = statuses.reduce<Record<string, number>>((acc, { status }) => {
      const key = status ?? "UNKNOWN";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const statusCounts: StatusCount[] =
      Object.entries(statusMap).map(([status, count]) => ({ status, count }));

    // 2) Latest 10
    const latestRows = await ctx.prisma.application.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, updatedAt: true },
      take: 10,
    });

    const latest: LatestItem[] = latestRows.map((r: any) => ({
      id: r.id,
      status: r.status ?? null,
      updatedAt: r.updatedAt ?? null,
    }));

    return { statusCounts, latest };
  }),
});

export type SummaryRouter = typeof summaryRouter;
`;

/**
 * Three import/adapter variants for TRPC:
 *   A) Flexible: import * as trpc and try several shapes
 *   B) Classic: import { createTRPCRouter, publicProcedure } from "../trpc"
 *   C) t.router / t.procedure
 */

const VARIANTS = [
  // A) Flexible star import + adapter
  {
    name: 'A-flexible-star-import',
    code: `/* eslint-disable @typescript-eslint/no-explicit-any */
// Variant A: flexible star import and adapters
import * as trpc from "../trpc";

const ROUTER: any =
  (trpc as any).createTRPCRouter ??
  (trpc as any).router ??
  ((trpc as any).t && (trpc as any).t.router);

const PROC: any =
  (trpc as any).publicProcedure ??
  (trpc as any).procedure ??
  ((trpc as any).t && (trpc as any).t.procedure);

${implBody}
`,
  },

  // B) Classic named import
  {
    name: 'B-classic-named-import',
    code: `/* eslint-disable @typescript-eslint/no-explicit-any */
// Variant B: classic named import
import { createTRPCRouter as ROUTER, publicProcedure as PROC } from "../trpc";

${implBody}
`,
  },

  // C) t.router style
  {
    name: 'C-t-router',
    code: `/* eslint-disable @typescript-eslint/no-explicit-any */
// Variant C: t.router / t.procedure
import { t } from "../trpc";
const ROUTER: any = (t as any).router ?? (t as any).merge ?? (t as any);
const PROC: any = (t as any).procedure ?? (t as any).publicProcedure ?? (t as any);

${implBody}
`,
  },
];

const original = exists(target) ? read(target) : null;
if (!original) {
  log(`FATAL: ${target} does not exist. Aborting.`);
  process.exit(1);
}

// Backup
const backupPath = `${target}.backup-${timestamp}`;
write(backupPath, original);
log(`# Summary variant runner @ ${timestamp}`);
log(`Backed up original to: ${path.relative(repo, backupPath)}\n`);

const results = [];

/**
 * Try each variant:
 * 1) write file
 * 2) pnpm -w test:api
 * 3) if pass -> pnpm -w exec nx run web:build
 */
for (const v of VARIANTS) {
  log(`\n=== Trying variant: ${v.name} ===`);
  try {
    write(target, v.code);
  } catch (e) {
    log(`Write failed: ${String(e)}`);
    results.push({ name: v.name, wrote: false, api: 'skip', web: 'skip' });
    continue;
  }
  log(`Wrote ${path.relative(repo, target)} for variant ${v.name}`);

  // Step 1: API tests
  log(`→ Running API tests (pnpm -w test:api) ...`);
  const api = run('pnpm', ['-w', 'test:api'], { timeout: 10 * 60 * 1000 });
  const apiOk = api.status === 0;

  log(`API status: ${apiOk ? 'PASS' : 'FAIL'} (exit ${api.status})`);
  if (!apiOk) {
    log(
      `--- API stderr (first 200 lines) ---\n${shorten(
        api.stderr
      )}\n--- end ---`
    );
  }

  // Step 2: web build only if API passed
  let webOk = false;
  let web = null;
  if (apiOk) {
    log(`→ Running web build (pnpm -w exec nx run web:build) ...`);
    web = run('pnpm', ['-w', 'exec', 'nx', 'run', 'web:build'], {
      timeout: 15 * 60 * 1000,
    });
    webOk = web.status === 0;
    log(`WEB status: ${webOk ? 'PASS' : 'FAIL'} (exit ${web && web.status})`);
    if (!webOk && web) {
      log(
        `--- WEB stderr (first 200 lines) ---\n${shorten(
          web.stderr
        )}\n--- end ---`
      );
    }
  } else {
    log(`Skipping web build for ${v.name} because API tests failed.`);
  }

  results.push({
    name: v.name,
    wrote: true,
    api: apiOk ? 'pass' : 'fail',
    web: apiOk ? (webOk ? 'pass' : 'fail') : 'skip',
  });

  // If both passed, stop early and keep this variant
  if (apiOk && webOk) {
    log(`✅ Selected variant: ${v.name} (API ✅, WEB ✅)\n`);
    break;
  }
}

// Decide best outcome
const winner =
  results.find((r) => r.api === 'pass' && r.web === 'pass') ||
  results.find((r) => r.api === 'pass' && r.web === 'skip');

if (!winner) {
  // Restore original
  log(`\nNo passing variant found. Restoring original summary.ts ...`);
  write(target, original);
  log(`Original restored.`);
} else {
  log(`\nKeeping variant: ${winner.name}`);
}

// Write final summary
log(`\n=== Results ===`);
for (const r of results) {
  log(
    [
      r.name.padEnd(22),
      `write=${r.wrote ? 'ok' : 'fail'}`,
      `api=${r.api}`,
      `web=${r.web}`,
    ].join(' | ')
  );
}

log(`\nFull logs saved to: ${path.relative(repo, reportPath)}`);

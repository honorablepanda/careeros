/**
 * Small Real UI generator for Next.js app routes + tests (Vitest).
 * - Idempotent (use --force to overwrite)
 * - Resilient TRPC access (compiles even if routers/methods are missing)
 * - Uses [...].sort(...) (no toSorted) for TS lib compatibility
 *
 * Usage:
 *   node tools/scripts/generate-small-ui.cjs --routes=networking,resume,roadmap,metrics,achievements,planner,skills,tracker
 *   node tools/scripts/generate-small-ui.cjs --all
 *   node tools/scripts/generate-small-ui.cjs --routes=tracker --force --commit
 *   node tools/scripts/generate-small-ui.cjs --routes=planner --dry
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const WEB  = path.join(ROOT, 'web');
const APP  = path.join(WEB, 'src', 'app');

const args   = process.argv.slice(2);
const flag   = (n) => args.includes(`--${n}`);
const argVal = (n) => {
  const x = args.find(a => a.startsWith(`--${n}=`));
  return x ? x.split('=').slice(1).join('=').trim() : null;
};

const FORCE  = flag('force');
const DRY    = flag('dry');
const COMMIT = flag('commit');
const ALL    = flag('all');
const ROUTES_ARG = argVal('routes');

// Presets
const P = {
  networking: {
    title: 'Networking',
    trpc: { router: 'networking', method: 'list' },
    columns: [
      { key: 'name',          label: 'Name' },
      { key: 'company',       label: 'Company' },
      { key: 'status',        label: 'Status' },
      { key: 'lastContacted', label: 'Last Contacted', isDate: true },
    ],
    sample: [
      { id: '1', name: 'Aisha Khan', company: 'Acme',   status: 'ACTIVE', lastContacted: new Date().toISOString() },
      { id: '2', name: 'Ben Ortiz',  company: 'Globex', status: 'PAUSED', lastContacted: new Date().toISOString() },
    ],
    emptyText: 'No contacts yet.',
  },
  resume: {
    title: 'Resume',
    trpc: { router: 'resume', method: 'list' },
    columns: [
      { key: 'section',  label: 'Section' },
      { key: 'value',    label: 'Value' },
      { key: 'updatedAt', label: 'Updated', isDate: true },
    ],
    sample: [
      { id: '1', section: 'Experience', value: 'Frontend Dev @ Acme', updatedAt: new Date().toISOString() },
      { id: '2', section: 'Education',  value: 'BSc CS',              updatedAt: new Date().toISOString() },
    ],
    emptyText: 'No resume entries.',
  },
  roadmap: {
    title: 'Roadmap',
    trpc: { router: 'roadmap', method: 'list' },
    columns: [
      { key: 'milestone', label: 'Milestone' },
      { key: 'status',    label: 'Status' },
      { key: 'dueDate',   label: 'Due', isDate: true },
    ],
    sample: [
      { id: '1', milestone: 'Polish portfolio', status: 'IN_PROGRESS', dueDate: new Date().toISOString() },
      { id: '2', milestone: 'Ship v1',          status: 'PLANNED',     dueDate: new Date().toISOString() },
    ],
    emptyText: 'No roadmap items.',
  },
  metrics: {
    title: 'Metrics',
    trpc: { router: 'metrics', method: 'list' },
    columns: [
      { key: 'kpi',    label: 'KPI' },
      { key: 'value',  label: 'Value' },
      { key: 'period', label: 'Period' },
    ],
    sample: [
      { id: '1', kpi: 'Applications', value: 25, period: '30d' },
      { id: '2', kpi: 'Interviews',   value: 6,  period: '30d' },
    ],
    emptyText: 'No metrics yet.',
  },
  achievements: {
    title: 'Achievements',
    trpc: { router: 'achievements', method: 'list' },
    columns: [
      { key: 'title',     label: 'Title' },
      { key: 'category',  label: 'Category' },
      { key: 'awardedAt', label: 'Date', isDate: true },
    ],
    sample: [
      { id: '1', title: 'Top Referrer',  category: 'Networking', awardedAt: new Date().toISOString() },
      { id: '2', title: 'Fastest Apply', category: 'Tracker',    awardedAt: new Date().toISOString() },
    ],
    emptyText: 'No achievements yet.',
  },
  planner: {
    title: 'Planner',
    trpc: { router: 'planner', method: 'list' },
    columns: [
      { key: 'task',    label: 'Task' },
      { key: 'status',  label: 'Status' },
      { key: 'dueDate', label: 'Due', isDate: true },
    ],
    sample: [
      { id: '1', task: 'Update resume',     status: 'IN_PROGRESS', dueDate: new Date().toISOString() },
      { id: '2', task: 'Reach out to Ben',  status: 'PLANNED',     dueDate: new Date().toISOString() },
    ],
    emptyText: 'No tasks scheduled.',
  },
  skills: {
    title: 'Skills',
    trpc: { router: 'skills', method: 'list' },
    columns: [
      { key: 'name',      label: 'Skill' },
      { key: 'level',     label: 'Level' },
      { key: 'updatedAt', label: 'Updated', isDate: true },
    ],
    sample: [
      { id: '1', name: 'React', level: 'Advanced',    updatedAt: new Date().toISOString() },
      { id: '2', name: 'SQL',   level: 'Intermediate', updatedAt: new Date().toISOString() },
    ],
    emptyText: 'No skills yet.',
  },
  tracker: {
    title: 'Tracker',
    // IMPORTANT: this app uses tracker.getApplications in real pages
    trpc: { router: 'tracker', method: 'getApplications' },
    columns: [
      { key: 'company',   label: 'Company' },
      { key: 'role',      label: 'Role' },
      { key: 'status',    label: 'Status' },
      { key: 'updatedAt', label: 'Updated', isDate: true },
    ],
    sample: [
      { id: '1', company: 'Acme',   role: 'FE Dev', status: 'APPLIED',     updatedAt: new Date().toISOString() },
      { id: '2', company: 'Globex', role: 'BE Dev', status: 'INTERVIEW',   updatedAt: new Date().toISOString() },
    ],
    emptyText: 'No tracked applications.',
  },
};

// Already built manually; skip unless --force (generator still supports them)
const ALREADY_DONE = new Set([
  'summary','dashboard','applications','profile','goals','settings','notifications','interviews','calendar',
]);

const ALL_PRESETS = Object.keys(P);
let ROUTES = [];
if (ALL) ROUTES = ALL_PRESETS;
else if (ROUTES_ARG) ROUTES = ROUTES_ARG.split(',').map(s=>s.trim()).filter(Boolean);
else ROUTES = ALL_PRESETS;

if (!FORCE) ROUTES = ROUTES.filter(r => !ALREADY_DONE.has(r));

// Helpers
function writeFileIfNeeded(p, content) {
  if (fs.existsSync(p) && !FORCE) return { written:false, skipped:true };
  if (DRY) { console.log(`[dry] write ${p}`); return { written:false, skipped:false }; }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return { written:true, skipped:false };
}

function pageTemplateList({ title, router, method, columns, emptyText }) {
  const head = columns.map(c => `            <th className="p-2 text-left">${c.label}</th>`).join('\n');
  const cells = columns.map(c => {
    if (c.isDate) return `                <td className="p-2">{r.${c.key} ? new Date(r.${c.key}).toLocaleDateString() : '—'}</td>`;
    return `                <td className="p-2">{String(r.${c.key} ?? '—')}</td>`;
  }).join('\n');

  // sort desc by first date column, else asc by first column
  const dateCol = columns.find(c => c.isDate)?.key;
  const sortExpr = dateCol
    ? `(a,b) => new Date(b.${dateCol} ?? 0).getTime() - new Date(a.${dateCol} ?? 0).getTime()`
    : `(a,b) => String(a.${columns[0].key} ?? '').localeCompare(String(b.${columns[0].key} ?? ''))`;

  return `'use client';
import * as React from 'react';
import { trpc } from '@/trpc';

type Row = { [k: string]: any };

export default function ${title.replace(/\s+/g,'')}Page() {
  const userId = 'demo-user'; // TODO: replace with session user id

  const hook = (trpc as any)?.${router}?.${method}?.useQuery;
  const query = hook
    ? hook({ userId })
    : { data: null, isLoading: false, error: { message: '${title} API not available' } };

  const { data, isLoading, error } = query as {
    data: null | Row[];
    isLoading: boolean;
    error: null | { message: string };
  };

  if (isLoading) return <main className="p-6">Loading…</main>;
  if (error)     return <main className="p-6 text-red-600">Error: {error.message}</main>;
  if (!data?.length) return <main className="p-6">${emptyText}</main>;

  const rows = [...(data ?? [])].sort(${sortExpr});

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">${title}</h1>
      <table className="w-full text-sm border" role="table">
        <thead className="bg-gray-50">
          <tr>
${head}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id ?? Math.random())} className="border-t">
${cells}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
`;
}

function testTemplateList({ title, router, method, columns, sample }) {
  const assertions = [];
  assertions.push(`expect(screen.getByText('${title}')).toBeInTheDocument();`);
  assertions.push(`const table = screen.getByRole('table');`);
  // use the first non-empty value from first sample row
  const firstRow = sample[0] || {};
  const firstKey = columns.find(c => String(firstRow[c.key] ?? '') !== '')?.key;
  if (firstKey) {
    assertions.push(`expect(within(table).getByText(String(${JSON.stringify(firstRow[firstKey])}))).toBeInTheDocument();`);
  }
  assertions.push(`expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);`);

  const mockData = JSON.stringify(sample, null, 2).replace(/</g,'\\u003c');

  return `import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    ${router}: {
      ${method}: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: ${mockData},
        }),
      },
    },
  },
}));

import Page from './page';

describe('${title} page', () => {
  it('renders table with data', () => {
    render(<Page />);
    ${assertions.join('\n    ')}
  });
});
`;
}

function genList(route, cfg) {
  const dir  = path.join(APP, route);
  const page = path.join(dir, 'page.tsx');
  const spec = path.join(dir, 'page.spec.tsx');

  const pageCode = pageTemplateList({
    title:  cfg.title,
    router: cfg.trpc.router,
    method: cfg.trpc.method,
    columns: cfg.columns,
    emptyText: cfg.emptyText,
  });

  const testCode = testTemplateList({
    title:  cfg.title,
    router: cfg.trpc.router,
    method: cfg.trpc.method,
    columns: cfg.columns,
    sample: cfg.sample,
  });

  const r1 = writeFileIfNeeded(page, pageCode);
  const r2 = writeFileIfNeeded(spec, testCode);
  return { page, spec, wrote: (r1.written || r2.written), skipped: (r1.skipped && r2.skipped) };
}

// Execute
if (!fs.existsSync(APP)) {
  console.error('web/src/app/ not found. Are you in the repo root?');
  process.exit(1);
}

const results = [];
for (const route of ROUTES) {
  const cfg = P[route];
  if (!cfg) { console.warn(`• Unknown route preset: ${route} (skipped)`); continue; }
  const out = genList(route, cfg);
  results.push({ route, ...out });
  const mark = out.skipped ? '⏭  exists' : (out.wrote ? '✅ wrote' : '…');
  console.log(`${mark}  ${route}  -> ${path.relative(ROOT, out.page)}`);
}

if (COMMIT && !DRY) {
  try {
    const touched = results.filter(r => r.wrote).flatMap(r => [r.page, r.spec]);
    if (touched.length) {
      cp.spawnSync('git', ['add', ...touched], { stdio: 'inherit' });
      cp.spawnSync('git', ['commit', '-m', `feat(web): small real UI scaffolds for ${results.filter(r=>r.wrote).map(r=>r.route).join(', ')}`], { stdio: 'inherit' });
    } else {
      console.log('Nothing new to commit.');
    }
  } catch (e) {
    console.warn('Commit step failed:', e?.message || e);
  }
}

console.log('\nDone.');

#!/usr/bin/env node
/**
 * quick-wire-web-fixes.cjs
 *
 * Automates two quick fixes to unblock builds/tests:
 *  1) Remove the Interviews `title` column from the web page.
 *  2) Insert a local Vitest mock for trpc.settings.* in Settings page spec.
 *
 * Usage:
 *   # dry-run (default)
 *   node tools/scripts/quick-wire-web-fixes.cjs --dry
 *   node tools/scripts/quick-wire-web-fixes.cjs --check
 *
 *   # apply changes (writes .bak backups first)
 *   node tools/scripts/quick-wire-web-fixes.cjs --apply
 *   node tools/scripts/quick-wire-web-fixes.cjs --fix
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const APPLY =
  args.includes('--apply') ||
  (args.includes('--fix') &&
    !args.includes('--dry') &&
    !args.includes('--check'));
const DRY = !APPLY; // default to dry mode

function log(...a) {
  console.log(...a);
}
function info(msg) {
  console.log('\x1b[36m%s\x1b[0m', msg);
}
function ok(msg) {
  console.log('\x1b[32m%s\x1b[0m', msg);
}
function warn(msg) {
  console.log('\x1b[33m%s\x1b[0m', msg);
}
function err(msg) {
  console.log('\x1b[31m%s\x1b[0m', msg);
}

const CWD = process.cwd();

/** Find the first existing path from a list */
function firstExisting(relPaths) {
  for (const p of relPaths) {
    const abs = path.join(CWD, p);
    if (fs.existsSync(abs)) return { rel: p, abs };
  }
  return null;
}

/** Make a backup file once */
function backupOnce(absPath) {
  const bak = absPath + '.bak';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(absPath, bak);
  }
}

/** Write file with backup */
function writeWithBackup(absPath, content) {
  backupOnce(absPath);
  fs.writeFileSync(absPath, content);
}

/**
 * Transformation 1: remove Interviews title column
 */
function transformInterviewsPage(src) {
  let changed = false;
  const details = [];
  let out = src;

  // Remove a table header cell that literally shows "Title"
  const before1 = out;
  out = out.replace(/\n?\s*<th[^>]*>\s*Title\s*<\/th>\s*\n?/gi, () => {
    details.push('Removed <th>Title</th> header');
    return '\n';
  });
  if (out !== before1) changed = true;

  // Remove any <td> cell that renders iv.title (e.g. {iv.title ?? '—'})
  const tdPattern = /\n?\s*<td[^>]*>\s*\{[^}]*iv\.title[^}]*\}\s*<\/td>\s*\n?/g;
  const before2 = out;
  out = out.replace(tdPattern, () => {
    details.push('Removed <td> with iv.title');
    return '\n';
  });
  if (out !== before2) changed = true;

  // Also remove any dangling commas in arrays/JSX fragments if the column list is an array
  // (Best-effort; safe no-op otherwise)
  const before3 = out;
  out = out.replace(/,\s*\n\s*\n/g, '\n');
  if (out !== before3) changed = true;

  return { changed, details, out };
}

/**
 * Transformation 2: ensure test-local mock in settings page spec
 */
function ensureSettingsMockSpec(src) {
  const already =
    src.includes("vi.mock('@/trpc/react'") ||
    src.includes('vi.mock("@/trpc/react"');
  if (already)
    return { changed: false, out: src, details: ['Mock already present'] };

  const mockBlock =
    `// Auto-added by quick-wire-web-fixes (keeps test self-contained)\n` +
    `vi.mock('@/trpc/react', () => ({\n` +
    `  trpc: {\n` +
    `    settings: {\n` +
    `      get: { useQuery: () => ({ data: { theme: 'system', timezone: 'UTC', notifications: true }, isLoading: false, error: null }) },\n` +
    `      update: { useMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ ok: true }), isPending: false }) },\n` +
    `    },\n` +
    `  },\n` +
    `}));\n\n`;

  // Prepend ensures it runs before any static imports of the component under test
  return {
    changed: true,
    out: mockBlock + src,
    details: ['Inserted vi.mock("@/trpc/react") block'],
  };
}

/** Run the plan */
(async function run() {
  info(`quick-wire-web-fixes: ${DRY ? 'dry-run' : 'apply'} mode`);

  // 1) Interviews page — locate file
  const interviewCandidates = [
    'web/src/app/interviews/page.tsx',
    'web/app/interviews/page.tsx',
    'src/app/interviews/page.tsx',
    'app/interviews/page.tsx',
  ];
  const interviews = firstExisting(interviewCandidates);

  if (!interviews) {
    warn(
      'Interviews page not found (searched common locations). Skipping that fix.'
    );
  } else {
    const src = fs.readFileSync(interviews.abs, 'utf8');
    const { changed, details, out } = transformInterviewsPage(src);
    if (changed) {
      if (DRY) {
        ok(`[dry] Would edit ${interviews.rel}: ${details.join('; ')}`);
      } else {
        writeWithBackup(interviews.abs, out);
        ok(
          `Wrote ${interviews.rel} (${details.join(
            '; '
          )}) [backup: ${path.basename(interviews.rel)}.bak]`
        );
      }
    } else {
      info(`No changes needed in ${interviews.rel} (title column not found).`);
    }
  }

  // 2) Settings spec — locate file
  const settingsSpecCandidates = [
    'web/src/app/settings/page.spec.tsx',
    'web/app/settings/page.spec.tsx',
    'src/app/settings/page.spec.tsx',
    'app/settings/page.spec.tsx',
  ];
  const settingsSpec = firstExisting(settingsSpecCandidates);

  if (!settingsSpec) {
    warn(
      'Settings spec not found (searched common locations). Skipping that fix.'
    );
  } else {
    const src = fs.readFileSync(settingsSpec.abs, 'utf8');
    const { changed, details, out } = ensureSettingsMockSpec(src);
    if (changed) {
      if (DRY) {
        ok(`[dry] Would edit ${settingsSpec.rel}: ${details.join('; ')}`);
      } else {
        writeWithBackup(settingsSpec.abs, out);
        ok(
          `Wrote ${settingsSpec.rel} (${details.join(
            '; '
          )}) [backup: ${path.basename(settingsSpec.rel)}.bak]`
        );
      }
    } else {
      info(`No changes needed in ${settingsSpec.rel} (${details[0]}).`);
    }
  }

  ok('Done.');
  if (DRY) {
    info('Run again with --apply (or --fix) to write changes.');
  } else {
    info('Next steps:');
    console.log('  pnpm -w exec nx run web:build');
    console.log('  pnpm -w test:web -- src/app/settings/page.spec.tsx');
    console.log('  # or your previous combined test command');
  }
})();

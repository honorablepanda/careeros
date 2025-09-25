/**
 * phase3-fix-summary-and-tests.cjs
 * - Finalize safe aggregation in apps/api/src/router/summary.ts
 * - Ensure web/vitest.setup.ts loads jest-dom and mocks "@/trpc" (settings, auth, tracker)
 * - Ensure web/vitest.config.ts uses jsdom and includes setupFiles
 */
const fs = require('fs');
const path = require('path');

const repo = process.cwd();
const exist = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, 'utf8');
  console.log('✓ wrote', p);
};

/* 1) Patch summary.ts (replace any lingering `{ source }` reducer with { status }) */
(function patchSummary() {
  const file = path.join(repo, 'apps/api/src/router/summary.ts');
  if (!exist(file)) {
    console.log('• summary.ts not found (skip)');
    return;
  }
  let src = read(file);

  // If we already have the exact finalized block, skip.
  if (
    src.includes(`select: { status: true }`) &&
    src.includes(`const sourceGrp = Object.entries(sourceCountMap)`)
  ) {
    // Make sure reducer is correct (uses { status })
    if (!/reduce<[^>]*>\(\s*\(?acc.*\{\s*status\s*\}\)/m.test(src)) {
      // Try to fix only the reducer arg + key line
      src = src
        .replace(
          /reduce<[^>]*>\(\s*(acc[^,]*),\s*\{\s*source\s*\}\s*\)\s*=>\s*\{/m,
          'reduce<$1>((acc, { status }) => {'
        )
        .replace(
          /const\s+key\s*=\s*source\s*\?\?\s*['"]Unknown['"]/m,
          "const key = status ?? 'UNKNOWN'"
        );
      write(file, src);
      console.log('• summary.ts reducer fixed to use { status }');
    } else {
      console.log('• summary.ts already finalized');
    }
    return;
  }

  // Broader fix: replace a "source grouping" section with the safe status aggregation.
  // We look for either a groupBy by ['source'] or a findMany select { source: true } block.
  const safeBlock = `// 2) "Source" counts (fallback via status, since \`source\` is not in the model).
const appsForSources = await prisma.application.findMany({
  where: { userId },
  select: { status: true },
});

const sourceCountMap = appsForSources.reduce<Record<string, number>>(
  (acc, { status }) => {
    const key = status ?? 'UNKNOWN';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  },
  {}
);

// Keep the same shape your UI expects: [{ source, _count: { _all } }]
const sourceGrp = Object.entries(sourceCountMap).map(([source, count]) => ({
  source,
  _count: { _all: count },
}));`;

  let replaced = false;

  // Try to replace a groupBy(['source']) block
  src = src.replace(
    /const\s+[A-Za-z0-9_$]+\s*=\s*await\s*prisma\.application\.groupBy\s*\([\s\S]*?by:\s*\[\s*'source'\s*\][\s\S]*?\);\s*/m,
    () => {
      replaced = true;
      return safeBlock + '\n';
    }
  );

  // Or replace a findMany select { source: true } → reduce(...) pattern block
  if (!replaced) {
    src = src.replace(
      /const\s+[A-Za-z0-9_$]+\s*=\s*await\s*prisma\.application\.findMany\s*\([\s\S]*?select:\s*\{\s*source:\s*true\s*\}[\s\S]*?reduce[\s\S]*?\);\s*/m,
      () => {
        replaced = true;
        return safeBlock + '\n';
      }
    );
  }

  if (replaced) {
    write(file, src);
    console.log(
      '• summary.ts source-counts block replaced with safe status aggregation'
    );
    return;
  }

  // Last-resort: inject the safe block right after first occurrence of "userId" query
  if (src.includes('where: { userId }')) {
    const idx = src.indexOf('where: { userId }');
    const insertAt = src.indexOf('\n', idx) + 1;
    src =
      src.slice(0, insertAt) + '\n' + safeBlock + '\n' + src.slice(insertAt);
    write(file, src);
    console.log('• summary.ts safe block injected (fallback)');
  } else {
    console.log(
      '• Could not confidently patch summary.ts; please manual check.'
    );
  }
})();

/* 2) Ensure web/vitest.setup.ts has jest-dom and a robust @/trpc mock */
(function ensureVitestSetup() {
  const file = path.join(repo, 'web/vitest.setup.ts');
  const content = `import '@testing-library/jest-dom/vitest';

vi.mock('@/trpc', () => {
  const q = (data: any) => ({ data, isLoading: false, isSuccess: true, error: undefined });
  const m = () => ({ isLoading: false, isSuccess: true, error: undefined, mutate: () => {} });

  return {
    trpc: {
      settings: {
        get: { useQuery: () => q({ theme: 'system', timezone: 'UTC', notifications: true }) },
        update: { useMutation: m },
      },
      auth: {
        reset: { useMutation: m },
        verifyToken: { useMutation: m },
      },
      tracker: {
        getApplications: { useQuery: () => q([]) },
        createApplication: { useMutation: m },
        updateApplication: { useMutation: m },
        deleteApplication: { useMutation: m },
      },
    },
  };
});
`;
  write(file, content);
})();

/* 3) Ensure web/vitest.config.ts includes setupFiles + jsdom */
(function ensureVitestConfig() {
  const file = path.join(repo, 'web/vitest.config.ts');
  if (!exist(file)) {
    console.log('• web/vitest.config.ts not found (skip)');
    return;
  }
  let src = read(file);

  // Ensure environment: 'jsdom'
  if (!/environment\s*:\s*['"]jsdom['"]/.test(src)) {
    src = src.replace(/test:\s*\{([\s\S]*?)\}/m, (m, inner) => {
      // If there is an existing test block, add/override environment
      if (inner) {
        if (/environment\s*:/.test(inner)) {
          return `test: { ${inner.replace(
            /environment\s*:\s*['"][^'"]+['"]/,
            `environment: 'jsdom'`
          )} }`;
        }
        return `test: { environment: 'jsdom', ${inner} }`;
      }
      return `test: { environment: 'jsdom' }`;
    });
  }

  // Ensure setupFiles includes ./vitest.setup.ts
  if (!/setupFiles\s*:\s*\[/.test(src)) {
    // add setupFiles
    src = src.replace(/test:\s*\{([\s\S]*?)\}/m, (m, inner) => {
      const comma = inner.trim().length ? ',' : '';
      return `test: { ${inner}${comma} setupFiles: ['./vitest.setup.ts'] }`;
    });
  } else if (!/['"]\.\/vitest\.setup\.ts['"]/.test(src)) {
    // append to existing array
    src = src.replace(/setupFiles\s*:\s*\[([^\]]*)\]/m, (m, arr) => {
      const trimmed = arr.trim();
      const withComma =
        trimmed && !trimmed.endsWith(',') ? trimmed + ', ' : trimmed;
      return `setupFiles: [${withComma}'./vitest.setup.ts']`;
    });
  }

  write(file, src);
})();

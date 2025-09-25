const fs = require('fs'),
  path = require('path');
const ROOT = process.cwd();
const argOut = ((i) =>
  i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null)(
  process.argv.indexOf('--out')
);
const outBase = argOut
  ? argOut.replace(/\.json$/, '').replace(/\/$/, '')
  : path.join(
      'tools',
      'reports',
      `project-scan-${new Date().toISOString().replace(/[:.]/g, '-')}`
    );
const norm = (p) => p.split(path.sep).join('/');
const exists = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};
const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};
const walk = (
  dir,
  exts = null,
  ignore = new Set([
    'node_modules',
    '.git',
    '.nx',
    'dist',
    'build',
    'coverage',
    '.next',
    '.turbo',
    '.cache',
  ])
) => {
  const out = [];
  (function _w(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (ignore.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) _w(p);
      else if (!exts || exts.has(path.extname(e.name))) out.push(p);
    }
  })(dir);
  return out;
};

// Prisma
function findPrismaSchemas() {
  return walk(ROOT, new Set(['.prisma']))
    .filter((f) => path.basename(f) === 'schema.prisma')
    .sort(
      (a, b) =>
        (a.includes('/apps/api/') ? -1 : 1) -
          (b.includes('/apps/api/') ? -1 : 1) || a.length - b.length
    );
}
function parsePrismaSchema(body) {
  const enums = [],
    models = [];
  let m;
  const enumRe = /enum\s+(\w+)\s*\{([^}]+)\}/gms;
  while ((m = enumRe.exec(body))) {
    const name = m[1],
      values = m[2]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('//'));
    enums.push({ name, values });
  }
  const modelRe = /model\s+(\w+)\s*\{([^}]+)\}/gms;
  while ((m = modelRe.exec(body))) {
    const name = m[1],
      raw = m[2];
    const fields = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'))
      .map((l) => {
        const mm = /^(\w+)\s+([\w\[\]?]+)\s*(.*)$/.exec(l);
        return mm ? { name: mm[1], type: mm[2], attr: mm[3] || '' } : null;
      })
      .filter(Boolean);
    models.push({ name, fields });
  }
  return { enums, models };
}

// TRPC
function analyzeTrpc() {
  const root = ['apps/api/src/trpc/root.ts', 'apps/api/src/trpc/index.ts']
    .map((p) => path.join(ROOT, p))
    .find(exists);
  const dir = path.join(ROOT, 'apps/api/src/trpc/routers');
  const files = exists(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => path.join(dir, f))
    : [];
  const routers = files.map((f) => {
    const s = read(f) || '';
    return {
      file: norm(path.relative(ROOT, f)),
      exportedName:
        (/export\s+const\s+(\w+)Router\s*=\s*router\(/.exec(s) || [])[1] ||
        null,
      usesDollarEnums: /\$Enums\./.test(s),
      stubMarkers: (s.match(/\b(TODO|FIXME|STUB|PLACEHOLDER|WIP)\b/gi) || [])
        .length,
    };
  });
  return { apiRoot: root ? norm(path.relative(ROOT, root)) : null, routers };
}

// Types
function analyzeTypes() {
  const dir = path.join(ROOT, 'libs/types/src');
  return exists(dir)
    ? walk(dir, new Set(['.ts'])).map((f) => norm(path.relative(ROOT, f)))
    : [];
}

// Web
function analyzeWeb() {
  const app = path.join(ROOT, 'web/src/app'),
    pages = [];
  if (exists(app))
    for (const e of fs.readdirSync(app, { withFileTypes: true }))
      if (e.isDirectory() && e.name !== 'api') {
        const p = path.join(app, e.name, 'page.tsx');
        if (exists(p))
          pages.push({ module: e.name, page: norm(path.relative(ROOT, p)) });
      }
  const src = path.join(ROOT, 'web/src');
  let trpcClient = null;
  if (exists(src))
    for (const f of walk(src, new Set(['.ts', '.tsx']))) {
      const s = read(f) || '';
      if (/createTRPCReact\(|createClient\(/.test(s) && /trpc/i.test(s)) {
        trpcClient = norm(path.relative(ROOT, f));
        break;
      }
    }
  const e2eDir = path.join(ROOT, 'web/specs');
  const e2e = exists(e2eDir)
    ? fs
        .readdirSync(e2eDir)
        .filter((f) => f.endsWith('.spec.ts'))
        .map((f) => norm(path.relative(ROOT, path.join(e2eDir, f))))
    : [];
  return { pages, trpcClientPath: trpcClient, e2e };
}

// Stub scan
function scanStubs() {
  const files = walk(
    ROOT,
    new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.yml', '.yaml'])
  );
  const out = [];
  for (const f of files) {
    const s = read(f) || '';
    const a = (re) => (s.match(re) || []).length;
    const MARKER = a(/\b(TODO|FIXME|HACK|STUB|PLACEHOLDER|WIP|TEMP)\b/gi),
      TS_BANDAID = a(/@ts-(ignore|expect-error)/g),
      CAST_ANY = a(/\bas\s+any\b/g),
      DOUBLE_CAST = a(/as\s+unknown\s+as/g),
      NOT_IMPLEMENTED = a(
        /throw\s+new\s+Error\(['"`]\s*(not\s+implemented|unimplemented)\s*['"`]\)/gi
      );
    const total =
      MARKER + TS_BANDAID + CAST_ANY + DOUBLE_CAST + NOT_IMPLEMENTED;
    if (total)
      out.push({
        file: norm(path.relative(ROOT, f)),
        MARKER,
        TS_BANDAID,
        CAST_ANY,
        DOUBLE_CAST,
        NOT_IMPLEMENTED,
        total,
      });
  }
  return out.sort((a, b) => b.total - a.total);
}

// Module synthesis
const KNOWN = [
  'auth',
  'onboarding',
  'dashboard',
  'tracker',
  'resume',
  'settings',
  'profile',
  'goals',
  'planner',
  'calendar',
  'roadmap',
  'interviews',
  'activity',
  'notifications',
  'summary',
  'skills',
  'insights',
  'metrics',
  'achievements',
  'networking',
  'applications',
];
function synthesizeModules(types, routers, pages, stubs) {
  const map = new Map();
  const ensure = (n) => {
    if (!map.has(n))
      map.set(n, {
        name: n,
        types: null,
        router: null,
        page: null,
        apiSpec: null,
        e2e: null,
        stubScore: 0,
      });
    return map.get(n);
  };
  for (const f of types) {
    const m = /libs\/types\/src\/(\w+)\.ts$/.exec(f);
    if (m) ensure(m[1]).types = f;
  }
  for (const r of routers) {
    const m =
      /apps\/api\/src\/trpc\/routers\/(\w+)\.router\.ts$/.exec(r.file) ||
      /apps\/api\/src\/router\/(\w+)\.ts$/.exec(r.file);
    if (m) ensure(m[1]).router = r.file;
  }
  for (const p of pages) ensure(p.module).page = p.page;
  const specDir = path.join(ROOT, 'apps/api/src/router/__tests__');
  if (exists(specDir))
    for (const f of fs.readdirSync(specDir))
      if (/\.spec\.ts$/.test(f)) {
        const n = f.replace(/\.spec\.ts$/, '');
        ensure(n).apiSpec = norm(path.relative(ROOT, path.join(specDir, f)));
      }
  const e2eDir = path.join(ROOT, 'web/specs');
  if (exists(e2eDir))
    for (const f of fs.readdirSync(e2eDir))
      if (/\.e2e\.spec\.ts$/.test(f)) {
        const n = f.replace(/\.e2e\.spec\.ts$/, '');
        ensure(n).e2e = norm(path.relative(ROOT, path.join(e2eDir, f)));
      }
  for (const rec of stubs) {
    const hit = KNOWN.find(
      (m) =>
        rec.file.includes(`/${m}/`) ||
        rec.file.includes(`/${m}.`) ||
        rec.file.includes(`\\${m}\\`) ||
        rec.file.includes(`\\${m}.`)
    );
    if (hit) ensure(hit).stubScore += rec.total;
  }
  return Array.from(map.values()).filter(
    (m) => m.types || m.router || m.page || m.apiSpec || m.e2e
  );
}

// MAIN
(function main() {
  const prismaSchemas = findPrismaSchemas().map((p) => ({
    path: norm(path.relative(ROOT, p)),
    ...parsePrismaSchema(read(p) || ''),
  }));
  const prisma = {
    schemas: prismaSchemas,
    applicationModel: null,
    applicationStatusEnum: null,
    applicationSourceEnum: null,
  };
  for (const s of prismaSchemas) {
    const app = s.models.find((m) => /application/i.test(m.name));
    if (app && !prisma.applicationModel)
      prisma.applicationModel = { schema: s.path, ...app };
    const st = s.enums.find((e) => /ApplicationStatus/.test(e.name)),
      so = s.enums.find((e) => /ApplicationSource/.test(e.name));
    if (st) prisma.applicationStatusEnum = st;
    if (so) prisma.applicationSourceEnum = so;
  }
  const trpc = analyzeTrpc();
  const types = analyzeTypes();
  const web = analyzeWeb();
  const stubs = scanStubs();
  const modules = synthesizeModules(types, trpc.routers, web.pages, stubs);

  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const data = { prisma, trpc, web, types, stubs, modules };
  fs.writeFileSync(outBase + '.json', JSON.stringify(data, null, 2));

  // Markdown summary (avoid nested backticks)
  let md = `# Project Scan\n\n## Prisma\n`;
  if (prisma.applicationModel) {
    const fieldsList = prisma.applicationModel.fields
      .map((f) => `${f.name}:${f.type}`)
      .join(', ');
    md += `- Application model: **${prisma.applicationModel.name}** (from ${prisma.applicationModel.schema})\n`;
    md += `  - Fields: ${fieldsList}\n`;
  } else {
    md += `- Application model: **not found**\n`;
  }
  if (prisma.applicationStatusEnum)
    md += `- ApplicationStatus: ${prisma.applicationStatusEnum.values.join(
      ', '
    )}\n`;
  if (prisma.applicationSourceEnum)
    md += `- ApplicationSource: ${prisma.applicationSourceEnum.values.join(
      ', '
    )}\n`;

  md +=
    `\n## TRPC\n- Root: ${trpc.apiRoot || '(not found)'}\n- Routers (${
      trpc.routers.length
    }):\n` +
    trpc.routers
      .map(
        (r) =>
          `  - ${r.file}${
            r.exportedName ? ` → **${r.exportedName}Router**` : ''
          }${r.usesDollarEnums ? ' (uses $Enums)' : ''}${
            r.stubMarkers ? ` [stub markers: ${r.stubMarkers}]` : ''
          }`
      )
      .join('\n') +
    '\n';
  md += `\n## Web\n- TRPC client: ${
    web.trpcClientPath || '(not found)'
  }\n- Pages (${web.pages.length}): ${
    web.pages.map((p) => p.module).join(', ') || '(none)'
  }\n- Legacy e2e specs: ${web.e2e.length}\n`;
  md += `\n## Types\n- Files: ${types.length}\n`;
  md +=
    `\n## Stub findings\n- Files with markers: ${stubs.length}\n- Top offenders:\n` +
    stubs
      .slice(0, 10)
      .map(
        (s) =>
          `  - ${s.file} (total=${s.total}, MARKER=${s.MARKER}, ANY=${s.CAST_ANY})`
      )
      .join('\n') +
    '\n';
  md +=
    `\n## Module matrix (${modules.length})\n` +
    modules
      .map(
        (m) =>
          `- **${m.name}** — types:${m.types ? '✅' : '—'}, router:${
            m.router ? '✅' : '—'
          }, page:${m.page ? '✅' : '—'}, apiSpec:${
            m.apiSpec ? '✅' : '—'
          }, e2e:${m.e2e ? '⚠️' : ''} (stubScore=${m.stubScore})`
      )
      .join('\n') +
    '\n';

  fs.writeFileSync(outBase + '.md', md, 'utf8');
  console.log(
    `✓ Wrote:\n  - ${norm(outBase + '.json')}\n  - ${norm(outBase + '.md')}`
  );
  console.log(
    `\nSummary: routers=${trpc.routers.length}, pages=${web.pages.length}, types=${types.length}, stub-files=${stubs.length}`
  );
})();

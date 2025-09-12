/**
 * Scan the repo for stubs/placeholders and emit a CSV + Markdown report.
 * Heuristics:
 *  - markers: TODO, FIXME, HACK, STUB, PLACEHOLDER, WIP, TEMP
 *  - not-implemented: throw new Error('Not implemented'), unimplemented
 *  - type band-aids: @ts-ignore, @ts-expect-error, as any, as unknown as
 *  - trivial/spec stubs: specs with ≤1 expect and names like sanity|health|stub|smoke
 *
 * Outputs:
 *  - tools/reports/stub-scan-<timestamp>.csv
 *  - tools/reports/stub-scan-<timestamp>.md
 *
 * Flags:
 *  --suggest-deletes   Print a one-liner 'git rm' for obvious stub specs
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUTDIR = path.join(ROOT, 'tools', 'reports');
fs.mkdirSync(OUTDIR, { recursive: true });

const IGNORE_DIRS = new Set(['node_modules','.git','.nx','dist','build','coverage','.next','.turbo','.cache']);
const exts = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.yml','.yaml','.md','.sql']);

const MATCHERS = [
  { type:'MARKER', re:/\b(TODO|FIXME|HACK|STUB|PLACEHOLDER|WIP|TEMP)\b/i },
  { type:'NOT_IMPLEMENTED', re:/throw\s+new\s+Error\(['"`]\s*(not\s+implemented|unimplemented)\s*['"`]\)/i },
  { type:'TS_BANDAID', re:/@ts-(ignore|expect-error)/ },
  { type:'CAST_ANY', re:/\bas\s+any\b/ },
  { type:'DOUBLE_CAST', re:/as\s+unknown\s+as\b/ },
];

const STUB_SPEC_NAME = /(sanity|health|placeholder|stub|smoke)/i;

const findings = [];
const stubSpecs = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(p); continue; }
    if (!exts.has(path.extname(entry.name))) continue;

    let src = '';
    try { src = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const lines = src.split(/\r?\n/);

    // per-line matches
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const m of MATCHERS) {
        if (m.re.test(line)) {
          findings.push({
            file: path.relative(ROOT, p),
            line: i + 1,
            type: m.type,
            text: line.trim().slice(0, 240)
          });
        }
      }
    }

    // spec stub heuristic
    if (/(\.spec|\.test)\.(t|j)sx?$/.test(p)) {
      const nameHit = STUB_SPEC_NAME.test(src) || STUB_SPEC_NAME.test(path.basename(p));
      const expectCount = (src.match(/\bexpect\(/g) || []).length;
      if (nameHit && expectCount <= 1) {
        stubSpecs.push(path.relative(ROOT, p));
      }
      // very trivial asserts:
      if (!nameHit && expectCount <= 1 && /expect\((true|1)\)\.toBe\(\1\)/.test(src)) {
        stubSpecs.push(path.relative(ROOT, p));
      }
    }
  }
}

walk(ROOT);

// Write CSV
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const csvPath = path.join(OUTDIR, `stub-scan-${stamp}.csv`);
const mdPath  = path.join(OUTDIR, `stub-scan-${stamp}.md`);
const csv = ['file,line,type,snippet']
  .concat(findings.map(f => `"${f.file.replace(/"/g,'""')}",${f.line},${f.type},"${f.text.replace(/"/g,'""')}"`))
  .join('\n');
fs.writeFileSync(csvPath, csv, 'utf8');

// Write Markdown summary
const byType = findings.reduce((a,f)=>((a[f.type]=(a[f.type]||0)+1),a),{});
let md = `# Stub Scan Report (${stamp})\n\n`;
md += `**Total findings:** ${findings.length}\n\n`;
md += `**By type:** ${Object.entries(byType).map(([k,v])=>`${k}: ${v}`).join(', ') || 'none'}\n\n`;
if (stubSpecs.length) {
  md += `## Obvious stub specs (${stubSpecs.length})\n`;
  md += stubSpecs.map(s=>`- ${s}`).join('\n') + '\n\n';
}
md += `## Findings\n`;
for (const f of findings.slice(0, 1000)) {
  md += `- ${f.file}:${f.line} — **${f.type}** — \`${f.text}\`\n`;
}
if (findings.length > 1000) md += `\n…and ${findings.length - 1000} more.\n`;
fs.writeFileSync(mdPath, md, 'utf8');

console.log(`✓ Wrote:\n  - ${path.relative(ROOT, csvPath)}\n  - ${path.relative(ROOT, mdPath)}`);
if (process.argv.includes('--suggest-deletes') && stubSpecs.length) {
  const chunk = (arr, n) => arr.length ? [arr.slice(0,n), ...chunk(arr.slice(n), n)] : [];
  console.log('\n# Suggested commands to remove obvious stub tests (review before running):');
  for (const group of chunk(stubSpecs, 10)) {
    console.log('git rm ' + group.map(p=>`"${p}"`).join(' '));
  }
}

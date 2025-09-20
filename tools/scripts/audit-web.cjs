#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

// ---------- CLI args ----------
const roots = process.argv.slice(2);
const scanRoots = roots.length ? roots : ['web/src', 'web/app'];

// ---------- helpers ----------
const exts = /\.(t|j)sx?$/i;
const ctrlRe = /<(input|select|textarea)\b[^>]*>/i;
const labelRe = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
const idRe = /\bid\s*=\s*"([^"]+)"/i;
const htmlForRe = /\b(htmlFor|for)\s*=\s*"([^"]+)"/i;
const classRe = /\bclass(Name)?\s*=\s*"([^"]*)"/i;

function walk(d) {
  const out = [];
  const stack = [d];
  while (stack.length) {
    const cur = stack.pop();
    if (!fs.existsSync(cur)) continue;
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.next') continue;
        stack.push(p);
      } else if (exts.test(p)) {
        out.push(p);
      }
    }
  }
  return out;
}

function lineCol(src, idx) {
  const pre = src.slice(0, idx);
  const lines = pre.split(/\r?\n/);
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return `${line}:${col}`;
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function findNextControl(src, fromIdx) {
  const after = src.slice(fromIdx);
  const m = ctrlRe.exec(after);
  if (!m) return null;
  const raw = m[0];
  const id = (raw.match(idRe) || [])[1] || null;
  return { raw, id, absoluteIdx: fromIdx + m.index };
}

// ---------- findings ----------
const findings = [];
function logFinding(code, file, idx, msg, sample) {
  findings.push({ code, file, loc: lineCol(sample.src ?? fs.readFileSync(file, 'utf8'), idx), msg, sample: sample.text ?? null });
}

function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8');

  // A) Dangling "from '...';" (no import) and other suspicious top-of-file lines
  {
    const re = /^\s*from\s+['"][^'"]+['"]\s*;?\s*$/gm;
    let m;
    while ((m = re.exec(src))) {
      logFinding('DANGLED_FROM', file, m.index, `Dangling "from ..." without "import".`, { src, text: m[0] });
    }
  }

  // B) TRPC legacy import
  {
    const re = /from\s+['"]@\/trpc\/react['"]/g;
    let m;
    while ((m = re.exec(src))) {
      logFinding('TRPC_LEGACY_IMPORT', file, m.index, `Use "@/trpc" instead of "@/trpc/react".`, { src, text: m[0] });
    }
  }

  // C) any-usage
  {
    const reAnyAnnot = /:\s*any\b/g;
    let m;
    while ((m = reAnyAnnot.exec(src))) {
      logFinding('TS_ANY', file, m.index, `Explicit ": any" type.`, { src, text: src.slice(m.index, m.index + 40) });
    }
    const reAsAny = /\bas\s+any\b/g;
    while ((m = reAsAny.exec(src))) {
      logFinding('TS_AS_ANY', file, m.index, `Cast "as any".`, { src, text: src.slice(m.index, m.index + 40) });
    }
  }

  // D) Date usage on possibly unknown fields -> suggest dateValue/formatDate
  {
    const reDateCall = /new\s+Date\s*\(\s*([^)]+?)\s*\)\s*(?:\.getTime\(\)|\.toLocaleDateString\(\))?/g;
    let m;
    while ((m = reDateCall.exec(src))) {
      const inner = m[1];
      // Ignore safe patterns: 0, constants, new Date(), Date.now(), dateValue(), formatDate()
      if (/^0|^\d+$/.test(inner)) continue;
      if (/dateValue\s*\(/.test(inner) || /formatDate\s*\(/.test(inner)) continue;
      // If it's clearly a property or unknown and not guarded
      if (/\w+\.\w+/.test(inner) && !/\?\?\s*0/.test(inner) && !/\bas\s+/.test(inner)) {
        logFinding('DATE_UNKNOWN', file, m.index, `new Date(${inner}) on possibly unknown field (prefer dateValue/formatDate or proper typing).`, { src, text: m[0] });
      }
    }
  }

  // E) Labels ↔ controls
  {
    let m;
    while ((m = labelRe.exec(src))) {
      const full = m[0];
      const attrs = m[1] || '';
      const text = stripTags(m[2] || '');
      const idx = m.index;
      const cls = (attrs.match(classRe) || [])[2] || '';
      const htmlFor = (attrs.match(htmlForRe) || [])[2] || null;

      // Skip labels that visually wrap their control (inline-flex or nested input/select)
      const wrapsControl = /inline-flex/.test(cls) || /(input|select|textarea)/i.test(full);

      // Find the first control after this label (before the next closing </div> to narrow scope)
      const nextDivClose = src.indexOf('</div>', idx) === -1 ? src.length : src.indexOf('</div>', idx);
      const next = findNextControl(src, idx + full.length);
      const inScope = next && next.absoluteIdx < nextDivClose ? next : null;

      if (wrapsControl) {
        // If it wraps, we don't require htmlFor/id. But we can warn if htmlFor is present (usually unnecessary)
        continue;
      }

      if (!htmlFor && inScope && !inScope.id) {
        logFinding('LABEL_MISSING_FOR', file, idx, `Label "${text}" missing htmlFor (and following ${RegExp.$1 || 'control'} missing id).`, { src, text: full });
      } else if (!htmlFor && inScope && inScope.id) {
        logFinding('LABEL_MISSING_FOR', file, idx, `Label "${text}" missing htmlFor (control has id="${inScope.id}").`, { src, text: full });
      } else if (htmlFor && !inScope) {
        logFinding('CONTROL_NOT_FOUND', file, idx, `Label "${text}" has htmlFor="${htmlFor}" but no following control found in the same block.`, { src, text: full });
      } else if (htmlFor && inScope && !inScope.id) {
        logFinding('CONTROL_MISSING_ID', file, inScope.absoluteIdx, `Control after label "${text}" is missing id (expected id="${htmlFor}").`, { src, text: inScope.raw });
      } else if (htmlFor && inScope && inScope.id && htmlFor !== inScope.id) {
        logFinding('LABEL_FOR_MISMATCH', file, idx, `Label "${text}" htmlFor="${htmlFor}" does not match control id="${inScope.id}".`, { src, text: full });
      }
    }
  }
}

// ---------- run ----------
const files = scanRoots.flatMap(walk);
console.log(`Scanning ${files.length} files...\n`);

for (const f of files) scanFile(f);

// print
if (!findings.length) {
  console.log('No issues detected ✅');
  process.exit(0);
}

const byCode = findings.reduce((acc, it) => {
  (acc[it.code] ||= []).push(it);
  return acc;
}, {});

Object.keys(byCode).sort().forEach(code => {
  for (const it of byCode[code]) {
    console.log(`[${code}] ${it.file.replace(/\\/g,'/')}:${it.loc}  ${it.msg}`);
    if (it.sample) {
      const s = String(it.sample).split('\n')[0];
      console.log(`  → ${s.length > 120 ? s.slice(0,120) + '…' : s}`);
    }
  }
  console.log();
});

console.log('────────────────────────────────────────────────────────────────────────');
console.log('Summary:');
for (const code of Object.keys(byCode).sort()) {
  console.log(`${code.padEnd(24)} ${String(byCode[code].length).padStart(3)}`);
}
console.log('────────────────────────────────────────────────────────────────────────');

process.exit(1);

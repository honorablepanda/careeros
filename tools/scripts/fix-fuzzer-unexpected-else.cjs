#!/usr/bin/env node
// Removes an orphan "else { ... }" left after the APPLY_BEST patch.
const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'tools', 'scripts', 'fuzz-web-vitest.cjs');
if (!fs.existsSync(file)) {
  console.error('Not found:', file);
  process.exit(1);
}

let s = fs.readFileSync(file, 'utf8');

// sanity: our new block has this marker text
const marker = 'No successful run to apply (no totals or nonzero exit). Keeping originals.';
const markerIdx = s.indexOf(marker);
if (markerIdx === -1) {
  console.error('Could not find patched APPLY_BEST marker. Aborting to avoid damaging the file.');
  process.exit(1);
}

// backup first
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = file + '.fixbak.' + stamp;
fs.writeFileSync(backup, s, 'utf8');

// find a stray "else { ... }" that follows our block
const searchFrom = markerIdx + marker.length;
// standalone "else" followed by "{"
const reElse = /(^|\s)else\s*\{/g;
reElse.lastIndex = searchFrom;
const m = reElse.exec(s);

if (!m) {
  console.log('No stray else-block found. Nothing to do.');
  console.log('Backup kept at:', backup);
  process.exit(0);
}

// find matching closing brace for that else-block
let i = reElse.lastIndex - 1;           // position of the "{"
let depth = 0;
let inS = false, inD = false, inT = false, inSL = false, inML = false;

function nextChar() {
  return s[i + 1];
}

while (++i < s.length) {
  const c = s[i];
  const p = s[i - 1];

  // handle comments
  if (!inS && !inD && !inT) {
    if (!inSL && !inML && p === '/' && c === '/') { inSL = true; continue; }
    if (!inSL && !inML && p === '/' && c === '*') { inML = true; continue; }
    if (inSL && c === '\n') { inSL = false; continue; }
    if (inML && p === '*' && c === '/') { inML = false; continue; }
    if (inSL || inML) continue;
  }

  // handle strings/template
  if (!inD && !inT && c === '\'' && p !== '\\') { inS = !inS; continue; }
  if (!inS && !inT && c === '"' && p !== '\\') { inD = !inD; continue; }
  if (!inS && !inD && c === '`' && p !== '\\') { inT = !inT; continue; }

  if (inS || inD || inT) continue;

  // brace tracking
  if (c === '{') depth++;
  else if (c === '}') {
    if (depth === 0) {
      // this closes the else-block we started at "{"
      const elseStart = m.index + (m[1] ? m[1].length : 0); // start of "else"
      const afterElseBlock = i + 1;
      const removed = s.slice(elseStart, afterElseBlock);
      s = s.slice(0, elseStart) + s.slice(afterElseBlock);
      fs.writeFileSync(file, s, 'utf8');
      console.log('✅ Removed stray else-block.');
      console.log('Backup:', backup);
      // optional: show first line of what we removed
      console.log('Removed snippet starts with:', removed.split(/\r?\n/)[0]);
      process.exit(0);
    } else {
      depth--;
    }
  }
}

console.error('Failed to match closing brace for stray else-block. No changes made.');
console.log('Backup:', backup);
process.exit(2);

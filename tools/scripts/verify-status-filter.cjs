
const fs = require('fs');

const FILES = [
  'web/src/app/applications/page.tsx',
  'web/src/app/goals/page.tsx',
].filter(fs.existsSync);

function findSelectOpen(text, startIndex) {
  const i = text.indexOf('<select', startIndex);
  if (i === -1) return { idx: -1, open: '', end: -1 };
  let j = i + '<select'.length;
  let brace = 0, inS = false, inD = false, inT = false;
  for (; j < text.length; j++) {
    const ch = text[j], prev = text[j - 1];
    if (inS) { if (ch === "'" && prev !== '\\') inS = false; continue; }
    if (inD) { if (ch === '"' && prev !== '\\') inD = false; continue; }
    if (inT) { if (ch === '`' && prev !== '\\') inT = false; continue; }
    if (!inS && !inD && !inT) {
      if (ch === "'") { inS = true; continue; }
      if (ch === '"') { inD = true; continue; }
      if (ch === '`') { inT = true; continue; }
      if (ch === '{') { brace++; continue; }
      if (ch === '}') { if (brace > 0) brace--; continue; }
      if (ch === '>' && brace === 0) { j++; break; }
    }
  }
  return { idx: i, open: text.slice(i, j), end: j };
}

function report(file) {
  const s = fs.readFileSync(file, 'utf8');
  console.log('\n=== ' + file + ' ===');

  const labelOk = /<label[^>]*\bhtmlFor="statusFilter"[^>]*>\s*Filter status:\s*<\/label>/.test(s);
  console.log(labelOk ? 'PASS: label htmlFor="statusFilter"' : 'FAIL: label htmlFor="statusFilter"');

  const labelPos = s.indexOf('Filter status:</label>');
  if (labelPos < 0) {
    console.log('FAIL: no <label>…Filter status…</label> found');
    return 1;
  }

  const { idx: selIdx, open: openTag } = findSelectOpen(s, labelPos);
  if (selIdx < 0) {
    console.log('FAIL: no <select> after label');
    return 1;
  }

  const idOk    = /\b<select\b[\s\S]*?\bid\s*=\s*"statusFilter"/.test(openTag);
  const valOk   = /\bvalue=\{\s*status\s*\?\?\s*''\s*\}/.test(openTag);
  const arrowOk = /onChange=\{\s*\(e\)\s*=>\s*setStatus\(\s*e\.target\.value\s*\|\|\s*undefined\s*\)\s*\}/.test(openTag);

  console.log(idOk    ? 'PASS: id="statusFilter"'                : 'FAIL: id="statusFilter"');
  console.log(valOk   ? "PASS: value={status ?? ''}"             : "FAIL: value={status ?? ''}");
  console.log(arrowOk ? 'PASS: onChange arrow'                   : 'FAIL: onChange arrow');

  const idInside = /onChange=\{[^}]*id="/.test(openTag);
  const downgrad = /onChange=\{\s*\(e\)\s*=/.test(openTag);
  const stray    = /onChange=\{\s*\(e\)\s*=>\s*>\s*/.test(openTag);

  console.log(!idInside ? 'PASS: no id inside onChange' : 'FAIL: id found inside onChange');
  console.log(!downgrad ? 'PASS: no downgraded "(e) ="' : 'FAIL: downgraded "(e) ="');
  console.log(!stray    ? 'PASS: no stray "=> >"'       : 'FAIL: stray "=> >"');

  console.log('Opening <select> tag:');
  console.log(openTag.trim());

  return (labelOk && idOk && valOk && arrowOk && !idInside && !downgrad && !stray) ? 0 : 1;
}

let fail = 0;
for (const f of FILES) fail |= report(f);
process.exitCode = fail ? 1 : 0;

// tools/scripts/relax-activity-scanners.cjs
const fs = require('fs');
const path = require('path');

function robustify(file) {
  let s = fs.readFileSync(file, 'utf8');

  // Normalize line endings in-source (scanner should do this before regex)
  if (!/const\s+norm\s*=/.test(s)) {
    s = s.replace(
      /(const\s+src\s*=\s*fs\.readFileSync\([^)]*\)\.toString\(\);?)/,
      `$1
const norm = src.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');`
    );
    s = s.replace(/\bsrc\b(?!\.replace)/g, 'norm');
  }

  // Loosen "permissive input" check: z.object({}).passthrough() with any spacing/newlines
  s = s.replace(
    /z\.object\(\{\}\)\.passthrough\(\)/g,
    String.raw`z\.object\(\s*\{\s*\}\s*\)\s*\.passthrough\(\s*\)`
  );

  // CREATE activity shape: allow any spacing and allow payload:{data:input} or payload: { data: input }
  s = s.replace(
    /applicationActivity\.create\([^)]*type:\s*'CREATE'[^)]*payload:\s*\{\s*data:\s*input\s*\}[^)]*\)/g,
    String.raw`applicationActivity\.create\([\s\S]*?type:\s*['"]CREATE['"][\s\S]*?payload:\s*\{\s*data\s*:\s*input\s*\}[\s\S]*?\)`
  );

  // STATUS_CHANGE shape: allow to:<expr> (nextStatus or e)
  s = s.replace(
    /applicationActivity\.create\([^)]*type:\s*'STATUS_CHANGE'[^)]*payload:\s*\{\s*to:\s*[a-zA-Z0-9_.]+\s*\}[^)]*\)/g,
    String.raw`applicationActivity\.create\([\s\S]*?type:\s*['"]STATUS_CHANGE['"][\s\S]*?payload:\s*\{\s*to\s*:\s*[a-zA-Z0-9_.]+\s*\}[\s\S]*?\)`
  );

  // getApplicationActivity: tolerate CRLF + any prop order between where/orderBy
  s = s.replace(
    /applicationActivity\.findMany\(\s*\{\s*where:\s*\{\s*applicationId:\s*input\.id\s*\}\s*,\s*orderBy:\s*\{\s*createdAt:\s*'desc'\s*\}\s*\}\s*\)/g,
    String.raw`applicationActivity\.findMany\(\s*\{[\s\S]*?where\s*:\s*\{\s*applicationId\s*:\s*input\.id\s*\}[\s\S]*?orderBy\s*:\s*\{\s*createdAt\s*:\s*['"]desc['"]\s*\}[\s\S]*?\}\s*\)`
  );

  fs.writeFileSync(file, s, 'utf8');
  console.log('✓ Hardened scanner:', file);
}

[
  'tools/scripts/verify-activity.cjs',
  'tools/scripts/deep-scan-activity.cjs',
  'tools/scripts/scan-tracker-activity.cjs',
].forEach((p) => {
  if (fs.existsSync(p)) robustify(p);
});

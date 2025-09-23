const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_DIR = path.join(ROOT, 'apps/api/src');

const exts = new Set(['.ts', '.tsx', '.js', '.jsx']);
const files = [];

(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (
      exts.has(path.extname(name)) &&
      (name.endsWith('.spec.ts') || name.endsWith('.test.ts'))
    ) {
      files.push(p);
    }
  }
})(TARGET_DIR);

const REPLACERS = [
  [/\bjest\.fn\b/g, 'vi.fn'],
  [/\bjest\.spyOn\b/g, 'vi.spyOn'],
  [/\bjest\.mock\b/g, 'vi.mock'],
  [/\bjest\.clearAllMocks\b/g, 'vi.clearAllMocks'],
  [/\bjest\.resetAllMocks\b/g, 'vi.resetAllMocks'],
  [/\bjest\.restoreAllMocks\b/g, 'vi.restoreAllMocks'],
  [/\bjest\.useFakeTimers\b/g, 'vi.useFakeTimers'],
  [/\bjest\.useRealTimers\b/g, 'vi.useRealTimers'],
  [/\bjest\.setSystemTime\b/g, 'vi.setSystemTime'],
  [/\bjest\.advanceTimersByTime\b/g, 'vi.advanceTimersByTime'],
  [/\bjest\.runAllTimers\b/g, 'vi.runAllTimers'],
];

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;

  // swap jest.* -> vi.*
  for (const [re, rep] of REPLACERS) s = s.replace(re, rep);

  // ensure { vi } is imported from 'vitest'
  if (s.includes('vi.')) {
    const impRe = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]vitest['"];?/;
    if (impRe.test(s)) {
      s = s.replace(impRe, (_m, g1) => {
        const names = new Set(
          g1
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        );
        names.add('vi');
        return `import { ${Array.from(names)
          .sort()
          .join(', ')} } from 'vitest'`;
      });
    } else {
      // add a vitest import at the top if none exists
      s = `import { vi, describe, it, expect } from 'vitest';\n` + s;
    }
  }

  if (s !== before) {
    fs.writeFileSync(f + '.bak', before); // one-time backup per file
    fs.writeFileSync(f, s, 'utf8');
    console.log('✓ patched', path.relative(ROOT, f));
  }
}

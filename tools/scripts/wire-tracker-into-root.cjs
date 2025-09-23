const fs = require('fs');
const path = require('path');

const file = path.join('apps', 'api', 'src', 'trpc', 'root.ts');
if (!fs.existsSync(file)) {
  console.error(
    '! Missing apps/api/src/trpc/root.ts — adjust path if your root is elsewhere.'
  );
  process.exit(1);
}
let s = fs.readFileSync(file, 'utf8');
const orig = s;

// Ensure import of trackerRouter
if (!/trackerRouter/.test(s)) {
  // Add import if not present (common project layout)
  if (!/from\s+['"]\.\/routers\/tracker\.router['"]/.test(s)) {
    s = `import { trackerRouter } from './routers/tracker.router';\n` + s;
  }
}

// Ensure createTRPCRouter call includes { tracker: trackerRouter }
s = s.replace(/createTRPCRouter\s*\(\s*\{\s*([\s\S]*?)\}\s*\)/m, (m, inner) => {
  if (/[\s{,]tracker\s*:\s*trackerRouter[\s},]/.test(inner)) return m; // already wired
  const cleaned = inner.trim();
  const prefix = cleaned.length
    ? cleaned.replace(/[\s\r\n]+$/, '') + ',\n  '
    : '';
  return `createTRPCRouter({\n  ${prefix}tracker: trackerRouter\n})`;
});

// Ensure we export AppRouter type (scanner often checks this too)
if (!/export\s+type\s+AppRouter\s*=\s*typeof\s+appRouter/.test(s)) {
  if (/export\s+const\s+appRouter\s*=/.test(s)) {
    s += `\nexport type AppRouter = typeof appRouter;\n`;
  } else {
    // If appRouter is a default or differently named, try to normalize a bit:
    s = s.replace(
      /export\s+default\s+createTRPCRouter\s*\(/,
      'export const appRouter = createTRPCRouter('
    );
    if (!/export\s+type\s+AppRouter\s*=\s*typeof\s+appRouter/.test(s)) {
      s += `\nexport type AppRouter = typeof appRouter;\n`;
    }
  }
}

if (s !== orig) {
  fs.writeFileSync(file, s, 'utf8');
  console.log('✓ wired trackerRouter into root and ensured AppRouter export');
} else {
  console.log('= root router already wired + typed');
}

/**
 * auto-fix-web-build.cjs
 * - Patch apps/api/src/router/summary.ts to avoid Prisma groupBy TS issue
 * - Ensure web/next.config.js sets experimental.outputFileTracingRoot
 * - Optionally create web/src/app/reset/page.tsx and web/src/app/magic/page.tsx if missing
 */
const fs = require('fs');
const path = require('path');

const repo = process.cwd();
const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); console.log(`✓ wrote ${p}`); };

function patchSummaryRouter() {
  const p = path.join(repo, 'apps/api/src/router/summary.ts');
  if (!exists(p)) { console.log(`⚠ skipped: ${p} not found`); return; }
  let src = read(p);

  // If already patched, skip
  if (src.includes('appsForSources = await prisma.application.findMany')) {
    console.log('• summary.ts already uses findMany+reduce, skipping');
    return;
  }

  // Try to detect the variable name for the group result (default to "sourceGrp")
  let varName = 'sourceGrp';
  const varMatch = src.match(/const\s+([A-Za-z0-9_$]+)\s*=\s*await\s+prisma\.application\.groupBy\s*\(/);
  if (varMatch) varName = varMatch[1];

  // Replace the whole groupBy(...) assignment block with safer code
  // Heuristic: replace from "const <var> = await prisma.application.groupBy({"
  // up to the first ");" that closes it.
  const pattern = new RegExp(
    `const\\s+${varName}\\s*=\\s*await\\s*prisma\\.application\\.groupBy\\s*\\([\\s\\S]*?\\)\\s*;`
  );

  const replacement = `// 2) Source counts (avoid Prisma groupBy TS issues)
const appsForSources = await prisma.application.findMany({
  where: { userId },
  select: { source: true },
});

const sourceCountMap = appsForSources.reduce<Record<string, number>>((acc, { source }) => {
  const key = source ?? 'Unknown';
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

// into the same shape the old code returned:
const ${varName} = Object.entries(sourceCountMap).map(([source, count]) => ({
  source,
  _count: { _all: count },
}));`;

  if (pattern.test(src)) {
    src = src.replace(pattern, replacement);
    write(p, src);
    console.log('• Patched summary.ts (groupBy → findMany+reduce)');
  } else {
    // Fallback: just insert right above the groupBy as a safer duplicate and comment the old one
    if (src.includes('prisma.application.groupBy')) {
      src = src.replace(
        'prisma.application.groupBy',
        `/* prisma.application.groupBy (commented by auto-fix-web-build)
prisma.application.groupBy`
      );
      src += `\n\n${replacement}\n`;
      write(p, src);
      console.log('• Inserted safe block and commented original groupBy (fallback path)');
    } else {
      console.log('⚠ Could not detect groupBy block. No changes made to summary.ts');
    }
  }
}

function ensureNextConfig() {
  const p = path.join(repo, 'web/next.config.js');
  const snippet =
`const path = require('path');
/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '..'),
  },
};
`;
  if (!exists(p)) {
    write(p, snippet);
    console.log('• Created web/next.config.js with outputFileTracingRoot');
    return;
  }
  let src = read(p);
  if (!/outputFileTracingRoot/.test(src)) {
    // naive add experimental block or extend it
    if (/module\.exports\s*=\s*\{/.test(src)) {
      src = src.replace(
        /module\.exports\s*=\s*\{/,
        `module.exports = {\n  experimental: { outputFileTracingRoot: require('path').join(__dirname, '..') },`
      );
      write(p, src);
      console.log('• Injected outputFileTracingRoot into existing next.config.js');
    } else {
      // fallback: overwrite with known-good config
      write(p, snippet);
      console.log('• Replaced web/next.config.js with known-good config');
    }
  } else {
    console.log('• web/next.config.js already has outputFileTracingRoot');
  }
}

function ensureAuthPages() {
  const resetP = path.join(repo, 'web/src/app/reset/page.tsx');
  const magicP = path.join(repo, 'web/src/app/magic/page.tsx');

  const resetContent =
`'use client';
import { useState } from 'react';
import { trpc } from '@/trpc';

export default function ResetPage() {
  const [email, setEmail] = useState('');
  const reset = trpc.auth.reset.useMutation();

  return (
    <main className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Reset password</h1>
      <input
        className="w-full border rounded p-2"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        className="rounded px-4 py-2 border"
        disabled={!email || reset.isLoading}
        onClick={() => reset.mutate({ email })}
      >
        {reset.isLoading ? 'Sending…' : 'Send reset link'}
      </button>

      {reset.isSuccess && (
        <p className="text-sm">If the email exists, a link was sent.</p>
      )}
      {reset.error && (
        <p className="text-sm text-red-600">{reset.error.message}</p>
      )}
    </main>
  );
}
`;

  const magicContent =
`'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '@/trpc';

export default function MagicLinkHandler() {
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const router = useRouter();
  const verify = trpc.auth.verifyToken.useMutation({
    onSuccess: () => router.replace('/dashboard'),
  });

  useEffect(() => {
    if (token) verify.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="mx-auto max-w-md p-6 space-y-3">
      <h1 className="text-xl font-semibold">Signing you in…</h1>
      {!token && <p className="text-sm text-red-600">Missing token.</p>}
      {verify.error && (
        <p className="text-sm text-red-600">{verify.error.message}</p>
      )}
    </main>
  );
}
`;

  if (!exists(resetP)) { write(resetP, resetContent); } else { console.log('• reset page exists, skipping'); }
  if (!exists(magicP)) { write(magicP, magicContent); } else { console.log('• magic page exists, skipping'); }
}

(function main(){
  patchSummaryRouter();
  ensureNextConfig();
  ensureAuthPages(); // harmless if already present
  console.log('✅ automation complete');
})();

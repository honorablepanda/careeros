const fs = require('fs');
const path = require('path');

const repo = process.cwd();
const w = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, 'utf8');
  console.log('✓ wrote', p);
};
const e = (p) => fs.existsSync(p);
const r = (p) => fs.readFileSync(p, 'utf8');

/**
 * 1) Overwrite web/vitest.setup.ts with a robust TRPC mock:
 *    - settings.get.useQuery()
 *    - settings.update.useMutation()
 *    - auth.reset/verifyToken
 *    - tracker basic hooks (since other pages import them)
 */
(function ensureMock() {
  const file = path.join(repo, 'web/vitest.setup.ts');
  const content = `vi.mock('@/trpc', () => {
  // generic helpers
  const q = (data) => ({ data, isLoading: false, isSuccess: true, error: undefined });
  const m = () => ({ isLoading: false, isSuccess: true, error: undefined, mutate: () => {} });

  return {
    trpc: {
      settings: {
        get: { useQuery: () => q({ theme: 'system', timezone: 'UTC', notifications: true }) },
        update: { useMutation: m }
      },
      auth: {
        reset: { useMutation: m },
        verifyToken: { useMutation: m }
      },
      tracker: {
        getApplications: { useQuery: () => q([]) },
        createApplication: { useMutation: m },
        updateApplication: { useMutation: m },
        deleteApplication: { useMutation: m }
      }
    }
  };
});`;
  w(file, content);
})();

/**
 * 2) Enforce a clean TRPC client in web/src/trpc/index.ts
 *    (Fixes @nx/enforce-module-boundaries error if there was a relative import).
 */
(function fixTrpcIndex() {
  const file = path.join(repo, 'web/src/trpc/index.ts');
  const content = `import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@careeros/trpc';

export const trpc = createTRPCReact<AppRouter>();
export default trpc;
`;
  w(file, content);
})();

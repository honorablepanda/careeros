// web/vitest.setup.ts

// Make JSX happy in tests (even if a test forgets to import React)
import React from 'react';
(globalThis as any).React = React;

// Helpful matchers: toBeInTheDocument, etc.
import '@testing-library/jest-dom';

// Always clean up React Testing Library between tests
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
afterEach(() => cleanup());

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight TRPC stub: constant leaf (no recursion, no allocations)
// This avoids memory leaks and thread instability on Windows.
// Extend specific routers below only when a test/page needs concrete data.
// ─────────────────────────────────────────────────────────────────────────────
const __trpcLeaf = {
  // Query: stable, no polling/background work
  useQuery: () => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  }),
  // Mutation: stable, no side effects
  useMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    isSuccess: true,
    reset: vi.fn(),
  }),
};

// Known routers pages reach for; everything else falls back to the same leaf
const trpcStub: any = {
  settings: {
    get: __trpcLeaf,
    update: __trpcLeaf,
  },
  tracker: {
    getApplications: __trpcLeaf,
    activity: __trpcLeaf,
  },
  notifications: { list: __trpcLeaf },
  goals: { list: __trpcLeaf },
  planner: { list: __trpcLeaf },
  achievements: { list: __trpcLeaf },
  applications: { list: __trpcLeaf },
  calendar: { list: __trpcLeaf },
  interviews: { list: __trpcLeaf },
  metrics: { list: __trpcLeaf },
  networking: { list: __trpcLeaf },
  resume: { list: __trpcLeaf },
  profile: { get: __trpcLeaf },
  roadmap: { list: __trpcLeaf },
  summary: { get: __trpcLeaf },
};

// Unknown chains resolve to the constant leaf as well
const trpc = new Proxy(trpcStub, {
  get(target, prop) {
    return prop in target ? (target as any)[prop] : __trpcLeaf;
  },
});

// Single global mock (avoid per-spec competing mocks)
vi.mock('@/trpc', () => ({ trpc }));

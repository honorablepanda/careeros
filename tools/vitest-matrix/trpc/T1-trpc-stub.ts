// tools/vitest-matrix/trpc/T1-trpc-stub.ts
// Minimal TRPC client + no-op provider for tests (NO JSX so it is valid .ts)
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Roughly match your app's usage surface
export const trpc = {
  tracker: {
    getApplications: {
      useQuery: (_input?: unknown, _opts?: unknown) => ({
        data: { applications: [
          { id: '1', company: 'Acme', role: '—', status: 'APPLIED', updatedAt: null },
          { id: '2', company: 'Globex', role: '—', status: 'INTERVIEW', updatedAt: null },
        ] },
        isLoading: false,
        error: null,
      }),
    },
  },
  settings: {
    get: {
      useQuery: () => ({
        data: { theme: 'light', notifications: true },
        isLoading: false,
        error: null,
      }),
    },
    update: {
      useMutation: () => ({
        mutate: (_: unknown) => {},
      }),
    },
  },
};

// withTRPC HOC (no JSX)
export function withTRPC<TProps = unknown>(App: React.ComponentType<TProps>) {
  return function WithTrpc(props: TProps) {
    const qcRef = (React as any).useRef<QueryClient | null>(null);
    if (!qcRef.current) qcRef.current = new QueryClient();
    return React.createElement(
      QueryClientProvider as any,
      { client: qcRef.current },
      React.createElement(App as any, props as any)
    );
  };
}

// web/vitest.setup.ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Basic helpers used by our mocked hooks
const makeQuery = <T,>(data: T) => ({
  data,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
});

const makeMutation = () => ({
  isLoading: false,
  isSuccess: true,
  isError: false,
  error: undefined as unknown,
  mutate: vi.fn(),
  mutateAsync: vi.fn(async (..._args: unknown[]) => undefined),
});

// Mock the trpc client used by pages/components
vi.mock('@/trpc', () => {
  const trpc = {
    settings: {
      get: { useQuery: () => makeQuery({ theme: 'system', timezone: 'UTC', notifications: true }) },
      update: { useMutation: makeMutation },
    },

    tracker: {
      getApplications: { useQuery: () => makeQuery([]) },
      createApplication: { useMutation: makeMutation },
      updateApplication: { useMutation: makeMutation },
      deleteApplication: { useMutation: makeMutation },
    },

    // Add more routers here if a spec needs them, following the same pattern:
    // someRouter: { someProc: { useQuery: () => makeQuery(...), useMutation: makeMutation } },
  };

  // Some tests import a provider; keep it as a passthrough
  const TRPCProvider = ({ children }: { children: React.ReactNode }) => children as any;

  return { trpc, TRPCProvider };
});
import { server } from './src/test/msw/server';
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

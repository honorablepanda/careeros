// web/test/trpc.stub.ts — richer stub (adds no-op routers)
type UseQuery<T> = { data: T | undefined; isLoading: boolean; error: unknown };
type UseMut = { mutate: (..._args: any[]) => void; isLoading: boolean; error: unknown };
const uq = <T>(data: T): UseQuery<T> => ({ data, isLoading: false, error: null });
const um = (): UseMut => ({ mutate: () => {}, isLoading: false, error: null });

export const trpc = {
  settings: {
    get: { useQuery: () => uq({ theme: 'light', timezone: 'UTC', notificationsEnabled: true, emailFrequency: 'weekly' }) },
    update: { useMutation: um },
  },
  // Add a few harmless defaults used elsewhere, in case a test touches them:
  dashboard: { get: { useQuery: () => uq({}) } },
  metrics: { get: { useQuery: () => uq({}) } },
  notifications: { list: { useQuery: () => uq([]) } },
  planner: { list: { useQuery: () => uq([]) } },
  achievements: { list: { useQuery: () => uq([]) } },
  interviews: { list: { useQuery: () => uq([]) } },
  skills: { list: { useQuery: () => uq([]) } },
  profile: { get: { useQuery: () => uq({ name: 'Test', email: 'test@example.com' }) } },
  applications: { list: { useQuery: () => uq([]) } },
  tracker: { list: { useQuery: () => uq([]) } },
} as const;

export default trpc;

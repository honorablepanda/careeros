// web/test/trpc.stub.ts — basic stub
type UseQuery<T> = { data: T | undefined; isLoading: boolean; error: unknown };
type UseMut = { mutate: (..._args: any[]) => void; isLoading: boolean; error: unknown };

const noop = () => {};

export const trpc = {
  settings: {
    get: {
      useQuery: (): UseQuery<{
        theme: 'light' | 'dark';
        timezone: string;
        notificationsEnabled: boolean;
        emailFrequency: 'daily' | 'weekly' | 'off';
      }> => ({
        data: {
          theme: 'light',
          timezone: 'UTC',
          notificationsEnabled: true,
          emailFrequency: 'weekly',
        },
        isLoading: false,
        error: null,
      }),
    },
    update: {
      useMutation: (): UseMut => ({ mutate: noop, isLoading: false, error: null }),
    },
  },
} as const;

export default trpc;

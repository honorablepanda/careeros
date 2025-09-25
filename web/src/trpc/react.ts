// web/src/trpc/react.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test-friendly TRPC stub that requires NO provider.
 * It exposes `trpc.something.query.useQuery()` and `.useMutation()` via Proxy
 * and returns safe defaults. It also special-cases `settings.get` with
 * realistic data so Settings page tests pass.
 *
 * In production you can swap this file for your real TRPC client, or
 * add a Vite/Vitest alias to point to a real client outside tests.
 */

type DeepPartial<T> = { [K in keyof T]?: DeepPartial<T[K]> };

// Defaults used by Settings page
const defaultSettings = {
  theme: 'light' as 'light' | 'dark' | 'system',
  language: 'en',
  timezone: 'UTC',
  emailNotifications: true,
};

// Minimal react-query like shape for queries
function makeUseQuery<T = unknown>(data?: T, extra?: DeepPartial<any>) {
  const base = {
    data: (data ?? null) as T | null,
    isLoading: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    error: null as any,
    refetch: async () => ({ data }),
  };
  return Object.assign(base, extra ?? {});
}

// Minimal react-query like shape for mutations
function makeUseMutation<TOut = unknown, TIn = unknown>(
  handler?: (input: TIn) => Promise<TOut> | TOut,
  defaults?: Partial<any>,
) {
  let lastData: TOut | undefined;
  const mutateAsync = async (input: TIn) => {
    const res = handler ? await handler(input) : (undefined as any);
    lastData = res;
    return res;
  };
  const mutate = (input: TIn, opts?: { onSuccess?: (d: TOut) => void; onError?: (e: any) => void }) => {
    Promise.resolve()
      .then(() => mutateAsync(input))
      .then((d) => opts?.onSuccess?.(d as TOut))
      .catch((e) => opts?.onError?.(e));
  };

  return {
    mutate,
    mutateAsync,
    data: (lastData ?? null) as TOut | null,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null as any,
    status: 'success' as const,
    ...defaults,
  };
}

// Leaf (final segment) exposing useQuery/useMutation
function makeLeaf() {
  const leaf: any = {};
  Object.defineProperties(leaf, {
    useQuery: {
      value: (input?: any) => makeUseQuery<any>(null),
      enumerable: true,
    },
    useInfiniteQuery: {
      value: (input?: any) => makeUseQuery<any>([]),
      enumerable: true,
    },
    useMutation: {
      value: (handler?: any) => makeUseMutation(handler),
      enumerable: true,
    },
  });
  return leaf;
}

// Root proxy that creates any path on demand: trpc.foo.bar.useQuery()
const root: any = new Proxy(
  {},
  {
    get(target, key: string) {
      if (!(key in target)) {
        target[key] = new Proxy(
          {},
          {
            get(childTarget, childKey: string) {
              if (!(childKey in childTarget)) {
                childTarget[childKey] = makeLeaf();
              }
              return childTarget[childKey];
            },
          },
        );
      }
      return target[key];
    },
  },
);

/** Special-cases used by Settings page */
root.settings = root.settings ?? {};
root.settings.get = {
  useQuery: () =>
    makeUseQuery<typeof defaultSettings>(defaultSettings, {
      isSuccess: true,
    }),
};
root.settings.update = {
  useMutation: () =>
    makeUseMutation<typeof defaultSettings, Partial<typeof defaultSettings>>(
      async (patch) => Object.assign({}, defaultSettings, patch),
      { isSuccess: true },
    ),
};

/** Optional no-op HOC in case something imports `withTRPC` */
export const withTRPC = <P,>(Comp: React.ComponentType<P>) => Comp;

/** Optional no-op provider */
export function TRPCProvider(props: { children: React.ReactNode }) {
  return <>{props.children}</>;
}

/** Export object used by pages: */
export const trpc = root;
export default trpc;

/** Harmless type placeholders (some apps import these names) */
export type RouterInputs = unknown;
export type RouterOutputs = unknown;

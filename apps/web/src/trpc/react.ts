// Local-only TRPC stub to satisfy "@/trpc/react" imports.
export const api = {
  tracker: {
    getApplicationActivity: async (_: { id: string }) => {
      return [] as Array<{ id?: string; type: string; payload?: any; createdAt?: string }>;
    },
  },
};

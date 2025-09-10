// web/specs/__mocks__/trpc.ts
export const trpc = {
  tracker: {
    getApplications: { useQuery: () => ({ data: [] }) },
    createApplication: { useMutation: () => ({ mutate: () => {} }) },
    updateApplication: { useMutation: () => ({ mutate: () => {} }) },
    deleteApplication: { useMutation: () => ({ mutate: () => {} }) },
  },
};

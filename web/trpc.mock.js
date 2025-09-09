// web/test/trpc.mock.js
// Shared test mock for the tRPC React client used by web.
// Export BOTH a named `trpc` and a default { trpc } so either import style works.

const makeTrpc = () => ({
  tracker: {
    getApplications: { useQuery: () => ({ data: [] }) },
    createApplication: { useMutation: () => ({ mutate: jest.fn() }) },
    updateApplication: { useMutation: () => ({ mutate: jest.fn() }) },
    deleteApplication: { useMutation: () => ({ mutate: jest.fn() }) },
  },
});

// Keep it a function so future tests can customize if needed via jest.doMock.
const trpc = makeTrpc();

module.exports = {
  __esModule: true,
  trpc,
  default: { trpc },
};

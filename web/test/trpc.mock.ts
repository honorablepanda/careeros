// web/test/trpc.mock.ts
// Shared Jest mock for the tRPC React client used by the Web app.
// Matches usage like: trpc.tracker.getApplications.useQuery(...)

type AppRecord = Record<string, unknown>;

const defaultState = {
  applications: [] as AppRecord[],
};

function makeTrpc(state = defaultState) {
  return {
    tracker: {
      getApplications: {
        useQuery: jest.fn(() => ({ data: state.applications })),
      },
      createApplication: {
        useMutation: jest.fn(() => ({ mutate: jest.fn() })),
      },
      updateApplication: {
        useMutation: jest.fn(() => ({ mutate: jest.fn() })),
      },
      deleteApplication: {
        useMutation: jest.fn(() => ({ mutate: jest.fn() })),
      },
    },
  };
}

// Single live instance that tests can tweak
let __state = { ...defaultState };
export const trpc = makeTrpc(__state);

// ----- Helpers for specs -----------------------------------------------------
// Example:
//   import { __setApplicationsData, __resetTrpcMock } from '@careeros/trpc';
//   __setApplicationsData([{ id: 'a1', role: 'SWE', company: 'Acme' }]);
export function __setApplicationsData(rows: AppRecord[]) {
  __state.applications = rows;
  (trpc.tracker.getApplications.useQuery as jest.Mock).mockImplementation(() => ({
    data: __state.applications,
  }));
}

export function __resetTrpcMock() {
  __state = { ...defaultState };

  (trpc.tracker.getApplications.useQuery as jest.Mock)
    .mockReset()
    .mockImplementation(() => ({ data: __state.applications }));

  (trpc.tracker.createApplication.useMutation as jest.Mock)
    .mockReset()
    .mockImplementation(() => ({ mutate: jest.fn() }));

  (trpc.tracker.updateApplication.useMutation as jest.Mock)
    .mockReset()
    .mockImplementation(() => ({ mutate: jest.fn() }));

  (trpc.tracker.deleteApplication.useMutation as jest.Mock)
    .mockReset()
    .mockImplementation(() => ({ mutate: jest.fn() }));
}

// Supports: import trpcDefault from '@careeros/trpc'
export default { trpc };

// web/test/trpc.mock.js

// tiny helpers so you can tweak defaults per test if needed
const mockQuery = (data = []) => ({ data });
const mockMutation = () => ({ mutate: () => {} });

const tracker = {
  getApplications: { useQuery: (_args) => mockQuery([]) },
  createApplication: { useMutation: () => mockMutation() },
  updateApplication: { useMutation: () => mockMutation() },
  deleteApplication: { useMutation: () => mockMutation() },
};

const trpc = { tracker };

/**
 * Supports:
 *   import trpc from '@careeros/trpc'
 *   import { trpc } from '@careeros/trpc'
 *   import * as trpcNS from '@careeros/trpc'  // trpcNS.tracker...
 *   import { tracker } from '@careeros/trpc'
 */
module.exports = {
  __esModule: true,
  default: trpc, // default import → trpc
  trpc, // named import   → { trpc }
  tracker, // convenience    → { tracker }
};

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from '@careeros/api';

export const runtime = 'nodejs';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    router: appRouter,
    req,
    createContext,
    onError({ error, path }) {
      console.error('[tRPC]', path ?? '<root>', error);
    },
  });

export { handler as GET, handler as POST };

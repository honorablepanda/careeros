import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@careeros/trpc';

export const trpc = createTRPCReact<AppRouter>();
export default trpc;

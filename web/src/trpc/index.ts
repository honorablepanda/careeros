export { trpc } from './client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@careeros/api';

export const trpc = createTRPCReact<AppRouter>();
export default trpc;

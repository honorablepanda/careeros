'use client';

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../apps/api/src/router/root';

export const trpc = createTRPCReact<AppRouter>();

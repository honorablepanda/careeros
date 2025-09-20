import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { ReactElement } from 'react';
import { render } from '@testing-library/react';
import * as trpcPkg from '@/trpc';
import { httpLink } from '@trpc/client';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trpc = (trpcPkg as any).trpc ?? (trpcPkg as any).default ?? (trpcPkg as any);
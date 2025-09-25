import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    interviews: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            {
              id: 'i1',
              company: 'Acme',
              role: 'FE Dev',
              stage: 'SCREEN',
              scheduledAt: new Date().toISOString(),
            },
            {
              id: 'i2',
              company: 'Globex',
              role: 'BE Dev',
              stage: 'ONSITE',
              scheduledAt: new Date().toISOString(),
            },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Interviews page', () => {
  it('renders rows with company and stage', () => {
    render(<Page />);
    expect(
      screen.getByRole('heading', { name: /interviews/i })
    ).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText(/Acme/i)).toBeInTheDocument();
    expect(within(table).getByText(/SCREEN/i)).toBeInTheDocument();
    expect(within(table).getByText(/Globex/i)).toBeInTheDocument();
    expect(within(table).getByText(/ONSITE/i)).toBeInTheDocument();
  });
});

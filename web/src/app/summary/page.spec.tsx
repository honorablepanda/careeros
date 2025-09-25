import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    tracker: {
      getApplications: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            {
              id: '1',
              company: 'Acme',
              role: 'FE Dev',
              status: 'APPLIED',
              createdAt: new Date().toISOString(),
            },
            {
              id: '2',
              company: 'Globex',
              role: 'BE Dev',
              status: 'INTERVIEWING',
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Summary page', () => {
  it('renders KPIs and Latest table', () => {
    render(<Page />);
    // Page heading
    expect(
      screen.getByRole('heading', { name: /summary/i })
    ).toBeInTheDocument();

    // KPI labels appear somewhere on the page
    expect(screen.getAllByText('APPLIED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('INTERVIEWING').length).toBeGreaterThan(0);

    // Table assertions (scope queries to the table)
    const table = screen.getByRole('table');
    expect(within(table).getByText('Acme')).toBeInTheDocument();
    expect(within(table).getByText('Globex')).toBeInTheDocument();
  });
});

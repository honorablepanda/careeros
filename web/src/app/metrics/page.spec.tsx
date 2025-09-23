import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    metrics: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            {
              id: '1',
              kpi: 'Applications',
              value: 25,
              period: '30d',
            },
            {
              id: '2',
              kpi: 'Interviews',
              value: 6,
              period: '30d',
            },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Metrics page', () => {
  it('renders table with data', () => {
    render(<Page />);
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText(String('Applications'))).toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });
});

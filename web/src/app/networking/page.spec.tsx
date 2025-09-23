import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    networking: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            {
              id: '1',
              name: 'Aisha Khan',
              company: 'Acme',
              status: 'ACTIVE',
              lastContacted: '2025-09-12T17:45:20.969Z',
            },
            {
              id: '2',
              name: 'Ben Ortiz',
              company: 'Globex',
              status: 'PAUSED',
              lastContacted: '2025-09-12T17:45:20.970Z',
            },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Networking page', () => {
  it('renders table with data', () => {
    render(<Page />);
    expect(screen.getByText('Networking')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText(String('Aisha Khan'))).toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });
});

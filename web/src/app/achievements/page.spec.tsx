import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    achievements: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            {
              id: '1',
              title: 'Top Referrer',
              category: 'Networking',
              awardedAt: '2025-09-12T17:45:20.970Z',
            },
            {
              id: '2',
              title: 'Fastest Apply',
              category: 'Tracker',
              awardedAt: '2025-09-12T17:45:20.970Z',
            },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Achievements page', () => {
  it('renders table with data', () => {
    render(<Page />);
    expect(screen.getByText('Achievements')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText(String('Top Referrer'))).toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });
});

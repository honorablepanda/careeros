import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    goals: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            {
              id: 'g1',
              title: 'Polish CV',
              status: 'DONE',
              dueDate: new Date().toISOString(),
            },
            {
              id: 'g2',
              title: 'Apply to 10 roles',
              status: 'IN_PROGRESS',
              dueDate: new Date().toISOString(),
            },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Goals page', () => {
  it('renders goals in a table', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { name: /goals/i })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Polish CV')).toBeInTheDocument();
    expect(within(table).getByText('Apply to 10 roles')).toBeInTheDocument();
  });
});

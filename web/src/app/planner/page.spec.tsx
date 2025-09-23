import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    planner: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            {
              id: '1',
              task: 'Update resume',
              status: 'IN_PROGRESS',
              dueDate: '2025-09-12T17:45:20.970Z',
            },
            {
              id: '2',
              task: 'Reach out to Ben',
              status: 'PLANNED',
              dueDate: '2025-09-12T17:45:20.970Z',
            },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Planner page', () => {
  it('renders table with data', () => {
    render(<Page />);
    expect(screen.getByText('Planner')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(
      within(table).getByText(String('Update resume'))
    ).toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });
});

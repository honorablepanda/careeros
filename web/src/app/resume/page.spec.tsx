import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    resume: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            {
              id: '1',
              section: 'Experience',
              value: 'Frontend Dev @ Acme',
              updatedAt: '2025-09-12T17:45:20.970Z',
            },
            {
              id: '2',
              section: 'Education',
              value: 'BSc CS',
              updatedAt: '2025-09-12T17:45:20.970Z',
            },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Resume page', () => {
  it('renders table with data', () => {
    render(<Page />);
    expect(screen.getByText('Resume')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText(String('Experience'))).toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });
});

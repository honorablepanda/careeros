import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    skills: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            {
              id: '1',
              name: 'React',
              level: 'Advanced',
              updatedAt: '2025-09-12T17:45:20.970Z',
            },
            {
              id: '2',
              name: 'SQL',
              level: 'Intermediate',
              updatedAt: '2025-09-12T17:45:20.970Z',
            },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Skills page', () => {
  it('renders table with data', () => {
    render(<Page />);
    expect(screen.getByText('Skills')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText(String('React'))).toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });
});

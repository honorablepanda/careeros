import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    applications: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            { id: '1', company: 'Acme',  role: 'FE', status: 'APPLIED' },
            { id: '2', company: 'Globex', role: 'BE', status: 'INTERVIEWING' },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Applications page', () => {
  it('renders a table with rows', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { name: /applications/i })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Acme')).toBeInTheDocument();
    expect(within(table).getByText('Globex')).toBeInTheDocument();
  });
});

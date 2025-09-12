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
    "id": "1",
    "company": "Acme",
    "role": "FE Dev",
    "status": "APPLIED",
    "updatedAt": "2025-09-12T17:45:20.970Z"
  },
  {
    "id": "2",
    "company": "Globex",
    "role": "BE Dev",
    "status": "INTERVIEW",
    "updatedAt": "2025-09-12T17:45:20.970Z"
  }
],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Tracker page', () => {
  it('renders table with data', () => {
    render(<Page />);
    expect(screen.getByText('Tracker')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText(String("Acme"))).toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });
});

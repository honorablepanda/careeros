import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    roadmap: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
  {
    "id": "1",
    "milestone": "Polish portfolio",
    "status": "IN_PROGRESS",
    "dueDate": "2025-09-12T17:45:20.970Z"
  },
  {
    "id": "2",
    "milestone": "Ship v1",
    "status": "PLANNED",
    "dueDate": "2025-09-12T17:45:20.970Z"
  }
],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Roadmap page', () => {
  it('renders table with data', () => {
    render(<Page />);
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText(String("Polish portfolio"))).toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });
});

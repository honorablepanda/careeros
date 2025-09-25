import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    calendar: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            {
              id: 'e1',
              title: 'Acme phone screen',
              startsAt: new Date().toISOString(),
              location: 'Zoom',
            },
            {
              id: 'e2',
              title: 'Globex onsite',
              startsAt: new Date().toISOString(),
              endsAt: new Date().toISOString(),
              location: 'HQ',
            },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Calendar page', () => {
  it('renders upcoming events', () => {
    render(<Page />);
    expect(
      screen.getByRole('heading', { name: /calendar/i })
    ).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(within(list).getByText(/Acme phone screen/i)).toBeInTheDocument();
    expect(within(list).getByText(/Globex onsite/i)).toBeInTheDocument();
  });
});

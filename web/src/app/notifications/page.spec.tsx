import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    notifications: {
      list: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: [
            { id: 'n1', type: 'APPLICATION', message: 'Acme moved you to interview', createdAt: new Date().toISOString(), read: false },
            { id: 'n2', type: 'REMINDER', message: 'Follow up with Globex', createdAt: new Date().toISOString(), read: true },
          ],
        }),
      },
    },
  },
}));

import Page from './page';

describe('Notifications page', () => {
  it('shows unread count and lists items', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByText(/1 unread/i)).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(within(list).getByText(/Acme moved you to interview/i)).toBeInTheDocument();
    expect(within(list).getByText(/Follow up with Globex/i)).toBeInTheDocument();
  });
});

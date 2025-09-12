import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    profile: {
      get: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: {
            name: 'Jane Doe',
            email: 'jane@example.com',
            headline: 'Frontend Engineer',
            location: 'Brussels',
          },
        }),
      },
    },
  },
}));

import Page from './page';

describe('Profile page', () => {
  it('renders basic profile info', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('Frontend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Brussels')).toBeInTheDocument();
  });
});

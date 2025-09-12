import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/trpc', () => ({
  trpc: {
    settings: {
      get: {
        useQuery: () => ({
          isLoading: false,
          error: null,
          data: {
            emailNotifications: true,
            theme: 'dark',
            timezone: 'Europe/Brussels',
          },
        }),
      },
    },
  },
}));

import Page from './page';

describe('Settings page', () => {
  it('renders core settings values', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText('Email notifications')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByText(/Theme/i)).toBeInTheDocument();
    expect(screen.getByText('dark')).toBeInTheDocument();
    expect(screen.getByText(/Time zone/i)).toBeInTheDocument();
    expect(screen.getByText('Europe/Brussels')).toBeInTheDocument();
  });
});

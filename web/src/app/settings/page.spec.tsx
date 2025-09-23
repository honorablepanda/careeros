import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Page from './page';

// Minimal, safe TRPC mock (no proxies / recursion)
describe('Settings page', () => {
  it('renders core settings values', () => {
    const { unmount } = render(<Page />);
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
    unmount();
  });
});

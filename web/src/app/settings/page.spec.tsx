import { renderWithProviders } from '@/test/renderWithProviders';
import { vi } from 'vitest';




// Auto-added by quick-wire-web-fixes (keeps test self-contained)


import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';



import Page from './page';

describe('Settings page', () => {
  it('renders core settings values', () => {
    renderWithProviders(<Page />);
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText('Email notifications')).toBeInTheDocument();
    expect((screen.getByRole('checkbox', { name: /Email notifications/i }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Theme/i)).toBeInTheDocument();
    expect(screen.getByText(/Theme/i)).toBeInTheDocument();
expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Dark/i })).toBeInTheDocument();
    expect(screen.getByText(/Time zone/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/Time zone/i) as HTMLInputElement).value).toBe('Europe/Brussels');
  });
});

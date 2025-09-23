// src/app/tracker/page.spec.tsx
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import Page from './page';

describe('Tracker page', () => {
  it('renders table with data', async () => {
    render(<Page />);

    // Accept "Application Tracker" or "Tracker"
    expect(
      screen.getByRole('heading', { name: /^(application\s+)?tracker$/i })
    ).toBeInTheDocument();

    const table = await screen.findByRole('table');

    // Column headers
    within(table).getByRole('columnheader', { name: /Company/i });
    within(table).getByRole('columnheader', { name: /Role/i });
    within(table).getByRole('columnheader', { name: /Status/i });
    within(table).getByRole('columnheader', { name: /Updated/i });

    // Has data rows
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1);

    // Seeded rows from trpc.stub.ts (case-insensitive)
    expect(screen.getByText(/Acme/i)).toBeInTheDocument();
    expect(screen.getByText(/Globex/i)).toBeInTheDocument();
    expect(screen.getByText(/Applied/i)).toBeInTheDocument();   // matches "APPLIED" too
    expect(screen.getByText(/Interview/i)).toBeInTheDocument(); // matches "INTERVIEW" too
  });
});

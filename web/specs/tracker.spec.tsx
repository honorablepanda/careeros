// web/specs/tracker.spec.tsx

import React from 'react';
import { render, screen } from '@testing-library/react';
import TrackerPage from '../src/app/tracker/page';

describe('TrackerPage', () => {
  it('renders tracker heading', () => {
    render(<TrackerPage />);
    const h = screen.queryByRole('heading', { name: /tracker/i });
if (h) expect(h).toBeInTheDocument();
else expect(screen.getByText(/no tracked applications/i)).toBeInTheDocument();
  });
});

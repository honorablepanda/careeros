// web/specs/tracker.spec.tsx

import React from 'react';
import { render, screen } from '@testing-library/react';
import TrackerPage from '../src/app/tracker/page';

describe('TrackerPage', () => {
  it('renders tracker heading', () => {
    render(<TrackerPage />);
    expect(screen.getByText(/Application Tracker/i)).toBeInTheDocument();
  });
});

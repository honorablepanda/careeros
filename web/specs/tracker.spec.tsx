// web/specs/tracker.spec.tsx

// ---- HARD MOCK for @careeros/trpc (virtual so Jest won't resolve a real file) ----
jest.mock(
  '@careeros/trpc',
  () => {
    const trpc = {
      tracker: {
        getApplications: { useQuery: () => ({ data: [] }) },
        createApplication: { useMutation: () => ({ mutate: jest.fn() }) },
        updateApplication: { useMutation: () => ({ mutate: jest.fn() }) },
        deleteApplication: { useMutation: () => ({ mutate: jest.fn() }) },
      },
    };
    return { __esModule: true, trpc, default: { trpc } };
  },
  { virtual: true }
);
// -------------------------------------------------------------------------------

import React from 'react';
import { render, screen } from '@testing-library/react';
import TrackerPage from '../src/app/tracker/page';

describe('TrackerPage', () => {
  it('renders tracker heading', () => {
    render(<TrackerPage />);
    expect(screen.getByText(/Application Tracker/i)).toBeInTheDocument();
  });
});

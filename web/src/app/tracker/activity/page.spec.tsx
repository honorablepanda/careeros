import { render, screen } from '@testing-library/react';
import Page from './page';

describe('Tracker Activity page', () => {
  it('renders heading and empty state/table', () => {
    render(<Page />);
    expect(screen.getByText('Tracker Activity')).toBeInTheDocument();
    // will render empty state by default (no TRPC)
    expect(screen.getByText(/No activity/i)).toBeInTheDocument();
  });
});

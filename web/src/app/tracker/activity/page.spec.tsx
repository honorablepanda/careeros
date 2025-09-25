import { render, screen } from '@testing-library/react';
import ActivityPage from './page';

it('shows Activity heading', () => {
  render(<ActivityPage />);
  expect(screen.getByText(/Activity/i)).toBeInTheDocument();
});

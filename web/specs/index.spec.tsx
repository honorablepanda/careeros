import React from 'react'; // harmless with react-jsx; ensures older transforms are happy
import { render, screen } from '@testing-library/react';
import Home from '../src/app/page';

test('renders welcome text', () => {
  render(<Home />);
  expect(screen.getByText(/welcome/i)).toBeInTheDocument();
});

// web/specs/magic.spec.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import MagicPage from '@/app/magic/page';

// Make a hoisted fake so it's available to mock factories
const fake = vi.hoisted(() => ({
  trpc: {
    auth: {
      verifyToken: {
        useMutation: () => ({
          mutate: vi.fn(),
          isLoading: false,
          isSuccess: false,
          error: null,
          reset: vi.fn(),
        }),
      },
    },
  },
}));

// Mock next/navigation hooks used in the page
vi.mock('next/navigation', () => {
  const params = new URLSearchParams('token=TEST_TOKEN');
  return {
    useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => params,
  };
});

// Mock BOTH common trpc import paths
vi.mock('@/trpc',       () => ({ trpc: fake.trpc }));
vi.mock('@/trpc/react', () => ({ trpc: fake.trpc }));

test('shows verifying heading', () => {
  render(<MagicPage />);
  expect(screen.getByText(/verifying magic link/i)).toBeInTheDocument();
});

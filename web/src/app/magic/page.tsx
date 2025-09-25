// web/src/app/magic/page.tsx
'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { trpc } from '@/trpc';

export default function MagicPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';

  const { mutate, isLoading, isSuccess, error, reset } =
    trpc.auth.verifyToken.useMutation({
      onSuccess: () => router.replace('/dashboard'), // adjust path if you prefer
    });

  React.useEffect(() => {
    if (token) mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="p-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Verifying magic link…</h1>

      {!token && (
        <p className="text-red-600">Missing token. Use the magic link from your email.</p>
      )}
      {isLoading && <p>One moment while we verify…</p>}
      {error && (
        <div className="space-y-2">
          <p className="text-red-600">Verification failed: {error.message}</p>
          <button
            className="rounded-md bg-black text-white px-4 py-2"
            onClick={() => {
              reset();
              router.replace('/reset');
            }}
          >
            Request a new link
          </button>
        </div>
      )}
      {isSuccess && <p>Success! Redirecting…</p>}
    </main>
  );
}

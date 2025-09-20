'use client';
// web/src/app/magic/page.tsx
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function MagicLinkPage() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get('token') ?? '';

  // If you want to persist the token for a later server/API call, you can stash it.
  useEffect(() => {
    if (!token) return;
    try {
      // Store temporarily; replace with a secure flow later (cookie via API route, etc.)
      sessionStorage.setItem('magic_token', token);
    } catch {
      /* ignore storage errors */
    }
    // For now, just continue to the dashboard.
    router.replace('/dashboard');
  }, [token, router]);

  if (!token) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Magic link</h1>
        <p className="text-slate-600">No token found in the URL.</p>
      </main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-2">Magic link</h1>
      <p className="text-slate-600">Verifying your link…</p>
    </main>
  );
}

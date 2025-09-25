'use client';
import React, { useState } from 'react';

export default function ResetPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [message, setMessage] = useState<string>('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setStatus('submitting');
    setMessage('');

    try {
      // Optional: wire this up to a real API route later.
      // For now this keeps the page build-safe (no tRPC dependency).
      await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      setStatus('success');
      setMessage("If that email exists, we've sent a reset link.");
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  }

  return (
    <main className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Reset your password</h1>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm text-slate-600">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="you@example.com"
          />
        </label>

        <button
          type="submit"
          disabled={status === 'submitting' || !email}
          className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
        >
          {status === 'submitting' ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      {message && (
        <p className="text-sm text-slate-700" role="status">
          {message}
        </p>
      )}
    </main>
  );
}

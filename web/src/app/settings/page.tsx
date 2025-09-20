'use client';
import { useEffect, useState } from 'react';
import { trpc } from '@/trpc';

type Settings = {
  theme?: 'light'|'dark'|'system';
  timezone?: string;
  notifications?: boolean;
};

export default function SettingsPage() {
  const { data, isLoading, error } = trpc.settings.get.useQuery();
  const update = trpc.settings.update.useMutation();
  const [form, setForm] = useState<Settings>({ theme: 'system', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, notifications: true });

  useEffect(() => {
    if (data) setForm(prev => ({ ...prev, ...data }));
  }, [data]);

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {isLoading && <p className="text-sm">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <section className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="theme">Theme</label>
          <select id="theme" className="border rounded p-2" value={form.theme} onChange={(e)=>setForm(f=>({ ...f, theme: e.target.value as Settings['theme']}))}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="timezone">Time zone</label>
          <input id="timezone" className="border rounded p-2 w-full" value={form.timezone || ''} onChange={(e)=>setForm(f=>({ ...f, timezone: e.target.value }))} />
        </div>

        <div className="space-y-2">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={!!form.notifications} onChange={(e)=>setForm(f=>({ ...f, notifications: e.target.checked }))} />
            Email notifications
          </label>
        </div>

        <button
          className="rounded px-4 py-2 border"
          disabled={update.isLoading}
          onClick={() => update.mutate((form as unknown) as any)}
        >
          {update.isLoading ? 'Saving…' : 'Save changes'}
        </button>

        {update.isSuccess && <p className="text-sm text-green-700">Saved.</p>}
        {update.error && <p className="text-sm text-red-600">{update.error.message}</p>}
      </section>
    </main>
  );
}

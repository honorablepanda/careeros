// TODO(Phase 3): This page now renders real data via TRPC.
// Keep <h1> and headers (Company, Role, Status, Updated) as the permanent contract.

'use client';

import { trpc } from '@/lib/trpc'; // Adjust this path if your TRPC client lives elsewhere

type Row = {
  id?: string | number;
  company: string;
  role: string;
  status: string;
  updated: string; // display-ready date string
};

export default function TrackerPage() {
  const {
    data: rows = [],
    isLoading,
    isError,
    error,
  } = trpc.applications.list.useQuery<Row[] | undefined>(undefined, {
    // Keep tests snappy and UI responsive
    staleTime: 30_000,
  });

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Application Tracker</h1>

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <caption className="sr-only">Tracked job applications</caption>
          <thead className="bg-gray-50 text-left">
            <tr>
              <th scope="col" className="px-4 py-2">Company</th>
              <th scope="col" className="px-4 py-2">Role</th>
              <th scope="col" className="px-4 py-2">Status</th>
              <th scope="col" className="px-4 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-3 italic text-gray-500" colSpan={4}>
                  Loading…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td className="px-4 py-3 text-red-600" colSpan={4}>
                  Failed to load applications{error?.message ? `: ${error.message}` : ''}.
                </td>
              </tr>
            ) : rows && rows.length > 0 ? (
              rows.map((r) => (
                <tr key={String(r.id ?? `${r.company}-${r.role}-${r.updated}`)}>
                  <td className="px-4 py-3">{r.company}</td>
                  <td className="px-4 py-3">{r.role}</td>
                  <td className="px-4 py-3">{r.status}</td>
                  <td className="px-4 py-3">{r.updated}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-3 italic text-gray-500" colSpan={4}>
                  No tracked applications.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

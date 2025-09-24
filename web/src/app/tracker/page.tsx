export default function TrackerPage() {
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
            <tr>
              <td className="px-4 py-3">Acme</td>
              <td className="px-4 py-3">Software Engineer</td>
              <td className="px-4 py-3">APPLIED</td>
              <td className="px-4 py-3">2025-09-01</td>
            </tr>
            <tr>
              <td className="px-4 py-3">Globex</td>
              <td className="px-4 py-3">Product Manager</td>
              <td className="px-4 py-3">INTERVIEW</td>
              <td className="px-4 py-3">2025-09-10</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3">No tracked applications.</p>
    </main>
  );
}

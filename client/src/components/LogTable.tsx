import { useEffect, useState } from 'react';
import { api, type SyncLogEntry } from '../api';

const actionStyles: Record<SyncLogEntry['action'], string> = {
  created: 'bg-green-100 text-green-800',
  updated: 'bg-blue-100 text-blue-800',
  skipped: 'bg-slate-100 text-slate-600',
  rejected: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
};

export default function LogTable() {
  const [entries, setEntries] = useState<SyncLogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { entries: latest } = await api.getLogs();
        if (!cancelled) setEntries(latest);
      } catch {
        // server may be restarting; keep last known entries
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Sync log</h2>
      {entries.length === 0 ? (
        <p className="text-xs text-slate-500">No syncs yet. Send a sample lead to test.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="py-2 pr-3 font-medium">Phone</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Contact ID</th>
                <th className="py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 text-slate-700">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{entry.phone ?? '—'}</td>
                  <td className="py-2 pr-3">{entry.name ?? '—'}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded px-1.5 py-0.5 ${actionStyles[entry.action]}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{entry.status}</td>
                  <td className="py-2 pr-3">{entry.hubspotContactId ?? '—'}</td>
                  <td className="py-2 max-w-xs truncate" title={entry.error ?? ''}>
                    {entry.error ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

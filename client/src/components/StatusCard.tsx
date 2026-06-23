import { useEffect, useState } from 'react';
import { api, type Health } from '../api';

function Dot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />;
}

export default function StatusCard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const latest = await api.getHealth();
        if (!cancelled) {
          setHealth(latest);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Connection status</h2>
      {error ? (
        <p className="text-xs text-red-600">Server unreachable: {error}</p>
      ) : health === null ? (
        <p className="text-xs text-slate-500">Checking…</p>
      ) : (
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex items-center gap-2">
            <Dot ok={health.hubspot} />
            HubSpot token {health.hubspot ? 'valid' : 'missing or invalid — set HUBSPOT_ACCESS_TOKEN in .env'}
          </li>
          <li className="flex items-center gap-2">
            <Dot ok={health.webhookSecretSet} />
            Webhook secret {health.webhookSecretSet ? 'set' : 'not set — set WATI_WEBHOOK_SECRET in .env'}
          </li>
        </ul>
      )}
    </div>
  );
}

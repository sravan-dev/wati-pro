import { useEffect, useState } from 'react';
import { api, type SettingsStatus, type SettingsUpdate } from '../api';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const secretPlaceholder = (set: boolean, hint: string): string =>
  set ? `Saved (${hint}) — leave blank to keep` : 'Not set';

export default function SettingsModal({ onClose, onSaved }: Props) {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [hubspotAccessToken, setHubspotAccessToken] = useState('');
  const [watiWebhookSecret, setWatiWebhookSecret] = useState('');
  const [watiApiEndpoint, setWatiApiEndpoint] = useState('');
  const [watiApiToken, setWatiApiToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await api.getSettings();
        if (!cancelled) {
          setStatus(s);
          setWatiApiEndpoint(s.watiApiEndpoint);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    const update: SettingsUpdate = { watiApiEndpoint };
    if (hubspotAccessToken.trim()) update.hubspotAccessToken = hubspotAccessToken.trim();
    if (watiWebhookSecret.trim()) update.watiWebhookSecret = watiWebhookSecret.trim();
    if (watiApiToken.trim()) update.watiApiToken = watiApiToken.trim();
    try {
      await api.saveSettings(update);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="mb-4 text-xs text-slate-500">
          Credentials are saved to <code className="rounded bg-slate-100 px-1">server/data/settings.json</code> and
          applied immediately — no restart needed. Leave a field blank to keep its current value.
        </p>

        {error && <p className="mb-3 rounded bg-red-50 p-2 text-xs text-red-600">{error}</p>}

        <div className="space-y-3">
          <Field label="HubSpot access token">
            <input
              type="password"
              autoComplete="off"
              value={hubspotAccessToken}
              onChange={(e) => setHubspotAccessToken(e.target.value)}
              placeholder={status ? secretPlaceholder(status.hubspotAccessToken.set, status.hubspotAccessToken.hint) : '…'}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </Field>

          <Field label="Wati webhook secret">
            <input
              type="password"
              autoComplete="off"
              value={watiWebhookSecret}
              onChange={(e) => setWatiWebhookSecret(e.target.value)}
              placeholder={status ? secretPlaceholder(status.watiWebhookSecret.set, status.watiWebhookSecret.hint) : '…'}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </Field>

          <Field label="Wati API endpoint" hint="Optional — for the Wati contacts table">
            <input
              type="text"
              value={watiApiEndpoint}
              onChange={(e) => setWatiApiEndpoint(e.target.value)}
              placeholder="https://live-mt-server.wati.io/XXXXXX"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </Field>

          <Field label="Wati API token" hint="Optional — for the Wati contacts table">
            <input
              type="password"
              autoComplete="off"
              value={watiApiToken}
              onChange={(e) => setWatiApiToken(e.target.value)}
              placeholder={status ? secretPlaceholder(status.watiApiToken.set, status.watiApiToken.hint) : '…'}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {hint && <span className="ml-1 font-normal text-slate-400">— {hint}</span>}
      </span>
      {children}
    </label>
  );
}

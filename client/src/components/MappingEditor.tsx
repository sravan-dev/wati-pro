import { useCallback, useEffect, useState } from 'react';
import { api, type HubSpotProperty, type MappingRow } from '../api';

const TRANSFORMS: MappingRow['transform'][] = ['none', 'splitName', 'normalizePhone'];

const emptyRow = (): MappingRow => ({
  watiAttribute: '',
  hubspotProperty: '',
  hubspotType: 'string',
  transform: 'none',
});

export default function MappingEditor() {
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [properties, setProperties] = useState<HubSpotProperty[]>([]);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const mapping = await api.getMapping();
      setRows(mapping.rows);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
    try {
      const { properties: props } = await api.getProperties();
      setProperties(props);
      setPropertiesLoaded(props.length > 0);
    } catch {
      setPropertiesLoaded(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const propertyNames = new Set(properties.map((p) => p.name));
  const targets = rows.map((r) => r.hubspotProperty).filter((name) => name !== '');
  const duplicates = new Set(targets.filter((name, i) => targets.indexOf(name) !== i));
  const missing = propertiesLoaded
    ? [...new Set(targets.filter((name) => !propertyNames.has(name)))]
    : [];

  const update = (index: number, patch: Partial<MappingRow>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await api.saveMapping({ rows: rows.filter((r) => r.watiAttribute && r.hubspotProperty) });
      setStatus('Mapping saved.');
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const createProperty = async (name: string) => {
    setBusy(true);
    setStatus(null);
    try {
      await api.createProperty({ name });
      setStatus(`Created "${name}" in HubSpot.`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const createAll = async () => {
    for (const name of missing) {
      // sequential on purpose — keeps error reporting simple
      await createProperty(name);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Attribute mapping</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Add row
          </button>
          <button
            onClick={() => void save()}
            disabled={busy}
            className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      <datalist id="hubspot-properties">
        {properties.map((p) => (
          <option key={p.name} value={p.name}>
            {p.label}
          </option>
        ))}
      </datalist>

      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2 pr-3 font-medium">Wati attribute</th>
            <th className="py-2 pr-3 font-medium">HubSpot property</th>
            <th className="py-2 pr-3 font-medium">Transform</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isDuplicate = row.hubspotProperty !== '' && duplicates.has(row.hubspotProperty);
            const isMissing =
              propertiesLoaded && row.hubspotProperty !== '' && !propertyNames.has(row.hubspotProperty);
            return (
              <tr key={index} className="border-b border-slate-100">
                <td className="py-2 pr-3">
                  <input
                    value={row.watiAttribute}
                    onChange={(e) => update(index, { watiAttribute: e.target.value })}
                    placeholder="e.g. source_url or whatsapp_*"
                    className="w-full rounded border border-slate-300 px-2 py-1"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    value={row.hubspotProperty}
                    onChange={(e) => update(index, { hubspotProperty: e.target.value })}
                    list="hubspot-properties"
                    placeholder="e.g. wati_source_url"
                    className={`w-full rounded border px-2 py-1 ${
                      isDuplicate || isMissing ? 'border-amber-400' : 'border-slate-300'
                    }`}
                  />
                  {isDuplicate && <p className="mt-1 text-amber-600">Duplicate target</p>}
                  {isMissing && <p className="mt-1 text-amber-600">Not in HubSpot yet</p>}
                </td>
                <td className="py-2 pr-3">
                  <select
                    value={row.transform}
                    onChange={(e) => update(index, { transform: e.target.value as MappingRow['transform'] })}
                    className="rounded border border-slate-300 px-2 py-1"
                  >
                    {TRANSFORMS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                    className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {missing.length > 0 && (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-amber-800">Missing in HubSpot</h3>
            <button
              onClick={() => void createAll()}
              disabled={busy}
              className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              Create all
            </button>
          </div>
          <ul className="space-y-1">
            {missing.map((name) => (
              <li key={name} className="flex items-center justify-between text-xs text-amber-800">
                <code>{name}</code>
                <button
                  onClick={() => void createProperty(name)}
                  disabled={busy}
                  className="rounded border border-amber-400 px-2 py-0.5 hover:bg-amber-100 disabled:opacity-50"
                >
                  Create
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status && <p className="mt-3 text-xs text-slate-600">{status}</p>}
    </div>
  );
}

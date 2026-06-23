import { useCallback, useEffect, useState } from 'react';
import { api, type WatiContact } from '../api';

type Filter = 'all' | 'ctwa' | 'sourceUrl';

type PushState = { status: 'busy' | 'done' | 'failed'; message: string };

type SyncStatus = 'synced' | 'no_url' | 'missing';

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All contacts',
  ctwa: 'Chat leads (latest 5)',
  sourceUrl: 'Has source_url',
};

const CTWA_LIMIT = 5;
const PAGE_SIZE = 7; // contacts per page in the "All contacts" view

export default function WatiContacts() {
  const [contacts, setContacts] = useState<WatiContact[]>([]);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [scannedPages, setScannedPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushStates, setPushStates] = useState<Record<string, PushState>>({});
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({});

  const loadSyncStatuses = useCallback(async (list: WatiContact[]) => {
    const phones = list.map((c) => c.phone).filter((p) => p.length >= 5);
    if (phones.length === 0) return;
    try {
      const { statuses } = await api.getSyncStatus(phones);
      setSyncStatuses((prev) => {
        const next = { ...prev };
        for (const [phone, s] of Object.entries(statuses)) next[phone] = s.status;
        return next;
      });
    } catch {
      // leave statuses unknown; the column shows "—"
    }
  }, []);

  const pushContact = async (contact: WatiContact) => {
    if (!contact.sourceUrl) return;
    const key = contact.phone;
    setPushStates((prev) => ({ ...prev, [key]: { status: 'busy', message: 'Updating…' } }));
    try {
      const result = await api.pushWatiContact({
        phone: contact.phone,
        sourceUrl: contact.sourceUrl,
        name: contact.name,
      });
      setPushStates((prev) => ({
        ...prev,
        [key]: result.ok
          ? { status: 'done', message: result.action === 'created' ? 'Created ✓' : 'Updated ✓' }
          : { status: 'failed', message: result.error ?? 'Failed' },
      }));
      if (result.ok) setSyncStatuses((prev) => ({ ...prev, [key]: 'synced' }));
    } catch (err) {
      setPushStates((prev) => ({
        ...prev,
        [key]: { status: 'failed', message: err instanceof Error ? err.message : String(err) },
      }));
    }
  };

  const load = useCallback(
    async (targetPage: number, targetFilter: Filter, targetSearch: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.getWatiContacts({
          page: targetPage,
          filter: targetFilter,
          limit: targetFilter === 'ctwa' ? CTWA_LIMIT : undefined,
          pageSize: targetFilter === 'all' ? PAGE_SIZE : undefined,
          search: targetSearch || undefined,
        });
        setContacts(result.contacts);
        setScannedPages(result.scannedPages);
        void loadSyncStatuses(result.contacts);
      } catch (err) {
        setContacts([]);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [loadSyncStatuses],
  );

  // Debounce the search box, and jump back to page 1 whenever the term changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void load(page, filter, search);
    // Auto-refresh: the server caches Wati responses for 60s, so polling at the
    // same cadence picks up new chat leads about a minute after they arrive.
    const timer = setInterval(() => void load(page, filter, search), 60_000);
    return () => clearInterval(timer);
  }, [load, page, filter, search]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Wati contacts</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name…"
            className="rounded border border-slate-300 px-2 py-1"
          />
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as Filter);
              setPage(1);
            }}
            className="rounded border border-slate-300 px-2 py-1"
          >
            {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
              <option key={key} value={key}>
                {FILTER_LABELS[key]}
              </option>
            ))}
          </select>
          {filter === 'all' && (
            <span className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={loading || page === 1}
                className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
              >
                Prev
              </button>
              Page {page}
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={loading || contacts.length < PAGE_SIZE}
                className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </span>
          )}
          <button
            onClick={() => void load(page, filter, search)}
            disabled={loading}
            className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : loading ? (
        <p className="text-xs text-slate-500">
          {filter === 'all' ? 'Loading…' : 'Scanning recent Wati contacts…'}
        </p>
      ) : contacts.length === 0 ? (
        <p className="text-xs text-slate-500">No contacts found.</p>
      ) : (
        <div className="overflow-x-auto">
          {filter !== 'all' && (
            <p className="mb-2 text-xs text-slate-500">
              {filter === 'ctwa'
                ? `Latest ${contacts.length} CTWA lead${contacts.length === 1 ? '' : 's'}, newest first.`
                : `${contacts.length} contact${contacts.length === 1 ? '' : 's'} with a source_url (scanned ${scannedPages * 100} most recent contacts).`}
            </p>
          )}
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Phone</th>
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Channel</th>
                <th className="py-2 pr-3 font-medium">source_url</th>
                <th className="py-2 pr-3 font-medium">Created</th>
                <th className="py-2 pr-3 font-medium">Sync</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact, index) => (
                <tr key={`${contact.phone}-${index}`} className="border-b border-slate-100 text-slate-700">
                  <td className="py-2 pr-3">{contact.name}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{contact.phone}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {contact.watiSource === 'CTWA' ? (
                      <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800">CTWA</span>
                    ) : (
                      (contact.watiSource ?? '—')
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{contact.channel ?? '—'}</td>
                  <td className="py-2 pr-3 max-w-xs truncate" title={contact.sourceUrl ?? ''}>
                    {contact.sourceUrl ? (
                      contact.sourceUrl.startsWith('http') ? (
                        <a
                          href={contact.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {contact.sourceUrl}
                        </a>
                      ) : (
                        contact.sourceUrl
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{contact.created ?? '—'}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {(() => {
                      const status = syncStatuses[contact.phone];
                      if (!status) return <span className="text-slate-400">—</span>;
                      if (status === 'synced') {
                        return <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800">Synced ✓</span>;
                      }
                      if (status === 'no_url') {
                        return (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">URL not synced</span>
                        );
                      }
                      return <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">Not in HubSpot</span>;
                    })()}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    {(() => {
                      const state = pushStates[contact.phone];
                      if (!contact.sourceUrl) {
                        return <span className="text-slate-400">no source_url</span>;
                      }
                      if (state?.status === 'busy') {
                        return <span className="text-slate-500">{state.message}</span>;
                      }
                      return (
                        <span className="flex items-center gap-2">
                          <button
                            onClick={() => void pushContact(contact)}
                            className="rounded bg-slate-800 px-2 py-0.5 text-white hover:bg-slate-700"
                          >
                            Update
                          </button>
                          {state && (
                            <span
                              className={
                                state.status === 'done' ? 'text-green-600' : 'max-w-40 truncate text-red-600'
                              }
                              title={state.message}
                            >
                              {state.message}
                            </span>
                          )}
                        </span>
                      );
                    })()}
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

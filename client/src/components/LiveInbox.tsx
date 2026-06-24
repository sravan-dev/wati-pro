import { useCallback, useEffect, useState } from 'react';
import { api, type Conversation } from '../api';

const PAGE_SIZE = 7;

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export default function LiveInbox() {
  const [chats, setChats] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number, targetSearch: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getWatiChats({ page: targetPage, pageSize: PAGE_SIZE, search: targetSearch || undefined });
      setChats(result.chats);
      setTotal(result.total);
    } catch (err) {
      setChats([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void load(page, search);
    // Live-ish: poll every 10s so new messages surface without a manual refresh.
    const timer = setInterval(() => void load(page, search), 10_000);
    return () => clearInterval(timer);
  }, [load, page, search]);

  const markRead = async (phone: string) => {
    setChats((prev) => prev.map((c) => (c.phone === phone ? { ...c, unread: 0 } : c)));
    try {
      await api.markChatRead(phone);
    } catch {
      // best-effort; the next poll will reconcile
    }
  };

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Live inbox (WhatsApp)
          {total > 0 && <span className="ml-2 font-normal text-slate-400">{total} chats</span>}
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or phone…"
            className="rounded border border-slate-300 px-2 py-1"
          />
          <span className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={loading || page === 1}
              className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
            >
              Prev
            </button>
            Page {page}/{totalPages}
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={loading || page >= totalPages}
              className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </span>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : chats.length === 0 ? (
        <p className="text-xs text-slate-500">
          No conversations yet. Once the Wati message webhook is configured, incoming chats appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Phone</th>
                <th className="py-2 pr-3 font-medium">Last message</th>
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 font-medium">Unread</th>
              </tr>
            </thead>
            <tbody>
              {chats.map((c) => (
                <tr key={c.phone} className="border-b border-slate-100 text-slate-700">
                  <td className="py-2 pr-3">{c.name}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{c.phone}</td>
                  <td className="py-2 pr-3 max-w-sm truncate" title={c.lastMessage}>
                    {c.lastDirection === 'out' && <span className="text-slate-400">You: </span>}
                    {c.lastMessage}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{relativeTime(c.lastMessageAt)}</td>
                  <td className="py-2 whitespace-nowrap">
                    {c.unread > 0 ? (
                      <button
                        onClick={() => void markRead(c.phone)}
                        title="Mark as read"
                        className="rounded-full bg-green-500 px-2 py-0.5 text-white hover:bg-green-600"
                      >
                        {c.unread}
                      </button>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
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

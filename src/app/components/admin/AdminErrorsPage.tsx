import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Monitor, Server, Check, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface ErrorLog {
  id: number;
  source: 'client' | 'server';
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  context: string | null;
  resolved: number;
  created_at: string;
}

type FilterSource = 'all' | 'client' | 'server';
type FilterResolved = 'unresolved' | 'all';

function relativeTime(dtStr: string): string {
  const diff = Date.now() - new Date(dtStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Baru saja';
  if (mins < 60) return `${mins} mnt lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days < 8) return `${days} hari lalu`;
  return new Date(dtStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.data ?? json;
}

export default function AdminErrorsPage() {
  const [items, setItems] = useState<ErrorLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState<FilterSource>('all');
  const [filterResolved, setFilterResolved] = useState<FilterResolved>('unresolved');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const fetchErrors = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: '100' });
    if (filterSource !== 'all') params.set('source', filterSource);
    if (filterResolved === 'unresolved') params.set('resolved', '0');
    apiFetch(`/api/admin/errors?${params.toString()}`)
      .then(d => { setItems(d.items ?? []); setTotal(d.total ?? 0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [filterSource, filterResolved]);

  useEffect(() => { fetchErrors(); }, [fetchErrors]);

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const markResolved = async (id: number) => {
    setBusyIds(prev => new Set(prev).add(id));
    try {
      await apiFetch(`/api/admin/errors/${id}`, { method: 'PATCH', body: JSON.stringify({ resolved: true }) });
      setItems(prev => prev.filter(it => it.id !== id));
      setTotal(t => Math.max(0, t - 1));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const deleteItem = async (id: number) => {
    if (!confirm('Hapus error log ini secara permanen?')) return;
    setBusyIds(prev => new Set(prev).add(id));
    try {
      await apiFetch(`/api/admin/errors/${id}`, { method: 'DELETE' });
      setItems(prev => prev.filter(it => it.id !== id));
      setTotal(t => Math.max(0, t - 1));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <AlertTriangle size={20} className="text-[#EF4444]" />
            Error Logs
          </h1>
          <p className="text-sm text-[#64748B] mt-0.5">{total} error {filterResolved === 'unresolved' ? 'belum ditinjau' : 'tercatat'}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterSource} onChange={e => setFilterSource(e.target.value as FilterSource)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1565C0]">
            <option value="all">Semua sumber</option>
            <option value="client">Client (browser)</option>
            <option value="server">Server (Functions)</option>
          </select>
          <select value={filterResolved} onChange={e => setFilterResolved(e.target.value as FilterResolved)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1565C0]">
            <option value="unresolved">Belum ditinjau</option>
            <option value="all">Semua (termasuk resolved)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[#1565C0]" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-[#94A3B8]">
          <Check size={32} className="mx-auto mb-2 text-[#10B981]" />
          Tidak ada error {filterResolved === 'unresolved' ? 'yang belum ditinjau' : 'tercatat'}.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map(item => {
            const isOpen = expanded.has(item.id);
            const busy = busyIds.has(item.id);
            return (
              <li key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button onClick={() => toggleExpand(item.id)} className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <span className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${item.source === 'client' ? 'bg-[#EFF6FF] text-[#1565C0]' : 'bg-[#FFF7ED] text-[#F97316]'}`}>
                    {item.source === 'client' ? <Monitor size={13} /> : <Server size={13} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#0F172A] truncate">{item.message}</div>
                    <div className="text-xs text-[#94A3B8] mt-0.5 flex items-center gap-2">
                      <span>{relativeTime(item.created_at)}</span>
                      {item.url && <span className="truncate max-w-xs">· {item.url}</span>}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={16} className="text-[#94A3B8] flex-shrink-0" /> : <ChevronDown size={16} className="text-[#94A3B8] flex-shrink-0" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-gray-50">
                    {item.stack && (
                      <pre className="mt-3 p-3 bg-[#0F172A] text-[#E2E8F0] text-xs rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{item.stack}</pre>
                    )}
                    {item.context && (
                      <pre className="mt-2 p-3 bg-gray-50 text-xs rounded-lg overflow-x-auto whitespace-pre-wrap break-all">{item.context}</pre>
                    )}
                    {item.user_agent && (
                      <p className="mt-2 text-xs text-[#94A3B8] truncate">{item.user_agent}</p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <button disabled={busy} onClick={() => markResolved(item.id)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-[#10B981] text-white font-medium hover:bg-[#0ea371] disabled:opacity-50 flex items-center gap-1">
                        <Check size={13} /> Tandai selesai
                      </button>
                      <button disabled={busy} onClick={() => deleteItem(item.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 font-medium hover:bg-red-50 disabled:opacity-50 flex items-center gap-1">
                        <Trash2 size={13} /> Hapus
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

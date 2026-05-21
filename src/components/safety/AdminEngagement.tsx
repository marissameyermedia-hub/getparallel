import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, AlertCircle, ThumbsUp, ThumbsDown, BarChart2 } from 'lucide-react';
import { ADMIN_FUNCTION_URL, getAuthHeaders } from '../../utils/supabase/client';

interface DailyMessages {
  date: string;
  count: number;
}

interface EngagementData {
  messages_24h: number;
  messages_7d: number;
  messages_30d: number;
  active_conversations_7d: number;
  total_conversations: number;
  match_interactions_7d: number;
  likes_7d: number;
  passes_7d: number;
  avg_messages_per_active_convo: number;
  daily_messages: DailyMessages[];
  generated_at: string;
}

interface Props {
  accessToken: string | null;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function MsgBar({ date, count, max }: { date: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const label = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 flex-shrink-0 text-right">
        <span className="text-[10px] text-gray-400">{label}</span>
      </div>
      <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
        <div
          className="h-full rounded bg-gradient-to-r from-[#7B5EA7] to-[#A98FD0] transition-all"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <div className="w-8 flex-shrink-0 text-right">
        <span className="text-xs font-semibold tabular-nums text-gray-900">{count}</span>
      </div>
    </div>
  );
}

export function AdminEngagement({ accessToken }: Props) {
  const [data, setData] = useState<EngagementData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!accessToken) { setIsLoading(false); return; }
    try {
      const res = await fetch(`${ADMIN_FUNCTION_URL}/engagement`, {
        method: 'GET',
        headers: getAuthHeaders(accessToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as EngagementData);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load engagement data');
    }
    setIsLoading(false);
    setIsRefreshing(false);
  }, [accessToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const maxDaily = Math.max(...(data?.daily_messages ?? []).map(d => d.count), 1);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-[#7B5EA7]" />
          <h2 className="text-base font-semibold text-gray-900">Engagement</h2>
        </div>
        <button
          onClick={() => { setIsRefreshing(true); fetchData(); }}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm text-red-600">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Messages (24h)" value={data.messages_24h} />
            <StatCard label="Messages (7d)" value={data.messages_7d} />
            <StatCard label="Messages (30d)" value={data.messages_30d} />
            <StatCard
              label="Active convos (7d)"
              value={data.active_conversations_7d}
              sub={`${data.total_conversations} total`}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-3">
              <ThumbsUp size={20} className="text-green-500 flex-shrink-0" />
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider">Likes (7d)</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900">{data.likes_7d}</p>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-3">
              <ThumbsDown size={20} className="text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider">Passes (7d)</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900">{data.passes_7d}</p>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-3">
              <BarChart2 size={20} className="text-[#7B5EA7] flex-shrink-0" />
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider">Avg msgs / convo</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900">
                  {data.avg_messages_per_active_convo.toFixed(1)}
                </p>
              </div>
            </div>
          </div>

          {data.daily_messages.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Daily Messages — Last 30 Days
              </h3>
              <div className="space-y-1.5">
                {data.daily_messages.map(d => (
                  <MsgBar key={d.date} date={d.date} count={d.count} max={maxDaily} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { DollarSign, RefreshCw, AlertCircle, TrendingUp, Users } from 'lucide-react';
import { ADMIN_FUNCTION_URL, getAuthHeaders } from '../../utils/supabase/client';

interface RecentPayment {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  paid_at: string;
}

interface MonthlyRevenue {
  month: string;
  amount: number;
}

interface RevenueData {
  total_revenue: number;
  revenue_30d: number;
  paying_subscribers: number;
  mrr: number;
  arr: number;
  active_subscriptions: number;
  revenue_by_month: MonthlyRevenue[];
  recent_payments: RecentPayment[];
  generated_at: string;
}

interface Props {
  accessToken: string | null;
}

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function RevenueBar({ month, amount, max }: { month: string; amount: number; max: number }) {
  const pct = max > 0 ? (amount / max) * 100 : 0;
  const label = new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 flex-shrink-0 text-right">
        <span className="text-[10px] text-gray-400">{label}</span>
      </div>
      <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
        <div
          className="h-full rounded bg-gradient-to-r from-[#7B5EA7] to-[#A98FD0] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-16 flex-shrink-0 text-right">
        <span className="text-xs font-semibold tabular-nums text-gray-900">{fmt(amount)}</span>
      </div>
    </div>
  );
}

export function AdminRevenue({ accessToken }: Props) {
  const [data, setData] = useState<RevenueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!accessToken) { setIsLoading(false); return; }
    try {
      const res = await fetch(`${ADMIN_FUNCTION_URL}/revenue`, {
        method: 'GET',
        headers: getAuthHeaders(accessToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as RevenueData);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load revenue data');
    }
    setIsLoading(false);
    setIsRefreshing(false);
  }, [accessToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const maxMonthly = Math.max(...(data?.revenue_by_month ?? []).map(m => m.amount), 1);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <DollarSign size={18} className="text-[#7B5EA7]" />
          <h2 className="text-base font-semibold text-gray-900">Revenue</h2>
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
            <StatCard
              label="Total revenue"
              value={fmt(data.total_revenue)}
              sub="all time"
            />
            <StatCard
              label="Paying subscribers"
              value={data.paying_subscribers.toString()}
              sub={`${data.active_subscriptions} active subs total`}
            />
            <StatCard
              label="MRR"
              value={fmt(data.mrr)}
              sub="monthly recurring"
            />
            <StatCard
              label="ARR"
              value={fmt(data.arr)}
              sub="annual run rate"
            />
          </div>

          {data.revenue_30d > 0 && (
            <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 mb-6 text-sm text-[#7B5EA7]">
              <TrendingUp size={14} />
              {fmt(data.revenue_30d)} collected in the last 30 days
            </div>
          )}

          {data.revenue_by_month.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-5">Revenue by Month</h3>
              <div className="space-y-2.5">
                {data.revenue_by_month.map(m => (
                  <RevenueBar key={m.month} month={m.month} amount={m.amount} max={maxMonthly} />
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Users size={13} className="text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment History</h3>
            </div>
            {data.recent_payments.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-gray-400">No payments recorded yet.</p>
                <p className="text-xs text-gray-400 mt-1">Payments will appear here automatically when PayPal fires webhooks.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.recent_payments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#7B5EA7]">{fmt(p.amount)}</td>
                      <td className="px-5 py-3 text-right text-gray-400 text-xs hidden sm:table-cell">{timeAgo(p.paid_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

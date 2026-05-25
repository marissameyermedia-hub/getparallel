import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, RefreshCw, AlertCircle, Users } from 'lucide-react';
import { ADMIN_FUNCTION_URL, getAuthHeaders } from '../../utils/supabase/client';

interface FunnelStep {
  label: string;
  count: number;
  pct_of_top: number;
  pct_of_prev: number;
}

interface DailySignup {
  date: string;
  count: number;
}

interface FunnelData {
  steps: FunnelStep[];
  trend: DailySignup[];
  signups_7d: number;
  signups_30d: number;
  generated_at: string;
}

interface Props {
  accessToken: string | null;
}

function SparkBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex-1 flex items-end h-10">
      <div
        className="w-full rounded-t bg-gradient-to-t from-[#7B5EA7] to-[#A98FD0] transition-all"
        style={{ height: `${Math.max(pct, 4)}%` }}
      />
    </div>
  );
}

export function AdminGrowthFunnel({ accessToken }: Props) {
  const [data, setData] = useState<FunnelData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!accessToken) { setIsLoading(false); return; }
    try {
      const res = await fetch(`${ADMIN_FUNCTION_URL}/funnel`, {
        method: 'GET',
        headers: getAuthHeaders(accessToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as FunnelData);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load funnel data');
    }
    setIsLoading(false);
    setIsRefreshing(false);
  }, [accessToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  const maxDaily = Math.max(...(data?.trend ?? []).map(d => d.count), 1);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-[#7B5EA7]" />
          <h2 className="text-base font-semibold text-gray-900">Growth Funnel</h2>
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
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Users size={13} className="text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Conversion Funnel</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {data.steps.map((step, i) => (
                <div key={step.label} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#7B5EA7]/10 text-[#7B5EA7] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{step.label}</span>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <span className="text-xl font-bold tabular-nums text-gray-900">{step.count.toLocaleString()}</span>
                      <div className="w-20">
                        <div className="text-xs font-semibold text-[#7B5EA7]">
                          {step.pct_of_top.toFixed(1)}% of total
                        </div>
                        {i > 0 && (
                          <div className={`text-[10px] ${step.pct_of_prev < 50 ? 'text-red-500' : step.pct_of_prev < 75 ? 'text-amber-500' : 'text-green-600'}`}>
                            {step.pct_of_prev.toFixed(1)}% of prev
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#7B5EA7] to-[#A98FD0] transition-all"
                      style={{ width: `${step.pct_of_top}%` }}
                    />
                  </div>
                  {i > 0 && step.pct_of_prev < 70 && (
                    <p className="text-[10px] text-amber-600 mt-1.5">
                      Drop-off: {(100 - step.pct_of_prev).toFixed(1)}% of previous step didn't reach this stage
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {data.trend.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Daily Signups — Last 30 Days</h3>
              <div className="flex items-end gap-0.5 h-16">
                {data.trend.map(d => (
                  <SparkBar key={d.date} value={d.count} max={maxDaily} />
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-400">
                  {new Date(data.trend[0]?.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(data.trend[data.trend.length - 1]?.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                Total last 30 days: <span className="font-semibold text-gray-700">{data.trend.reduce((s, d) => s + d.count, 0)}</span> signups
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

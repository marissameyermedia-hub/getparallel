import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, AlertTriangle, AlertCircle, CheckCircle2, GitBranch } from 'lucide-react';
import { ADMIN_FUNCTION_URL, getAuthHeaders } from '../../utils/supabase/client';

interface ScoreDistribution {
  excellent: number;
  good: number;
  fair: number;
  floor: number;
}

interface MatchQualityData {
  total_matches_all_time: number;
  matches_last_7d: number;
  matches_last_30d: number;
  users_with_zero_matches: number;
  users_with_one_match: number;
  active_users_total: number;
  score_distribution: ScoreDistribution;
  avg_compatibility_score: number;
  category_averages: Record<string, number>;
  algorithm_version: string;
  canonical_hash: string;
  last_match_inserted_at: string | null;
}

interface Props {
  accessToken: string | null;
}

const CATEGORIES = [
  'Attachment & Emotional Health',
  'Communication & Conflict',
  'Life Goals',
  'Values & Beliefs',
  'Lifestyle Behaviors',
  'Social & Shared Life',
  'Financial & Career',
  'Intimacy & Connection',
];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (86400 * 1000));
}

function StatCard({ label, value, sub, warn = false }: {
  label: string; value: string | number; sub?: string; warn?: boolean;
}) {
  return (
    <div className={`bg-white border rounded-xl px-5 py-4 ${warn ? 'border-red-200' : 'border-gray-200'}`}>
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums flex items-center gap-2 ${warn ? 'text-red-500' : 'text-gray-900'}`}>
        {warn && <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />}
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function DistributionBar({ label, count, total, colorClass, range }: {
  label: string; count: number; total: number; colorClass: string; range: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 flex-shrink-0 text-right">
        <span className="text-xs font-medium text-gray-900">{label}</span>
        <span className="block text-[10px] text-gray-400">{range}</span>
      </div>
      <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
        <div className={`h-full rounded transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-28 flex-shrink-0 flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums text-gray-900">{count.toLocaleString()}</span>
        <span className="text-[11px] text-gray-400 tabular-nums">{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

function CategoryBar({ name, score }: { name: string; score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const colorClass = pct >= 70 ? 'bg-[#A98FD0]' : pct >= 50 ? 'bg-[#7B5EA7]' : 'bg-gray-300';
  return (
    <div className="flex items-center gap-3">
      <div className="w-52 flex-shrink-0">
        <span className="text-xs text-gray-500 truncate block">{name}</span>
      </div>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-12 flex-shrink-0 text-right">
        <span className="text-xs font-semibold tabular-nums text-gray-900">
          {score > 0 ? score.toFixed(1) : '—'}
        </span>
      </div>
    </div>
  );
}

export function AdminMatchQuality({ accessToken }: Props) {
  const [data, setData] = useState<MatchQualityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!accessToken) { setIsLoading(false); return; }
    try {
      const res = await fetch(`${ADMIN_FUNCTION_URL}/match-quality`, {
        method: 'GET',
        headers: getAuthHeaders(accessToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      setData(result as MatchQualityData);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load match quality data');
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

  const flags: Array<{ severity: 'red' | 'yellow'; message: string }> = [];
  if (data) {
    const activeUsers = data.active_users_total ?? 0;
    if (data.users_with_zero_matches > 0 && activeUsers > 10) {
      flags.push({ severity: 'red', message: `${data.users_with_zero_matches.toLocaleString()} active user${data.users_with_zero_matches !== 1 ? 's have' : ' has'} zero matches — run matching to generate pairs` });
    }
    const isStale = !data.last_match_inserted_at || daysAgo(data.last_match_inserted_at) > 7;
    if (isStale) {
      const label = data.last_match_inserted_at ? `${daysAgo(data.last_match_inserted_at)} days ago` : 'never';
      flags.push({ severity: 'yellow', message: `No matches have been run in 7+ days (last run: ${label})` });
    }
    if (data.avg_compatibility_score > 0 && data.avg_compatibility_score < 55) {
      flags.push({ severity: 'yellow', message: `Average compatibility score is low (${data.avg_compatibility_score.toFixed(1)}) — check algorithm parameters` });
    }
  }

  const dist = data?.score_distribution;
  const totalDistPairs = dist ? dist.excellent + dist.good + dist.fair + dist.floor : 0;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-[#7B5EA7]" />
          <h2 className="text-base font-semibold text-gray-900">Match Quality</h2>
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

      {flags.length > 0 && (
        <div className="space-y-2 mb-6">
          {flags.map((f, i) => (
            <div key={i} className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm ${
              f.severity === 'red'
                ? 'bg-red-50 border-red-200 text-red-600'
                : 'bg-yellow-50 border-yellow-200 text-yellow-700'
            }`}>
              <AlertTriangle size={14} className="flex-shrink-0" />
              {f.message}
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total match pairs" value={data.total_matches_all_time.toLocaleString()} sub="all time" />
            <StatCard label="Match pairs this week" value={data.matches_last_7d.toLocaleString()} sub={`${data.matches_last_30d.toLocaleString()} this month`} />
            <StatCard
              label="Avg compatibility"
              value={data.avg_compatibility_score > 0 ? data.avg_compatibility_score.toFixed(1) : '—'}
              sub="out of 100"
              warn={data.avg_compatibility_score > 0 && data.avg_compatibility_score < 55}
            />
            <StatCard
              label="Users with 0 matches"
              value={data.users_with_zero_matches.toLocaleString()}
              sub={`${data.users_with_one_match.toLocaleString()} with exactly 1`}
              warn={data.users_with_zero_matches > 0 && (data.active_users_total ?? 0) > 10}
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-5">
              Score Distribution
              <span className="ml-2 font-normal text-gray-400 normal-case">
                {totalDistPairs.toLocaleString()} pairs scored
              </span>
            </h3>
            <div className="space-y-3">
              <DistributionBar label="Excellent" range="80+"   count={dist?.excellent ?? 0} total={totalDistPairs} colorClass="bg-[#A98FD0]" />
              <DistributionBar label="Good"      range="60–79" count={dist?.good      ?? 0} total={totalDistPairs} colorClass="bg-[#7B5EA7]" />
              <DistributionBar label="Fair"      range="40–59" count={dist?.fair      ?? 0} total={totalDistPairs} colorClass="bg-gray-300" />
              <DistributionBar label="Floor"     range="30–39" count={dist?.floor     ?? 0} total={totalDistPairs} colorClass="bg-red-200" />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-5">Category Averages</h3>
            <div className="space-y-3.5">
              {CATEGORIES.map(cat => (
                <CategoryBar key={cat} name={cat} score={data.category_averages[cat] ?? 0} />
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <GitBranch size={13} className="text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Algorithm Status</h3>
            </div>
            <dl className="space-y-3">
              <div className="flex items-center justify-between">
                <dt className="text-xs text-gray-500">Algorithm version</dt>
                <dd className="text-xs font-semibold text-gray-900 font-mono">{data.algorithm_version}</dd>
              </div>
              {data.canonical_hash !== 'unknown' && (
                <div className="flex items-center justify-between">
                  <dt className="text-xs text-gray-500">Canonical hash</dt>
                  <dd className="text-xs font-semibold text-[#7B5EA7] font-mono truncate max-w-[200px]">
                    {data.canonical_hash.slice(0, 12)}…
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-xs text-gray-500">Last match run</dt>
                <dd className={`text-xs font-semibold ${
                  data.last_match_inserted_at
                    ? daysAgo(data.last_match_inserted_at) > 7 ? 'text-yellow-600' : 'text-gray-900'
                    : 'text-gray-400'
                }`}>
                  {data.last_match_inserted_at
                    ? `${timeAgo(data.last_match_inserted_at)} · ${new Date(data.last_match_inserted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : 'Never'}
                </dd>
              </div>
              {data.active_users_total > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-xs text-gray-500">Active users tracked</dt>
                  <dd className="text-xs font-semibold text-gray-900 tabular-nums">{data.active_users_total.toLocaleString()}</dd>
                </div>
              )}
            </dl>
            {!flags.length && data.total_matches_all_time > 0 && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100 text-xs text-[#7B5EA7]">
                <CheckCircle2 size={12} />
                All match quality checks passing
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

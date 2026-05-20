import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, RefreshCw, AlertCircle, TrendingUp } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { CITY_RELEASE_THRESHOLDS } from '../../utils/supabase/cityThresholds';

interface CityRow {
  city_normalized: string;
  display_name: string;
  status: string;
  soft_waitlist_total: number;
  hard_waitlist_total: number;
  hard_waitlist_7d: number;
  hard_waitlist_24h: number;
  verified_total: number;
  gender_man_count: number;
  gender_total_count: number;
  ad_spend_to_date: number | null;
  median_good_matches_per_user: number;
  users_with_zero_good_matches: number;
  match_quality_score: number;
  computed_at: string | null;
  health_score: number;
  bottleneck: string;
  users_with_qualifying_matches: number;
}

interface Props {
  onSelectCity: (cityNormalized: string) => void;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    building: 'bg-gray-100 text-gray-500',
    ready:    'bg-purple-100 text-[#7B5EA7]',
    live:     'bg-green-100 text-green-700',
  };
  const labels: Record<string, string> = {
    building: 'Building', ready: 'Ready', live: 'Live',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function RaceRow({ city, rank, isLeading, onClick }: {
  city: CityRow; rank: number; isLeading: boolean; onClick: () => void;
}) {
  const goal = CITY_RELEASE_THRESHOLDS.USERS_WITH_QUALIFYING_MATCHES;
  const pct = goal > 0 ? Math.min(100, (city.users_with_qualifying_matches / goal) * 100) : 0;
  const velocity = city.hard_waitlist_7d;
  const isLive = city.status === 'live';

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-purple-300 hover:bg-gray-50 transition-all group"
    >
      <div className="flex items-center gap-4">
        <span className={`text-sm font-bold w-5 flex-shrink-0 text-center ${isLeading ? 'text-[#7B5EA7]' : 'text-gray-300'}`}>
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-sm font-semibold text-gray-900 group-hover:text-gray-700 transition-colors truncate">
              {city.display_name}
            </span>
            <StatusBadge status={city.status} />
            {isLeading && city.verified_total > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-50 border border-purple-200 text-[#7B5EA7] text-[10px] font-bold uppercase tracking-wider rounded-full">
                Leading
              </span>
            )}
          </div>
          <div className="relative w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-1.5">
            {pct > 0 && (
              <div
                className={`h-full rounded-full transition-all ${isLive ? 'bg-green-500' : 'bg-gradient-to-r from-[#7B5EA7] to-[#A98FD0]'}`}
                style={{ width: `${pct}%` }}
              />
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              {city.users_with_qualifying_matches.toLocaleString()} / {goal.toLocaleString()} qualifying users
              {isLive ? ' · LIVE' : ''}
            </span>
            <span className={`text-[10px] font-semibold ${pct >= 100 ? 'text-[#7B5EA7]' : 'text-gray-400'}`}>
              {Math.round(pct)}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="text-right">
            <p className={`text-sm font-semibold tabular-nums ${velocity > 10 ? 'text-[#7B5EA7]' : velocity > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
              {velocity > 0 ? `+${velocity}` : '—'}
            </p>
            <p className="text-[10px] text-gray-400">7d</p>
          </div>
          <div className="text-right">
            <p className={`text-sm font-semibold tabular-nums ${city.health_score >= 70 ? 'text-[#7B5EA7]' : city.health_score >= 40 ? 'text-gray-900' : 'text-gray-300'}`}>
              {city.health_score > 0 ? city.health_score : '—'}
            </p>
            <p className="text-[10px] text-gray-400">health</p>
          </div>
        </div>
      </div>
    </button>
  );
}

export function AdminCitiesOverview({ onSelectCity }: Props) {
  const [cities, setCities] = useState<CityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCities = useCallback(async () => {
    const { data, error: rpcErr } = await supabase.rpc('get_cities_overview');
    if (rpcErr) {
      setError(rpcErr.message);
    } else {
      const sorted = ((data as CityRow[]) ?? []).sort(
        (a, b) => b.users_with_qualifying_matches - a.users_with_qualifying_matches
      );
      setCities(sorted);
      setLastRefreshed(new Date().toISOString());
      setError(null);
    }
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => { fetchCities(); }, [fetchCities]);

  useEffect(() => {
    const triggerRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try { await supabase.rpc('refresh_city_health'); } catch { /* best-effort */ }
        fetchCities();
      }, 800);
    };
    const channel = supabase
      .channel('admin-city-updates')
      .on('postgres_changes', { event: '*',      schema: 'public', table: 'waitlist_signups' }, triggerRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles'         }, triggerRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shadow_matches'   }, triggerRefresh)
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchCities]);

  async function handleManualRefresh() {
    setIsRefreshing(true);
    try { await supabase.rpc('refresh_city_health'); } catch { /* ignore */ }
    fetchCities();
  }

  const totalSignups = cities.reduce((s, c) => s + c.soft_waitlist_total + c.hard_waitlist_total, 0);
  const readyCount   = cities.filter(c => c.status === 'ready').length;
  const liveCount    = cities.filter(c => c.status === 'live').length;
  const totalSpend   = cities.reduce((s, c) => s + (c.ad_spend_to_date ?? 0), 0);
  const leadingSlug  = cities.length > 0 && cities[0].users_with_qualifying_matches > 0
    ? cities[0].city_normalized
    : null;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MapPin size={18} className="text-[#7B5EA7]" />
          <h2 className="text-base font-semibold text-gray-900">Cities</h2>
          {lastRefreshed && (
            <span className="text-xs text-gray-400">updated {timeAgo(lastRefreshed)}</span>
          )}
        </div>
        <button
          onClick={handleManualRefresh}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <SummaryStat label="Total signups" value={totalSignups.toLocaleString()} />
        <SummaryStat label="Cities ready"  value={readyCount} />
        <SummaryStat label="Cities live"   value={liveCount} />
        <SummaryStat label="Ad spend"      value={totalSpend > 0 ? `$${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—'} />
      </div>

      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-[#A98FD0]" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Race to launch</span>
          </div>
          <p className="text-[11px] text-gray-400 ml-5">
            {CITY_RELEASE_THRESHOLDS.USERS_WITH_QUALIFYING_MATCHES} users
            &nbsp;·&nbsp; ≥{CITY_RELEASE_THRESHOLDS.MIN_MUTUAL_MATCHES_PER_USER} mutual matches each
            &nbsp;·&nbsp; score ≥{CITY_RELEASE_THRESHOLDS.MIN_MATCH_SCORE}
          </p>
        </div>
        <span className="text-xs text-gray-400 mt-0.5">{cities.length} {cities.length === 1 ? 'city' : 'cities'}</span>
      </div>

      {cities.length === 0 ? (
        <div className="border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-500">No cities yet. Signups will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cities.map((city, i) => (
            <RaceRow
              key={city.city_normalized}
              city={city}
              rank={i + 1}
              isLeading={city.city_normalized === leadingSlug}
              onClick={() => onSelectCity(city.city_normalized)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

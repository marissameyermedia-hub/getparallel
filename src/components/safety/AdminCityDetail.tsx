import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, AlertCircle, Zap, CheckCircle2, Circle, RefreshCw, X } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { RELEASE_CITY_FUNCTION_URL, getAuthHeaders } from '../../utils/supabase/client';
import { CITY_RELEASE_THRESHOLDS } from '../../utils/supabase/cityThresholds';

interface CityData {
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

interface TrendPoint {
  date: string;
  verified_total: number;
  hard_waitlist_total: number;
}

interface Props {
  cityNormalized: string;
  onBack: () => void;
  accessToken: string | null;
}

type Tab = 'pipeline' | 'matches' | 'spend';

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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

function ThresholdGate({ label, current, target, unit = '', met }: {
  label: string; current: number; target: number; unit?: string; met: boolean;
}) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {met
            ? <CheckCircle2 size={13} className="text-[#7B5EA7] flex-shrink-0" />
            : <Circle      size={13} className="text-gray-300    flex-shrink-0" />
          }
          <span className={`text-xs font-medium ${met ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
        </div>
        <span className={`text-xs tabular-nums font-semibold ${met ? 'text-[#7B5EA7]' : 'text-gray-400'}`}>
          {current.toLocaleString()}{unit} / {target.toLocaleString()}{unit}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${met ? 'bg-[#A98FD0]' : 'bg-gradient-to-r from-[#7B5EA7] to-[#A98FD0]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-lg font-semibold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

function GrowthChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-gray-400 text-xs">
        Not enough data yet
      </div>
    );
  }
  const W = 480, H = 120, PAD = 16;
  const values = data.map(d => d.verified_total);
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;
  const toX = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const toY = (v: number) => H - PAD - ((v - minV) / range) * (H - PAD * 2);
  const linePoints = data.map((d, i) => `${toX(i)},${toY(d.verified_total)}`).join(' ');
  const areaPoints = [
    `${toX(0)},${H - PAD}`,
    ...data.map((d, i) => `${toX(i)},${toY(d.verified_total)}`),
    `${toX(data.length - 1)},${H - PAD}`,
  ].join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGradLight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#7B5EA7" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#7B5EA7" stopOpacity="0"    />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#chartGradLight)" />
      <polyline points={linePoints} fill="none" stroke="#7B5EA7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.length <= 14 && data.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(d.verified_total)} r="2.5" fill="#7B5EA7" />
      ))}
    </svg>
  );
}

export function AdminCityDetail({ cityNormalized, onBack, accessToken }: Props) {
  const [city, setCity] = useState<CityData | null>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('pipeline');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState('');

  const fetchTrend = useCallback(async (slug: string) => {
    const { data } = await supabase
      .from('city_growth_snapshots')
      .select('snapshot_date, verified_total, hard_waitlist_total')
      .eq('city_normalized', slug)
      .order('snapshot_date', { ascending: true })
      .limit(30);
    if (data && data.length > 0) {
      setTrendData(data.map((d: any) => ({
        date: d.snapshot_date as string,
        verified_total: (d.verified_total as number) ?? 0,
        hard_waitlist_total: (d.hard_waitlist_total as number) ?? 0,
      })));
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error: rpcErr } = await supabase.rpc('get_cities_overview');
      if (rpcErr) {
        setError(rpcErr.message);
      } else {
        const found = ((data as CityData[]) ?? []).find(c => c.city_normalized === cityNormalized);
        if (found) setCity(found);
        else setError('City not found');
      }
      setIsLoading(false);
      fetchTrend(cityNormalized);
    })();
  }, [cityNormalized, fetchTrend]);

  const handleRelease = async () => {
    if (!accessToken) return;
    setIsReleasing(true);
    setReleaseError('');
    try {
      const res = await fetch(RELEASE_CITY_FUNCTION_URL, {
        method: 'POST',
        headers: getAuthHeaders(accessToken),
        body: JSON.stringify({ city_normalized: cityNormalized, notes: releaseNotes || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setReleaseError((d as any).error || 'Release failed. Please try again.');
        setIsReleasing(false);
        return;
      }
      setShowModal(false);
      setReleaseNotes('');
      // Refresh city data
      const { data } = await supabase.rpc('get_cities_overview');
      const found = ((data as CityData[]) ?? []).find(c => c.city_normalized === cityNormalized);
      if (found) setCity(found);
    } catch {
      setReleaseError('Network error. Please try again.');
    }
    setIsReleasing(false);
  };

  const T = CITY_RELEASE_THRESHOLDS;
  const TABS: { id: Tab; label: string }[] = [
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'matches',  label: 'Match Quality' },
    { id: 'spend',    label: 'Ad Spend' },
  ];

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-3">
        <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !city) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} /> {error ?? 'City not found'}
        </div>
      </div>
    );
  }

  const qualifyingMet = city.users_with_qualifying_matches >= T.USERS_WITH_QUALIFYING_MATCHES;
  const matchesMet    = city.median_good_matches_per_user  >= T.MIN_MUTUAL_MATCHES_PER_USER;
  const genderPct     = city.gender_total_count > 0 ? (city.gender_man_count / city.gender_total_count) * 100 : 50;
  const genderMet     = genderPct >= 40 && genderPct <= 60;
  const allMet        = qualifyingMet && matchesMet && genderMet;
  const womenPct      = city.gender_total_count > 0
    ? Math.round(((city.gender_total_count - city.gender_man_count) / city.gender_total_count) * 100)
    : 0;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-900 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-base font-semibold text-gray-900">{city.display_name}</h2>
        <StatusBadge status={city.status} />
        {city.status === 'ready' && (
          <button
            onClick={() => setShowModal(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#7B5EA7] text-white rounded-lg text-xs font-semibold hover:bg-[#7B5EA7]/90 transition-colors"
          >
            <Zap size={12} /> Release
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? 'border-[#7B5EA7] text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'pipeline' && (
        <div className="space-y-4">
          {/* Threshold card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Release Threshold</h3>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                allMet ? 'bg-purple-100 text-[#7B5EA7]' : 'bg-gray-100 text-gray-400'
              }`}>
                {allMet ? 'All gates met' : `${[qualifyingMet, matchesMet, genderMet].filter(Boolean).length} / 3 gates`}
              </span>
            </div>
            <div className="space-y-4">
              <ThresholdGate label={`Users with ≥${T.MIN_MUTUAL_MATCHES_PER_USER} quality matches`} current={city.users_with_qualifying_matches} target={T.USERS_WITH_QUALIFYING_MATCHES} met={qualifyingMet} />
              <ThresholdGate label={`Median good matches / user (score ≥${T.MIN_MATCH_SCORE})`} current={Math.round(city.median_good_matches_per_user * 10) / 10} target={T.MIN_MUTUAL_MATCHES_PER_USER} met={matchesMet} />
              <ThresholdGate label="Gender balance (40–60% men)" current={Math.round(genderPct)} target={60} unit="%" met={genderMet} />
            </div>
            {city.bottleneck && !allMet && (
              <p className="mt-4 pt-4 border-t border-gray-100 text-[11px] text-gray-400">
                Bottleneck: {city.bottleneck}
              </p>
            )}
          </div>

          <SectionCard title="Funnel">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
              <Stat label="Hard waitlist" value={city.hard_waitlist_total.toLocaleString()} sub={`+${city.hard_waitlist_24h} today · +${city.hard_waitlist_7d} 7d`} />
              <Stat label="Verified" value={city.verified_total.toLocaleString()} />
              <Stat label="Soft waitlist" value={city.soft_waitlist_total.toLocaleString()} />
              <Stat label="Women" value={`${womenPct}%`} sub={`of ${city.gender_total_count.toLocaleString()} gendered`} />
              <Stat label="Health score" value={city.health_score > 0 ? city.health_score : '—'} />
              <Stat label="Bottleneck" value={city.bottleneck || '—'} />
            </div>
          </SectionCard>

          <SectionCard title="Growth trend">
            <GrowthChart data={trendData} />
            {city.computed_at && (
              <p className="text-[10px] text-gray-400 mt-2">
                Last computed {new Date(city.computed_at).toLocaleString()}
              </p>
            )}
          </SectionCard>
        </div>
      )}

      {activeTab === 'matches' && (
        <SectionCard title="Match quality">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
            <Stat label="Median good matches / user" value={city.median_good_matches_per_user.toFixed(1)} />
            <Stat label="Users with 0 good matches" value={city.users_with_zero_good_matches.toLocaleString()} />
            <Stat label="Match quality score" value={city.match_quality_score > 0 ? city.match_quality_score : '—'} />
          </div>
        </SectionCard>
      )}

      {activeTab === 'spend' && (
        <SectionCard title="Ad spend">
          <Stat
            label="Total spend to date"
            value={city.ad_spend_to_date != null
              ? `$${city.ad_spend_to_date.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
              : '—'}
          />
        </SectionCard>
      )}

      {/* Release modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Release {city.display_name}</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              This flips <strong>{city.display_name}</strong> from <em>ready</em> → <em>live</em> and enables matches for verified users in this city.
            </p>
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Release notes (optional)</label>
              <textarea
                value={releaseNotes}
                onChange={e => setReleaseNotes(e.target.value)}
                placeholder="e.g. Organic growth — 105 verified, 52% female"
                rows={3}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#7B5EA7] transition-colors"
                style={{ fontSize: '16px' }}
              />
            </div>
            {releaseError && <p className="text-sm text-red-600 mb-3">{releaseError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 border-2 border-gray-200 rounded-full text-sm font-medium hover:border-gray-300 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleRelease}
                disabled={isReleasing}
                className="flex-1 py-3 bg-[#7B5EA7] text-white rounded-full text-sm font-medium hover:bg-[#7B5EA7]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isReleasing
                  ? <><RefreshCw size={13} className="animate-spin" /> Releasing…</>
                  : <><Zap size={13} /> Release</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

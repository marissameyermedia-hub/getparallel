import { useState, useEffect } from 'react';
import { MapPin, Users, TrendingUp, RefreshCw, Rocket, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { ADMIN_FUNCTION_URL, RELEASE_CITY_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { getAccessToken } from '../../utils/auth';

interface CityHealth {
  city_normalized: string;
  display_name: string;
  status: 'building' | 'ready' | 'live';
  soft_waitlist_total: number;
  hard_waitlist_total: number;
  hard_waitlist_7d: number;
  hard_waitlist_24h: number;
  verified_total: number;
  gender_man_count: number;
  gender_total_count: number;
  ad_spend_to_date: string;
  median_good_matches_per_user: number | null;
  users_with_zero_good_matches: number | null;
  match_quality_score: number;
  computed_at: string;
}

interface CityThresholds {
  min_verified_profiles: number;
  min_median_mutual_matches: number;
  gender_ratio_min: string;
  gender_ratio_max: string;
  min_match_score_floor: number;
}

interface ReleaseLog {
  id: string;
  city_normalized: string;
  released_at: string;
  released_by: string | null;
  notes: string | null;
}

export function CityLaunchDashboard() {
  const [cities, setCities] = useState<CityHealth[]>([]);
  const [thresholds, setThresholds] = useState<CityThresholds | null>(null);
  const [recentReleases, setRecentReleases] = useState<ReleaseLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [releaseConfirmCity, setReleaseConfirmCity] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [releasingCity, setReleasingCity] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getAccessToken();
      if (!token) { setError('Not authenticated'); setLoading(false); return; }
      const res = await fetch(`${ADMIN_FUNCTION_URL}/cities`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as any).error || 'Failed to load city data');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCities(data.cities || []);
      setThresholds(data.thresholds || null);
      setRecentReleases(data.recentReleases || []);
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleRelease = async () => {
    if (!releaseConfirmCity) return;
    setReleasingCity(releaseConfirmCity);
    setReleaseError('');
    try {
      const token = await getAccessToken();
      if (!token) { setReleasingCity(null); return; }
      const res = await fetch(RELEASE_CITY_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
        body: JSON.stringify({ city_normalized: releaseConfirmCity, notes: releaseNotes || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReleaseError((data as any).error || 'Release failed. Please try again.');
        setReleasingCity(null);
        return;
      }
      setReleaseConfirmCity(null);
      setReleaseNotes('');
      setReleasingCity(null);
      await fetchData();
    } catch {
      setReleaseError('Network error. Please try again.');
      setReleasingCity(null);
    }
  };

  const minVerified = thresholds?.min_verified_profiles ?? 100;

  const statusCounts = {
    live: cities.filter(c => c.status === 'live').length,
    ready: cities.filter(c => c.status === 'ready').length,
    building: cities.filter(c => c.status === 'building').length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'live': return 'bg-green-100 text-green-800';
      case 'ready': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getGenderRatio = (city: CityHealth) => {
    if (!city.gender_total_count) return null;
    const malePct = Math.round((city.gender_man_count / city.gender_total_count) * 100);
    return { malePct, femalePct: 100 - malePct };
  };

  const isGenderHealthy = (city: CityHealth) => {
    if (!thresholds || !city.gender_total_count) return null;
    const femalePct = 1 - (city.gender_man_count / city.gender_total_count);
    const min = parseFloat(thresholds.gender_ratio_min);
    const max = parseFloat(thresholds.gender_ratio_max);
    return femalePct >= min && femalePct <= max;
  };

  const lastRefreshed = cities[0]?.computed_at
    ? new Date(cities[0].computed_at).toLocaleTimeString()
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-black text-white rounded-lg text-sm">Retry</button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
          <p className="text-xs text-green-600 font-medium uppercase tracking-wide mb-1">Live</p>
          <p className="text-3xl font-bold text-green-800">{statusCounts.live}</p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
          <p className="text-xs text-purple-600 font-medium uppercase tracking-wide mb-1">Ready</p>
          <p className="text-3xl font-bold text-purple-800">{statusCounts.ready}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Building</p>
          <p className="text-3xl font-bold text-gray-700">{statusCounts.building}</p>
        </div>
      </div>

      {/* Threshold reminder */}
      {thresholds && (
        <div className="mb-4 px-3 py-2 bg-gray-50 rounded-xl text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>Threshold: {thresholds.min_verified_profiles} verified</span>
          <span>Gender ratio: {Math.round(parseFloat(thresholds.gender_ratio_min) * 100)}–{Math.round(parseFloat(thresholds.gender_ratio_max) * 100)}% F</span>
          <span>Min median matches: {thresholds.min_median_mutual_matches}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">All Cities ({cities.length})</h2>
        <div className="flex items-center gap-3">
          {lastRefreshed && <p className="text-xs text-gray-400">Updated {lastRefreshed}</p>}
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* City cards */}
      <div className="space-y-2 mb-8">
        {cities.map((city) => {
          const pct = Math.min(100, Math.round((city.verified_total / minVerified) * 100));
          const ratio = getGenderRatio(city);
          const genderOk = isGenderHealthy(city);

          return (
            <div key={city.city_normalized} className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <MapPin size={13} className="text-gray-400 flex-shrink-0" />
                  <span className="font-medium text-sm">{city.display_name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(city.status)}`}>
                    {city.status}
                  </span>
                </div>
                {city.status === 'ready' && (
                  <button
                    onClick={() => {
                      setReleaseConfirmCity(city.city_normalized);
                      setReleaseNotes('');
                      setReleaseError('');
                    }}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#7B5EA7] text-white rounded-full text-xs font-semibold hover:bg-[#7B5EA7]/90 transition-colors"
                  >
                    <Rocket size={11} />
                    Release
                  </button>
                )}
                {city.status === 'live' && (
                  <CheckCircle2 size={17} className="text-green-500 flex-shrink-0 mt-0.5" />
                )}
              </div>

              {/* Progress bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">Verified profiles</span>
                  <span className="text-xs font-semibold text-gray-700">{city.verified_total} / {minVerified}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      city.status === 'live'
                        ? 'bg-green-500'
                        : city.verified_total >= minVerified
                          ? 'bg-[#7B5EA7]'
                          : 'bg-[#0D0D0F]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                {city.hard_waitlist_total > 0 && (
                  <span className="flex items-center gap-1">
                    <Users size={11} />
                    {city.hard_waitlist_total.toLocaleString()} waitlist
                    {city.hard_waitlist_7d > 0 && (
                      <span className="text-green-600 font-medium">+{city.hard_waitlist_7d}/wk</span>
                    )}
                  </span>
                )}
                {ratio && (
                  <span className={genderOk === false ? 'text-orange-500 font-medium' : ''}>
                    {ratio.femalePct}%F / {ratio.malePct}%M
                    {genderOk === false && ' ⚠'}
                  </span>
                )}
                {city.match_quality_score > 0 && (
                  <span className="flex items-center gap-1">
                    <TrendingUp size={11} />
                    Quality {city.match_quality_score}
                  </span>
                )}
                {city.median_good_matches_per_user != null && (
                  <span>Median matches: {city.median_good_matches_per_user}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent releases */}
      {recentReleases.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-3">Recent Releases</h3>
          <div className="space-y-2">
            {recentReleases.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 text-sm">
                <div>
                  <span className="font-medium text-gray-800">{r.city_normalized}</span>
                  {r.notes && <span className="text-gray-400 ml-2 text-xs">— {r.notes}</span>}
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(r.released_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Release confirmation modal */}
      {releaseConfirmCity && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Release city</h3>
              <button
                onClick={() => setReleaseConfirmCity(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              This flips{' '}
              <strong>{cities.find(c => c.city_normalized === releaseConfirmCity)?.display_name}</strong>{' '}
              from <em>ready</em> → <em>live</em> and enables matches for verified users in this city.
            </p>
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500 block mb-1.5">
                Release notes (optional)
              </label>
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
              <button
                onClick={() => setReleaseConfirmCity(null)}
                className="flex-1 py-3 border-2 border-gray-200 rounded-full text-sm font-medium hover:border-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRelease}
                disabled={!!releasingCity}
                className="flex-1 py-3 bg-[#7B5EA7] text-white rounded-full text-sm font-medium hover:bg-[#7B5EA7]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {releasingCity ? (
                  <><RefreshCw size={13} className="animate-spin" /> Releasing…</>
                ) : (
                  <><Rocket size={13} /> Release</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

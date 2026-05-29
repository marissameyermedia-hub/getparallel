import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play } from 'lucide-react';
import { ADMIN_FUNCTION_URL, getAuthHeaders } from '../../utils/supabase/client';

interface PulseData {
  signups_24h: number;
  completed_profiles_total: number;
  active_subscriptions: number;
  otp_failures_24h: number;
  photodna_flags_7d: number;
  persona_verifications_7d: number;
  persona_failures_7d: number;
  user_reports_7d: number;
  underage_reports_7d: number;
  auto_suspends_7d: number;
  matches_24h: number;
  generated_at: string;
}

interface AdminPulsePanelProps {
  accessToken: string | null;
}

type Flag = 'red' | 'yellow' | null;

interface TileConfig {
  label: string;
  getValue: (d: PulseData) => number;
  getFlag: (d: PulseData) => Flag;
}

const ROWS: Array<{ section: string; cols: string; tiles: TileConfig[] }> = [
  {
    section: 'Growth',
    cols: 'grid-cols-2',
    tiles: [
      { label: 'Signups 24h', getValue: d => d.signups_24h, getFlag: () => null },
      { label: 'Completed Profiles', getValue: d => d.completed_profiles_total, getFlag: () => null },
    ],
  },
  {
    section: 'Revenue',
    cols: 'grid-cols-1',
    tiles: [
      {
        label: 'Active Subscriptions',
        getValue: d => d.active_subscriptions,
        getFlag: d => d.active_subscriptions === 0 ? 'yellow' : null,
      },
    ],
  },
  {
    section: 'Safety',
    cols: 'grid-cols-2 sm:grid-cols-4',
    tiles: [
      { label: 'OTP Failures 24h', getValue: d => d.otp_failures_24h, getFlag: d => d.otp_failures_24h > 0 ? 'red' : null },
      { label: 'PhotoDNA Flags 7d', getValue: d => d.photodna_flags_7d, getFlag: d => d.photodna_flags_7d > 0 ? 'red' : null },
      { label: 'Underage Reports 7d', getValue: d => d.underage_reports_7d, getFlag: d => d.underage_reports_7d > 0 ? 'red' : null },
      { label: 'Auto-Suspends 7d', getValue: d => d.auto_suspends_7d, getFlag: d => d.auto_suspends_7d > 0 ? 'yellow' : null },
    ],
  },
  {
    section: 'Integrations',
    cols: 'grid-cols-2',
    tiles: [
      { label: 'Persona Verifications 7d', getValue: d => d.persona_verifications_7d, getFlag: () => null },
      { label: 'Persona Failures 7d', getValue: d => d.persona_failures_7d, getFlag: d => d.persona_failures_7d > 0 ? 'red' : null },
    ],
  },
  {
    section: 'Matching',
    cols: 'grid-cols-2',
    tiles: [
      { label: 'User Reports 7d', getValue: d => d.user_reports_7d, getFlag: d => d.user_reports_7d > 0 ? 'yellow' : null },
      { label: 'Matches 24h', getValue: d => d.matches_24h, getFlag: () => null },
    ],
  },
];

function Tile({ label, value, flag }: { label: string; value: number; flag: Flag }) {
  return (
    <div
      className={`relative bg-white rounded-2xl p-4 border border-gray-200 ${
        flag === 'red'
          ? 'border-l-4 border-l-red-500'
          : flag === 'yellow'
          ? 'border-l-4 border-l-yellow-500'
          : ''
      }`}
    >
      {flag === null && (
        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400" />
      )}
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div
        className={`text-2xl font-bold ${
          flag === 'red'
            ? 'text-red-600'
            : flag === 'yellow'
            ? 'text-yellow-600'
            : 'text-gray-900'
        }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} at ${timePart}`;
}

interface MatchRunResult {
  name: string;
  ok: boolean;
  matched?: number;
  error?: string;
}

export function AdminPulsePanel({ accessToken }: AdminPulsePanelProps) {
  const [data, setData] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [matchingRunning, setMatchingRunning] = useState(false);
  const [matchingResults, setMatchingResults] = useState<MatchRunResult[] | null>(null);

  const fetchPulse = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setError(false);
    }

    try {
      const res = await fetch(`${ADMIN_FUNCTION_URL}/pulse`, {
        headers: getAuthHeaders(accessToken),
      });
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchPulse();
  }, [fetchPulse]);

  const runMatchingAll = useCallback(async () => {
    setMatchingRunning(true);
    setMatchingResults(null);
    try {
      const res = await fetch(`${ADMIN_FUNCTION_URL}/run-matching-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Request failed');
      const json = await res.json();
      setMatchingResults(json.results ?? []);
    } catch {
      setMatchingResults([{ name: 'Error', ok: false, error: 'Request failed — check logs' }]);
    } finally {
      setMatchingRunning(false);
    }
  }, [accessToken]);

  const redCount = data
    ? [
        data.otp_failures_24h > 0,
        data.photodna_flags_7d > 0,
        data.underage_reports_7d > 0,
        data.persona_failures_7d > 0,
      ].filter(Boolean).length
    : 0;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div className="h-4 w-32 bg-gray-200 rounded-lg animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <p className="text-sm text-red-500">Pulse unavailable — check edge function logs</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {redCount > 0 ? (
        <div className="bg-red-600 text-white text-sm font-medium px-5 py-3">
          ⚠️ Action required — {redCount} item{redCount !== 1 ? 's' : ''} need attention
        </div>
      ) : (
        <div className="bg-green-600 text-white text-sm font-medium px-5 py-3">
          ✅ All systems healthy
        </div>
      )}

      <div className="p-5 space-y-5">
        {ROWS.map(({ section, cols, tiles }) => (
          <div key={section}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {section}
            </div>
            <div className={`grid gap-3 ${cols}`}>
              {tiles.map(({ label, getValue, getFlag }) => (
                <Tile
                  key={label}
                  label={label}
                  value={getValue(data)}
                  flag={getFlag(data)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 pb-4 border-t border-gray-100 pt-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Beta Matching
        </div>
        <button
          onClick={runMatchingAll}
          disabled={matchingRunning}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Play className={`w-3.5 h-3.5 ${matchingRunning ? 'opacity-50' : ''}`} />
          {matchingRunning ? 'Running matching…' : 'Run matching for all users'}
        </button>
        {matchingResults && (
          <div className="mt-3 space-y-1">
            {matchingResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={r.ok ? 'text-green-600' : 'text-red-500'}>
                  {r.ok ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 font-medium">{r.name}</span>
                {r.ok && <span className="text-gray-400">{r.matched} match{r.matched !== 1 ? 'es' : ''}</span>}
                {!r.ok && <span className="text-red-400">{r.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>


      <div className="px-5 pb-5 flex items-center justify-between border-t border-gray-100 pt-3">
        <p className="text-xs text-gray-400">
          Last updated: {formatTimestamp(data.generated_at)}
        </p>
        <button
          onClick={() => fetchPulse(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50 transition-colors"
          aria-label="Refresh pulse data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    </div>
  );
}

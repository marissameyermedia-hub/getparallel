import { useEffect, useState } from 'react';
import { Clock, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';

type ReleaseRow = {
  city_normalized: string;
  city_name: string;
  released_at: string;
  released_by: string | null;
  user_count: number | null;
  median_quality: number | null;
  notes: string | null;
};

export function AdminReleases() {
  const [rows, setRows] = useState<ReleaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    const { data, error: err } = await supabase.rpc('get_releases_log');
    if (err) setError(err.message);
    else setRows((data ?? []) as ReleaseRow[]);
    setIsLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (isLoading) {
    return (
      <div className="p-6 space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-[#7B5EA7]" />
          <h2 className="text-base font-semibold text-gray-900">Release History</h2>
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
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-600">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {rows.length === 0 && !error ? (
        <div className="border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">No cities have been released yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">City</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Released</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">By</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Users</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Median quality</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={`${r.city_normalized}-${r.released_at}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.city_name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(r.released_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{r.released_by ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-900 text-right tabular-nums hidden md:table-cell">{r.user_count?.toLocaleString() ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-900 text-right tabular-nums hidden md:table-cell">{r.median_quality?.toFixed(1) ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">{r.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

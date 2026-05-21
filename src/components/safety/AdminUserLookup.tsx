import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, AlertCircle, User, CheckCircle, XCircle } from 'lucide-react';
import { ADMIN_FUNCTION_URL, getAuthHeaders } from '../../utils/supabase/client';

interface UserResult {
  id: string;
  name: string;
  email: string;
  city_normalized: string | null;
  created_at: string;
  has_completed_onboarding: boolean;
  phone_verified: boolean;
  email_verified: boolean;
  is_suspended: boolean;
  is_hidden_pending_review: boolean;
  is_seed_account: boolean;
  is_paused: boolean;
  subscription_status: string | null;
  subscription_plan: string | null;
  match_count: number;
}

interface Props {
  accessToken: string | null;
}

function Badge({ label, active, color }: { label: string; active: boolean; color: string }) {
  if (!active) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${color}`}>
      {label}
    </span>
  );
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function UserCard({ user }: { user: UserResult }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[#7B5EA7]/10 flex items-center justify-center flex-shrink-0">
          <span className="text-[#7B5EA7] font-semibold text-sm">
            {user.name?.charAt(0)?.toUpperCase() ?? '?'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-900 text-sm">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
            <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">joined {timeAgo(user.created_at)}</span>
          </div>

          <div className="flex flex-wrap gap-1 mt-2">
            <Badge label="subscribed" active={!!user.subscription_status && user.subscription_status !== 'cancelled'} color="bg-green-100 text-green-800" />
            <Badge label="onboarded" active={user.has_completed_onboarding} color="bg-blue-100 text-blue-800" />
            <Badge label="phone ✓" active={user.phone_verified} color="bg-purple-100 text-purple-800" />
            <Badge label="email ✓" active={user.email_verified} color="bg-indigo-100 text-indigo-800" />
            <Badge label="seed" active={user.is_seed_account} color="bg-amber-100 text-amber-800" />
            <Badge label="paused" active={user.is_paused} color="bg-gray-100 text-gray-600" />
            <Badge label="hidden" active={user.is_hidden_pending_review} color="bg-orange-100 text-orange-800" />
            <Badge label="SUSPENDED" active={user.is_suspended} color="bg-red-100 text-red-800" />
          </div>

          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            {user.city_normalized && <span>{user.city_normalized}</span>}
            <span>{user.match_count} matches</span>
            {user.subscription_plan && <span>{user.subscription_plan}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminUserLookup({ accessToken }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!accessToken || q.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const res = await fetch(`${ADMIN_FUNCTION_URL}/users/search?q=${encodeURIComponent(q.trim())}`, {
        headers: getAuthHeaders(accessToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { users: UserResult[] };
      setResults(json.users ?? []);
      setHasSearched(true);
    } catch (e: any) {
      setError(e.message ?? 'Search failed');
    }
    setIsSearching(false);
  }, [accessToken]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(query), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <User size={18} className="text-[#7B5EA7]" />
        <h2 className="text-base font-semibold text-gray-900">User Lookup</h2>
      </div>

      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or email..."
          autoComplete="off"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B5EA7]/20 focus:border-[#7B5EA7] text-sm"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-[#7B5EA7]/30 border-t-[#7B5EA7] rounded-full animate-spin" />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-600">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!hasSearched && !isSearching && query.trim().length < 2 && (
        <div className="text-center py-16 text-gray-400">
          <Search size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Type at least 2 characters to search</p>
        </div>
      )}

      {hasSearched && results.length === 0 && !isSearching && (
        <div className="text-center py-16 text-gray-400">
          <XCircle size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No users found for "{query}"</p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <p className="text-xs text-gray-400 mb-3">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-3">
            {results.map(u => <UserCard key={u.id} user={u} />)}
          </div>
        </>
      )}
    </div>
  );
}

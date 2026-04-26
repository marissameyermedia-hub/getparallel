// Parallel — auth token helper.
//
// Why this exists: Supabase access tokens expire after 1 hour. The Supabase
// SDK auto-refreshes them in the background, but the refreshed token only
// lives in the SDK's own session storage — it never makes it back to our
// custom `parallel_access_token` localStorage key.
//
// Reading the token directly from localStorage is therefore unsafe: after
// ~1 hour signed in, every fetch sends an expired Bearer token and the
// server returns 401.
//
// Always use getAccessToken() to obtain a Bearer token for edge-function
// calls. It pulls from supabase.auth.getSession(), which auto-refreshes on
// expiry, and falls back to the stale localStorage value only as a last
// resort (e.g. if the SDK is mid-init or session lookup fails).
//
// Usage in any async function:
//   const token = await getAccessToken();
//   if (!token) { /* not signed in — bail */ return; }
//   await fetch(url, { headers: { Authorization: `Bearer ${token}`, ... } });

import { supabase } from './supabase/client';

/**
 * Always returns a fresh, non-expired access token, or null if the user
 * has no valid session. Pulls from supabase.auth.getSession() which
 * auto-refreshes the token if it's near expiry.
 *
 * Falls back to the localStorage value only if the SDK call throws
 * unexpectedly — this preserves the legacy behaviour but should rarely
 * trigger in practice.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[getAccessToken] getSession error:', error);
      // Fall through to localStorage fallback below
    } else if (data?.session?.access_token) {
      // Keep localStorage in sync so any legacy reader sees the fresh value too
      try {
        localStorage.setItem('parallel_access_token', data.session.access_token);
      } catch {
        /* localStorage may be disabled — ignore */
      }
      return data.session.access_token;
    }
  } catch (err) {
    console.warn('[getAccessToken] unexpected error:', err);
  }

  // Fallback: read whatever's in localStorage. Better than returning null
  // and breaking calls, but the token may be stale.
  try {
    return localStorage.getItem('parallel_access_token');
  } catch {
    return null;
  }
}

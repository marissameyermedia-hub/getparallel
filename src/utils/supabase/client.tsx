import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const supabaseUrl = `https://${projectId}.supabase.co`;

// ── PWA session bridge ────────────────────────────────────────────────────────
// On iOS, adding to home screen creates a sandboxed context with its own
// localStorage that doesn't share with Safari — so Supabase sessions are lost.
// Cookies ARE shared between Safari and the PWA standalone context, so we
// store only the refresh_token there (the access_token JWT can exceed the
// 4096-byte cookie limit). On PWA first-launch, getItem reconstructs a minimal
// session blob from the stored refresh token so Supabase can call refreshSession
// and restore the full session without the user re-logging-in.
const COOKIE_RT_KEY = 'pwa_sb_rt'; // refresh-token cookie name

function _escapeForRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function _setCookie(name: string, value: string) {
  const expires = new Date(Date.now() + 365 * 864e5).toUTCString();
  const secure = location.protocol === 'https:' ? ';Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax${secure}`;
}
function _getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + _escapeForRegex(name) + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function _deleteCookie(name: string) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
}

const cookieBridgeStorage = {
  getItem(key: string): string | null {
    try {
      const fromLocal = localStorage.getItem(key);
      if (fromLocal) return fromLocal;
    } catch { /* localStorage unavailable */ }
    // PWA first-launch: localStorage is empty. Reconstruct a minimal session
    // blob containing just the refresh_token so Supabase can call refreshSession.
    const rt = _getCookie(COOKIE_RT_KEY);
    if (rt && key.endsWith('-auth-token')) {
      return JSON.stringify({ access_token: '', refresh_token: rt, token_type: 'bearer', expires_in: 0, expires_at: 0, user: { id: '' } });
    }
    return null;
  },
  setItem(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* quota */ }
    // Extract and persist only the refresh_token to the cookie.
    if (key.endsWith('-auth-token')) {
      try {
        const session = JSON.parse(value);
        if (session?.refresh_token) _setCookie(COOKIE_RT_KEY, session.refresh_token);
      } catch { /* malformed — skip */ }
    }
  },
  removeItem(key: string): void {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    if (key.endsWith('-auth-token')) _deleteCookie(COOKIE_RT_KEY);
  },
};

// Detect dev gallery mode so we can short-circuit auth. The dev gallery needs
// supabase.auth.getSession() to return a fake session (otherwise components
// like NotificationsView that guard on `if (!session) throw` will bail out
// before ever calling fetch — and the fetch interceptor won't get a chance
// to return mock data).
const isDevGallery =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('dev') === '1';

const realClient = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: cookieBridgeStorage,
  },
});

// In dev gallery mode, wrap the real client so auth methods return mock data.
// Everything else (realtime, storage, etc) still points at the real client
// but the window.fetch interceptor catches anything that would actually go
// over the wire.
export const supabase = isDevGallery
  ? ({
      ...realClient,
      auth: {
        ...realClient.auth,
        getSession: async () => ({
          data: {
            session: {
              access_token: 'dev-fake-access-token',
              refresh_token: 'dev-fake-refresh-token',
              expires_in: 3600,
              token_type: 'bearer',
              user: {
                id: 'dev-user-00000000-0000-0000-0000-000000000001',
                email: 'dev@example.com',
                phone: '+12535551234',
              },
            },
          },
          error: null,
        }),
        getUser: async () => ({
          data: {
            user: {
              id: 'dev-user-00000000-0000-0000-0000-000000000001',
              email: 'dev@example.com',
              phone: '+12535551234',
            },
          },
          error: null,
        }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
      },
    } as unknown as typeof realClient)
  : realClient;

// Full URL for the main edge function.
export const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/make-server-7af08c19`;

// Dedicated auth function (signup, etc). Sidesteps the make-server OPTIONS bug
// by living at its own slug. Matches the pattern used by EMAIL_FUNCTION_URL.
export const AUTH_FUNCTION_URL = `${supabaseUrl}/functions/v1/auth`;

// Dedicated email function (verification send/resend/verify/status).
export const EMAIL_FUNCTION_URL = `${supabaseUrl}/functions/v1/email`;

// Dedicated onboarding function. Handles: /progress, /user/profile, /user/complete-onboarding,
// /user/location, /user/category-weights, /location/search, /location/reverse, /photos/upload,
// /attachment/score. Sidesteps the make-server OPTIONS bug.
export const ONBOARDING_FUNCTION_URL = `${supabaseUrl}/functions/v1/onboarding`;

// Dedicated matches function. Handles: /list, /mutual, /mutual-waiting, /action,
// /feedback/structured, /feedback/confirm-met, /feedback/tier2.
export const MATCHES_FUNCTION_URL = `${supabaseUrl}/functions/v1/matches`;

// Dedicated messaging function. Handles: /conversations, /:matchId, /mark-read,
// /realtime-config, /send.
export const MESSAGES_FUNCTION_URL = `${supabaseUrl}/functions/v1/messages`;

// Dedicated feedback-processor function. Handles: /process-user, /process-all.
// Called fire-and-forget after every feedback save to recompute per-user
// matching weights from accumulated structured_feedback and date_reviews.
export const FEEDBACK_PROCESSOR_URL = `${supabaseUrl}/functions/v1/feedback-processor`;

// Dedicated date-agent function. Handles: /generate.
export const DATE_AGENT_FUNCTION_URL = `${supabaseUrl}/functions/v1/date-agent`;

// Dedicated waitlist function. Handles: POST / (signup).
export const WAITLIST_FUNCTION_URL = `${supabaseUrl}/functions/v1/waitlist-signup`;

// Dedicated misc function — final chunk of the make-server rebuild.
// Handles: /auth/email-confirmed, /auth/resend-verification, /auth/validate-token,
// /auth/send-phone-otp, /auth/verify-phone-otp, /sms/log-consent,
// /verification/complete, /verification/consent,
// /safety/block, /safety/blocked, /safety/report,
// /notifications/preferences (GET/PUT),
// /paypal/config, /paypal/record-subscription, /payment/cancel,
// /promo/redeem, /referral/my-code,
// /exit-feedback, /app-feedback, /nps, /success/submit, /user/feedback,
// /account/export, /user/delete.
export const MISC_FUNCTION_URL = `${supabaseUrl}/functions/v1/misc`;

// Admin-only API. Handles: /check (is_admin), /cities (city_health + thresholds + release_log).
export const ADMIN_FUNCTION_URL = `${supabaseUrl}/functions/v1/admin-api`;

// Release-city edge function — flips a city from ready → live.
export const RELEASE_CITY_FUNCTION_URL = `${supabaseUrl}/functions/v1/release-city`;

// Affiliate function — tracked link clicks, signup attribution, promo code validation.
export const AFFILIATE_FUNCTION_URL = `${supabaseUrl}/functions/v1/affiliate`;

export function getAuthHeaders(accessToken: string) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'apikey': publicAnonKey,
    'Content-Type': 'application/json',
  };
}
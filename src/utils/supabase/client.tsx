import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const supabaseUrl = `https://${projectId}.supabase.co`;

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

export function getAuthHeaders(accessToken: string) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'apikey': publicAnonKey,
    'Content-Type': 'application/json',
  };
}
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
    } as typeof realClient)
  : realClient;

// Full URL for the main edge function.
export const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/make-server-7af08c19`;

export function getAuthHeaders(accessToken: string) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'apikey': publicAnonKey,
    'Content-Type': 'application/json',
  };
}
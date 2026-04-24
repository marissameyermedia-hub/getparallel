import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const supabaseUrl = `https://${projectId}.supabase.co`;

export const supabase: SupabaseClient = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

// Full URL for the main edge function deployed on the user's Supabase project.
export const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/make-server-7af08c19`;

export function getAuthHeaders(accessToken: string) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'apikey': publicAnonKey,
    'Content-Type': 'application/json',
  };
}

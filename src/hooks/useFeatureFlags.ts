import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase/client';

export type FeatureFlags = Record<string, boolean>;

// Module-level cache — flags load once per page session, never re-fetched.
let cache: FeatureFlags | null = null;
let inflightPromise: Promise<FeatureFlags> | null = null;

async function loadFlags(): Promise<FeatureFlags> {
  if (cache !== null) return cache;
  if (inflightPromise) return inflightPromise;

  inflightPromise = supabase
    .from('feature_flags')
    .select('flag_key, enabled')
    .then(({ data }) => {
      const result: FeatureFlags = {};
      for (const row of data ?? []) result[row.flag_key] = row.enabled === true;
      cache = result;
      inflightPromise = null;
      return result;
    })
    .catch(() => {
      inflightPromise = null;
      return {} as FeatureFlags;
    });

  return inflightPromise;
}

export function useFeatureFlags(): { flags: FeatureFlags; loaded: boolean } {
  const [flags, setFlags] = useState<FeatureFlags>(cache ?? {});
  const [loaded, setLoaded] = useState(cache !== null);

  useEffect(() => {
    if (cache !== null) {
      setFlags(cache);
      setLoaded(true);
      return;
    }
    loadFlags().then((result) => {
      setFlags(result);
      setLoaded(true);
    });
  }, []);

  return { flags, loaded };
}

// Imperative loader for App.tsx — call once on auth success.
export { loadFlags };

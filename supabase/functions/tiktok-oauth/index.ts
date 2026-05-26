import { createClient } from 'jsr:@supabase/supabase-js@2';

const TIKTOK_CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY')!;
const TIKTOK_CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET')!;
const REDIRECT_URI = 'https://parallel-planner.netlify.app/tiktok-callback';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { code } = await req.json();
    if (!code) throw new Error('Missing code');

    // Exchange code for tokens
    const params = new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    });

    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error && tokenData.error !== 'ok') {
      throw new Error(`TikTok OAuth error: ${JSON.stringify(tokenData)}`);
    }

    const { access_token, refresh_token, open_id, expires_in, refresh_expires_in } = tokenData;
    const now = Date.now();
    const expires_at = new Date(now + expires_in * 1000).toISOString();
    const refresh_expires_at = new Date(now + refresh_expires_in * 1000).toISOString();

    // Store in DB (upsert — only one credential row needed for single-user app)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: dbError } = await supabase
      .from('tiktok_credentials')
      .upsert({ open_id, access_token, refresh_token, expires_at, refresh_expires_at }, { onConflict: 'open_id' });

    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    return new Response(
      JSON.stringify({ ok: true, open_id }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});

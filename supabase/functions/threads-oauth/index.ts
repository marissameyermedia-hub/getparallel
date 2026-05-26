import { createClient } from 'jsr:@supabase/supabase-js@2';

const THREADS_APP_ID = Deno.env.get('THREADS_APP_ID')!;
const THREADS_APP_SECRET = Deno.env.get('THREADS_APP_SECRET')!;
const REDIRECT_URI = 'https://parallel-planner.netlify.app/threads-callback';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { code } = await req.json();
    if (!code) throw new Error('Missing code');

    // Exchange code for short-lived token
    const shortParams = new URLSearchParams({
      client_id: THREADS_APP_ID,
      client_secret: THREADS_APP_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const shortRes = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: shortParams.toString(),
    });

    const shortData = await shortRes.json();
    if (shortData.error) {
      throw new Error(`Threads short-lived token error: ${JSON.stringify(shortData.error)}`);
    }

    const { access_token: shortToken, user_id } = shortData;
    if (!shortToken || !user_id) {
      throw new Error(`Unexpected token response: ${JSON.stringify(shortData)}`);
    }

    // Exchange short-lived for long-lived token (60 days)
    const longUrl = new URL('https://graph.threads.net/access_token');
    longUrl.searchParams.set('grant_type', 'th_exchange_token');
    longUrl.searchParams.set('client_id', THREADS_APP_ID);
    longUrl.searchParams.set('client_secret', THREADS_APP_SECRET);
    longUrl.searchParams.set('access_token', shortToken);

    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    if (longData.error) {
      throw new Error(`Threads long-lived token error: ${JSON.stringify(longData.error)}`);
    }

    const { access_token, expires_in } = longData;
    if (!access_token) {
      throw new Error(`No long-lived token returned: ${JSON.stringify(longData)}`);
    }

    const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

    // Store in DB (upsert on user_id — single-user app)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: dbError } = await supabase
      .from('threads_credentials')
      .upsert(
        { user_id: String(user_id), access_token, expires_at, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    return new Response(
      JSON.stringify({ ok: true, user_id }),
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

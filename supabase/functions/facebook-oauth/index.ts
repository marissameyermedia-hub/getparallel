import { createClient } from 'jsr:@supabase/supabase-js@2';

const FACEBOOK_APP_ID = Deno.env.get('FACEBOOK_APP_ID')!;
const FACEBOOK_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET')!;
const REDIRECT_URI = 'https://parallel-planner.netlify.app/facebook-callback';
const GRAPH = 'https://graph.facebook.com/v25.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { code } = await req.json();
    if (!code) throw new Error('Missing code');

    // 1. Exchange code for short-lived user token
    const shortUrl = new URL(`${GRAPH}/oauth/access_token`);
    shortUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    shortUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
    shortUrl.searchParams.set('code', code);
    shortUrl.searchParams.set('redirect_uri', REDIRECT_URI);

    const shortRes = await fetch(shortUrl.toString());
    const shortData = await shortRes.json();
    if (shortData.error) throw new Error(`Token exchange error: ${JSON.stringify(shortData.error)}`);
    const shortToken = shortData.access_token;
    if (!shortToken) throw new Error(`No access_token in response: ${JSON.stringify(shortData)}`);

    // 2. Exchange for long-lived user token (~60 days)
    const longUrl = new URL(`${GRAPH}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    longUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
    longUrl.searchParams.set('fb_exchange_token', shortToken);

    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    if (longData.error) throw new Error(`Long-lived token error: ${JSON.stringify(longData.error)}`);
    const userToken = longData.access_token;
    const expiresIn = longData.expires_in ?? 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3. Get pages via /me/accounts (page tokens from long-lived user token are themselves long-lived)
    const accountsUrl = new URL(`${GRAPH}/me/accounts`);
    accountsUrl.searchParams.set('access_token', userToken);
    accountsUrl.searchParams.set('fields', 'id,name,access_token');

    const accountsRes = await fetch(accountsUrl.toString());
    const accountsData = await accountsRes.json();
    if (accountsData.error) throw new Error(`/me/accounts error: ${JSON.stringify(accountsData.error)}`);

    const pages = accountsData.data ?? [];
    if (pages.length === 0) throw new Error('No Facebook Pages found for this account');

    // Prefer a page with "parallel" in the name, fall back to first page
    const page = pages.find((p: any) =>
      p.name?.toLowerCase().includes('parallel') || p.name?.toLowerCase().includes('para//el')
    ) ?? pages[0];

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: dbError } = await supabase
      .from('facebook_credentials')
      .upsert(
        {
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
          user_access_token: userToken,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'page_id' }
      );

    if (dbError) throw new Error(`DB error: ${dbError.message}`);

    return new Response(
      JSON.stringify({ ok: true, page_id: page.id, page_name: page.name }),
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

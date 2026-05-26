import { createClient } from 'jsr:@supabase/supabase-js@2';

const FACEBOOK_APP_ID = Deno.env.get('FACEBOOK_APP_ID')!;
const FACEBOOK_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET')!;
const REDIRECT_URI = 'https://parallel-planner.netlify.app/facebook-callback';
const GRAPH = 'https://graph.facebook.com/v25.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getPages(userToken: string): Promise<any[]> {
  // Primary: /me/accounts lists all pages the user has a role on
  const accountsUrl = new URL(`${GRAPH}/me/accounts`);
  accountsUrl.searchParams.set('access_token', userToken);
  accountsUrl.searchParams.set('fields', 'id,name,access_token,tasks');
  accountsUrl.searchParams.set('limit', '100');

  const accountsRes = await fetch(accountsUrl.toString());
  const accountsData = await accountsRes.json();
  if (accountsData.error) {
    throw new Error(`/me/accounts error: ${JSON.stringify(accountsData.error)}`);
  }

  if ((accountsData.data ?? []).length > 0) {
    return accountsData.data;
  }

  // Fallback: page may live inside a Business Portfolio
  // requires business_management scope — silently skip if not granted
  const bizUrl = new URL(`${GRAPH}/me/businesses`);
  bizUrl.searchParams.set('access_token', userToken);
  bizUrl.searchParams.set('fields', 'id,name,owned_pages{id,name,access_token}');
  bizUrl.searchParams.set('limit', '50');

  const bizRes = await fetch(bizUrl.toString());
  const bizData = await bizRes.json();

  if (!bizData.error && Array.isArray(bizData.data)) {
    const pages: any[] = [];
    for (const biz of bizData.data) {
      if (biz.owned_pages?.data) pages.push(...biz.owned_pages.data);
    }
    if (pages.length > 0) return pages;
  }

  // Nothing found — surface a diagnostic error so it's actionable
  throw new Error(
    `No Facebook Pages found for this account. ` +
    `/me/accounts returned: ${JSON.stringify(accountsData)}. ` +
    `Ensure you are an Admin (not just Editor/Moderator) of the Para//el. page ` +
    `and that "pages_show_list" permission was granted during login. ` +
    `Try reconnecting using the URL with business_management scope added.`
  );
}

function findParallelPage(pages: any[]): any {
  // Match: "para//el", "parallel", or any name containing "para" followed by "el"
  // Page name is "Para//el." — normalise slashes/dots out before comparing
  return (
    pages.find((p: any) => {
      const raw = (p.name ?? '').toLowerCase();
      const norm = raw.replace(/[^a-z0-9]/g, ''); // strip special chars
      return (
        raw.includes('parallel') ||
        raw.includes('para//el') ||
        norm.includes('parallelvip') ||
        norm.includes('parallelel') ||  // "para" + "//" removed + "el"
        norm.startsWith('para') && norm.endsWith('el')
      );
    }) ?? pages[0]
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { code } = await req.json();
    if (!code) throw new Error('Missing code');

    // 1. Exchange code → short-lived user token
    const shortUrl = new URL(`${GRAPH}/oauth/access_token`);
    shortUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    shortUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
    shortUrl.searchParams.set('code', code);
    shortUrl.searchParams.set('redirect_uri', REDIRECT_URI);

    const shortRes = await fetch(shortUrl.toString());
    const shortData = await shortRes.json();
    if (shortData.error) throw new Error(`Token exchange error: ${JSON.stringify(shortData.error)}`);
    const shortToken = shortData.access_token;
    if (!shortToken) throw new Error(`No access_token: ${JSON.stringify(shortData)}`);

    // 2. Exchange short-lived → long-lived user token (~60 days)
    const longUrl = new URL(`${GRAPH}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    longUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
    longUrl.searchParams.set('fb_exchange_token', shortToken);

    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    if (longData.error) throw new Error(`Long-lived token error: ${JSON.stringify(longData.error)}`);
    const userToken = longData.access_token;
    if (!userToken) throw new Error(`No long-lived token: ${JSON.stringify(longData)}`);
    const expiresIn = longData.expires_in ?? 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3. Get pages — tries /me/accounts, falls back to Business Portfolio
    const pages = await getPages(userToken);

    // 4. Pick the Para//el. page (or first page if no match)
    const page = findParallelPage(pages);

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

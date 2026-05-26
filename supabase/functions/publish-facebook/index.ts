import { createClient } from 'jsr:@supabase/supabase-js@2';

const FACEBOOK_APP_ID = Deno.env.get('FACEBOOK_APP_ID')!;
const FACEBOOK_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET')!;
const GRAPH = 'https://graph.facebook.com/v25.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshCredentials(
  supabase: any,
  cred: any
): Promise<{ pageToken: string; pageId: string }> {
  const longUrl = new URL(`${GRAPH}/oauth/access_token`);
  longUrl.searchParams.set('grant_type', 'fb_exchange_token');
  longUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
  longUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
  longUrl.searchParams.set('fb_exchange_token', cred.user_access_token);

  const longRes = await fetch(longUrl.toString());
  const longData = await longRes.json();
  if (longData.error) throw new Error(`Token refresh error: ${JSON.stringify(longData.error)}`);

  const userToken = longData.access_token;
  const expiresIn = longData.expires_in ?? 5184000;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const accountsUrl = new URL(`${GRAPH}/me/accounts`);
  accountsUrl.searchParams.set('access_token', userToken);
  accountsUrl.searchParams.set('fields', 'id,name,access_token');

  const accountsRes = await fetch(accountsUrl.toString());
  const accountsData = await accountsRes.json();
  if (accountsData.error) throw new Error(`/me/accounts error: ${JSON.stringify(accountsData.error)}`);

  const pages = accountsData.data ?? [];
  const page = pages.find((p: any) => p.id === cred.page_id) ?? pages[0];
  if (!page) throw new Error('Could not find page during token refresh');

  await supabase
    .from('facebook_credentials')
    .update({
      page_access_token: page.access_token,
      user_access_token: userToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cred.id);

  return { pageToken: page.access_token, pageId: page.id };
}

async function fbPost(
  path: string,
  params: Record<string, string>,
  accessToken: string
): Promise<any> {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Facebook API error: ${JSON.stringify(data.error)}`);
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { slide_urls, caption, hashtags } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: creds, error: credError } = await supabase
      .from('facebook_credentials')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (credError || !creds) throw new Error('No Facebook credentials found — run OAuth first');

    // Auto-refresh if within 24 hours of user token expiry
    let pageToken = creds.page_access_token;
    let pageId = creds.page_id;
    const expiresAt = new Date(creds.expires_at).getTime();
    if (Date.now() > expiresAt - 24 * 60 * 60 * 1000) {
      const refreshed = await refreshCredentials(supabase, creds);
      pageToken = refreshed.pageToken;
      pageId = refreshed.pageId;
    }

    // caption + top 5 hashtags
    const top5 = (hashtags || '')
      .split(/\s+/)
      .filter((t: string) => t.startsWith('#'))
      .slice(0, 5)
      .join(' ');
    const fullCaption = top5 ? `${caption}\n\n${top5}` : caption;

    const validUrls = (slide_urls || []).filter((u: string) => u.startsWith('http'));
    if (validUrls.length === 0) throw new Error('No valid public slide URLs for Facebook');

    let postId: string;

    if (validUrls.length === 1) {
      // Single photo post — publishes immediately, returns post_id
      const result = await fbPost(`/${pageId}/photos`, {
        url: validUrls[0],
        message: fullCaption,
      }, pageToken);
      postId = result.post_id ?? result.id;
    } else {
      // Upload each image as unpublished, then publish as multi-photo feed post
      const photoIds: string[] = [];
      for (const url of validUrls) {
        const photo = await fbPost(`/${pageId}/photos`, {
          url,
          published: 'false',
        }, pageToken);
        photoIds.push(photo.id);
      }

      const attachedMedia = JSON.stringify(photoIds.map(id => ({ media_fbid: id })));
      const feedResult = await fbPost(`/${pageId}/feed`, {
        message: fullCaption,
        attached_media: attachedMedia,
      }, pageToken);
      postId = feedResult.id;
    }

    return new Response(
      JSON.stringify({ ok: true, post_id: postId }),
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

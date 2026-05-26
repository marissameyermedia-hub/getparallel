import { createClient } from 'jsr:@supabase/supabase-js@2';

const TIKTOK_CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY')!;
const TIKTOK_CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshToken(supabase: any, cred: any): Promise<string> {
  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    client_secret: TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: cred.refresh_token,
  });

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

  const now = Date.now();
  const expires_at = new Date(now + data.expires_in * 1000).toISOString();
  const refresh_expires_at = new Date(now + data.refresh_expires_in * 1000).toISOString();

  await supabase.from('tiktok_credentials').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at,
    refresh_expires_at,
    updated_at: new Date().toISOString(),
  }).eq('id', cred.id);

  return data.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { slide_urls, caption, hashtags } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Load credentials
    const { data: creds, error: credError } = await supabase
      .from('tiktok_credentials')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (credError || !creds) throw new Error('No TikTok credentials found — run OAuth first');

    // Refresh token if expired (or within 5 min of expiry)
    let accessToken = creds.access_token;
    const expiresAt = new Date(creds.expires_at).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      accessToken = await refreshToken(supabase, creds);
    }

    // Build caption (TikTok max 2200 chars)
    const top5 = (hashtags || '').split(/\s+/).filter((t: string) => t.startsWith('#')).slice(0, 5).join(' ');
    const fullCaption = top5 ? `${caption}\n\n${top5}` : caption;
    const truncated = fullCaption.slice(0, 2200);

    // Post to TikTok Content Posting API
    const body = {
      post_info: {
        title: truncated,
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        auto_add_music: true,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_images: slide_urls,
        photo_cover_index: 0,
      },
      media_type: 'PHOTO',
      post_mode: 'DIRECT_POST',
    };

    const postRes = await fetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const postData = await postRes.json();
    if (postData.error?.code && postData.error.code !== 'ok') {
      throw new Error(`TikTok post failed: ${JSON.stringify(postData.error)}`);
    }

    const publishId = postData.data?.publish_id;
    return new Response(
      JSON.stringify({ ok: true, publish_id: publishId }),
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

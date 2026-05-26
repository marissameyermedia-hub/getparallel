import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshToken(supabase: any, cred: any): Promise<string> {
  const refreshUrl = new URL('https://graph.threads.net/refresh_access_token');
  refreshUrl.searchParams.set('grant_type', 'th_refresh_token');
  refreshUrl.searchParams.set('access_token', cred.access_token);

  const res = await fetch(refreshUrl.toString());
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);

  const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await supabase
    .from('threads_credentials')
    .update({ access_token: data.access_token, expires_at, updated_at: new Date().toISOString() })
    .eq('id', cred.id);

  return data.access_token;
}

async function threadsPost(userId: string, accessToken: string, params: Record<string, string>): Promise<{ id: string }> {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Threads API error: ${JSON.stringify(data.error)}`);
  return data;
}

async function threadsPublish(userId: string, accessToken: string, creationId: string): Promise<{ id: string }> {
  const body = new URLSearchParams({ creation_id: creationId });
  const res = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Threads publish error: ${JSON.stringify(data.error)}`);
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

    // Load credentials
    const { data: creds, error: credError } = await supabase
      .from('threads_credentials')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (credError || !creds) throw new Error('No Threads credentials found — run OAuth first');

    // Refresh token if within 24 hours of expiry
    let accessToken = creds.access_token;
    const expiresAt = new Date(creds.expires_at).getTime();
    if (Date.now() > expiresAt - 24 * 60 * 60 * 1000) {
      accessToken = await refreshToken(supabase, creds);
    }

    const userId = creds.user_id;

    // Build caption: caption + top 5 hashtags, truncated to 500 chars
    const top5 = (hashtags || '').split(/\s+/).filter((t: string) => t.startsWith('#')).slice(0, 5).join(' ');
    const fullCaption = top5 ? `${caption}\n\n${top5}` : caption;
    const truncatedCaption = fullCaption.slice(0, 500);

    // Filter to valid http URLs only (same resolveUrls pattern as scheduler)
    const validUrls = (slide_urls || []).filter((u: string) => u.startsWith('http'));
    if (validUrls.length === 0) throw new Error('No valid public slide URLs for Threads');

    let threadId: string;

    if (validUrls.length === 1) {
      // Single image post
      const container = await threadsPost(userId, accessToken, {
        media_type: 'IMAGE',
        image_url: validUrls[0],
        text: truncatedCaption,
      });
      const published = await threadsPublish(userId, accessToken, container.id);
      threadId = published.id;
    } else {
      // Carousel post
      const childIds: string[] = [];
      for (const url of validUrls) {
        const item = await threadsPost(userId, accessToken, {
          media_type: 'IMAGE',
          image_url: url,
          is_carousel_item: 'true',
        });
        childIds.push(item.id);
      }

      const carousel = await threadsPost(userId, accessToken, {
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        text: truncatedCaption,
      });

      const published = await threadsPublish(userId, accessToken, carousel.id);
      threadId = published.id;
    }

    return new Response(
      JSON.stringify({ ok: true, thread_id: threadId }),
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

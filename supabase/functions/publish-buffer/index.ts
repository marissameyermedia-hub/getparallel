const BUFFER_GQL = 'https://api.buffer.com/graphql';
const TARGET_SERVICES = ['instagram', 'facebook', 'tiktok'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function gql(apiKey: string, query: string, variables?: unknown) {
  const res = await fetch(BUFFER_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Buffer HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function getConnectedChannels(apiKey: string) {
  const data = await gql(apiKey, `
    query {
      channels {
        id
        service
        name
      }
    }
  `);
  if (data.errors) throw new Error(`Buffer channels error: ${JSON.stringify(data.errors)}`);
  const all: any[] = data.data?.channels ?? [];
  return all.filter(c =>
    TARGET_SERVICES.includes((c.service ?? '').toLowerCase())
  );
}

// Look up a Facebook/Instagram location ID from a text string using the Graph API
async function resolveLocationId(locationText: string): Promise<string | null> {
  try {
    const fbPageToken = Deno.env.get('META_PAGE_ACCESS_TOKEN');
    if (!fbPageToken || !locationText) return null;

    const url = new URL('https://graph.facebook.com/v25.0/search');
    url.searchParams.set('type', 'place');
    url.searchParams.set('q', locationText);
    url.searchParams.set('limit', '1');
    url.searchParams.set('fields', 'id,name,location');
    url.searchParams.set('access_token', fbPageToken);

    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.error || !data.data?.length) return null;
    return data.data[0].id ?? null;
  } catch {
    return null;
  }
}

async function createPost(
  apiKey: string,
  channelId: string,
  service: string,
  text: string,
  imageUrls: string[],
  locationId: string | null,
  hasAudio: boolean
): Promise<string> {
  const assets = imageUrls.map(url => ({ image: { url } }));

  // Build service-specific attributes
  const serviceAttributes: Record<string, any> = {};

  if (service === 'instagram' && locationId) {
    serviceAttributes.instagramServiceAttributes = { locationId };
  }

  if (service === 'tiktok' && hasAudio) {
    // auto_add_music tells TikTok to pick today's trending sound automatically
    serviceAttributes.tiktokServiceAttributes = { autoAddMusic: true };
  }

  const input: Record<string, any> = {
    channelId,
    text,
    assets,
    schedulingType: 'automatic',
    mode: 'shareNow',
  };

  if (Object.keys(serviceAttributes).length > 0) {
    input.serviceAttributes = serviceAttributes;
  }

  const data = await gql(apiKey, `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post { id status }
        }
        ... on MutationError {
          message
        }
      }
    }
  `, { input });

  if (data.errors) throw new Error(`Buffer mutation error: ${JSON.stringify(data.errors)}`);

  const result = data.data?.createPost;
  if (!result) throw new Error('Empty response from Buffer createPost');
  if (result.message) throw new Error(`Buffer rejected post: ${result.message}`);
  return result.post?.id ?? 'unknown';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { slide_urls, caption, hashtags, location, audio } = await req.json();

    const apiKey = Deno.env.get('BUFFER_API_KEY');
    if (!apiKey) throw new Error('BUFFER_API_KEY secret not set');

    const top5 = (hashtags ?? '')
      .split(/\s+/)
      .filter((t: string) => t.startsWith('#'))
      .slice(0, 5)
      .join(' ');
    const fullText = top5 ? `${caption}\n\n${top5}` : caption;

    const validUrls = (slide_urls ?? []).filter((u: string) => u.startsWith('http'));
    if (validUrls.length === 0) throw new Error('No valid public image URLs — images must be in Supabase Storage');

    const channels = await getConnectedChannels(apiKey);
    if (channels.length === 0) throw new Error('No connected Instagram/Facebook/TikTok channels found in Buffer');

    // Resolve location text → Facebook Place ID (best-effort, used for Instagram)
    const locationId = location ? await resolveLocationId(location) : null;
    if (location && locationId) console.log(`Location resolved: "${location}" → ${locationId}`);
    if (location && !locationId) console.log(`Location "${location}" could not be resolved to a Place ID — posting without location`);

    const hasAudio = Boolean(audio && audio.trim());

    const results: { service: string; channel: string; post_id?: string; error?: string; location_applied?: boolean; auto_music?: boolean }[] = [];

    for (const ch of channels) {
      const service = ch.service.toLowerCase();
      try {
        const postId = await createPost(
          apiKey,
          ch.id,
          service,
          fullText,
          validUrls,
          service === 'instagram' ? locationId : null,
          hasAudio
        );
        results.push({
          service,
          channel: ch.name,
          post_id: postId,
          ...(service === 'instagram' && locationId ? { location_applied: true } : {}),
          ...(service === 'tiktok' && hasAudio ? { auto_music: true } : {}),
        });
        console.log(`Buffer: posted to ${service} (${ch.name}) → ${postId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If location/music caused rejection, retry without those attributes
        if ((msg.includes('locationId') || msg.includes('autoAddMusic') || msg.includes('serviceAttributes')) && (locationId || hasAudio)) {
          try {
            console.log(`Buffer: retrying ${service} without service attributes`);
            const postId = await createPost(apiKey, ch.id, service, fullText, validUrls, null, false);
            results.push({ service, channel: ch.name, post_id: postId });
          } catch (retryErr) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            results.push({ service, channel: ch.name, error: retryMsg });
          }
        } else {
          results.push({ service, channel: ch.name, error: msg });
          console.error(`Buffer: failed ${service} — ${msg}`);
        }
      }
    }

    const successes = results.filter(r => r.post_id);
    return new Response(
      JSON.stringify({ ok: successes.length > 0, results }),
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

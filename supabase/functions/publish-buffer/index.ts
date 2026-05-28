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
    throw new Error(`Buffer HTTP ${res.status}: ${text.slice(0, 600)}`);
  }
  return res.json();
}

async function getConnectedChannels(apiKey: string) {
  const accountWithChannels = await gql(apiKey, `query { account { id name channels { id service name } } }`);
  if (!accountWithChannels.errors && accountWithChannels.data?.account?.channels?.length > 0) {
    const all: any[] = accountWithChannels.data.account.channels;
    console.log(`Channels via account.channels (${all.length}): ${JSON.stringify(all.map(c => ({ id: c.id, service: c.service })))}`);
    return all.filter(c => TARGET_SERVICES.includes((c.service ?? '').toLowerCase()));
  }

  const accountId = accountWithChannels.data?.account?.id;
  if (!accountId) throw new Error(`Buffer account query failed: ${JSON.stringify(accountWithChannels)}`);

  console.log(`account.id: ${accountId}, trying channels(input: { organizationId })`);

  const data = await gql(apiKey,
    `query GetChannels($input: ChannelsInput!) { channels(input: $input) { id service name } }`,
    { input: { organizationId: accountId } }
  );
  if (data.errors) throw new Error(`Buffer channels error: ${JSON.stringify(data.errors)}`);
  const all: any[] = data.data?.channels ?? [];
  console.log(`Channels via root query (${all.length}): ${JSON.stringify(all.map(c => ({ id: c.id, service: c.service })))}`);
  const filtered = all.filter(c => TARGET_SERVICES.includes((c.service ?? '').toLowerCase()));
  if (filtered.length === 0 && all.length > 0) {
    throw new Error(`No IG/FB/TT channels. Found: ${all.map(c => c.service).join(', ')}`);
  }
  return filtered;
}

async function createPost(
  apiKey: string,
  channelId: string,
  service: string,
  text: string,
  imageUrls: string[]
): Promise<string> {
  const assets = imageUrls.map(url => ({ image: { url } }));

  // Service-specific metadata (type is required for IG and FB)
  const metadata: Record<string, any> = {};
  if (service === 'instagram') {
    metadata.instagram = { type: 'post', shouldShareToFeed: true };
  } else if (service === 'facebook') {
    metadata.facebook = { type: 'post' };
  }

  const input: Record<string, any> = {
    channelId,
    text,
    assets,
    schedulingType: 'automatic',
    mode: 'shareNow',
  };
  if (Object.keys(metadata).length > 0) input.metadata = metadata;

  const data = await gql(apiKey, `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id status } }
        ... on MutationError { message }
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
    const { slide_urls, caption, hashtags } = await req.json();

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

    const results: { service: string; channel: string; post_id?: string; error?: string }[] = [];

    for (const ch of channels) {
      const service = ch.service.toLowerCase();
      try {
        const postId = await createPost(apiKey, ch.id, service, fullText, validUrls);
        results.push({ service, channel: ch.name, post_id: postId });
        console.log(`Buffer: posted to ${service} (${ch.name}) → ${postId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ service, channel: ch.name, error: msg });
        console.error(`Buffer: failed ${service} — ${msg}`);
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

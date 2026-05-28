const BUFFER_GQL = 'https://api.buffer.com/graphql';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function gql(apiKey: string, query: string, variables?: unknown) {
  const res = await fetch(BUFFER_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Buffer HTTP ${res.status}`);
  return res.json();
}

// Try extended channel fields; fall back gracefully if schema doesn't have them
async function getChannels(apiKey: string) {
  // First try with followers + suggestedTimes
  try {
    const data = await gql(apiKey, `
      query {
        account {
          channels {
            id service name
            isDisconnected
            followers { count }
            suggestedTimes { time timezone }
          }
        }
      }
    `);
    if (!data.errors) {
      return data.data?.account?.channels ?? [];
    }
  } catch (_) { /* fall through */ }

  // Fall back: just the fields we know work, plus try followers at least
  try {
    const data = await gql(apiKey, `
      query {
        account {
          channels {
            id service name
            followers { count }
          }
        }
      }
    `);
    if (!data.errors) {
      return (data.data?.account?.channels ?? []).map((ch: any) => ({
        ...ch,
        isDisconnected: false,
        suggestedTimes: [],
      }));
    }
  } catch (_) { /* fall through */ }

  // Minimal fallback
  const data = await gql(apiKey, `query { account { channels { id service name } } }`);
  return (data.data?.account?.channels ?? []).map((ch: any) => ({
    ...ch,
    isDisconnected: false,
    followers: null,
    suggestedTimes: [],
  }));
}

// Get metrics for a map of { service → bufferPostId }
async function getPostMetrics(apiKey: string, postIds: Record<string, string>) {
  const metrics: Record<string, any> = {};
  for (const [service, postId] of Object.entries(postIds)) {
    if (!postId) continue;
    try {
      const data = await gql(apiKey, `
        query($id: ID!) {
          post(id: $id) {
            id
            status
            dueAt
            statistics {
              impressions
              reach
              likes
              comments
              shares
              saves
              videoViews
            }
          }
        }
      `, { id: postId });
      if (!data.errors) {
        metrics[service] = data.data?.post ?? null;
      } else {
        metrics[service] = null;
        console.log(`post(${postId}) errors: ${JSON.stringify(data.errors)}`);
      }
    } catch (e) {
      metrics[service] = null;
    }
  }
  return metrics;
}

// Try to get recent comments / engagement from Buffer
async function getRecentComments(apiKey: string) {
  try {
    const data = await gql(apiKey, `
      query {
        account {
          channels {
            id service name
            recentActivity {
              comments {
                id text authorName createdAt postId
              }
            }
          }
        }
      }
    `);
    if (!data.errors) {
      const channels = data.data?.account?.channels ?? [];
      return channels.flatMap((ch: any) =>
        (ch.recentActivity?.comments ?? []).map((c: any) => ({
          ...c, service: ch.service, channelName: ch.name,
        }))
      );
    }
  } catch (_) { /* fall through */ }
  return null; // signals "not available on this plan"
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { action, ...params } = await req.json();
    const apiKey = Deno.env.get('BUFFER_API_KEY');
    if (!apiKey) throw new Error('BUFFER_API_KEY not set');

    if (action === 'channels') {
      const channels = await getChannels(apiKey);
      return new Response(JSON.stringify({ ok: true, channels }),
        { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (action === 'post_metrics') {
      const { post_ids } = params as { post_ids: Record<string, string> };
      if (!post_ids || Object.keys(post_ids).length === 0) {
        return new Response(JSON.stringify({ ok: true, metrics: {} }),
          { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const metrics = await getPostMetrics(apiKey, post_ids);
      return new Response(JSON.stringify({ ok: true, metrics }),
        { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (action === 'recent_comments') {
      const comments = await getRecentComments(apiKey);
      return new Response(JSON.stringify({ ok: true, comments, available: comments !== null }),
        { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});

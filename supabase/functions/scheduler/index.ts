import { createClient } from 'jsr:@supabase/supabase-js@2';

const META_PAGE_ACCESS_TOKEN = Deno.env.get('META_PAGE_ACCESS_TOKEN')!;
const META_IG_ACCOUNT_ID = Deno.env.get('META_IG_ACCOUNT_ID')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GRAPH = 'https://graph.facebook.com/v19.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function top5Hashtags(raw: string): string {
  if (!raw) return '';
  return raw.split(/\s+/).filter(t => t.startsWith('#')).slice(0, 5).join(' ');
}

async function metaPost(path: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', META_PAGE_ACCESS_TOKEN);
  const res = await fetch(url.toString(), { method: 'POST' });
  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${JSON.stringify(data.error)}`);
  return data;
}

async function uploadBase64(supabase: any, dataUrl: string, name: string): Promise<string> {
  const commaIdx = dataUrl.indexOf(',');
  const meta = dataUrl.substring(0, commaIdx);
  const b64 = dataUrl.substring(commaIdx + 1);
  const mimeMatch = meta.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const ext = mime.split('/')[1] || 'jpg';
  const path = `auto-publish/${name}.${ext}`;
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const { error } = await supabase.storage.from('social-media').upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from('social-media').getPublicUrl(path);
  return data.publicUrl;
}

async function resolveUrls(supabase: any, slideUrls: string[], plannerKey: string): Promise<string[]> {
  const result: string[] = [];
  for (let i = 0; i < slideUrls.length; i++) {
    const url = slideUrls[i];
    if (url.startsWith('http')) {
      result.push(url);
    } else if (url.startsWith('data:')) {
      const publicUrl = await uploadBase64(supabase, url, `${plannerKey}-${Date.now()}-${i}`);
      result.push(publicUrl);
    }
  }
  return result;
}

async function publishPost(supabase: any, post: any) {
  const slideUrls = await resolveUrls(supabase, post.slide_urls, post.planner_key);
  if (slideUrls.length === 0) throw new Error('No valid slide URLs');

  const hashtags5 = top5Hashtags(post.hashtags || '');
  const fullCaption = hashtags5
    ? `${post.caption}\n\n${hashtags5}`
    : post.caption;

  let publishedId: string;

  if (slideUrls.length === 1) {
    const media = await metaPost(`/${META_IG_ACCOUNT_ID}/media`, {
      image_url: slideUrls[0], caption: fullCaption,
    });
    const published = await metaPost(`/${META_IG_ACCOUNT_ID}/media_publish`, {
      creation_id: media.id,
    });
    publishedId = published.id;
  } else {
    const childIds: string[] = [];
    for (const url of slideUrls) {
      const child = await metaPost(`/${META_IG_ACCOUNT_ID}/media`, {
        image_url: url, is_carousel_item: 'true',
      });
      childIds.push(child.id);
    }
    const carousel = await metaPost(`/${META_IG_ACCOUNT_ID}/media`, {
      media_type: 'CAROUSEL', children: childIds.join(','), caption: fullCaption,
    });
    const published = await metaPost(`/${META_IG_ACCOUNT_ID}/media_publish`, {
      creation_id: carousel.id,
    });
    publishedId = published.id;
  }

  const permalinkRes = await fetch(
    `${GRAPH}/${publishedId}?fields=permalink&access_token=${META_PAGE_ACCESS_TOKEN}`
  );
  const permalinkData = await permalinkRes.json();
  return {
    publishedId,
    permalink: permalinkData.permalink ?? `https://www.instagram.com/p/${publishedId}/`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const { data: duePosts, error } = await supabase
    .from('scheduled_posts')
    .select('id, planner_key, caption, hashtags, slide_urls, status')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(5);

  if (error) {
    console.error('DB error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  }

  if (!duePosts || duePosts.length === 0) {
    return new Response(JSON.stringify({ published: 0 }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const results = [];
  for (const post of duePosts) {
    try {
      await supabase.from('scheduled_posts').update({ status: 'publishing' }).eq('id', post.id);

      const { publishedId, permalink } = await publishPost(supabase, post);

      await supabase.from('scheduled_posts').update({
        status: 'published',
        instagram_post_id: publishedId,
        permalink,
        updated_at: new Date().toISOString(),
      }).eq('id', post.id);

      console.log(`Published ${post.planner_key} → ${permalink}`);

      // TikTok dual-post (best-effort — don't fail if TikTok errors)
      try {
        const ttRes = await fetch(
          `${SUPABASE_URL}/functions/v1/publish-tiktok`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              slide_urls: post.slide_urls,
              caption: post.caption,
              hashtags: post.hashtags,
            }),
          }
        );
        const ttData = await ttRes.json();
        if (ttData.ok) {
          await supabase.from('scheduled_posts').update({ tiktok_post_id: ttData.publish_id }).eq('id', post.id);
        } else {
          await supabase.from('scheduled_posts').update({ tiktok_error: ttData.error }).eq('id', post.id);
        }
      } catch (ttErr) {
        const ttMsg = ttErr instanceof Error ? ttErr.message : String(ttErr);
        await supabase.from('scheduled_posts').update({ tiktok_error: ttMsg }).eq('id', post.id);
      }

      results.push({ planner_key: post.planner_key, status: 'published', permalink });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed ${post.planner_key}:`, msg);
      await supabase.from('scheduled_posts').update({
        status: 'scheduled',
        error_message: msg,
        updated_at: new Date().toISOString(),
      }).eq('id', post.id);
      results.push({ planner_key: post.planner_key, status: 'failed', error: msg });
    }
  }

  return new Response(
    JSON.stringify({ published: results.filter(r => r.status === 'published').length, results }),
    { headers: { ...cors, 'Content-Type': 'application/json' } }
  );
});

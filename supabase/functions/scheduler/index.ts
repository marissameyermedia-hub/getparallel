import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert a base64 data URL to a Supabase Storage public URL
async function uploadBase64(supabase: any, dataUrl: string, name: string): Promise<string> {
  const commaIdx = dataUrl.indexOf(',');
  const meta = dataUrl.substring(0, commaIdx);
  const b64 = dataUrl.substring(commaIdx + 1);
  const mimeMatch = meta.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const ext = mime.split('/')[1] || 'jpg';
  const path = `auto-publish/${name}.${ext}`;
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const { error } = await supabase.storage
    .from('social-media')
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from('social-media').getPublicUrl(path);
  return data.publicUrl;
}

// Ensure all slide URLs are public https:// URLs (upload base64 if needed)
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const { data: duePosts, error } = await supabase
    .from('scheduled_posts')
    .select('id, planner_key, caption, hashtags, slide_urls, status, location, audio')
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

      // Ensure all images are public https URLs (uploads base64 to Storage if needed)
      const slideUrls = await resolveUrls(supabase, post.slide_urls, post.planner_key);
      if (slideUrls.length === 0) throw new Error('No valid slide URLs after resolving');

      // Push to Buffer — it handles Instagram, Facebook, and TikTok in one shot
      const bufferRes = await fetch(`${SUPABASE_URL}/functions/v1/publish-buffer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          slide_urls: slideUrls,
          caption: post.caption,
          hashtags: post.hashtags,
          location: post.location ?? null,
          audio: post.audio ?? null,
        }),
      });

      const bufferData = await bufferRes.json();
      if (!bufferData.ok) throw new Error(bufferData.error ?? 'Buffer returned ok: false');

      // Map Buffer results to per-platform IDs for the DB record
      const bufferPostIds: Record<string, string> = {};
      let igPostId: string | null = null;

      for (const r of bufferData.results ?? []) {
        if (r.post_id) {
          bufferPostIds[r.service] = r.post_id;
          if (r.service === 'instagram') igPostId = r.post_id;
        } else if (r.error) {
          bufferPostIds[`${r.service}_error`] = r.error;
        }
      }

      await supabase.from('scheduled_posts').update({
        status: 'published',
        buffer_post_ids: bufferPostIds,
        instagram_post_id: igPostId,
        updated_at: new Date().toISOString(),
      }).eq('id', post.id);

      const platforms = Object.keys(bufferPostIds).filter(k => !k.endsWith('_error')).join(', ');
      console.log(`Published ${post.planner_key} via Buffer → ${platforms}`);
      results.push({ planner_key: post.planner_key, status: 'published', platforms: bufferData.results });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed ${post.planner_key}:`, msg);
      await supabase.from('scheduled_posts').update({
        status: 'failed',
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

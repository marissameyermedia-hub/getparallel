import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { urls, prefix } = await req.json();
    if (!Array.isArray(urls) || urls.length === 0) throw new Error('urls array required');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results: string[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image ${i + 1}: ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'image/png';
      const ext = contentType.includes('jpeg') ? 'jpg' : 'png';
      const path = `auto-publish/${prefix}-${i + 1}.${ext}`;

      const { error } = await supabase.storage
        .from('social-media')
        .upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(`Storage upload failed for image ${i + 1}: ${error.message}`);

      const { data } = supabase.storage.from('social-media').getPublicUrl(path);
      results.push(data.publicUrl);
      console.log(`Uploaded ${path} → ${data.publicUrl}`);
    }

    return new Response(JSON.stringify({ ok: true, urls: results }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

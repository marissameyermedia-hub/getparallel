// Parallel — affiliate edge function v1
// v1: POST /click, POST /attribute, GET /validate/:slug, POST /validate-promo

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getUserFromAuth(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^bearer\s+/i, "").trim();
  if (!token) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + (Deno.env.get("IP_HASH_SALT") || "parallel-affiliate-v1"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  // Strip function prefix so both /affiliate/click and /click work
  const path = url.pathname
    .replace(/^\/functions\/v1\/affiliate/, "")
    .replace(/^\/affiliate/, "")
    || "/";
  const segments = path.split("/").filter(Boolean);
  const endpoint = segments[0] || "";

  const admin = adminClient();

  // ── GET /validate/:slug ──────────────────────────────────────────
  if (req.method === "GET" && endpoint === "validate") {
    const slug = segments[1];
    if (!slug) return json({ error: "slug required" }, 400);

    const { data, error } = await admin
      .from("affiliates")
      .select("id, display_name, subscription_discount_pct, tier, status")
      .eq("tracked_link_slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (error) return json({ error: "db error" }, 500);
    if (!data) return json({ valid: false }, 404);

    return json({
      valid: true,
      affiliate_id: data.id,
      display_name: data.display_name,
      tier: data.tier,
      subscription_discount_pct: data.subscription_discount_pct,
    });
  }

  // ── POST /click ──────────────────────────────────────────────────
  // Record a tracked link click. No auth required (pre-signup).
  if (req.method === "POST" && endpoint === "click") {
    let body: { slug?: string } = {};
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const { slug } = body;
    if (!slug) return json({ error: "slug required" }, 400);

    const { data: affiliate, error: affErr } = await admin
      .from("affiliates")
      .select("id, status")
      .eq("tracked_link_slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (affErr) return json({ error: "db error" }, 500);
    if (!affiliate) return json({ error: "invalid slug" }, 404);

    const ip = getClientIp(req);
    const ip_hash = await hashIp(ip);
    const user_agent = req.headers.get("user-agent") || null;
    const referrer = req.headers.get("referer") || null;
    const country_code = req.headers.get("cf-ipcountry") || null;

    const { data: click, error: clickErr } = await admin
      .from("affiliate_clicks")
      .insert({ affiliate_id: affiliate.id, ip_hash, user_agent, referrer, country_code })
      .select("id, clicked_at")
      .single();
    if (clickErr) return json({ error: "db error" }, 500);

    return json({ ok: true, affiliate_id: affiliate.id, click_id: click.id, clicked_at: click.clicked_at });
  }

  // ── POST /attribute ──────────────────────────────────────────────
  // Record signup attribution. Requires auth (called right after account creation).
  if (req.method === "POST" && endpoint === "attribute") {
    const user = await getUserFromAuth(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    let body: { affiliate_id?: string; click_id?: string; method?: string; promo_code_used?: string } = {};
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const { affiliate_id, click_id, method = "cookie", promo_code_used } = body;
    if (!affiliate_id) return json({ error: "affiliate_id required" }, 400);

    const { data: affiliate, error: affErr } = await admin
      .from("affiliates")
      .select("id, status")
      .eq("id", affiliate_id)
      .eq("status", "active")
      .maybeSingle();
    if (affErr) return json({ error: "db error" }, 500);
    if (!affiliate) return json({ error: "invalid affiliate" }, 404);

    // Prevent double-attribution
    const { data: existing } = await admin
      .from("affiliate_attributions")
      .select("id")
      .eq("referred_user_id", user.id)
      .maybeSingle();
    if (existing) return json({ ok: true, attribution_id: existing.id, duplicate: true });

    let clicked_at: string | null = null;
    if (click_id) {
      const { data: click } = await admin
        .from("affiliate_clicks")
        .select("clicked_at")
        .eq("id", click_id)
        .maybeSingle();
      if (click) clicked_at = click.clicked_at;
    }

    const clawback_deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: attribution, error: attrErr } = await admin
      .from("affiliate_attributions")
      .insert({
        affiliate_id,
        referred_user_id: user.id,
        attribution_method: method,
        ...(promo_code_used ? { promo_code_used } : {}),
        clicked_at,
        clawback_deadline,
        commission_amount: 0,
        commission_status: "pending",
      })
      .select("id")
      .single();
    if (attrErr) return json({ error: "db error" }, 500);

    // Mark click converted — fire and forget, don't block response
    if (click_id) {
      admin
        .from("affiliate_clicks")
        .update({ converted_to_signup: true, signup_attribution_id: attribution.id })
        .eq("id", click_id)
        .then(() => {})
        .catch(() => {});
    }

    return json({ ok: true, attribution_id: attribution.id });
  }

  // ── POST /validate-promo ─────────────────────────────────────────
  // Check if a promo code is valid and return discount info.
  if (req.method === "POST" && endpoint === "validate-promo") {
    let body: { promo_code?: string } = {};
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const { promo_code } = body;
    if (!promo_code) return json({ error: "promo_code required" }, 400);

    const { data: affiliate, error } = await admin
      .from("affiliates")
      .select("id, display_name, subscription_discount_pct, tier, status")
      .eq("promo_code", promo_code.toUpperCase())
      .eq("status", "active")
      .maybeSingle();
    if (error) return json({ error: "db error" }, 500);
    if (!affiliate) return json({ valid: false }, 404);

    return json({
      valid: true,
      affiliate_id: affiliate.id,
      display_name: affiliate.display_name,
      subscription_discount_pct: affiliate.subscription_discount_pct,
      tier: affiliate.tier,
    });
  }

  return json({ error: "not found" }, 404);
});

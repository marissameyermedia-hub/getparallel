// Parallel — affiliate edge function v5
// v5: POST /admin/approve — creates affiliates row, sends approval email
// v4: POST /apply — submit application + fire confirmation email
// v3: (deployed as Supabase version 3 — same code as v2 with bug fixes)
// v2: POST /payout/preview, POST /payout/release — admin Mercury ACH payouts
// v1: POST /click, POST /attribute, GET /validate/:slug, POST /validate-promo

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MERCURY_IS_SANDBOX = (Deno.env.get("MERCURY_IS_SANDBOX") ?? "true") !== "false";
const MERCURY_BASE = MERCURY_IS_SANDBOX
  ? "https://api-sandbox.mercury.com/api/v1"
  : "https://api.mercury.com/api/v1";
const MERCURY_TOKEN = MERCURY_IS_SANDBOX
  ? (Deno.env.get("MERCURY_API_TOKEN_SANDBOX") ?? "")
  : (Deno.env.get("MERCURY_API_TOKEN") ?? "");

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

async function checkIsAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^bearer\s+/i, "").trim();
  if (!token) return false;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return false;
  const { data: adminCheck } = await adminClient()
    .rpc("is_admin", { check_user_id: data.user.id })
    .maybeSingle();
  return adminCheck === true;
}

async function getMercuryAccountId(): Promise<string | null> {
  try {
    const res = await fetch(`${MERCURY_BASE}/accounts`, {
      headers: { Authorization: `Basic ${btoa(`${MERCURY_TOKEN}:`)}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const accounts: any[] = data.accounts ?? [];
    const checking = accounts.find((a: any) => a.kind === "checking") ?? accounts[0];
    return checking?.id ?? null;
  } catch { return null; }
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

  // ── POST /payout/preview ─────────────────────────────────────────
  // Returns approved commissions grouped by affiliate, ready to pay out.
  if (req.method === "POST" && endpoint === "payout" && segments[1] === "preview") {
    if (!(await checkIsAdmin(req))) return json({ error: "forbidden" }, 403);

    let body: { affiliate_id?: string } = {};
    try { body = await req.json(); } catch { /* optional body */ }

    let q = admin
      .from("affiliate_attributions")
      .select("id, affiliate_id, commission_amount, commission_status, signed_up_at, affiliates(id, display_name, email, mercury_recipient_id, total_paid_lifetime)")
      .eq("commission_status", "approved");
    if (body.affiliate_id) q = q.eq("affiliate_id", body.affiliate_id);
    const { data: attrs, error: attrsErr } = await q;
    if (attrsErr) return json({ error: "db error" }, 500);

    // Group by affiliate
    const byAffiliate: Record<string, {
      affiliate: any;
      attributions: any[];
      gross: number;
    }> = {};
    for (const a of (attrs ?? [])) {
      const affId = a.affiliate_id;
      if (!byAffiliate[affId]) {
        byAffiliate[affId] = { affiliate: (a as any).affiliates, attributions: [], gross: 0 };
      }
      byAffiliate[affId].attributions.push({ id: a.id, commission_amount: a.commission_amount, signed_up_at: a.signed_up_at });
      byAffiliate[affId].gross += Number(a.commission_amount ?? 0);
    }

    const previews = Object.values(byAffiliate).map(g => ({
      affiliate_id: (g.affiliate as any)?.id,
      display_name: (g.affiliate as any)?.display_name,
      email: (g.affiliate as any)?.email,
      mercury_recipient_id: (g.affiliate as any)?.mercury_recipient_id,
      total_paid_lifetime: (g.affiliate as any)?.total_paid_lifetime,
      attribution_ids: g.attributions.map((a: any) => a.id),
      attribution_count: g.attributions.length,
      gross_amount: parseFloat(g.gross.toFixed(2)),
    }));

    return json({ ok: true, previews, total_payable: previews.reduce((s, p) => s + p.gross_amount, 0) });
  }

  // ── POST /payout/release ─────────────────────────────────────────
  // Send a Mercury ACH payment to one affiliate and mark attributions paid.
  if (req.method === "POST" && endpoint === "payout" && segments[1] === "release") {
    if (!(await checkIsAdmin(req))) return json({ error: "forbidden" }, 403);

    let body: { affiliate_id?: string } = {};
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const { affiliate_id } = body;
    if (!affiliate_id) return json({ error: "affiliate_id required" }, 400);

    // Fetch affiliate
    const { data: aff, error: affErr } = await admin
      .from("affiliates")
      .select("id, display_name, email, mercury_recipient_id, total_paid_lifetime")
      .eq("id", affiliate_id)
      .maybeSingle();
    if (affErr || !aff) return json({ error: "affiliate not found" }, 404);
    if (!aff.mercury_recipient_id) return json({ error: "affiliate has no mercury_recipient_id — add bank account first" }, 400);

    // Fetch approved attributions
    const { data: attrs, error: attrsErr } = await admin
      .from("affiliate_attributions")
      .select("id, commission_amount, signed_up_at")
      .eq("affiliate_id", affiliate_id)
      .eq("commission_status", "approved");
    if (attrsErr) return json({ error: "db error" }, 500);
    if (!attrs || attrs.length === 0) return json({ error: "no approved commissions to pay" }, 400);

    const gross = parseFloat(attrs.reduce((s, a) => s + Number(a.commission_amount ?? 0), 0).toFixed(2));
    if (gross <= 0) return json({ error: "gross amount is zero" }, 400);

    const periodStart = attrs.reduce((min: string, a: any) => a.signed_up_at < min ? a.signed_up_at : min, attrs[0].signed_up_at);
    const periodEnd = attrs.reduce((max: string, a: any) => a.signed_up_at > max ? a.signed_up_at : max, attrs[0].signed_up_at);

    // Create payout record first so we have an ID
    const { data: payout, error: payoutErr } = await admin
      .from("affiliate_payouts")
      .insert({
        affiliate_id,
        period_start: periodStart.slice(0, 10),
        period_end: periodEnd.slice(0, 10),
        gross_amount: gross,
        net_amount: gross,
        mercury_status: "pending_approval",
      })
      .select("id")
      .single();
    if (payoutErr || !payout) return json({ error: "failed to create payout record" }, 500);

    // Call Mercury
    const accountId = await getMercuryAccountId();
    if (!accountId) {
      await admin.from("affiliate_payouts").update({ mercury_status: "failed", failure_reason: "could not fetch mercury account" }).eq("id", payout.id);
      return json({ error: "mercury account unavailable" }, 502);
    }

    const mercuryRes = await fetch(`${MERCURY_BASE}/account/${accountId}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${MERCURY_TOKEN}:`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        externalMemo: `Parallel affiliate commission — ${aff.display_name}`,
        amount: gross,
        paymentMethod: "ach",
        recipientId: aff.mercury_recipient_id,
      }),
    });

    const mercuryBody = await mercuryRes.json();
    if (!mercuryRes.ok) {
      await admin.from("affiliate_payouts").update({
        mercury_status: "failed",
        failure_reason: JSON.stringify(mercuryBody).slice(0, 500),
      }).eq("id", payout.id);
      console.error("[affiliate/payout] mercury error:", mercuryBody);
      return json({ error: "mercury payment failed", detail: mercuryBody }, 502);
    }

    const mercuryTxId = mercuryBody.id ?? null;
    const now = new Date().toISOString();

    // Update payout record
    await admin.from("affiliate_payouts").update({
      mercury_transaction_id: mercuryTxId,
      mercury_status: "sent",
      paid_at: now,
    }).eq("id", payout.id);

    // Mark attributions paid
    const attrIds = attrs.map((a: any) => a.id);
    await admin.from("affiliate_attributions").update({
      commission_status: "paid",
      payout_id: payout.id,
    }).in("id", attrIds);

    // Increment total_paid_lifetime
    await admin.from("affiliates").update({
      total_paid_lifetime: parseFloat(((aff.total_paid_lifetime ?? 0) + gross).toFixed(2)),
    }).eq("id", affiliate_id);

    console.log("[affiliate/payout] released:", { affiliate_id, gross, attributions: attrIds.length, mercuryTxId });
    return json({ ok: true, payout_id: payout.id, gross_amount: gross, mercury_transaction_id: mercuryTxId, attribution_count: attrIds.length });
  }

  // ── POST /admin/approve ──────────────────────────────────────────
  // Creates the affiliates row, sends approval email, updates application status.
  if (req.method === "POST" && endpoint === "admin" && segments[1] === "approve") {
    if (!(await checkIsAdmin(req))) return json({ error: "forbidden" }, 403);

    let body: any;
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const { application_id } = body;
    if (!application_id) return json({ error: "application_id required" }, 400);

    const { data: app, error: appErr } = await admin
      .from("affiliate_applications")
      .select("*")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr || !app) return json({ error: "application not found" }, 404);

    // Idempotent — if affiliate row already exists just update the application
    const { data: existing } = await admin
      .from("affiliates")
      .select("id, promo_code, tracked_link_slug")
      .eq("email", app.email)
      .maybeSingle();
    if (existing) {
      await admin.from("affiliate_applications")
        .update({ audit_status: "approved", reviewed_at: new Date().toISOString() })
        .eq("id", application_id);
      return json({ ok: true, affiliate: existing, already_existed: true });
    }

    // Look up user profile for display_name + user_id
    const { data: profile } = await admin
      .from("profiles")
      .select("id, name")
      .eq("email", app.email)
      .maybeSingle();
    const userId = profile?.id ?? null;
    const displayName: string = (profile?.name as string | null) ?? app.email.split("@")[0];

    const TIER_CONFIG: Record<string, { commission_rate: number; subscription_discount_pct: number }> = {
      seeds:   { commission_rate: 0.10, subscription_discount_pct: 20 },
      voices:  { commission_rate: 0.15, subscription_discount_pct: 25 },
      anchors: { commission_rate: 0.20, subscription_discount_pct: 30 },
    };
    const tierCfg = TIER_CONFIG[app.tier_applied_for] ?? TIER_CONFIG.seeds;

    // Generate promo code: [CLEANEDNAME][DISCOUNTPCT] — e.g. MARISSA20
    // Try progressively shorter name prefixes to avoid collisions.
    const discountSuffix = String(tierCfg.subscription_discount_pct);
    const nameClean = displayName.replace(/[^a-zA-Z]/g, "").toUpperCase() || "AFF";
    let promoCode: string | null = null;
    for (let len = Math.min(6, nameClean.length); len >= 2; len--) {
      const candidate = nameClean.slice(0, len) + discountSuffix;
      const { count: taken } = await admin.from("affiliates").select("id", { count: "exact", head: true }).eq("promo_code", candidate);
      if (!taken) { promoCode = candidate; break; }
    }
    if (!promoCode) {
      // Ultimate fallback: 3-char prefix + discount + last 3 digits of timestamp
      promoCode = nameClean.slice(0, 3) + discountSuffix + Date.now().toString().slice(-3);
    }

    const { data: slug, error: slugErr } = await admin.rpc("generate_tracked_link_slug");
    if (slugErr) return json({ error: "failed to generate slug: " + slugErr.message }, 500);

    const now = new Date().toISOString();
    const { data: newAffiliate, error: createErr } = await admin
      .from("affiliates")
      .insert({
        user_id:                  userId,
        display_name:             displayName,
        email:                    app.email,
        tier:                     app.tier_applied_for,
        status:                   "active",
        commission_rate:          tierCfg.commission_rate,
        subscription_discount_pct: tierCfg.subscription_discount_pct,
        promo_code:               promoCode,
        tracked_link_slug:        slug,
        total_conversions:        0,
        total_paid_lifetime:      0,
        approved_at:              now,
      })
      .select()
      .single();
    if (createErr) return json({ error: createErr.message }, 500);

    await admin.from("affiliate_applications")
      .update({ audit_status: "approved", reviewed_at: now })
      .eq("id", application_id);

    // Send approval email — fire and forget
    fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-approved`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email:              app.email,
        name:               displayName,
        tier:               app.tier_applied_for,
        promo_code:         promoCode,
        tracked_link_slug:  slug,
        commission_rate:    tierCfg.commission_rate,
      }),
    }).catch((err) => console.error("[affiliate/admin/approve] email failed:", err));

    return json({ ok: true, affiliate: newAffiliate });
  }

  // ── POST /apply ─────────────────────────────────────────────────
  // Submit an affiliate application. Inserts the row and fires a
  // confirmation email. Returns the inserted application.
  if (req.method === "POST" && endpoint === "apply") {
    const user = await getUserFromAuth(req);
    if (!user?.email) return json({ error: "Unauthorized" }, 401);

    let body: any;
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const { tier, instagram, tiktok, youtube, why_parallel, audience_description, phase1_city_audience } = body;
    if (!tier) return json({ error: "tier required" }, 400);

    const { data: existing } = await admin
      .from("affiliate_applications")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();
    if (existing) return json({ error: "Application already submitted" }, 409);

    const { data: app, error: insertErr } = await admin
      .from("affiliate_applications")
      .insert({
        email: user.email,
        tier_applied_for: tier,
        instagram_handle: instagram ? String(instagram).replace("@", "") : null,
        tiktok_handle:    tiktok    ? String(tiktok).replace("@", "")    : null,
        youtube_handle:   youtube   ? String(youtube).replace("@", "")   : null,
        why_parallel:         why_parallel         || null,
        audience_description: audience_description || null,
        phase1_city_audience: phase1_city_audience ?? false,
      })
      .select()
      .single();
    if (insertErr) return json({ error: insertErr.message }, 500);

    // Fetch display name for the email greeting (best-effort)
    const { data: profile } = await admin
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();

    // Fire confirmation email — don't fail the request if it errors
    fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-application`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ email: user.email, name: profile?.name ?? null, tier }),
    }).catch((err) => console.error("[affiliate/apply] email send failed:", err));

    return json({ ok: true, application: app });
  }

  return json({ error: "not found" }, 404);
});

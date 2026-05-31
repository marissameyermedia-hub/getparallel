// Parallel — affiliate edge function v32
// v32: Add required address object to Mercury electronicRoutingInfo (address1, city, state, postalCode).
// v31: Pass account_type directly as electronicAccountType (Mercury expects personalChecking/personalSavings/businessChecking).
// v30: Fix Mercury electronicAccountType casing: "checking"/"savings" → "Checking"/"Savings" (Haskell constructor tags).
// v28: Surface raw Mercury error in payout/setup response for easier diagnostics.
// v27: /payout/config is now public (no auth required) for easier Mercury diagnostics.
// v26: Add GET /payout/config — returns sandbox mode, token presence, and live Mercury API status.
// v25: Redeploy to pick up MERCURY_IS_SANDBOX=false + MERCURY_API_TOKEN production secrets.
// v24: Clearer sandbox error message — when MERCURY_IS_SANDBOX=true, bank account
//      errors now explain the real cause instead of blaming the routing number.
// v23: Fix affiliate routing for non-active affiliates.
//      getAffiliateFromAuth now includes pending_verification + paused statuses so
//      those users can access /profile and route to the portal. Adds email-based
//      fallback with opportunistic user_id backfill when user_id is null.
//      handleAdminApprove idempotent path now backfills user_id when the existing
//      affiliate row has user_id = null (was the cause of refresh → dating onboarding).
// v22: Fix Mercury recipient creation — remove non-standard top-level bank fields,
//      only send electronicRoutingInfo. Surface raw Mercury error message for debugging.
// v21: Two-phase payout flow with approval queue.
//      POST /payout/queue  — stage a payout (creates DB row, locks attributions as 'queued', no Mercury call)
//      GET  /payout/pending — return all pending_approval payouts with attribution breakdown for admin review
//      POST /payout/approve — admin approves a queued payout: calls Mercury, verifies returned amount, marks released
//      POST /payout/cancel  — cancel a queued payout, unlock attributions back to 'releasable'
//      Adds queued_by/queued_at, approved_by/approved_at, mercury_verified_amount tracking on payout rows.
// v20: GET /admin/review — return applicant_name from profiles so the admin
//      review UI can display it alongside all application details.
// v19: Instagram — use HTTP status code to distinguish "account exists but blocked"
//      (401/403) from "account not found" (404). Ensures Claude never flags valid
//      accounts as fake just because Instagram blocks server-side API access.
//      Update Claude prompt to note that Instagram server-side blocks are expected.
// v18: Remove phase1_city_audience from /apply (launching US+Canada wide, not phase-gated).
//      Fix social profile fetching — TikTok/YouTube oEmbed requires video URLs, not profiles;
//      now fetches profile HTML and parses embedded JSON for follower/subscriber counts.
//      Instagram falls back to HTML scrape with schema.org + regex extraction when API blocks.
// v17: Remove why_parallel + audience_description from /apply (collected via social fetch instead).
//      Add persona_inquiry_id to /apply insert/update.
//      GET /admin/review now fetches real social profile data (Instagram follower count,
//      TikTok/YouTube existence) before calling Claude. Prompt updated to use fetched data.
//      Removed "questions" field from Claude JSON shape — collect everything upfront.
// v16: GET /admin/review/:id — fetch full application + run Claude analysis for
//      AI-powered review page. Marks app as in_review if still pending. Returns
//      { application, analysis } where analysis has recommendation, confidence,
//      strengths, concerns, questions, tier_fit, audience_quality.
// v15: POST /apply allows re-application when previous application was rejected.
//      Updates the existing rejected row (reset to 'pending') instead of 409.
//      Email references updated to hello@getparallel.vip.
// v14: handleAdminActivate validates promo_code + tracked_link_slug before firing
//      approval email — prevents silent email failures when data is incomplete.
//      in_review status updates now route through edge function (RLS fix).
// v13: POST /admin/activate — manually activates a pending_verification affiliate
//      and sends the full approval email. Escape hatch when Persona webhook fails.
//      POST /payout/release now fires /affiliate-payout-failed email on Mercury errors.
// v12: POST /admin/update-status — updates audit_status for rejected/in_review
//      and fires email notifications.
// v11: /admin/approve creates affiliates with status='pending_verification' by default.
//      Sends identity-verification email instead of full approval email.
//      Pass skip_persona:true to create as active immediately (legacy/bypass).
//      Persona webhook in misc activates the row and sends the full approval email.
// v10: Fix affiliate_link URL format — use /r/{slug} tracked links instead of ?aff={slug}
// v9: Full payout setup flow
//   - GET /profile: affiliate's own data, program constants, payout setup status
//   - POST /payout/setup: legal name + tax address + Mercury bank account (one call)
//   - GET /earnings: attributions grouped by year with clawback countdowns
//   - GET /payout/history: past payouts for the authenticated affiliate
//   - POST /payout/clawback: admin — mark attribution clawed_back, notify affiliate by email
//   - POST /payout/preview: clawback-aware (eligible vs in-window split, can_payout flag)
//   - POST /payout/release: double-payout lock, clawback filter, confirmed_by, payout email
//   - POST /apply: save terms_accepted_at
// v8: Fix commission_status enum — use 'releasable' (not 'approved') and 'released' (not 'paid')
// v7: /admin/approve — fall back to get_user_id_by_email RPC when profiles row missing
// v6: promo code format [NAME][DISCOUNTPCT] — e.g. MARISSA20
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

const PAYOUT_MINIMUM_USD = 50;
const CLAWBACK_WINDOW_DAYS = 30;
const ATTRIBUTION_WINDOW_DAYS = 30;

const PROGRAM_INFO = {
  payout_cadence: "Commissions are reviewed and released on the 1st of each month",
  minimum_payout_usd: PAYOUT_MINIMUM_USD,
  clawback_window_days: CLAWBACK_WINDOW_DAYS,
  attribution_window_days: ATTRIBUTION_WINDOW_DAYS,
  payout_method: "ACH (3–5 business days after release)",
  tax_note: "If you earn $600 or more in a calendar year, we are required to issue a 1099-NEC. We will contact you in January to collect your tax ID securely.",
};

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

async function getAffiliateFromAuth(req: Request, admin: ReturnType<typeof adminClient>) {
  const user = await getUserFromAuth(req);
  if (!user) return { user: null, affiliate: null };

  const AFFILIATE_COLS = "id, user_id, display_name, email, tier, status, promo_code, tracked_link_slug, commission_rate, subscription_discount_pct, total_conversions, total_paid_lifetime, legal_name, tax_address, tax_country, tax_info_collected_at, bank_account_collected_at, mercury_recipient_id";
  const ACTIVE_STATUSES = ["active", "pending_verification", "paused"];

  // Primary lookup: by user_id (fast, no ambiguity)
  const { data: byUserId } = await admin
    .from("affiliates")
    .select(AFFILIATE_COLS)
    .eq("user_id", user.id)
    .in("status", ACTIVE_STATUSES)
    .maybeSingle();
  if (byUserId) return { user, affiliate: byUserId };

  // Fallback: by email — handles affiliates created before user_id was required.
  // Opportunistically backfills user_id so the next request uses the fast path.
  if (!user.email) return { user, affiliate: null };
  const { data: byEmail } = await admin
    .from("affiliates")
    .select(AFFILIATE_COLS)
    .eq("email", user.email)
    .in("status", ACTIVE_STATUSES)
    .maybeSingle();
  if (byEmail) {
    if (!byEmail.user_id) {
      await admin.from("affiliates").update({ user_id: user.id }).eq("id", byEmail.id);
      byEmail.user_id = user.id;
    }
    return { user, affiliate: byEmail };
  }

  return { user, affiliate: null };
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

async function checkIsAdmin(req: Request): Promise<{ isAdmin: boolean; userId: string | null }> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^bearer\s+/i, "").trim();
  if (!token) return { isAdmin: false, userId: null };
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { isAdmin: false, userId: null };
  const { data: adminCheck } = await adminClient()
    .rpc("is_admin", { check_user_id: data.user.id })
    .maybeSingle();
  return { isAdmin: adminCheck === true, userId: data.user.id };
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

// ── GET /profile ─────────────────────────────────────────────────────────────

async function handleGetProfile(req: Request): Promise<Response> {
  const admin = adminClient();
  const { affiliate } = await getAffiliateFromAuth(req, admin);
  if (!affiliate) return json({ error: "unauthorized" }, 401);

  return json({
    id: affiliate.id,
    display_name: affiliate.display_name,
    email: affiliate.email,
    tier: affiliate.tier,
    status: affiliate.status,
    promo_code: affiliate.promo_code,
    affiliate_link: affiliate.tracked_link_slug
      ? `https://getparallel.vip/r/${affiliate.tracked_link_slug}`
      : null,
    commission_rate: affiliate.commission_rate,
    commission_rate_pct: Math.round(Number(affiliate.commission_rate) * 100),
    subscription_discount_pct: affiliate.subscription_discount_pct,
    total_conversions: affiliate.total_conversions,
    total_paid_lifetime: Number(affiliate.total_paid_lifetime),
    legal_name: affiliate.legal_name ?? null,
    tax_address: affiliate.tax_address ?? null,
    tax_country: affiliate.tax_country ?? "US",
    tax_info_collected: !!affiliate.tax_info_collected_at,
    bank_account_connected: !!affiliate.bank_account_collected_at,
    program: PROGRAM_INFO,
  });
}

// ── POST /payout/setup ───────────────────────────────────────────────────────
// Collects legal name + mailing address + optional bank account in one call.
// Bank account fields (routing_number, account_number, account_type) must all
// be present together or all absent.

async function handlePayoutSetup(req: Request): Promise<Response> {
  const admin = adminClient();
  const { affiliate } = await getAffiliateFromAuth(req, admin);
  if (!affiliate) return json({ error: "unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const legal_name = String(body.legal_name ?? "").trim();
  const tax_address = String(body.tax_address ?? "").trim();
  const tax_country = String(body.tax_country ?? "US").trim() || "US";

  if (!legal_name) return json({ error: "Legal name is required" }, 400);
  if (!tax_address) return json({ error: "Mailing address is required" }, 400);

  const address_street = String(body.address_street ?? "").trim();
  const address_city = String(body.address_city ?? "").trim();
  const address_state = String(body.address_state ?? "").trim();
  const address_zip = String(body.address_zip ?? "").trim();

  const routing_number = body.routing_number ? String(body.routing_number).replace(/\s/g, "") : null;
  const account_number = body.account_number ? String(body.account_number).replace(/\s/g, "") : null;
  const account_type: string | null = body.account_type ?? null;

  const bankFieldsProvided = routing_number || account_number || account_type;
  const validAccountTypes = ["personalChecking", "personalSavings", "businessChecking"];

  if (bankFieldsProvided) {
    if (!routing_number || !account_number || !account_type) {
      return json({ error: "routing_number, account_number, and account_type are all required to connect a bank account" }, 400);
    }
    if (!/^\d{9}$/.test(routing_number)) {
      return json({ error: "Routing number must be exactly 9 digits" }, 400);
    }
    if (account_number.length < 4 || account_number.length > 17 || !/^\d+$/.test(account_number)) {
      return json({ error: "Account number must be 4–17 digits" }, 400);
    }
    if (!validAccountTypes.includes(account_type)) {
      return json({ error: `account_type must be one of: ${validAccountTypes.join(", ")}` }, 400);
    }
  }

  const now = new Date().toISOString();
  const taxUpdate: Record<string, any> = {
    legal_name,
    tax_address,
    tax_country,
    tax_info_collected_at: now,
    updated_at: now,
  };

  // If bank fields provided, create Mercury recipient first
  if (bankFieldsProvided) {
    const mercuryRes = await fetch(`${MERCURY_BASE}/recipients`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${MERCURY_TOKEN}:`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: legal_name,
        emails: [affiliate.email],
        electronicRoutingInfo: {
          electronicAccountType: account_type,
          routingNumber: routing_number,
          accountNumber: account_number,
          address: {
            address1: address_street,
            city: address_city,
            state: address_state,
            postalCode: address_zip,
            country: "US",
          },
        },
      }),
    });

    const mercuryBody = await mercuryRes.json().catch(() => ({}));
    if (!mercuryRes.ok) {
      const msg: string = (mercuryBody as any)?.message ?? JSON.stringify(mercuryBody);
      console.error("[affiliate/payout/setup] Mercury recipient error:", mercuryRes.status, msg, "sandbox:", MERCURY_IS_SANDBOX);
      if (MERCURY_IS_SANDBOX) {
        return json({ error: "Bank account setup is in test mode — real bank accounts cannot be connected until production Mercury credentials are configured. Contact support@getparallel.vip to complete your payout setup." }, 400);
      }
      // Always surface the raw Mercury message so we can diagnose exactly what's wrong
      return json({ error: `Bank account connection failed: ${msg}`, mercury_status: mercuryRes.status }, 400);
    }

    const recipientId = (mercuryBody as any).id ?? (mercuryBody as any).recipient?.id ?? null;
    if (!recipientId) {
      console.error("[affiliate/payout/setup] Mercury returned no recipient id:", mercuryBody);
      return json({ error: "Bank account setup failed — please try again" }, 500);
    }

    taxUpdate.mercury_recipient_id = recipientId;
    taxUpdate.bank_account_collected_at = now;
  }

  const { error: updateErr } = await admin
    .from("affiliates")
    .update(taxUpdate)
    .eq("id", affiliate.id);

  if (updateErr) {
    console.error("[affiliate/payout/setup] db update failed:", updateErr);
    return json({ error: "Failed to save setup — please try again" }, 500);
  }

  return json({
    ok: true,
    tax_info_collected: true,
    bank_account_connected: bankFieldsProvided ? true : !!affiliate.bank_account_collected_at,
  });
}

// ── GET /payout/config ────────────────────────────────────────────────────────
// Returns Mercury configuration state and pings the live API to verify the token.

async function handlePayoutConfig(_req: Request): Promise<Response> {
  const hasToken = MERCURY_TOKEN.length > 0;
  let mercuryStatus: number | null = null;
  let mercuryError: string | null = null;

  if (hasToken) {
    try {
      const r = await fetch(`${MERCURY_BASE}/accounts`, {
        headers: { Authorization: `Basic ${btoa(`${MERCURY_TOKEN}:`)}` },
      });
      mercuryStatus = r.status;
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        mercuryError = (body as any)?.message ?? `HTTP ${r.status}`;
      }
    } catch (e: any) {
      mercuryError = e?.message ?? "network error";
    }
  }

  return json({
    sandbox: MERCURY_IS_SANDBOX,
    mercury_base: MERCURY_BASE,
    has_token: hasToken,
    mercury_status: mercuryStatus,
    mercury_error: mercuryError,
    mercury_ok: mercuryStatus === 200,
  });
}

// ── GET /earnings ─────────────────────────────────────────────────────────────
// Returns attributions grouped by calendar year with clawback countdowns.

async function handleGetEarnings(req: Request): Promise<Response> {
  const admin = adminClient();
  const { affiliate } = await getAffiliateFromAuth(req, admin);
  if (!affiliate) return json({ error: "unauthorized" }, 401);

  const { data: attrs, error } = await admin
    .from("affiliate_attributions")
    .select("id, commission_amount, commission_status, clawback_deadline, subscribed_at, signed_up_at, promo_code_used")
    .eq("affiliate_id", affiliate.id)
    .order("signed_up_at", { ascending: false });

  if (error) return json({ error: "db error", detail: error.message }, 500);

  const now = new Date();
  const byYear: Record<string, {
    total_earned: number;
    total_paid: number;
    attributions: any[];
  }> = {};

  let lifetime_total = 0;
  let lifetime_paid = 0;
  let pending_count = 0;
  let in_window_count = 0;
  let eligible_count = 0;
  let released_count = 0;

  for (const a of (attrs ?? [])) {
    const dateStr = (a.subscribed_at ?? a.signed_up_at) as string;
    const year = new Date(dateStr).getFullYear().toString();
    if (!byYear[year]) byYear[year] = { total_earned: 0, total_paid: 0, attributions: [] };

    const amount = Number(a.commission_amount ?? 0);
    const status = a.commission_status as string;
    const deadline = a.clawback_deadline ? new Date(a.clawback_deadline) : null;
    const isPaid = status === "released";
    const isEligible = status === "releasable" && (!deadline || deadline <= now);
    const isInWindow = status === "releasable" && deadline && deadline > now;
    const daysPending = deadline && deadline > now
      ? Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    byYear[year].total_earned += amount;
    if (isPaid) byYear[year].total_paid += amount;

    lifetime_total += amount;
    if (isPaid) lifetime_paid += amount;
    if (status === "pending") pending_count++;
    if (isInWindow) in_window_count++;
    if (isEligible) eligible_count++;
    if (isPaid) released_count++;

    byYear[year].attributions.push({
      id: a.id,
      commission_amount: amount,
      commission_status: status,
      clawback_deadline: a.clawback_deadline ?? null,
      days_until_eligible: daysPending,
      subscribed_at: a.subscribed_at ?? null,
      signed_up_at: a.signed_up_at ?? null,
      promo_code_used: a.promo_code_used ?? null,
    });
  }

  // Round year totals
  for (const yr of Object.values(byYear)) {
    yr.total_earned = parseFloat(yr.total_earned.toFixed(2));
    yr.total_paid = parseFloat(yr.total_paid.toFixed(2));
  }

  return json({
    by_year: byYear,
    lifetime: {
      total_earned: parseFloat(lifetime_total.toFixed(2)),
      total_paid: parseFloat(lifetime_paid.toFixed(2)),
      pending_count,
      in_window_count,
      eligible_count,
      released_count,
    },
  });
}

// ── GET /payout/history ──────────────────────────────────────────────────────

async function handleGetPayoutHistory(req: Request): Promise<Response> {
  const admin = adminClient();
  const { affiliate } = await getAffiliateFromAuth(req, admin);
  if (!affiliate) return json({ error: "unauthorized" }, 401);

  const { data: payouts, error } = await admin
    .from("affiliate_payouts")
    .select("id, period_start, period_end, gross_amount, net_amount, mercury_status, paid_at, created_at")
    .eq("affiliate_id", affiliate.id)
    .order("created_at", { ascending: false });

  if (error) return json({ error: "db error", detail: error.message }, 500);

  return json({ payouts: payouts ?? [] });
}

// ── POST /payout/clawback ────────────────────────────────────────────────────
// Admin only. Marks a single attribution as clawed_back and emails the affiliate.

async function handlePayoutClawback(req: Request): Promise<Response> {
  const { isAdmin } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { attribution_id } = body;
  if (!attribution_id) return json({ error: "attribution_id required" }, 400);

  const admin = adminClient();

  // Fetch attribution + affiliate
  const { data: attr, error: attrErr } = await admin
    .from("affiliate_attributions")
    .select("id, affiliate_id, commission_amount, commission_status, affiliates(id, display_name, email)")
    .eq("id", attribution_id)
    .maybeSingle();

  if (attrErr || !attr) return json({ error: "attribution not found" }, 404);
  if (attr.commission_status === "released") {
    return json({ error: "cannot claw back a commission that has already been paid out" }, 400);
  }
  if (attr.commission_status === "clawed_back") {
    return json({ ok: true, already_clawed_back: true });
  }

  const { error: updateErr } = await admin
    .from("affiliate_attributions")
    .update({ commission_status: "clawed_back", updated_at: new Date().toISOString() })
    .eq("id", attribution_id);

  if (updateErr) return json({ error: "db error", detail: updateErr.message }, 500);

  // Fire clawback notification email
  const aff = (attr as any).affiliates;
  if (aff?.email) {
    fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-commission-clawback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email: aff.email,
        name: aff.display_name,
        commission_amount: Number(attr.commission_amount ?? 0),
      }),
    }).catch((err) => console.error("[affiliate/payout/clawback] email failed:", err));
  }

  console.log("[affiliate/payout/clawback]", { attribution_id, affiliate_id: attr.affiliate_id });
  return json({ ok: true });
}

// ── POST /payout/preview ─────────────────────────────────────────────────────
// Returns all releasable commissions grouped by affiliate.
// Splits eligible (past clawback) from in-window amounts.
// can_payout = bank connected + tax collected + eligible >= $50 + no pending payout.

async function handlePayoutPreview(req: Request): Promise<Response> {
  const { isAdmin } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { affiliate_id?: string } = {};
  try { body = await req.json(); } catch { /* optional body */ }

  const admin = adminClient();
  const now = new Date().toISOString();

  let q = admin
    .from("affiliate_attributions")
    .select("id, affiliate_id, commission_amount, commission_status, clawback_deadline, subscribed_at, signed_up_at, affiliates(id, display_name, email, mercury_recipient_id, total_paid_lifetime, tax_info_collected_at, bank_account_collected_at, legal_name)")
    .eq("commission_status", "releasable");
  if (body.affiliate_id) q = q.eq("affiliate_id", body.affiliate_id);
  const { data: attrs, error: attrsErr } = await q;
  if (attrsErr) return json({ error: "db error", detail: attrsErr.message }, 500);

  // Fetch affiliates with pending payouts for lock display
  const { data: pendingPayouts } = await admin
    .from("affiliate_payouts")
    .select("affiliate_id")
    .in("mercury_status", ["pending_approval", "sent"]);
  const pendingAffIds = new Set((pendingPayouts ?? []).map((p: any) => p.affiliate_id));

  // Group by affiliate
  const byAffiliate: Record<string, {
    affiliate: any;
    eligible: { ids: string[]; amount: number };
    in_window: { ids: string[]; amount: number; earliest_eligible: string | null };
  }> = {};

  for (const a of (attrs ?? [])) {
    const affId = a.affiliate_id;
    if (!byAffiliate[affId]) {
      byAffiliate[affId] = {
        affiliate: (a as any).affiliates,
        eligible: { ids: [], amount: 0 },
        in_window: { ids: [], amount: 0, earliest_eligible: null },
      };
    }
    const deadline = a.clawback_deadline ? new Date(a.clawback_deadline) : null;
    const isEligible = !deadline || deadline <= new Date(now);

    if (isEligible) {
      byAffiliate[affId].eligible.ids.push(a.id);
      byAffiliate[affId].eligible.amount += Number(a.commission_amount ?? 0);
    } else {
      byAffiliate[affId].in_window.ids.push(a.id);
      byAffiliate[affId].in_window.amount += Number(a.commission_amount ?? 0);
      const d = deadline!.toISOString();
      if (!byAffiliate[affId].in_window.earliest_eligible || d < byAffiliate[affId].in_window.earliest_eligible!) {
        byAffiliate[affId].in_window.earliest_eligible = d;
      }
    }
  }

  const previews = Object.values(byAffiliate).map((g) => {
    const aff = g.affiliate as any;
    const eligible_amount = parseFloat(g.eligible.amount.toFixed(2));
    const in_window_amount = parseFloat(g.in_window.amount.toFixed(2));
    const bank_connected = !!aff?.bank_account_collected_at;
    const tax_collected = !!aff?.tax_info_collected_at;
    const has_pending_payout = pendingAffIds.has(aff?.id);
    const can_payout = bank_connected && tax_collected && eligible_amount >= PAYOUT_MINIMUM_USD && !has_pending_payout;

    return {
      affiliate_id: aff?.id,
      display_name: aff?.display_name,
      legal_name: aff?.legal_name ?? null,
      email: aff?.email,
      total_paid_lifetime: Number(aff?.total_paid_lifetime ?? 0),
      bank_connected,
      tax_collected,
      has_pending_payout,
      can_payout,
      eligible_amount,
      eligible_count: g.eligible.ids.length,
      in_window_amount,
      in_window_count: g.in_window.ids.length,
      earliest_eligible: g.in_window.earliest_eligible,
      minimum_payout_usd: PAYOUT_MINIMUM_USD,
    };
  });

  return json({
    ok: true,
    previews,
    total_eligible_payable: parseFloat(previews.reduce((s, p) => s + p.eligible_amount, 0).toFixed(2)),
  });
}

// ── POST /payout/release ─────────────────────────────────────────────────────
// Send Mercury ACH for one affiliate. Only releases commissions past clawback window.

async function handlePayoutRelease(req: Request): Promise<Response> {
  const { isAdmin, userId: confirmedBy } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { affiliate_id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { affiliate_id } = body;
  if (!affiliate_id) return json({ error: "affiliate_id required" }, 400);

  const admin = adminClient();
  const now = new Date().toISOString();

  // 1. Lock check — reject if a payout is already in flight for this affiliate
  const { data: existingPayout } = await admin
    .from("affiliate_payouts")
    .select("id, mercury_status")
    .eq("affiliate_id", affiliate_id)
    .in("mercury_status", ["pending_approval", "sent"])
    .maybeSingle();
  if (existingPayout) return json({ error: "a payout is already in progress for this affiliate — wait for it to clear before releasing another" }, 409);

  // 2. Fetch affiliate
  const { data: aff, error: affErr } = await admin
    .from("affiliates")
    .select("id, display_name, email, mercury_recipient_id, total_paid_lifetime, tax_info_collected_at, bank_account_collected_at")
    .eq("id", affiliate_id)
    .maybeSingle();
  if (affErr || !aff) return json({ error: "affiliate not found" }, 404);
  if (!aff.mercury_recipient_id) return json({ error: "affiliate has no bank account connected — they must complete payout setup first" }, 400);
  if (!aff.tax_info_collected_at) return json({ error: "affiliate has not submitted their tax information — they must complete payout setup first" }, 400);

  // 3. Fetch eligible attributions only (past clawback deadline)
  const { data: attrs, error: attrsErr } = await admin
    .from("affiliate_attributions")
    .select("id, commission_amount, subscribed_at, signed_up_at")
    .eq("affiliate_id", affiliate_id)
    .eq("commission_status", "releasable")
    .or(`clawback_deadline.is.null,clawback_deadline.lt.${now}`);
  if (attrsErr) return json({ error: "db error", detail: attrsErr.message }, 500);
  if (!attrs || attrs.length === 0) return json({ error: "no commissions are past the clawback window yet — check back after the clawback deadline" }, 400);

  // 4. Threshold check
  const gross = parseFloat(attrs.reduce((s, a) => s + Number(a.commission_amount ?? 0), 0).toFixed(2));
  if (gross < PAYOUT_MINIMUM_USD) return json({ error: `total eligible amount ($${gross}) is below the $${PAYOUT_MINIMUM_USD} minimum` }, 400);

  // 5. Compute period dates from subscribed_at (fall back to signed_up_at)
  const dates = attrs.map((a: any) => (a.subscribed_at ?? a.signed_up_at) as string).filter(Boolean);
  const periodStart = dates.reduce((min, d) => d < min ? d : min, dates[0]).slice(0, 10);
  const periodEnd = dates.reduce((max, d) => d > max ? d : max, dates[0]).slice(0, 10);

  // 6. Create payout record (pending) before touching Mercury
  const { data: payout, error: payoutErr } = await admin
    .from("affiliate_payouts")
    .insert({
      affiliate_id,
      period_start: periodStart,
      period_end: periodEnd,
      gross_amount: gross,
      net_amount: gross,
      mercury_status: "pending_approval",
      confirmed_by: confirmedBy ?? null,
    })
    .select("id")
    .single();
  if (payoutErr || !payout) return json({ error: "failed to create payout record" }, 500);

  // 7. Get Mercury account
  const accountId = await getMercuryAccountId();
  if (!accountId) {
    await admin.from("affiliate_payouts").update({ mercury_status: "failed", failure_reason: "could not fetch Mercury account" }).eq("id", payout.id);
    fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-payout-failed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ email: aff.email, name: aff.display_name }),
    }).catch(() => {});
    return json({ error: "Mercury account unavailable — check Mercury API credentials" }, 502);
  }

  // 8. Call Mercury
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

  const mercuryBody = await mercuryRes.json().catch(() => ({}));

  // 9. If Mercury failed: update payout record, leave attributions untouched, notify affiliate
  if (!mercuryRes.ok) {
    await admin.from("affiliate_payouts").update({
      mercury_status: "failed",
      failure_reason: JSON.stringify(mercuryBody).slice(0, 500),
    }).eq("id", payout.id);
    console.error("[affiliate/payout/release] Mercury error:", mercuryRes.status, mercuryBody);
    // Notify affiliate their payout failed — commissions are safe, will retry
    fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-payout-failed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ email: aff.email, name: aff.display_name }),
    }).catch((err) => console.error("[affiliate/payout/release] payout-failed email error:", err));
    return json({ error: "Mercury payment failed", detail: mercuryBody }, 502);
  }

  const mercuryTxId = (mercuryBody as any).id ?? null;

  // 10. Mercury succeeded — update payout record, THEN mark attributions released
  await admin.from("affiliate_payouts").update({
    mercury_transaction_id: mercuryTxId,
    mercury_status: "sent",
    paid_at: now,
  }).eq("id", payout.id);

  const attrIds = attrs.map((a: any) => a.id);
  await admin.from("affiliate_attributions").update({
    commission_status: "released",
    payout_id: payout.id,
    updated_at: now,
  }).in("id", attrIds);

  await admin.from("affiliates").update({
    total_paid_lifetime: parseFloat(((Number(aff.total_paid_lifetime) ?? 0) + gross).toFixed(2)),
    updated_at: now,
  }).eq("id", affiliate_id);

  // 11. Notify affiliate by email
  fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-payout-released`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email: aff.email,
      name: aff.display_name,
      amount: gross,
      payout_id: payout.id,
    }),
  }).catch((err) => console.error("[affiliate/payout/release] email failed:", err));

  console.log("[affiliate/payout/release] released:", { affiliate_id, gross, attributions: attrIds.length, mercuryTxId });
  return json({ ok: true, payout_id: payout.id, gross_amount: gross, mercury_transaction_id: mercuryTxId, attribution_count: attrIds.length });
}

// ── POST /payout/queue ────────────────────────────────────────────────────────
// Stage a payout for admin approval. Creates payout row (pending_approval),
// locks attributions as 'queued'. Does NOT call Mercury.

async function handlePayoutQueue(req: Request): Promise<Response> {
  const { isAdmin, userId: queuedBy } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { affiliate_id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { affiliate_id } = body;
  if (!affiliate_id) return json({ error: "affiliate_id required" }, 400);

  const admin = adminClient();
  const now = new Date().toISOString();

  // Lock check — reject if a payout is already queued or in flight
  const { data: existing } = await admin
    .from("affiliate_payouts")
    .select("id, mercury_status")
    .eq("affiliate_id", affiliate_id)
    .in("mercury_status", ["pending_approval", "sent"])
    .maybeSingle();
  if (existing) return json({ error: "a payout is already queued or in flight for this affiliate" }, 409);

  const { data: aff, error: affErr } = await admin
    .from("affiliates")
    .select("id, display_name, email, mercury_recipient_id, tax_info_collected_at, bank_account_collected_at")
    .eq("id", affiliate_id)
    .maybeSingle();
  if (affErr || !aff) return json({ error: "affiliate not found" }, 404);
  if (!aff.mercury_recipient_id) return json({ error: "affiliate has no bank account connected" }, 400);
  if (!aff.tax_info_collected_at) return json({ error: "affiliate has not submitted tax information" }, 400);

  // Fetch eligible attributions (releasable, past clawback)
  const { data: attrs, error: attrsErr } = await admin
    .from("affiliate_attributions")
    .select("id, commission_amount, subscribed_at, signed_up_at, clawback_deadline")
    .eq("affiliate_id", affiliate_id)
    .eq("commission_status", "releasable")
    .or(`clawback_deadline.is.null,clawback_deadline.lt.${now}`);
  if (attrsErr) return json({ error: "db error", detail: attrsErr.message }, 500);
  if (!attrs || attrs.length === 0) return json({ error: "no commissions are past the clawback window" }, 400);

  const gross = parseFloat(attrs.reduce((s, a) => s + Number(a.commission_amount ?? 0), 0).toFixed(2));
  if (gross < PAYOUT_MINIMUM_USD) return json({ error: `total eligible ($${gross}) is below the $${PAYOUT_MINIMUM_USD} minimum` }, 400);

  const dates = attrs.map((a: any) => (a.subscribed_at ?? a.signed_up_at) as string).filter(Boolean);
  const periodStart = dates.length ? dates.reduce((min, d) => d < min ? d : min, dates[0]).slice(0, 10) : now.slice(0, 10);
  const periodEnd   = dates.length ? dates.reduce((max, d) => d > max ? d : max, dates[0]).slice(0, 10) : now.slice(0, 10);

  const { data: payout, error: payoutErr } = await admin
    .from("affiliate_payouts")
    .insert({
      affiliate_id,
      period_start: periodStart,
      period_end:   periodEnd,
      gross_amount: gross,
      net_amount:   gross,
      mercury_status: "pending_approval",
      queued_by: queuedBy ?? null,
      queued_at: now,
    })
    .select("id")
    .single();
  if (payoutErr || !payout) return json({ error: "failed to create payout record" }, 500);

  // Lock attributions as 'queued'
  const attrIds = attrs.map((a: any) => a.id);
  await admin.from("affiliate_attributions").update({
    commission_status: "queued",
    payout_id: payout.id,
    updated_at: now,
  }).in("id", attrIds);

  console.log("[affiliate/payout/queue]", { affiliate_id, gross, count: attrIds.length, payout_id: payout.id });
  return json({ ok: true, payout_id: payout.id, gross_amount: gross, attribution_count: attrIds.length });
}

// ── GET /payout/pending ───────────────────────────────────────────────────────
// Returns all pending_approval payouts with per-attribution breakdown for the
// admin approval queue UI.

async function handlePayoutPending(req: Request): Promise<Response> {
  const { isAdmin } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const admin = adminClient();

  const { data: payouts, error } = await admin
    .from("affiliate_payouts")
    .select("id, affiliate_id, period_start, period_end, gross_amount, net_amount, mercury_status, queued_by, queued_at, created_at, affiliates(display_name, legal_name, email, mercury_recipient_id)")
    .eq("mercury_status", "pending_approval")
    .order("queued_at", { ascending: true });
  if (error) return json({ error: "db error", detail: error.message }, 500);

  const results = await Promise.all((payouts ?? []).map(async (p: any) => {
    const { data: attrs } = await admin
      .from("affiliate_attributions")
      .select("id, commission_amount, subscribed_at, signed_up_at, referred_user_id, profiles(name, email)")
      .eq("payout_id", p.id)
      .eq("commission_status", "queued")
      .order("subscribed_at", { ascending: false });

    return {
      id: p.id,
      affiliate_id: p.affiliate_id,
      period_start: p.period_start,
      period_end:   p.period_end,
      gross_amount: Number(p.gross_amount),
      mercury_status: p.mercury_status,
      queued_at: p.queued_at,
      affiliate: p.affiliates ?? null,
      attributions: (attrs ?? []).map((a: any) => ({
        id: a.id,
        commission_amount: Number(a.commission_amount),
        subscribed_at: a.subscribed_at ?? a.signed_up_at ?? null,
        referred_user: a.profiles ? { name: (a.profiles as any).name ?? null, email: (a.profiles as any).email } : null,
      })),
    };
  }));

  return json({ ok: true, payouts: results });
}

// ── POST /payout/approve ──────────────────────────────────────────────────────
// Admin approves a queued payout: re-verifies amount, calls Mercury ACH,
// checks Mercury's returned amount matches, then marks released.

async function handlePayoutApprove(req: Request): Promise<Response> {
  const { isAdmin, userId: approvedBy } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { payout_id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { payout_id } = body;
  if (!payout_id) return json({ error: "payout_id required" }, 400);

  const admin = adminClient();
  const now = new Date().toISOString();

  const { data: payout, error: payoutErr } = await admin
    .from("affiliate_payouts")
    .select("id, affiliate_id, gross_amount, mercury_status")
    .eq("id", payout_id)
    .eq("mercury_status", "pending_approval")
    .maybeSingle();
  if (payoutErr || !payout) return json({ error: "payout not found or not in pending_approval state" }, 404);

  const { data: aff, error: affErr } = await admin
    .from("affiliates")
    .select("id, display_name, email, mercury_recipient_id, total_paid_lifetime")
    .eq("id", payout.affiliate_id)
    .maybeSingle();
  if (affErr || !aff) return json({ error: "affiliate not found" }, 404);
  if (!aff.mercury_recipient_id) return json({ error: "affiliate has no Mercury recipient — bank account missing" }, 400);

  // Re-sum attributions at approval time to catch any drift
  const { data: attrs, error: attrsErr } = await admin
    .from("affiliate_attributions")
    .select("id, commission_amount")
    .eq("payout_id", payout_id)
    .eq("commission_status", "queued");
  if (attrsErr) return json({ error: "db error fetching attributions" }, 500);
  if (!attrs || attrs.length === 0) return json({ error: "no queued attributions for this payout — it may have been cancelled" }, 400);

  const recalcGross = parseFloat(attrs.reduce((s, a) => s + Number(a.commission_amount ?? 0), 0).toFixed(2));
  if (recalcGross !== Number(payout.gross_amount)) {
    return json({
      error: `Amount mismatch: payout record says $${payout.gross_amount} but attributions sum to $${recalcGross}. Cancel and re-queue.`,
    }, 409);
  }

  const accountId = await getMercuryAccountId();
  if (!accountId) {
    await admin.from("affiliate_payouts").update({ mercury_status: "failed", failure_reason: "could not fetch Mercury account" }).eq("id", payout_id);
    return json({ error: "Mercury account unavailable — check API credentials" }, 502);
  }

  const mercuryRes = await fetch(`${MERCURY_BASE}/account/${accountId}/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${MERCURY_TOKEN}:`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      externalMemo: `Parallel affiliate commission — ${aff.display_name}`,
      amount: recalcGross,
      paymentMethod: "ach",
      recipientId: aff.mercury_recipient_id,
    }),
  });

  const mercuryBody = await mercuryRes.json().catch(() => ({}));

  if (!mercuryRes.ok) {
    await admin.from("affiliate_payouts").update({
      mercury_status: "failed",
      failure_reason: JSON.stringify(mercuryBody).slice(0, 500),
    }).eq("id", payout_id);
    // Unlock attributions so they can be re-queued
    await admin.from("affiliate_attributions").update({
      commission_status: "releasable",
      payout_id: null,
      updated_at: now,
    }).eq("payout_id", payout_id).eq("commission_status", "queued");
    fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-payout-failed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ email: aff.email, name: aff.display_name }),
    }).catch(() => {});
    console.error("[affiliate/payout/approve] Mercury error:", mercuryRes.status, mercuryBody);
    return json({ error: "Mercury payment failed", detail: mercuryBody }, 502);
  }

  const mercuryTxId = (mercuryBody as any).id ?? null;
  const mercuryReturnedAmount = Number((mercuryBody as any).amount ?? 0);

  // Verify Mercury's returned amount matches what we sent
  if (mercuryReturnedAmount > 0 && mercuryReturnedAmount !== recalcGross) {
    await admin.from("affiliate_payouts").update({
      mercury_transaction_id: mercuryTxId,
      mercury_status: "failed",
      failure_reason: `Mercury amount mismatch: sent $${recalcGross}, Mercury returned $${mercuryReturnedAmount}`,
    }).eq("id", payout_id);
    console.error("[affiliate/payout/approve] Mercury amount mismatch:", { sent: recalcGross, returned: mercuryReturnedAmount, txId: mercuryTxId });
    return json({
      error: `Mercury returned a different amount ($${mercuryReturnedAmount}) than sent ($${recalcGross}). Payout flagged. Contact Mercury support. Transaction ID: ${mercuryTxId}`,
    }, 500);
  }

  // All good — update payout, mark attributions released, update affiliate lifetime total
  await admin.from("affiliate_payouts").update({
    mercury_transaction_id: mercuryTxId,
    mercury_verified_amount: mercuryReturnedAmount > 0 ? mercuryReturnedAmount : recalcGross,
    mercury_status: "sent",
    paid_at: now,
    approved_by: approvedBy ?? null,
    approved_at: now,
  }).eq("id", payout_id);

  const attrIds = attrs.map((a: any) => a.id);
  await admin.from("affiliate_attributions").update({
    commission_status: "released",
    updated_at: now,
  }).in("id", attrIds);

  await admin.from("affiliates").update({
    total_paid_lifetime: parseFloat(((Number(aff.total_paid_lifetime) ?? 0) + recalcGross).toFixed(2)),
    updated_at: now,
  }).eq("id", aff.id);

  fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-payout-released`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ email: aff.email, name: aff.display_name, amount: recalcGross, payout_id }),
  }).catch((err) => console.error("[affiliate/payout/approve] email failed:", err));

  console.log("[affiliate/payout/approve] approved:", { payout_id, affiliate_id: aff.id, gross: recalcGross, mercuryTxId });
  return json({ ok: true, payout_id, gross_amount: recalcGross, mercury_transaction_id: mercuryTxId, mercury_verified_amount: mercuryReturnedAmount > 0 ? mercuryReturnedAmount : recalcGross });
}

// ── POST /payout/cancel ───────────────────────────────────────────────────────
// Cancel a queued payout — unlock attributions back to 'releasable'.

async function handlePayoutCancel(req: Request): Promise<Response> {
  const { isAdmin } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { payout_id?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { payout_id } = body;
  if (!payout_id) return json({ error: "payout_id required" }, 400);

  const admin = adminClient();
  const now = new Date().toISOString();

  const { data: payout, error: payoutErr } = await admin
    .from("affiliate_payouts")
    .select("id, mercury_status")
    .eq("id", payout_id)
    .eq("mercury_status", "pending_approval")
    .maybeSingle();
  if (payoutErr || !payout) return json({ error: "payout not found or not in pending_approval state" }, 404);

  // Return attributions to releasable
  await admin.from("affiliate_attributions").update({
    commission_status: "releasable",
    payout_id: null,
    updated_at: now,
  }).eq("payout_id", payout_id).eq("commission_status", "queued");

  await admin.from("affiliate_payouts").update({ mercury_status: "cancelled" }).eq("id", payout_id);

  console.log("[affiliate/payout/cancel] cancelled:", { payout_id });
  return json({ ok: true, payout_id });
}

// ── GET /validate/:slug ───────────────────────────────────────────────────────

async function handleValidateSlug(slug: string): Promise<Response> {
  const admin = adminClient();
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

// ── POST /click ───────────────────────────────────────────────────────────────

async function handleClick(req: Request): Promise<Response> {
  const admin = adminClient();
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
  const { data: click, error: clickErr } = await admin
    .from("affiliate_clicks")
    .insert({
      affiliate_id: affiliate.id,
      ip_hash,
      user_agent: req.headers.get("user-agent") || null,
      referrer: req.headers.get("referer") || null,
      country_code: req.headers.get("cf-ipcountry") || null,
    })
    .select("id, clicked_at")
    .single();
  if (clickErr) return json({ error: "db error" }, 500);

  return json({ ok: true, affiliate_id: affiliate.id, click_id: click.id, clicked_at: click.clicked_at });
}

// ── POST /attribute ───────────────────────────────────────────────────────────

async function handleAttribute(req: Request): Promise<Response> {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { affiliate_id?: string; click_id?: string; method?: string; promo_code_used?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { affiliate_id, click_id, method = "cookie", promo_code_used } = body;
  if (!affiliate_id) return json({ error: "affiliate_id required" }, 400);

  const admin = adminClient();
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

  const { data: attribution, error: attrErr } = await admin
    .from("affiliate_attributions")
    .insert({
      affiliate_id,
      referred_user_id: user.id,
      attribution_method: method,
      ...(promo_code_used ? { promo_code_used } : {}),
      clicked_at,
      commission_amount: 0,
      commission_status: "pending",
    })
    .select("id")
    .single();
  if (attrErr) return json({ error: "db error" }, 500);

  if (click_id) {
    admin
      .from("affiliate_clicks")
      .update({ converted_to_signup: true, signup_attribution_id: attribution.id })
      .eq("id", click_id)
      .then(() => {}).catch(() => {});
  }

  return json({ ok: true, attribution_id: attribution.id });
}

// ── POST /validate-promo ──────────────────────────────────────────────────────

async function handleValidatePromo(req: Request): Promise<Response> {
  const admin = adminClient();
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

// ── POST /admin/update-status ─────────────────────────────────────────────────
// Updates application audit_status for non-approval statuses and fires
// email notifications where appropriate.

async function handleAdminUpdateStatus(req: Request): Promise<Response> {
  const { isAdmin } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { application_id, status } = body;
  if (!application_id) return json({ error: "application_id required" }, 400);

  const allowed = ["rejected", "in_review"];
  if (!allowed.includes(status)) return json({ error: `status must be one of: ${allowed.join(", ")}` }, 400);

  const admin = adminClient();
  const { data: app, error: appErr } = await admin
    .from("affiliate_applications")
    .select("id, email, tier_applied_for, audit_status")
    .eq("id", application_id)
    .maybeSingle();
  if (appErr || !app) return json({ error: "application not found" }, 404);

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("affiliate_applications")
    .update({ audit_status: status, reviewed_at: now })
    .eq("id", application_id);
  if (updateErr) return json({ error: updateErr.message }, 500);

  // Resolve display name for email personalisation
  const { data: profile } = await admin
    .from("profiles")
    .select("name")
    .eq("email", app.email)
    .maybeSingle();
  const displayName: string | null = (profile?.name as string | null) ?? null;

  if (status === "rejected") {
    fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-rejected`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ email: app.email, name: displayName }),
    }).catch((err) => console.error("[affiliate/admin/update-status] rejected email failed:", err));
  }
  // in_review: status update only — no email

  return json({ ok: true, status, application_id });
}

// ── POST /admin/activate ──────────────────────────────────────────────────────
// Manually activates a pending_verification affiliate and sends the full
// approval email. Use when the Persona webhook fails to fire.

async function handleAdminActivate(req: Request): Promise<Response> {
  const { isAdmin } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { affiliate_id } = body;
  if (!affiliate_id) return json({ error: "affiliate_id required" }, 400);

  const admin = adminClient();
  const { data: aff, error: affErr } = await admin
    .from("affiliates")
    .select("id, email, display_name, tier, status, promo_code, tracked_link_slug, commission_rate")
    .eq("id", affiliate_id)
    .maybeSingle();
  if (affErr || !aff) return json({ error: "affiliate not found" }, 404);
  if (aff.status === "active") return json({ ok: true, already_active: true });
  if (aff.status !== "pending_verification") {
    return json({ error: `cannot activate affiliate with status '${aff.status}' — only pending_verification is allowed` }, 400);
  }
  if (!aff.promo_code || !aff.tracked_link_slug) {
    return json({ error: "affiliate is missing promo_code or tracked_link_slug — cannot send approval email. Fix the data first." }, 400);
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("affiliates")
    .update({ status: "active", updated_at: now })
    .eq("id", affiliate_id);
  if (updateErr) return json({ error: updateErr.message }, 500);

  fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-approved`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({
      email: aff.email,
      name: aff.display_name,
      tier: aff.tier,
      promo_code: aff.promo_code,
      tracked_link_slug: aff.tracked_link_slug,
      commission_rate: aff.commission_rate,
    }),
  }).catch((err) => console.error("[affiliate/admin/activate] approval email failed:", err));

  console.log("[affiliate/admin/activate] activated:", { affiliate_id, email: aff.email });
  return json({ ok: true, affiliate_id, status: "active" });
}

// ── POST /admin/approve ───────────────────────────────────────────────────────

async function handleAdminApprove(req: Request): Promise<Response> {
  const { isAdmin } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { application_id, skip_persona = false } = body;
  if (!application_id) return json({ error: "application_id required" }, 400);

  const admin = adminClient();
  const { data: app, error: appErr } = await admin
    .from("affiliate_applications")
    .select("*")
    .eq("id", application_id)
    .maybeSingle();
  if (appErr || !app) return json({ error: "application not found" }, 404);

  // Idempotent — if affiliate already exists just update the application status.
  // Also backfills user_id if it was null (can happen when profile row didn't exist
  // at first approval time, leaving the affiliate unable to log in to their portal).
  const { data: existing } = await admin
    .from("affiliates")
    .select("id, user_id, promo_code, tracked_link_slug, status")
    .eq("email", app.email)
    .maybeSingle();
  if (existing) {
    await admin.from("affiliate_applications")
      .update({ audit_status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", application_id);
    // Backfill user_id if missing
    if (!existing.user_id) {
      let uid: string | null = null;
      const { data: prof } = await admin.from("profiles").select("id").eq("email", app.email).maybeSingle();
      if (prof?.id) { uid = prof.id as string; }
      else {
        const { data: authId } = await admin.rpc("get_user_id_by_email", { p_email: app.email });
        if (authId) uid = authId as string;
      }
      if (uid) await admin.from("affiliates").update({ user_id: uid }).eq("id", existing.id);
    }
    return json({ ok: true, affiliate: existing, already_existed: true });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, name")
    .eq("email", app.email)
    .maybeSingle();

  let userId: string | null = profile?.id ?? null;
  if (!userId) {
    const { data: authUserId } = await admin.rpc("get_user_id_by_email", { p_email: app.email });
    if (authUserId) userId = authUserId as string;
  }

  const displayName: string = (profile?.name as string | null) ?? app.email.split("@")[0];

  const TIER_CONFIG: Record<string, { commission_rate: number; subscription_discount_pct: number }> = {
    seeds:   { commission_rate: 0.10, subscription_discount_pct: 20 },
    voices:  { commission_rate: 0.15, subscription_discount_pct: 25 },
    anchors: { commission_rate: 0.20, subscription_discount_pct: 30 },
  };
  const tierCfg = TIER_CONFIG[app.tier_applied_for] ?? TIER_CONFIG.seeds;

  const discountSuffix = String(tierCfg.subscription_discount_pct);
  const nameClean = displayName.replace(/[^a-zA-Z]/g, "").toUpperCase() || "AFF";
  let promoCode: string | null = null;
  for (let len = Math.min(6, nameClean.length); len >= 2; len--) {
    const candidate = nameClean.slice(0, len) + discountSuffix;
    const { count: taken } = await admin.from("affiliates").select("id", { count: "exact", head: true }).eq("promo_code", candidate);
    if (!taken) { promoCode = candidate; break; }
  }
  if (!promoCode) {
    promoCode = nameClean.slice(0, 3) + discountSuffix + Date.now().toString().slice(-3);
  }

  const { data: slug, error: slugErr } = await admin.rpc("generate_tracked_link_slug");
  if (slugErr) return json({ error: "failed to generate slug: " + slugErr.message }, 500);

  const now = new Date().toISOString();
  // skip_persona=true activates the affiliate immediately (for known/trusted partners).
  // Default: create as pending_verification — Persona webhook will activate and email.
  const affiliateStatus = skip_persona ? "active" : "pending_verification";

  const { data: newAffiliate, error: createErr } = await admin
    .from("affiliates")
    .insert({
      user_id:                  userId,
      display_name:             displayName,
      email:                    app.email,
      tier:                     app.tier_applied_for,
      status:                   affiliateStatus,
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

  if (skip_persona) {
    // Bypassing Persona — send full approval email with link and promo code now.
    fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-approved`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ email: app.email, name: displayName, tier: app.tier_applied_for, promo_code: promoCode, tracked_link_slug: slug, commission_rate: tierCfg.commission_rate }),
    }).catch((err) => console.error("[affiliate/admin/approve] approval email failed:", err));
  } else {
    // Standard flow — send "approved, verify identity" email; full approval email fires from Persona webhook.
    fetch(`${SUPABASE_URL}/functions/v1/email/affiliate-verify-identity`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ email: app.email, name: displayName, tier: app.tier_applied_for }),
    }).catch((err) => console.error("[affiliate/admin/approve] verify-identity email failed:", err));
  }

  return json({ ok: true, affiliate: newAffiliate, pending_verification: !skip_persona });
}

// ── POST /apply ───────────────────────────────────────────────────────────────

async function handleApply(req: Request): Promise<Response> {
  const user = await getUserFromAuth(req);
  if (!user?.email) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { tier, instagram, tiktok, youtube, persona_inquiry_id, terms_accepted } = body;
  if (!tier) return json({ error: "tier required" }, 400);
  if (!terms_accepted) return json({ error: "You must accept the affiliate program terms to apply" }, 400);

  const admin = adminClient();
  const { data: existing } = await admin
    .from("affiliate_applications")
    .select("id, audit_status")
    .eq("email", user.email)
    .maybeSingle();

  // Block re-submission unless the previous application was rejected
  if (existing && existing.audit_status !== "rejected") {
    return json({ error: "Application already submitted" }, 409);
  }

  const now = new Date().toISOString();
  let app: any;

  if (existing) {
    // Rejected reapplication — reset the existing row to pending
    const { data: updated, error: updateErr } = await admin
      .from("affiliate_applications")
      .update({
        tier_applied_for:     tier,
        audit_status:         "pending",
        persona_status:       "none",
        instagram_handle:     instagram ? String(instagram).replace("@", "") : null,
        tiktok_handle:        tiktok    ? String(tiktok).replace("@", "")    : null,
        youtube_handle:       youtube   ? String(youtube).replace("@", "")   : null,
        persona_inquiry_id:   persona_inquiry_id || null,
        terms_accepted_at:    now,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (updateErr) return json({ error: updateErr.message }, 500);
    app = updated;
  } else {
    // New application — insert
    const { data: inserted, error: insertErr } = await admin
      .from("affiliate_applications")
      .insert({
        email:                user.email,
        tier_applied_for:     tier,
        instagram_handle:     instagram ? String(instagram).replace("@", "") : null,
        tiktok_handle:        tiktok    ? String(tiktok).replace("@", "")    : null,
        youtube_handle:       youtube   ? String(youtube).replace("@", "")   : null,
        persona_inquiry_id:   persona_inquiry_id || null,
        terms_accepted_at:    now,
      })
      .select()
      .single();
    if (insertErr) return json({ error: insertErr.message }, 500);
    app = inserted;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

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

// ── Social media profile fetchers ─────────────────────────────────────────────

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Returns null only if the account is confirmed NOT to exist (404).
// Returns { followers: null } if the account exists but Instagram blocked data access.
// Returns { followers: N } if data was retrievable.
async function fetchInstagramProfile(handle: string): Promise<{ followers: number | null; bio: string | null; verified: boolean } | null> {
  try {
    // Instagram's web_profile_info: 200=data, 404=not found, 401/403=exists but blocked
    const apiRes = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, {
      headers: {
        "x-ig-app-id": "936619743392459",
        "User-Agent": BROWSER_UA,
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.instagram.com/",
        "Origin": "https://www.instagram.com",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (apiRes.status === 404) return null; // Account definitively does not exist

    if (apiRes.ok) {
      const data = await apiRes.json();
      const user = data?.data?.user;
      if (user) return {
        followers: user.edge_followed_by?.count ?? null,
        bio: user.biography ?? null,
        verified: user.is_verified ?? false,
      };
    }

    // 401/403/other non-404: account exists but Instagram blocked the API response.
    // Try HTML as a secondary data source, but treat non-404 as "account exists" regardless.
    const htmlRes = await fetch(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (htmlRes.status === 404) return null; // Profile page 404 = doesn't exist

    if (htmlRes.ok) {
      const html = await htmlRes.text();
      // schema.org JSON-LD (most reliable when present)
      const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (ldMatch) {
        try {
          const ld = JSON.parse(ldMatch[1]);
          const stats: any[] = ld?.mainEntity?.interactionStatistic ?? [];
          const follow = stats.find((s: any) => String(s.interactionType ?? "").includes("Follow"));
          if (follow?.userInteractionCount != null) {
            return { followers: Number(follow.userInteractionCount), bio: null, verified: false };
          }
        } catch { /* continue */ }
      }
      const countMatch = html.match(/"edge_followed_by":\{"count":(\d+)\}/);
      if (countMatch) return { followers: parseInt(countMatch[1]), bio: null, verified: false };
    }

    // Any non-404 response = account exists, just no data retrievable
    return { followers: null, bio: null, verified: false };
  } catch {
    return null;
  }
}

async function fetchTikTokProfile(handle: string): Promise<{ followers: number | null; author: string | null } | null> {
  try {
    // TikTok embeds profile data in __UNIVERSAL_DATA_FOR_REHYDRATION__ script tag
    const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(handle)}`, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Parse __UNIVERSAL_DATA_FOR_REHYDRATION__ for full profile stats
    const scriptMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      try {
        const data = JSON.parse(scriptMatch[1]);
        const userInfo = data?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo;
        if (userInfo) {
          return {
            followers: userInfo.stats?.followerCount ?? null,
            author: userInfo.user?.nickname ?? userInfo.user?.uniqueId ?? null,
          };
        }
      } catch { /* continue */ }
    }

    // Regex fallback
    const followerMatch = html.match(/"followerCount":(\d+)/);
    const nameMatch = html.match(/"nickname":"([^"]+)"/);
    if (followerMatch || html.includes(handle)) {
      return {
        followers: followerMatch ? parseInt(followerMatch[1]) : null,
        author: nameMatch?.[1] ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchYouTubeProfile(handle: string): Promise<{ subscribers: number | null; subscribersText: string | null; author: string | null } | null> {
  try {
    // Try YouTube Data API v3 if key is configured
    const ytKey = Deno.env.get("YOUTUBE_API_KEY");
    if (ytKey) {
      const apiRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&forHandle=${encodeURIComponent(handle)}&key=${ytKey}`,
        { signal: AbortSignal.timeout(7000) }
      );
      if (apiRes.ok) {
        const data = await apiRes.json();
        const ch = data?.items?.[0];
        if (ch) return {
          subscribers: ch.statistics?.subscriberCount ? parseInt(ch.statistics.subscriberCount) : null,
          subscribersText: null,
          author: ch.snippet?.title ?? null,
        };
      }
    }

    // Fallback: fetch channel HTML and extract subscriber count from embedded JSON
    const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const subTextMatch = html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"\}/);
    const nameMatch = html.match(/"channelMetadataRenderer":\{"title":"([^"]+)"/);
    const subNumMatch = html.match(/"subscriberCount":"(\d+)"/);

    if (subTextMatch || nameMatch || html.includes("youtube.com")) {
      return {
        subscribers: subNumMatch ? parseInt(subNumMatch[1]) : null,
        subscribersText: subTextMatch?.[1] ?? null,
        author: nameMatch?.[1] ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ── GET /admin/review/:applicationId ─────────────────────────────────────────

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

async function handleAdminReview(applicationId: string, req: Request): Promise<Response> {
  const { isAdmin } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const admin = adminClient();

  const { data: app, error } = await admin
    .from("affiliate_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (error || !app) return json({ error: "application not found" }, 404);

  // Look up applicant name from profiles (best-effort)
  const { data: profile } = await admin
    .from("profiles")
    .select("name")
    .eq("email", app.email)
    .maybeSingle();
  const applicantName: string | null = (profile?.name as string | null) ?? null;

  // Mark as in_review if still pending
  if (app.audit_status === "pending") {
    await admin
      .from("affiliate_applications")
      .update({ audit_status: "in_review" })
      .eq("id", applicationId);
    app.audit_status = "in_review";
  }

  // Fetch real social profile data concurrently (best-effort — null if blocked/rate-limited)
  const [igProfile, ttProfile, ytProfile] = await Promise.all([
    app.instagram_handle ? fetchInstagramProfile(app.instagram_handle) : Promise.resolve(null),
    app.tiktok_handle ? fetchTikTokProfile(app.tiktok_handle) : Promise.resolve(null),
    app.youtube_handle ? fetchYouTubeProfile(app.youtube_handle) : Promise.resolve(null),
  ]);

  // Build social data summary with real follower counts where available
  const socialLines: string[] = [];
  if (app.instagram_handle) {
    let line = `Instagram: @${app.instagram_handle}`;
    if (igProfile) {
      const parts: string[] = [];
      if (igProfile.followers !== null) {
        parts.push(`${igProfile.followers.toLocaleString()} followers`);
      } else {
        parts.push("account confirmed to exist; follower count not accessible via server-side API (Instagram blocks all unauthenticated server requests — admin should click the profile link to verify count manually)");
      }
      if (igProfile.verified) parts.push("verified badge");
      if (igProfile.bio) parts.push(`bio: "${igProfile.bio.slice(0, 120)}"`);
      line += ` — ${parts.join("; ")}`;
    } else {
      line += " — account NOT FOUND (handle may be wrong, account deactivated, or renamed)";
    }
    socialLines.push(line);
  }
  if (app.tiktok_handle) {
    let line = `TikTok: @${app.tiktok_handle}`;
    if (ttProfile) {
      const parts: string[] = [];
      if (ttProfile.followers !== null) parts.push(`${ttProfile.followers.toLocaleString()} followers`);
      else parts.push("account exists");
      if (ttProfile.author) parts.push(`name: "${ttProfile.author}"`);
      line += ` — ${parts.join("; ")}`;
    } else {
      line += " (not found or access blocked — verify manually)";
    }
    socialLines.push(line);
  }
  if (app.youtube_handle) {
    let line = `YouTube: @${app.youtube_handle}`;
    if (ytProfile) {
      const parts: string[] = [];
      if (ytProfile.subscribers !== null) parts.push(`${ytProfile.subscribers.toLocaleString()} subscribers`);
      else if (ytProfile.subscribersText) parts.push(`${ytProfile.subscribersText} subscribers`);
      else parts.push("channel exists");
      if (ytProfile.author) parts.push(`name: "${ytProfile.author}"`);
      line += ` — ${parts.join("; ")}`;
    } else {
      line += " (not found or access blocked — verify manually)";
    }
    socialLines.push(line);
  }
  const socialData = socialLines.length ? socialLines.join("\n") : "None provided";

  // Build Claude prompt
  const tierDescriptions: Record<string, string> = {
    seeds: "Seeds tier — micro-influencers, typically 1K–10K followers, community-focused",
    voices: "Voices tier — mid-tier, typically 10K–100K followers, growing reach",
    anchors: "Anchors tier — macro-influencers, typically 100K+ followers, major reach",
  };

  const prompt = `You are a senior affiliate program manager at Parallel, a premium dating app launching in major US cities. Analyze this affiliate application and return a structured JSON review to help a human reviewer decide whether to approve or reject it. We do NOT ask applicants follow-up questions — we verify everything from public profile data.

APPLICATION
Email: ${app.email}
Tier requested: ${tierDescriptions[app.tier_applied_for] || app.tier_applied_for}
Submitted: ${new Date(app.created_at).toLocaleDateString()}
ID verification: ${app.persona_status === "approved" ? "Verified ✓" : app.persona_status === "none" ? "Not yet verified" : app.persona_status}

Social profiles (fetched from public APIs):
${socialData}

IMPORTANT: Instagram blocks all server-side API calls — if the Instagram line says "account confirmed to exist", that IS positive verification. The account is real. The admin will manually verify the follower count using the profile link. Do NOT penalize an applicant or lower confidence because Instagram follower count is unavailable — treat "account confirmed" the same as having the count for recommendation purposes, and note it in your summary.

TIER GUIDE
- Seeds: 1K–10K followers, authentic community presence, 15% commission
- Voices: 10K–100K followers, consistent content, proven audience, 20% commission
- Anchors: 100K+ followers, major reach, verified brand experience, 25% commission

Best-converting audiences for a dating app: lifestyle, relationships, self-improvement, dating advice, social life, wellness.

Return ONLY valid JSON with this exact shape:
{
  "recommendation": "approve" | "reject",
  "confidence": "high" | "medium" | "low",
  "summary": "2–3 sentence plain English assessment of this applicant",
  "strengths": ["strength 1", "strength 2"],
  "concerns": ["concern 1", "concern 2"],
  "tier_fit": "well_suited" | "overstated" | "understated" | "unclear",
  "tier_rationale": "One sentence on whether the requested tier matches their verified follower count",
  "audience_quality": "strong" | "moderate" | "weak" | "unknown",
  "audience_notes": "One sentence on likely audience relevance for a dating app"
}`;

  let analysis: Record<string, unknown> | null = null;
  if (ANTHROPIC_API_KEY) {
    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const text: string = aiData?.content?.[0]?.text ?? "";
        try {
          analysis = JSON.parse(text);
        } catch {
          const m = text.match(/\{[\s\S]*\}/);
          if (m) analysis = JSON.parse(m[0]);
        }
      }
    } catch (e) {
      console.error("[affiliate/admin/review] Claude call failed:", e);
    }
  }

  const socialProfiles = {
    instagram: app.instagram_handle
      ? (igProfile !== null
          ? { found: true, followers: igProfile.followers, verified: igProfile.verified }
          : { found: false, followers: null, verified: false })
      : null,
    tiktok: app.tiktok_handle
      ? (ttProfile !== null
          ? { found: true, followers: ttProfile.followers, author: ttProfile.author }
          : { found: false, followers: null, author: null })
      : null,
    youtube: app.youtube_handle
      ? (ytProfile !== null
          ? { found: true, subscribers: ytProfile.subscribers, subscribersText: ytProfile.subscribersText, author: ytProfile.author }
          : { found: false, subscribers: null, subscribersText: null, author: null })
      : null,
  };

  return json({ application: app, analysis, social_profiles: socialProfiles, applicant_name: applicantName });
}

// ── Router ────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname
    .replace(/^\/functions\/v1\/affiliate/, "")
    .replace(/^\/affiliate/, "")
    || "/";
  const segments = path.split("/").filter(Boolean);
  const endpoint = segments[0] || "";

  // GET /validate/:slug
  if (req.method === "GET" && endpoint === "validate" && segments[1]) {
    return await handleValidateSlug(segments[1]);
  }

  // GET /profile
  if (req.method === "GET" && endpoint === "profile") {
    return await handleGetProfile(req);
  }

  // GET /earnings
  if (req.method === "GET" && endpoint === "earnings") {
    return await handleGetEarnings(req);
  }

  // GET /payout/history
  if (req.method === "GET" && endpoint === "payout" && segments[1] === "history") {
    return await handleGetPayoutHistory(req);
  }

  // GET /payout/config (Mercury config debug)
  if (req.method === "GET" && endpoint === "payout" && segments[1] === "config") {
    return await handlePayoutConfig(req);
  }

  // POST /click
  if (req.method === "POST" && endpoint === "click") {
    return await handleClick(req);
  }

  // POST /attribute
  if (req.method === "POST" && endpoint === "attribute") {
    return await handleAttribute(req);
  }

  // POST /validate-promo
  if (req.method === "POST" && endpoint === "validate-promo") {
    return await handleValidatePromo(req);
  }

  // POST /payout/setup
  if (req.method === "POST" && endpoint === "payout" && segments[1] === "setup") {
    return await handlePayoutSetup(req);
  }

  // POST /payout/preview
  if (req.method === "POST" && endpoint === "payout" && segments[1] === "preview") {
    return await handlePayoutPreview(req);
  }

  // POST /payout/queue
  if (req.method === "POST" && endpoint === "payout" && segments[1] === "queue") {
    return await handlePayoutQueue(req);
  }

  // GET /payout/pending
  if (req.method === "GET" && endpoint === "payout" && segments[1] === "pending") {
    return await handlePayoutPending(req);
  }

  // POST /payout/approve
  if (req.method === "POST" && endpoint === "payout" && segments[1] === "approve") {
    return await handlePayoutApprove(req);
  }

  // POST /payout/cancel
  if (req.method === "POST" && endpoint === "payout" && segments[1] === "cancel") {
    return await handlePayoutCancel(req);
  }

  // POST /payout/release (legacy — backend only, no UI button)
  if (req.method === "POST" && endpoint === "payout" && segments[1] === "release") {
    return await handlePayoutRelease(req);
  }

  // POST /payout/clawback
  if (req.method === "POST" && endpoint === "payout" && segments[1] === "clawback") {
    return await handlePayoutClawback(req);
  }

  // POST /admin/update-status
  if (req.method === "POST" && endpoint === "admin" && segments[1] === "update-status") {
    return await handleAdminUpdateStatus(req);
  }

  // POST /admin/activate
  if (req.method === "POST" && endpoint === "admin" && segments[1] === "activate") {
    return await handleAdminActivate(req);
  }

  // POST /admin/approve
  if (req.method === "POST" && endpoint === "admin" && segments[1] === "approve") {
    return await handleAdminApprove(req);
  }

  // GET /admin/review/:applicationId
  if (req.method === "GET" && endpoint === "admin" && segments[1] === "review" && segments[2]) {
    return await handleAdminReview(segments[2], req);
  }

  // POST /apply
  if (req.method === "POST" && endpoint === "apply") {
    return await handleApply(req);
  }

  return json({ error: "not found" }, 404);
});

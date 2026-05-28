// Parallel — affiliate edge function v10
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
  const { data: affiliate } = await admin
    .from("affiliates")
    .select("id, user_id, display_name, email, tier, status, promo_code, tracked_link_slug, commission_rate, subscription_discount_pct, total_conversions, total_paid_lifetime, legal_name, tax_address, tax_country, tax_info_collected_at, bank_account_collected_at, mercury_recipient_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  return { user, affiliate: affiliate ?? null };
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
    const eraAccountType = account_type === "personalSavings" ? "savings" : "checking";
    const mercuryRes = await fetch(`${MERCURY_BASE}/recipients`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${MERCURY_TOKEN}:`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: legal_name,
        emails: [affiliate.email],
        accountType: account_type,
        routingNumber: routing_number,
        accountNumber: account_number,
        electronicRoutingInfo: {
          accountType: eraAccountType,
          routingNumber: routing_number,
          accountNumber: account_number,
        },
      }),
    });

    const mercuryBody = await mercuryRes.json().catch(() => ({}));
    if (!mercuryRes.ok) {
      console.error("[affiliate/payout/setup] Mercury recipient error:", mercuryRes.status, mercuryBody);
      const msg = (mercuryBody as any)?.message ?? "";
      // Translate common Mercury errors into user-friendly messages
      if (msg.toLowerCase().includes("routing")) {
        return json({ error: "The routing number you entered is invalid — please double-check it" }, 400);
      }
      if (msg.toLowerCase().includes("account")) {
        return json({ error: "The account number you entered appears invalid — please double-check it" }, 400);
      }
      return json({ error: "We couldn't connect your bank account. Please check your details and try again." }, 400);
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

  // 9. If Mercury failed: update payout record, leave attributions untouched
  if (!mercuryRes.ok) {
    await admin.from("affiliate_payouts").update({
      mercury_status: "failed",
      failure_reason: JSON.stringify(mercuryBody).slice(0, 500),
    }).eq("id", payout.id);
    console.error("[affiliate/payout/release] Mercury error:", mercuryRes.status, mercuryBody);
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

// ── POST /admin/approve ───────────────────────────────────────────────────────

async function handleAdminApprove(req: Request): Promise<Response> {
  const { isAdmin } = await checkIsAdmin(req);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { application_id } = body;
  if (!application_id) return json({ error: "application_id required" }, 400);

  const admin = adminClient();
  const { data: app, error: appErr } = await admin
    .from("affiliate_applications")
    .select("*")
    .eq("id", application_id)
    .maybeSingle();
  if (appErr || !app) return json({ error: "application not found" }, 404);

  // Idempotent — if affiliate already exists just update the application
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

// ── POST /apply ───────────────────────────────────────────────────────────────

async function handleApply(req: Request): Promise<Response> {
  const user = await getUserFromAuth(req);
  if (!user?.email) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { tier, instagram, tiktok, youtube, why_parallel, audience_description, phase1_city_audience, terms_accepted } = body;
  if (!tier) return json({ error: "tier required" }, 400);
  if (!terms_accepted) return json({ error: "You must accept the affiliate program terms to apply" }, 400);

  const admin = adminClient();
  const { data: existing } = await admin
    .from("affiliate_applications")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();
  if (existing) return json({ error: "Application already submitted" }, 409);

  const now = new Date().toISOString();
  const { data: app, error: insertErr } = await admin
    .from("affiliate_applications")
    .insert({
      email:                user.email,
      tier_applied_for:     tier,
      instagram_handle:     instagram ? String(instagram).replace("@", "") : null,
      tiktok_handle:        tiktok    ? String(tiktok).replace("@", "")    : null,
      youtube_handle:       youtube   ? String(youtube).replace("@", "")   : null,
      why_parallel:         why_parallel         || null,
      audience_description: audience_description || null,
      phase1_city_audience: phase1_city_audience ?? false,
      terms_accepted_at:    now,
    })
    .select()
    .single();
  if (insertErr) return json({ error: insertErr.message }, 500);

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

  // POST /payout/release
  if (req.method === "POST" && endpoint === "payout" && segments[1] === "release") {
    return await handlePayoutRelease(req);
  }

  // POST /payout/clawback
  if (req.method === "POST" && endpoint === "payout" && segments[1] === "clawback") {
    return await handlePayoutClawback(req);
  }

  // POST /admin/approve
  if (req.method === "POST" && endpoint === "admin" && segments[1] === "approve") {
    return await handleAdminApprove(req);
  }

  // POST /apply
  if (req.method === "POST" && endpoint === "apply") {
    return await handleApply(req);
  }

  return json({ error: "not found" }, 404);
});

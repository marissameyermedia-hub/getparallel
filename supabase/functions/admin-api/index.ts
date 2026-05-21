// Parallel — admin-api edge function v6
// v6: Add /run-matching-all — triggers run-matching for every released user server-side.
//     Fix matches_24h in /pulse to count from matches table (not shadow_matches).
// v5: Add /revenue route — total revenue, MRR, ARR, paying subscribers, payment history.
// v4: Add /safety/cases routes — real T&S case management with DB persistence.
// v3: Add /match-quality route — algorithm health and match statistics.
// v2: Add /pulse route — 11-metric health snapshot.
// v1: /check, /cities routes.
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
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

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

async function requireAdmin(req: Request): Promise<{ user: any; error: Response | null }> {
  const user = await getUserFromAuth(req);
  if (!user) return { user: null, error: json({ error: "Unauthorized" }, 401) };
  const admin = adminClient();
  const { data: isAdminResult } = await admin.rpc("is_admin", { check_user_id: user.id });
  if (!isAdminResult) return { user: null, error: json({ error: "Forbidden" }, 403) };
  return { user, error: null };
}

async function handleCheck(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ isAdmin: false });
  const admin = adminClient();
  const { data: isAdminResult } = await admin.rpc("is_admin", { check_user_id: user.id });
  return json({ isAdmin: !!isAdminResult });
}

async function handleGetCities(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const admin = adminClient();
  const [citiesRes, thresholdsRes, releasesRes] = await Promise.all([
    admin.from("city_health").select("*").order("verified_total", { ascending: false }),
    admin.from("city_thresholds").select("*").maybeSingle(),
    admin.from("release_log").select("*").order("released_at", { ascending: false }).limit(20),
  ]);
  if (citiesRes.error) {
    console.error("[admin/cities]", citiesRes.error);
    return json({ error: "Failed to load city data" }, 500);
  }
  return json({
    cities: citiesRes.data ?? [],
    thresholds: thresholdsRes.data ?? {},
    recentReleases: releasesRes.data ?? [],
  });
}

async function handlePulse(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const admin = adminClient();
  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const ago7d  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    signupsRes,
    completedProfilesRes,
    activeSubsRes,
    otpFailuresRes,
    photodnaRes,
    personaVerifRes,
    personaFailRes,
    userReportsRes,
    underageReportsRes,
    autoSuspendsRes,
    matchesRes,
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', ago24h),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('has_completed_onboarding', true),
    admin.from('subscriptions').select('*', { count: 'exact', head: true }).in('status', ['active', 'trialing']),
    admin.from('phone_otps').select('*', { count: 'exact', head: true })
      .gte('created_at', ago24h).eq('used', false).lt('expires_at', now.toISOString()),
    admin.from('csam_flags').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
    admin.from('identity_verifications').select('*', { count: 'exact', head: true })
      .not('verified_at', 'is', null).gte('verified_at', ago7d),
    admin.from('identity_verifications').select('*', { count: 'exact', head: true })
      .in('status', ['failed', 'declined']).gte('created_at', ago7d),
    admin.from('reported_users').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
    admin.from('reported_users').select('*', { count: 'exact', head: true })
      .gte('created_at', ago7d).ilike('reason', '%underage%'),
    admin.from('trust_score_events').select('*', { count: 'exact', head: true })
      .gte('created_at', ago7d).ilike('event_type', '%suspend%'),
    // Count from matches (not shadow_matches) — all users are now released
    admin.from('matches').select('*', { count: 'exact', head: true }).gte('created_at', ago24h),
  ]);

  return json({
    signups_24h:               signupsRes.count            ?? 0,
    completed_profiles_total:  completedProfilesRes.count  ?? 0,
    active_subscriptions:      activeSubsRes.count         ?? 0,
    otp_failures_24h:          otpFailuresRes.count        ?? 0,
    photodna_flags_7d:         photodnaRes.count           ?? 0,
    persona_verifications_7d:  personaVerifRes.count       ?? 0,
    persona_failures_7d:       personaFailRes.count        ?? 0,
    user_reports_7d:           userReportsRes.count        ?? 0,
    underage_reports_7d:       underageReportsRes.count    ?? 0,
    auto_suspends_7d:          autoSuspendsRes.count       ?? 0,
    matches_24h:               matchesRes.count            ?? 0,
    generated_at:              now.toISOString(),
  });
}

async function handleMatchQuality(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const admin = adminClient();
  const now = new Date();
  const ago7d  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    totalCountRes,
    count7dRes,
    count30dRes,
    lastMatchRes,
    allScoresRes,
    breakdownSampleRes,
    activeUsersRes,
    matchedUsersRes,
  ] = await Promise.all([
    admin.from('matches').select('*', { count: 'exact', head: true }),
    admin.from('matches').select('*', { count: 'exact', head: true }).gte('created_at', ago7d),
    admin.from('matches').select('*', { count: 'exact', head: true }).gte('created_at', ago30d),
    admin.from('matches')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1),
    admin.from('matches')
      .select('compatibility_score')
      .not('compatibility_score', 'is', null)
      .limit(50000),
    admin.from('matches')
      .select('user_id, breakdown')
      .not('breakdown', 'is', null)
      .limit(2000),
    admin.from('profiles')
      .select('id')
      .eq('has_completed_onboarding', true)
      .not('is_suspended', 'eq', true)
      .not('is_paused', 'eq', true)
      .not('is_hidden_pending_review', 'eq', true)
      .not('is_seed_account', 'eq', true)
      .limit(100000),
    admin.from('matches').select('user_id').limit(100000),
  ]);

  const totalMatchPairs = Math.floor((totalCountRes.count  ?? 0) / 2);
  const matchPairs7d    = Math.floor((count7dRes.count     ?? 0) / 2);
  const matchPairs30d   = Math.floor((count30dRes.count    ?? 0) / 2);

  const scores = (allScoresRes.data ?? []).map((r: any) => r.compatibility_score as number);
  const avgCompatibilityScore = scores.length > 0
    ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
    : 0;

  const scoreDistribution = {
    excellent: Math.floor(scores.filter((s: number) => s >= 80).length                       / 2),
    good:      Math.floor(scores.filter((s: number) => s >= 60 && s < 80).length             / 2),
    fair:      Math.floor(scores.filter((s: number) => s >= 40 && s < 60).length             / 2),
    floor:     Math.floor(scores.filter((s: number) => s >= 30 && s < 40).length             / 2),
  };

  const categoryTotals: Record<string, { sum: number; count: number }> = {};
  for (const row of (breakdownSampleRes.data ?? []) as any[]) {
    const bd = row.breakdown as Record<string, number> | null;
    if (!bd) continue;
    for (const [cat, score] of Object.entries(bd)) {
      if (typeof score !== 'number') continue;
      if (!categoryTotals[cat]) categoryTotals[cat] = { sum: 0, count: 0 };
      categoryTotals[cat].sum   += score;
      categoryTotals[cat].count += 1;
    }
  }
  const categoryAverages: Record<string, number> = {};
  for (const [cat, { sum, count }] of Object.entries(categoryTotals)) {
    categoryAverages[cat] = count > 0
      ? Math.round((sum / count) * 10) / 10
      : 0;
  }

  const matchCountByUser: Record<string, number> = {};
  for (const row of (matchedUsersRes.data ?? []) as any[]) {
    const uid = row.user_id as string;
    matchCountByUser[uid] = (matchCountByUser[uid] ?? 0) + 1;
  }

  let usersWithZeroMatches = 0;
  let usersWithOneMatch    = 0;
  const activeUserIds = (activeUsersRes.data ?? []) as { id: string }[];
  for (const { id } of activeUserIds) {
    const c = matchCountByUser[id] ?? 0;
    if (c === 0) usersWithZeroMatches++;
    if (c === 1) usersWithOneMatch++;
  }

  let algorithmVersion = 'unknown';
  let canonicalHash    = 'unknown';
  try {
    const healthRes = await fetch(
      `${SUPABASE_URL}/functions/v1/run-matching/health`,
      { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    if (healthRes.ok) {
      const h = await healthRes.json() as Record<string, any>;
      algorithmVersion = h.version       ?? 'unknown';
      canonicalHash    = h.canonical_hash ?? 'unknown';
    } else {
      console.warn('[admin-api/match-quality] run-matching health:', healthRes.status);
    }
  } catch (e) {
    console.error('[admin-api/match-quality] run-matching health fetch failed:', e);
  }

  return json({
    total_matches_all_time:   totalMatchPairs,
    matches_last_7d:          matchPairs7d,
    matches_last_30d:         matchPairs30d,
    users_with_zero_matches:  usersWithZeroMatches,
    users_with_one_match:     usersWithOneMatch,
    active_users_total:       activeUserIds.length,
    score_distribution:       scoreDistribution,
    avg_compatibility_score:  avgCompatibilityScore,
    category_averages:        categoryAverages,
    algorithm_version:        algorithmVersion,
    canonical_hash:           canonicalHash,
    last_match_inserted_at:   lastMatchRes.data?.[0]?.created_at ?? null,
    generated_at:             now.toISOString(),
  });
}

// Triggers run-matching for every released non-seed user, sequentially.
// Returns per-user results so the admin panel can show who got matched.
async function handleRunMatchingAll(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const admin = adminClient();

  const { data: users, error: usersErr } = await admin
    .from('profiles')
    .select('id, name')
    .eq('has_completed_onboarding', true)
    .eq('release_status', 'released')
    .not('is_seed_account', 'eq', true)
    .not('is_suspended', 'eq', true);

  if (usersErr || !users) {
    return json({ error: 'Failed to fetch users' }, 500);
  }

  const results: Array<{ userId: string; name: string; ok: boolean; matched?: number; error?: string }> = [];

  for (const user of users as any[]) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/run-matching`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        const data = await res.json() as Record<string, any>;
        results.push({ userId: user.id, name: user.name, ok: true, matched: data.matched ?? 0 });
      } else {
        const errText = await res.text();
        results.push({ userId: user.id, name: user.name, ok: false, error: errText.slice(0, 200) });
      }
    } catch (e: any) {
      results.push({ userId: user.id, name: user.name, ok: false, error: e.message });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  console.log(`[admin-api/run-matching-all] processed ${users.length} users, ${succeeded} succeeded`);

  return json({ ok: true, users_processed: users.length, succeeded, results });
}

// ── Revenue ────────────────────────────────────────────────────────────────────

async function handleRevenue(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const admin = adminClient();
  const now = new Date();
  const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ago12m = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const [allPaymentsRes, recentPaymentsRes, activeSubsRes] = await Promise.all([
    admin.from('payment_events').select('amount, currency, paid_at, user_id').order('paid_at', { ascending: true }),
    admin.from('payment_events')
      .select('id, user_id, amount, currency, paid_at, profiles(name)')
      .order('paid_at', { ascending: false })
      .limit(20),
    admin.from('subscriptions')
      .select('user_id, plan, status')
      .not('paypal_subscription_id', 'is', null)
      .in('status', ['active', 'trialing']),
  ]);

  const allPayments = (allPaymentsRes.data ?? []) as any[];
  const totalRevenue = allPayments.reduce((s, p) => s + parseFloat(p.amount ?? 0), 0);
  const revenue30d   = allPayments
    .filter(p => p.paid_at >= ago30d)
    .reduce((s, p) => s + parseFloat(p.amount ?? 0), 0);

  const payingUserIds = new Set(allPayments.map(p => p.user_id));
  const payingSubscribers = payingUserIds.size;

  const mrr = Math.round((totalRevenue / 12) * 100) / 100;
  const arr = (activeSubsRes.data ?? []).filter(s => payingUserIds.has(s.user_id)).length * 79;

  const byMonth: Record<string, number> = {};
  for (const p of allPayments) {
    if (p.paid_at < ago12m) continue;
    const month = (p.paid_at as string).slice(0, 7);
    byMonth[month] = (byMonth[month] ?? 0) + parseFloat(p.amount ?? 0);
  }
  const revenueByMonth = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }));

  const recentPayments = (recentPaymentsRes.data ?? []).map((p: any) => ({
    id:       p.id,
    user_id:  p.user_id,
    name:     (p.profiles as any)?.name ?? 'Unknown',
    amount:   parseFloat(p.amount ?? 0),
    currency: p.currency ?? 'USD',
    paid_at:  p.paid_at,
  }));

  return json({
    total_revenue:       Math.round(totalRevenue * 100) / 100,
    revenue_30d:         Math.round(revenue30d   * 100) / 100,
    paying_subscribers:  payingSubscribers,
    mrr,
    arr,
    revenue_by_month:    revenueByMonth,
    recent_payments:     recentPayments,
    active_subscriptions: (activeSubsRes.data ?? []).length,
    generated_at:        now.toISOString(),
  });
}

// ── Trust & Safety case management ────────────────────────────────────────────

async function handleListSafetyCases(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const admin = adminClient();

  const { data: cases, error: dbErr } = await admin
    .from('safety_cases')
    .select(`
      id, case_number, status, priority, category, description,
      context, feels_unsafe, screenshots, suggested_tier, assigned_to, created_at,
      reporter:profiles!reporter_id(id, name),
      accused:profiles!accused_id(id, name)
    `)
    .order('created_at', { ascending: false });

  if (dbErr) {
    console.error('[admin-api/safety/cases list]', dbErr);
    return json({ error: 'Failed to load cases' }, 500);
  }

  const accusedIds = [...new Set((cases ?? []).map((c: any) => c.accused?.id).filter(Boolean))];
  const priorCounts: Record<string, number> = {};

  if (accusedIds.length > 0) {
    const { data: priorRows } = await admin
      .from('safety_cases')
      .select('accused_id')
      .in('accused_id', accusedIds)
      .neq('status', 'open');

    for (const row of (priorRows ?? []) as any[]) {
      priorCounts[row.accused_id] = (priorCounts[row.accused_id] ?? 0) + 1;
    }
  }

  const result = (cases ?? []).map((c: any) => {
    const prior = priorCounts[c.accused?.id] ?? 0;
    return {
      id:            c.id,
      case_number:   c.case_number,
      status:        c.status,
      priority:      c.priority,
      reporter_id:   c.reporter?.id   ?? null,
      reporter_name: c.reporter?.name ?? 'Unknown',
      accused_id:    c.accused?.id    ?? null,
      accused_name:  c.accused?.name  ?? 'Unknown',
      category:      c.category,
      description:   c.description,
      context:       c.context,
      feels_unsafe:  c.feels_unsafe,
      screenshots:   c.screenshots ?? [],
      suggested_tier: c.suggested_tier,
      assigned_to:   c.assigned_to ?? null,
      trust_score:   Math.max(0, 100 - prior * 15),
      prior_reports: prior,
      created_at:    c.created_at,
    };
  });

  return json(result);
}

async function handleGetSafetyCase(req: Request, caseId: string) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const admin = adminClient();

  const { data: caseRow, error: caseErr } = await admin
    .from('safety_cases')
    .select(`
      id, case_number, status, priority, category, description,
      context, feels_unsafe, screenshots, suggested_tier, assigned_to, created_at,
      reporter:profiles!reporter_id(id, name),
      accused:profiles!accused_id(id, name)
    `)
    .eq('id', caseId)
    .single();

  if (caseErr || !caseRow) return json({ error: 'Case not found' }, 404);

  const reporterId = (caseRow as any).reporter?.id;
  const accusedId  = (caseRow as any).accused?.id;

  const [convRes, priorRes, matchCountRes] = await Promise.all([
    reporterId && accusedId
      ? admin.from('conversations')
          .select('id')
          .or(`and(user_id_1.eq.${reporterId},user_id_2.eq.${accusedId}),and(user_id_1.eq.${accusedId},user_id_2.eq.${reporterId})`)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from('safety_cases')
      .select('id, case_number, category, status, created_at')
      .eq('accused_id', accusedId)
      .neq('id', caseId)
      .order('created_at', { ascending: false })
      .limit(10),
    admin.from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', accusedId),
  ]);

  let chatHistory: any[] = [];
  const convData = (convRes as any).data;
  if (convData?.id) {
    const { data: messages } = await admin
      .from('messages')
      .select('id, sender_id, text, created_at')
      .eq('conversation_id', convData.id)
      .order('created_at', { ascending: true })
      .limit(50);

    chatHistory = (messages ?? []).map((m: any) => ({
      id:         m.id,
      sender:     m.sender_id === reporterId ? 'reporter' : 'accused',
      text:       m.text,
      created_at: m.created_at,
    }));
  }

  const priorCaseHistory = (priorRes.data ?? []).map((p: any) => ({
    id:          p.id,
    case_number: p.case_number,
    category:    p.category,
    status:      p.status,
    date:        p.created_at,
  }));

  const priorCount = priorCaseHistory.length;
  const matchCount = Math.floor(((matchCountRes as any).count ?? 0) / 2);

  return json({
    case: {
      id:            (caseRow as any).id,
      case_number:   (caseRow as any).case_number,
      status:        (caseRow as any).status,
      priority:      (caseRow as any).priority,
      reporter_id:   reporterId,
      reporter_name: (caseRow as any).reporter?.name ?? 'Unknown',
      accused_id:    accusedId,
      accused_name:  (caseRow as any).accused?.name  ?? 'Unknown',
      category:      (caseRow as any).category,
      description:   (caseRow as any).description,
      context:       (caseRow as any).context,
      feels_unsafe:  (caseRow as any).feels_unsafe,
      screenshots:   (caseRow as any).screenshots ?? [],
      suggested_tier: (caseRow as any).suggested_tier,
      assigned_to:   (caseRow as any).assigned_to ?? null,
      trust_score:   Math.max(0, 100 - priorCount * 15),
      prior_reports: priorCount,
      match_count:   matchCount,
      created_at:    (caseRow as any).created_at,
    },
    chat_history:      chatHistory,
    prior_case_history: priorCaseHistory,
  });
}

async function handleSafetyCaseAction(req: Request, caseId: string) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { action, internal_notes, message_to_user } = body;

  if (!action || !internal_notes) {
    return json({ error: 'action and internal_notes are required' }, 400);
  }

  const validActions = ['warning', 'temp-suspend', 'request-response', 'permanent-ban', 'dismiss', 'escalate'];
  if (!validActions.includes(action)) {
    return json({ error: 'Invalid action' }, 400);
  }

  const admin = adminClient();

  const { data: caseRow, error: caseErr } = await admin
    .from('safety_cases')
    .select('id, accused_id, status')
    .eq('id', caseId)
    .single();

  if (caseErr || !caseRow) return json({ error: 'Case not found' }, 404);

  const newStatus: Record<string, string> = {
    'warning':          'resolved',
    'temp-suspend':     'under-review',
    'request-response': 'under-review',
    'permanent-ban':    'resolved',
    'dismiss':          'resolved',
    'escalate':         'escalated',
  };

  const caseUpdate: Record<string, any> = {
    status:     newStatus[action],
    updated_at: new Date().toISOString(),
  };
  if (action === 'escalate') caseUpdate.priority = 'critical';

  const updates: Promise<any>[] = [
    admin.from('safety_cases').update(caseUpdate).eq('id', caseId),
    admin.from('safety_case_actions').insert({
      case_id:         caseId,
      admin_id:        user.id,
      action,
      internal_notes,
      message_to_user: message_to_user ?? null,
    }),
  ];

  const accusedId = (caseRow as any).accused_id;
  if (action === 'permanent-ban') {
    updates.push(
      admin.from('profiles').update({
        is_suspended: true,
        suspended_at: new Date().toISOString(),
      }).eq('id', accusedId)
    );
  } else if (action === 'temp-suspend') {
    updates.push(
      admin.from('profiles').update({
        is_hidden_pending_review: true,
        hidden_at: new Date().toISOString(),
      }).eq('id', accusedId)
    );
  }

  const results = await Promise.all(updates);
  const firstErr = results.find((r: any) => r.error)?.error;
  if (firstErr) {
    console.error('[admin-api/safety/cases/action]', firstErr);
    return json({ error: 'Failed to record action' }, 500);
  }

  return json({ ok: true, case_id: caseId, action, new_status: newStatus[action] });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/admin-api\/?/i, "/").replace(/\/$/, "") || "/";
  try {
    if (path === "/" || path === "/health") return json({ ok: true, service: "admin-api", version: "6" });
    if (path === "/check"            && req.method === "GET")  return await handleCheck(req);
    if (path === "/cities"           && req.method === "GET")  return await handleGetCities(req);
    if (path === "/pulse"            && req.method === "GET")  return await handlePulse(req);
    if (path === "/match-quality"    && req.method === "GET")  return await handleMatchQuality(req);
    if (path === "/revenue"          && req.method === "GET")  return await handleRevenue(req);
    if (path === "/run-matching-all" && req.method === "POST") return await handleRunMatchingAll(req);

    const actionMatch = path.match(/^\/safety\/cases\/([^/]+)\/action$/);
    const detailMatch = path.match(/^\/safety\/cases\/([^/]+)$/);
    if (path === "/safety/cases"            && req.method === "GET")  return await handleListSafetyCases(req);
    if (detailMatch                          && req.method === "GET")  return await handleGetSafetyCase(req, detailMatch[1]);
    if (actionMatch                          && req.method === "POST") return await handleSafetyCaseAction(req, actionMatch[1]);

    return json({ error: "Not found", path, method: req.method }, 404);
  } catch (err) {
    console.error("[admin-api] unhandled:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

// Parallel — feedback-processor edge function v3
// v3: Distance filter signals — reads feedback_snapshot.distance_miles from
//     pass_reason rows where reason is "too_far_away". If a user has 2+
//     such passes, computes a tighter max_distance_miles (75% of the minimum
//     rejected distance, floor 10 mi) and writes to user_filter_preferences.
//     This is then enforced by the matches /list endpoint.
// v2: upsert includes legacy NOT NULL columns (life_goals, values_beliefs,
//     financial_career, lifestyle_behaviors, social_shared_life) so the
//     first-time INSERT doesn't fail the NOT NULL constraint.
//     Also reads worked_well (text[]) instead of went_well (text) from
//     date_reviews, matching the new column added in migration
//     add_date_review_feedback_columns.
// v1: initial release.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

const CATEGORIES = [
  "values_life_goals",
  "relationship_psychology",
  "lifestyle_compatibility",
  "attraction_preferences",
  "life_logistics",
  "attachment_emotional_health",
  "communication_conflict",
  "intimacy_connection",
] as const;

type Category = typeof CATEGORIES[number];

const DEFAULTS: Record<Category, number> = {
  values_life_goals:           32,
  relationship_psychology:     25,
  lifestyle_compatibility:     20,
  attraction_preferences:      13,
  life_logistics:              10,
  attachment_emotional_health:  0,
  communication_conflict:       0,
  intimacy_connection:          0,
};

// Legacy columns that exist in user_category_weights with NOT NULL constraints
// from an older schema. We zero them out on upsert so INSERT doesn't fail.
const LEGACY_ZERO_COLUMNS: Record<string, number> = {
  life_goals:          0,
  values_beliefs:      0,
  financial_career:    0,
  lifestyle_behaviors: 0,
  social_shared_life:  0,
};

const PASS_REASON_DELTAS: Partial<Record<string, { cat: Category; delta: number }>> = {
  values_felt_off:              { cat: "values_life_goals",          delta: -3 },
  lifestyle_mismatch:           { cat: "lifestyle_compatibility",     delta: -3 },
  not_physical_type:            { cat: "attraction_preferences",      delta: -2 },
  attachment_style_concern:     { cat: "attachment_emotional_health", delta: -2 },
  communication_style_felt_off: { cat: "communication_conflict",      delta: -2 },
  life_stage_mismatch:          { cat: "life_logistics",              delta: -2 },
};

const WOULD_ADJUST_DELTAS: Record<string, { cat: Category; delta: number }> = {
  more_similar_values:  { cat: "values_life_goals",      delta: -2 },
  closer_location:      { cat: "life_logistics",          delta: -2 },
  different_lifestyle:  { cat: "lifestyle_compatibility", delta: -2 },
  stronger_physical:    { cat: "attraction_preferences",  delta: -2 },
  different_life_stage: { cat: "life_logistics",          delta: -2 },
};

const WORKED_WELL_DELTAS: Record<string, { cat: Category; delta: number }> = {
  chemistry_strong:     { cat: "attraction_preferences",      delta: 3 },
  conversation_natural: { cat: "communication_conflict",      delta: 3 },
  values_aligned:       { cat: "values_life_goals",           delta: 3 },
  lifestyle_matched:    { cat: "lifestyle_compatibility",     delta: 3 },
  timing_right:         { cat: "life_logistics",              delta: 3 },
};

const WOULD_CHANGE_DELTAS: Record<string, { cat: Category; delta: number }> = {
  more_similar_values:  { cat: "values_life_goals",      delta: -2 },
  closer_location:      { cat: "life_logistics",          delta: -2 },
  different_lifestyle:  { cat: "lifestyle_compatibility", delta: -2 },
  stronger_physical:    { cat: "attraction_preferences",  delta: -2 },
  different_life_stage: { cat: "life_logistics",          delta: -2 },
};

function normalizeWeights(weights: Record<Category, number>): Record<Category, number> {
  const clamped = { ...weights };
  for (const cat of CATEGORIES) {
    clamped[cat] = Math.max(5, Math.min(50, clamped[cat]));
  }
  const total = Object.values(clamped).reduce((s, v) => s + v, 0);
  if (total === 0) return { ...DEFAULTS };
  const factor = 100 / total;
  const normalized = {} as Record<Category, number>;
  for (const cat of CATEGORIES) {
    normalized[cat] = Math.round(clamped[cat] * factor);
  }
  const sum = Object.values(normalized).reduce((s, v) => s + v, 0);
  const diff = 100 - sum;
  if (diff !== 0) {
    const largest = CATEGORIES.slice().sort((a, b) => normalized[b] - normalized[a])[0];
    normalized[largest] += diff;
  }
  return normalized;
}

async function processUser(userId: string): Promise<{ updated: boolean; weights?: Record<Category, number>; maxDistanceMiles?: number | null }> {
  const admin = adminClient();

  // v3: also select feedback_snapshot for distance signal processing
  const { data: feedbackRows } = await admin
    .from("structured_feedback")
    .select("feedback_type, pass_reasons, would_adjust, feedback_snapshot")
    .eq("user_id", userId);

  const { data: reviewRows } = await admin
    .from("date_reviews")
    .select("rating, would_see_again, worked_well, would_change_future")
    .eq("user_id", userId);

  if ((!feedbackRows || feedbackRows.length === 0) && (!reviewRows || reviewRows.length === 0)) {
    return { updated: false };
  }

  // ── Weight deltas from feedback ───────────────────────────────────────────

  const deltas: Record<Category, number> = {
    values_life_goals: 0, relationship_psychology: 0, lifestyle_compatibility: 0,
    attraction_preferences: 0, life_logistics: 0, attachment_emotional_health: 0,
    communication_conflict: 0, intimacy_connection: 0,
  };

  const applyDelta = (cat: Category, delta: number) => { deltas[cat] += delta; };

  for (const row of feedbackRows ?? []) {
    for (const reason of row.pass_reasons ?? []) {
      const mapping = PASS_REASON_DELTAS[reason];
      if (mapping) applyDelta(mapping.cat, mapping.delta);
    }
    for (const adj of row.would_adjust ?? []) {
      const mapping = WOULD_ADJUST_DELTAS[adj];
      if (mapping) applyDelta(mapping.cat, mapping.delta);
    }
  }

  for (const row of reviewRows ?? []) {
    const workedWell: string[] = Array.isArray(row.worked_well) ? row.worked_well : [];
    for (const chip of workedWell) {
      const mapping = WORKED_WELL_DELTAS[chip];
      if (mapping) applyDelta(mapping.cat, mapping.delta);
    }

    const wouldChange: string[] = Array.isArray(row.would_change_future) ? row.would_change_future : [];
    for (const chip of wouldChange) {
      const mapping = WOULD_CHANGE_DELTAS[chip];
      if (mapping) applyDelta(mapping.cat, mapping.delta);
    }

    if (row.rating === 5 && row.would_see_again === true) {
      const topTwo = (Object.entries(DEFAULTS) as [Category, number][])
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([cat]) => cat);
      for (const cat of topTwo) applyDelta(cat, 5);
    }
  }

  const { data: existing } = await admin
    .from("user_category_weights")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const current: Record<Category, number> = {} as Record<Category, number>;
  for (const cat of CATEGORIES) {
    current[cat] = existing?.[cat] ?? DEFAULTS[cat];
  }

  const adjusted: Record<Category, number> = {} as Record<Category, number>;
  for (const cat of CATEGORIES) {
    adjusted[cat] = current[cat] + deltas[cat];
  }

  const final = normalizeWeights(adjusted);

  const { error: weightErr } = await admin
    .from("user_category_weights")
    .upsert(
      { user_id: userId, ...final, ...LEGACY_ZERO_COLUMNS, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (weightErr) {
    console.error("[feedback-processor] weight upsert failed:", weightErr);
    return { updated: false };
  }

  // ── Distance filter signal ─────────────────────────────────────────────────
  // Collect snapshot.distance_miles from every "too_far_away" pass.
  // Requires 2+ data points before acting — avoids reacting to one-off passes.

  const tooFarDistances: number[] = [];
  for (const row of feedbackRows ?? []) {
    if (Array.isArray(row.pass_reasons) && row.pass_reasons.includes("too_far_away")) {
      const dist = (row.feedback_snapshot as any)?.distance_miles;
      if (typeof dist === "number" && dist > 0) {
        tooFarDistances.push(dist);
      }
    }
  }

  let maxDistanceMiles: number | null = null;
  if (tooFarDistances.length >= 2) {
    const minRejected = Math.min(...tooFarDistances);
    // Set max to 75% of the closest distance they rejected as "too far",
    // with a 10-mile floor so we never make matching impossible.
    maxDistanceMiles = Math.max(10, Math.round(minRejected * 0.75));
    const { error: filterErr } = await admin
      .from("user_filter_preferences")
      .upsert(
        { user_id: userId, max_distance_miles: maxDistanceMiles, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (filterErr) {
      console.error("[feedback-processor] filter prefs upsert failed:", filterErr);
    }
  }

  return { updated: true, weights: final, maxDistanceMiles };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/feedback-processor\/?/i, "/").replace(/\/$/, "") || "/";

  try {
    if (path === "/" || path === "/health") return json({ ok: true, service: "feedback-processor", version: "3" });

    if (path === "/process-user" && req.method === "POST") {
      let body: any;
      try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      const userId = String(body.userId ?? "").trim();
      if (!userId) return json({ error: "Missing userId" }, 400);
      const result = await processUser(userId);
      return json(result);
    }

    if (path === "/process-all" && req.method === "POST") {
      const admin = adminClient();
      const [feedbackUsersRes, reviewUsersRes] = await Promise.all([
        admin.from("structured_feedback").select("user_id").order("user_id"),
        admin.from("date_reviews").select("user_id").order("user_id"),
      ]);
      const userIds = new Set<string>();
      for (const r of feedbackUsersRes.data ?? []) userIds.add(r.user_id);
      for (const r of reviewUsersRes.data ?? []) userIds.add(r.user_id);
      const results: Record<string, boolean> = {};
      for (const userId of userIds) {
        const r = await processUser(userId);
        results[userId] = r.updated;
      }
      return json({ processed: userIds.size, results });
    }

    return json({ error: "Not found", path, method: req.method }, 404);
  } catch (err) {
    console.error("[feedback-processor] unhandled:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

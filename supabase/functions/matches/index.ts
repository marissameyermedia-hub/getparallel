// Parallel — matches edge function v13
// v13: Extend BREAKDOWN_KEY_MAP to cover all three generations of breakdown
//      keys found in live DB (Gen 1 short snake, Gen 2 display names, Gen 3
//      v100 snake). Fixes reweightScore() returning 0 for old matches.
// v12: feedback/structured now accepts optional `snapshot` field — stores
//      matched user's compatibility_score, age, distance, dimension_scores,
//      why_you_matched, shared_hobbies in feedback_snapshot jsonb column.
// v11: Fix feature_flags query: column is flag_key, not name. All three
//      flag checks (recovery-signal, explainer, date-outcome) corrected.
// v10: Three-Stage Feedback Loop — POST /date-outcome.
// v9: Why This Match Explainer — GET /explainer?matchId=X.
// v8: Match Recovery Signal — POST /recovery-signal.
// (earlier history omitted for brevity)

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY") || "";
const ONESIGNAL_APP_ID = "ac575970-18c4-4f71-9ff9-aa323baef90f";

const MATCHES_LIMIT = 7;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
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

// ── Notification helpers ──────────────────────────────────────────────────────

async function logNotifEvent(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  category: string,
  sent: boolean,
  skippedReason?: string,
  onesignalResponse?: unknown,
) {
  try {
    await admin.from("notification_events").insert({
      user_id: userId,
      category,
      sent,
      skipped_reason: skippedReason ?? null,
      onesignal_response: onesignalResponse ?? null,
    });
  } catch (err) {
    console.error("[notification_events] log failed:", err);
  }
}

async function sendPush(
  admin: ReturnType<typeof adminClient>,
  recipientId: string,
  title: string,
  body: string,
  category: "match" | "like" | "message",
  data: Record<string, unknown> = {},
): Promise<void> {
  if (!ONESIGNAL_API_KEY) {
    await logNotifEvent(admin, recipientId, category, false, "no_api_key");
    return;
  }
  try {
    const [prefRes, profileRes] = await Promise.all([
      admin.from("notification_preferences").select("push_enabled, new_matches, likes, messages").eq("user_id", recipientId).maybeSingle(),
      admin.from("profiles").select("onesignal_player_id").eq("id", recipientId).maybeSingle(),
    ]);
    const prefs = prefRes.data as Record<string, unknown> | null;
    const playerId = (profileRes.data as any)?.onesignal_player_id as string | null;
    if (!playerId) {
      await logNotifEvent(admin, recipientId, category, false, "no_player_id");
      return;
    }
    if (prefs?.push_enabled === false) {
      await logNotifEvent(admin, recipientId, category, false, "push_disabled");
      return;
    }
    const catKey = category === "match" ? "new_matches" : category;
    if (prefs?.[catKey] === false) {
      await logNotifEvent(admin, recipientId, category, false, "category_disabled");
      return;
    }
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Basic ${ONESIGNAL_API_KEY}` },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: [playerId],
        headings: { en: title },
        contents: { en: body },
        data,
        url: "https://getparallel.vip/",
        web_push_topic: `parallel_${category}`,
      }),
    });
    const responseJson = await res.json().catch(() => null);
    await logNotifEvent(admin, recipientId, category, res.ok, res.ok ? undefined : "onesignal_error", responseJson);
  } catch (err) {
    console.error(`[push/${category}] failed:`, err);
    await logNotifEvent(admin, recipientId, category, false, "fetch_error");
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ageFromDob(dob: string | null): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function extractAnswerValue(raw: any): any {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw) return raw.value;
  return raw;
}
function asString(raw: any): string | undefined {
  const v = extractAnswerValue(raw);
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  return undefined;
}
function asStringArray(raw: any): string[] | undefined {
  const v = extractAnswerValue(raw);
  if (Array.isArray(v)) return v.map(String).filter((s) => s.trim().length > 0);
  return undefined;
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  values_life_goals:           32,
  relationship_psychology:     25,
  lifestyle_compatibility:     20,
  attraction_preferences:      13,
  life_logistics:              10,
  attachment_emotional_health:  0,
  communication_conflict:       0,
  intimacy_connection:          0,
};

const BREAKDOWN_KEY_MAP: Record<string, string> = {
  // Gen 3 — current v100+ snake_case keys
  values_life_goals:               "values_life_goals",
  relationship_psychology:         "relationship_psychology",
  lifestyle_compatibility:         "lifestyle_compatibility",
  attraction_preferences:          "attraction_preferences",
  life_logistics:                  "life_logistics",
  attachment_emotional_health:     "attachment_emotional_health",
  communication_conflict:          "communication_conflict",
  intimacy_connection:             "intimacy_connection",
  // Gen 2 — v100-docs display names (may appear in some records)
  "Values & Life Goals":           "values_life_goals",
  "Relationship Psychology":       "relationship_psychology",
  "Lifestyle Compatibility":       "lifestyle_compatibility",
  "Attraction & Preferences":      "attraction_preferences",
  "Life Logistics":                "life_logistics",
  // Gen 2 — actual display names confirmed in live DB
  "Life Goals":                    "values_life_goals",
  "Values & Beliefs":              "values_life_goals",
  "Lifestyle Behaviors":           "lifestyle_compatibility",
  "Social & Shared Life":          "lifestyle_compatibility",
  "Communication & Conflict":      "communication_conflict",
  "Attachment & Emotional Health": "attachment_emotional_health",
  "Intimacy & Connection":         "intimacy_connection",
  "Financial & Career":            "life_logistics",
  // Gen 1 — early short snake_case keys
  values:        "values_life_goals",
  life_goals:    "values_life_goals",
  lifestyle:     "lifestyle_compatibility",
  social:        "lifestyle_compatibility",
  communication: "communication_conflict",
  attachment:    "attachment_emotional_health",
  intimacy:      "intimacy_connection",
  financial:     "life_logistics",
};

function reweightScore(breakdown: Record<string, number>, weights: Record<string, number>): number {
  let numerator = 0;
  let denominator = 0;
  for (const [displayKey, score] of Object.entries(breakdown)) {
    const weightKey = BREAKDOWN_KEY_MAP[displayKey];
    if (!weightKey) continue;
    const w = weights[weightKey] ?? 0;
    numerator += score * w;
    denominator += w;
  }
  if (denominator === 0) return 0;
  return Math.round(numerator / denominator);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleMatchesList(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();

  const { data: selfProfile } = await admin
    .from("profiles")
    .select("latitude, longitude, has_completed_onboarding, email_verified")
    .eq("id", user.id)
    .maybeSingle();

  const [matchRowsRes, userWeightsRes] = await Promise.all([
    admin
      .from("matches")
      .select("matched_user_id, compatibility_score, individual_score, breakdown, why_you_matched, potential_differences, shared_hobbies, asymmetry_category, asymmetry_gap")
      .eq("user_id", user.id)
      .order("compatibility_score", { ascending: false }),
    admin
      .from("user_category_weights")
      .select("values_life_goals, relationship_psychology, lifestyle_compatibility, attraction_preferences, life_logistics, attachment_emotional_health, communication_conflict, intimacy_connection")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (matchRowsRes.error) { console.error("[matches]", matchRowsRes.error); return json({ error: "Failed to load matches" }, 500); }
  const matchRows = matchRowsRes.data ?? [];
  if (matchRows.length === 0) return json({ matches: [] });

  const userWeights: Record<string, number> = userWeightsRes.data ?? DEFAULT_WEIGHTS;
  const hasPersonalisedWeights = !!userWeightsRes.data;

  const matchedIds = matchRows.map((r) => r.matched_user_id);

  const [profilesRes, photosRes, verifResRes, intRes, answersRes] = await Promise.all([
    admin.from("profiles").select("id, name, date_of_birth, bio, career, education, instagram, pronouns, religion, politics, relationship_intention, latitude, longitude, location_display, city, is_verified, is_paused, is_suspended, is_hidden_pending_review").in("id", matchedIds),
    admin.from("user_photos").select("user_id, photo_url, position").in("user_id", matchedIds).order("position", { ascending: true }),
    admin.from("identity_verifications").select("user_id, status").in("user_id", matchedIds),
    admin.from("match_interactions").select("matched_user_id, action").eq("user_id", user.id),
    admin.from("user_answers").select("user_id, answers").in("user_id", matchedIds),
  ]);

  const photosByUser = new Map<string, string[]>();
  for (const row of photosRes.data ?? []) { const arr = photosByUser.get(row.user_id) ?? []; arr.push(row.photo_url); photosByUser.set(row.user_id, arr); }
  const verifByUser = new Map<string, string>();
  for (const row of verifResRes.data ?? []) verifByUser.set(row.user_id, row.status);

  const actedIds = new Set<string>();
  for (const row of intRes.data ?? []) {
    if (row.action === "pass" || row.action === "like") actedIds.add(row.matched_user_id);
  }

  const profilesById = new Map<string, any>();
  for (const p of profilesRes.data ?? []) profilesById.set(p.id, p);
  const answersByUser = new Map<string, Record<string, any>>();
  for (const row of answersRes.data ?? []) answersByUser.set(row.user_id, row.answers || {});

  const filtered = matchRows.filter((row) => {
    const p = profilesById.get(row.matched_user_id);
    if (!p) return false;
    if (p.is_paused || p.is_suspended || p.is_hidden_pending_review) return false;
    if (actedIds.has(row.matched_user_id)) return false;
    return true;
  });

  if (hasPersonalisedWeights) {
    filtered.sort((a, b) => {
      const aScore = a.breakdown && typeof a.breakdown === "object"
        ? reweightScore(a.breakdown as Record<string, number>, userWeights)
        : (a.compatibility_score ?? 0);
      const bScore = b.breakdown && typeof b.breakdown === "object"
        ? reweightScore(b.breakdown as Record<string, number>, userWeights)
        : (b.compatibility_score ?? 0);
      return bScore - aScore;
    });
  }

  const matches = filtered
    .slice(0, MATCHES_LIMIT)
    .map((row) => {
      const p = profilesById.get(row.matched_user_id);
      const photos = photosByUser.get(p.id) ?? [];
      const photoUrl = photos[0] ?? "";
      const verifStatus = verifByUser.get(p.id);
      const isVerified = p.is_verified === true || verifStatus === "verified";
      let distanceMiles: number | undefined;
      if (selfProfile?.latitude && selfProfile?.longitude && p.latitude && p.longitude) {
        distanceMiles = Math.round(haversineMiles(selfProfile.latitude, selfProfile.longitude, p.latitude, p.longitude));
      }

      const displayScore = (hasPersonalisedWeights && row.breakdown && typeof row.breakdown === "object")
        ? reweightScore(row.breakdown as Record<string, number>, userWeights)
        : (row.compatibility_score ?? 0);

      const ans = answersByUser.get(p.id) ?? {};
      const drinking = asString(ans["3.1"]);
      const smoking = asString(ans["3.3"]);
      const pets = asString(ans["3.8"]);
      const hobbies = asStringArray(ans["3.9"]);

      return {
        user: {
          id: p.id, name: p.name ?? "", age: ageFromDob(p.date_of_birth) ?? 0,
          bio: p.bio ?? "", photoUrl, photos: photos.slice(1),
          location: p.location_display ?? p.city ?? "",
          instagram: p.instagram ?? "", pronouns: p.pronouns ?? "",
          education: p.education ?? "", career: p.career ?? "",
          religion: p.religion ?? "",
          politics: p.politics ?? "",
          drinking: drinking ?? "",
          smoking: smoking ?? "",
          pets: pets ?? "",
          hobbies: hobbies ?? [],
          relationshipIntention: p.relationship_intention ?? "",
          isVerified, answers: {}, preferences: {},
        },
        compatibilityScore: displayScore,
        distanceMiles,
        matchDetails: {
          breakdown: row.breakdown ?? {},
          whyYouMatched: row.why_you_matched ?? [],
          potentialDifferences: row.potential_differences ?? [],
          sharedHobbies: row.shared_hobbies ?? [],
        },
      };
    });
  return json({ matches, emailConfirmationRequired: !selfProfile?.email_verified });
}

async function handleMatchesMutual(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { data: myLikes } = await admin.from("match_interactions").select("matched_user_id").eq("user_id", user.id).eq("action", "like");
  const myLikeIds = (myLikes ?? []).map((r) => r.matched_user_id);
  if (myLikeIds.length === 0) return json({ mutualMatchIds: [] });
  const { data: theirLikes } = await admin.from("match_interactions").select("user_id").in("user_id", myLikeIds).eq("matched_user_id", user.id).eq("action", "like");
  const mutualMatchIds = (theirLikes ?? []).map((r) => r.user_id);
  return json({ mutualMatchIds, mutualMatches: mutualMatchIds });
}

async function handleMatchesMutualWaiting(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();

  const { data: myLikes } = await admin
    .from("match_interactions")
    .select("matched_user_id, created_at")
    .eq("user_id", user.id)
    .eq("action", "like")
    .order("created_at", { ascending: false });
  const myLikeIds = (myLikes ?? []).map((r) => r.matched_user_id);
  if (myLikeIds.length === 0) return json({ waiting: [] });

  const { data: theirLikes } = await admin
    .from("match_interactions")
    .select("user_id")
    .in("user_id", myLikeIds)
    .eq("matched_user_id", user.id)
    .eq("action", "like");
  const mutualSet = new Set((theirLikes ?? []).map((r) => r.user_id));
  const waitingIds = myLikeIds.filter((id) => !mutualSet.has(id));

  if (waitingIds.length === 0) return json({ waiting: [] });

  const [profilesRes, photosRes] = await Promise.all([
    admin.from("profiles").select("id, name").in("id", waitingIds),
    admin.from("user_photos").select("user_id, photo_url, position").in("user_id", waitingIds).order("position", { ascending: true }),
  ]);

  const photoByUser = new Map<string, string>();
  for (const p of photosRes.data ?? []) {
    if (!photoByUser.has(p.user_id)) photoByUser.set(p.user_id, p.photo_url);
  }
  const profileById = new Map<string, any>();
  for (const p of profilesRes.data ?? []) profileById.set(p.id, p);

  const waiting = waitingIds.map((id) => ({
    id,
    name: profileById.get(id)?.name ?? "",
    photo: photoByUser.get(id) ?? "",
    compatibilityScore: 0,
  }));

  return json({ waiting });
}

async function handleMatchesAction(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const matchUserId = String(body.matchUserId ?? "").trim();
  const action = String(body.action ?? "").trim();
  if (!matchUserId) return json({ error: "Missing matchUserId" }, 400);
  if (!["like", "pass", "save"].includes(action)) return json({ error: "Invalid action" }, 400);
  if (matchUserId === user.id) return json({ error: "Cannot action self" }, 400);

  const admin = adminClient();
  await admin.from("match_interactions").delete().eq("user_id", user.id).eq("matched_user_id", matchUserId);
  const { error: insErr } = await admin.from("match_interactions").insert({ user_id: user.id, matched_user_id: matchUserId, action });
  if (insErr) { console.error("[matches/action]", insErr); return json({ error: "Failed to save action" }, 500); }
  if (action !== "like") return json({ success: true, isMutual: false });

  const { data: targetProfile } = await admin
    .from("profiles")
    .select("is_seed_account")
    .eq("id", matchUserId)
    .maybeSingle();

  if (targetProfile?.is_seed_account === true) {
    const { data: existingReverse } = await admin
      .from("match_interactions")
      .select("id")
      .eq("user_id", matchUserId)
      .eq("matched_user_id", user.id)
      .eq("action", "like")
      .maybeSingle();
    if (!existingReverse) {
      await admin.from("match_interactions").delete().eq("user_id", matchUserId).eq("matched_user_id", user.id);
      await admin.from("match_interactions").insert({ user_id: matchUserId, matched_user_id: user.id, action: "like" });
    }
  }

  const { data: theirLike } = await admin.from("match_interactions").select("id").eq("user_id", matchUserId).eq("matched_user_id", user.id).eq("action", "like").maybeSingle();
  const isMutual = !!theirLike;

  if (isMutual) {
    const [a, b] = [user.id, matchUserId].sort();
    const { data: existing } = await admin.from("conversations").select("id").eq("user_id_1", a).eq("user_id_2", b).maybeSingle();
    if (!existing) {
      const { error: convErr } = await admin.from("conversations").insert({ user_id_1: a, user_id_2: b });
      if (convErr) console.error("[matches/action] conversation create failed:", convErr);
    }

    Promise.all([
      admin.from("profiles").select("name").eq("id", user.id).maybeSingle(),
      admin.from("profiles").select("name").eq("id", matchUserId).maybeSingle(),
    ]).then(([senderRes, receiverRes]) => {
      const senderFirst = ((senderRes.data as any)?.name ?? "Someone").split(" ")[0];
      const receiverFirst = ((receiverRes.data as any)?.name ?? "Someone").split(" ")[0];
      sendPush(admin, matchUserId, "It's a match! 🎉", `You and ${senderFirst} liked each other`, "match", { type: "match", from: user.id });
      sendPush(admin, user.id, "It's a match! 🎉", `You and ${receiverFirst} liked each other`, "match", { type: "match", from: matchUserId });
    }).catch((err) => console.error("[matches/action] push error:", err));
  } else {
    sendPush(admin, matchUserId, "Someone likes you 👀", "Open Parallel to see who", "like", { type: "like" });
  }

  return json({ success: true, isMutual });
}

async function handleFeedbackStructured(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const matchedUserId = String(body.matchedUserId ?? "").trim();
  const feedbackType = String(body.feedbackType ?? "").trim();
  if (!matchedUserId) return json({ error: "Missing matchedUserId" }, 400);
  if (!["pass_reason", "after_chat", "after_date", "conversation_fade"].includes(feedbackType)) {
    return json({ error: "Invalid feedbackType" }, 400);
  }
  const admin = adminClient();
  const row: Record<string, any> = { user_id: user.id, matched_user_id: matchedUserId, feedback_type: feedbackType };
  if (Array.isArray(body.passReasons)) row.pass_reasons = body.passReasons;
  if (typeof body.chatOutcome === "string") row.chat_outcome = body.chatOutcome;
  if (typeof body.dateOutcome === "string") row.date_outcome = body.dateOutcome;
  if (Array.isArray(body.wouldAdjust)) row.would_adjust = body.wouldAdjust;
  if (body.snapshot && typeof body.snapshot === "object" && !Array.isArray(body.snapshot)) row.feedback_snapshot = body.snapshot;
  const { error } = await admin.from("structured_feedback").insert(row);
  if (error) { console.error("[feedback/structured]", error); return json({ error: "Failed to save feedback" }, 500); }
  return json({ success: true });
}

async function handleFeedbackConfirmMet(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const matchUserId = String(body.matchUserId ?? "").trim();
  if (!matchUserId) return json({ error: "Missing matchUserId" }, 400);
  const admin = adminClient();
  await admin.from("date_confirmations").insert({ user_id: user.id, matched_user_id: matchUserId });
  const { data: theirConfirm } = await admin.from("date_confirmations").select("id").eq("user_id", matchUserId).eq("matched_user_id", user.id).maybeSingle();
  return json({ success: true, bothConfirmed: !!theirConfirm });
}

async function handleFeedbackTier2(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const matchUserId = String(body.matchUserId ?? "").trim();
  if (!matchUserId) return json({ error: "Missing matchUserId" }, 400);

  const row: Record<string, any> = { user_id: user.id, matched_user_id: matchUserId };
  if (typeof body.rating === "number")              row.rating             = body.rating;
  if (typeof body.wouldGoAgain === "boolean")        row.would_see_again    = body.wouldGoAgain;
  if (typeof body.wouldSeeAgain === "boolean")       row.would_see_again    = body.wouldSeeAgain;
  if (typeof body.isSafetyIssue === "boolean")       row.is_safety_issue    = body.isSafetyIssue;
  if (typeof body.couldImprove === "string")         row.could_improve      = body.couldImprove;
  if (typeof body.chemistryRating === "number")      row.chemistry_rating      = body.chemistryRating;
  if (typeof body.conversationRating === "number")   row.conversation_rating   = body.conversationRating;
  if (typeof body.respectfulnessRating === "number") row.respectfulness_rating = body.respectfulnessRating;
  if (Array.isArray(body.workedWell))        row.worked_well         = body.workedWell;
  if (Array.isArray(body.reasons))           row.reasons             = body.reasons;
  if (Array.isArray(body.wouldChangeFuture)) row.would_change_future = body.wouldChangeFuture;
  if (typeof body.wentWell === "string")     row.went_well           = body.wentWell;

  const admin = adminClient();
  const { error } = await admin.from("date_reviews").insert(row);
  if (error) { console.error("[feedback/tier2]", error); return json({ error: "Failed to save review" }, 500); }
  return json({ success: true });
}

async function handleRecoverySignal(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const matchedUserId = String(body.matchedUserId ?? "").trim();
  const triggerType = String(body.triggerType ?? "").trim();
  const reasons: string[] = Array.isArray(body.reasons) ? body.reasons.map(String) : [];
  const wouldAdjust: string[] = Array.isArray(body.wouldAdjust) ? body.wouldAdjust.map(String) : [];

  if (!matchedUserId) return json({ error: "Missing matchedUserId" }, 400);
  if (!["unmatch", "conversation_death_14d"].includes(triggerType)) return json({ error: "Invalid triggerType" }, 400);

  const admin = adminClient();

  const { data: flagRow } = await admin
    .from("feature_flags")
    .select("enabled")
    .eq("flag_key", "feature_recovery_signal_enabled")
    .maybeSingle();
  if (!flagRow?.enabled) return json({ error: "Feature not enabled" }, 403);

  const ALGORITHMIC_MAP: Record<string, string> = {
    values_felt_off:          "values_life_goals",
    lifestyle_mismatch:       "lifestyle_compatibility",
    life_stage_mismatch:      "life_logistics",
    attachment_style_concern: "relationship_psychology",
  };
  const BEHAVIORAL_REASONS = new Set(["not_physical_type", "communication_style_felt_off", "just_not_feeling_it"]);

  const algorithmicReasons = reasons.filter(r => r in ALGORITHMIC_MAP);
  const behavioralReasons  = reasons.filter(r => BEHAVIORAL_REASONS.has(r));
  const hasDistance        = reasons.includes("too_far_away");

  let failureCategory: string = "unknown";
  if (algorithmicReasons.length > 0 && behavioralReasons.length > 0) failureCategory = "mixed";
  else if (algorithmicReasons.length > 0 || hasDistance) failureCategory = "algorithmic";
  else if (behavioralReasons.length > 0) failureCategory = "behavioral";

  const weightDeltas: Record<string, number> = {};
  for (const reason of algorithmicReasons) {
    const key = ALGORITHMIC_MAP[reason];
    weightDeltas[key] = (weightDeltas[key] ?? 0) - 5;
  }

  if (Object.keys(weightDeltas).length > 0) {
    const { data: currentWeights } = await admin
      .from("user_category_weights")
      .select("user_id, values_life_goals, relationship_psychology, lifestyle_compatibility, attraction_preferences, life_logistics, attachment_emotional_health, communication_conflict, intimacy_connection")
      .eq("user_id", user.id)
      .maybeSingle();

    const base: Record<string, number> = currentWeights ?? {
      user_id: user.id,
      values_life_goals:          32,
      relationship_psychology:    25,
      lifestyle_compatibility:    20,
      attraction_preferences:     13,
      life_logistics:             10,
      attachment_emotional_health: 0,
      communication_conflict:      0,
      intimacy_connection:         0,
    };

    const updated: Record<string, any> = { ...base, user_id: user.id };
    for (const [key, delta] of Object.entries(weightDeltas)) {
      updated[key] = Math.max(5, Math.min(50, (base[key] ?? 10) + delta));
    }
    await admin.from("user_category_weights").upsert(updated, { onConflict: "user_id" });
  }

  if (behavioralReasons.length > 0) {
    const eventType = triggerType === "unmatch" ? "unmatch_behavioral" : "conversation_death_behavioral";
    await admin.from("trust_score_events").insert(
      behavioralReasons.map(reason => ({ user_id: user.id, event_type: eventType, matched_user_id: matchedUserId, reason }))
    );
  }

  await admin.from("match_recovery_signals").insert({
    user_id: user.id,
    matched_user_id: matchedUserId,
    trigger_type: triggerType,
    failure_category: failureCategory,
    raw_reasons: reasons,
    would_adjust: wouldAdjust.length > 0 ? wouldAdjust : null,
    weight_deltas: Object.keys(weightDeltas).length > 0 ? weightDeltas : null,
  });

  return json({ success: true });
}

async function handleExplainer(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId") ?? "";
  if (!matchId) return json({ error: "Missing matchId" }, 400);

  const admin = adminClient();

  const { data: flagRow } = await admin
    .from("feature_flags")
    .select("enabled")
    .eq("flag_key", "feature_match_explainer_enabled")
    .maybeSingle();
  if (!flagRow?.enabled) return json({ error: "Feature not enabled" }, 403);

  const cacheExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: cached } = await admin
    .from("match_explainer_cache")
    .select("headline")
    .eq("user_id", user.id)
    .eq("matched_user_id", matchId)
    .gt("created_at", cacheExpiry)
    .maybeSingle();
  if (cached?.headline) return json({ headline: cached.headline });

  if (!ANTHROPIC_API_KEY) return json({ headline: null });

  const { data: matchRow } = await admin
    .from("matches")
    .select("why_you_matched, breakdown, compatibility_score")
    .eq("user_id", user.id)
    .eq("matched_user_id", matchId)
    .maybeSingle();

  if (!matchRow) return json({ headline: null });

  const whyMatched: string[] = Array.isArray(matchRow.why_you_matched)
    ? matchRow.why_you_matched.slice(0, 3)
    : [];
  const breakdown = (matchRow.breakdown ?? {}) as Record<string, number>;
  const topCategories = Object.entries(breakdown)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");

  const prompt = whyMatched.length > 0
    ? `You are writing a short compatibility summary for a dating app called Parallel.\n\nTop compatibility reasons: ${whyMatched.join("; ")}\n${topCategories ? `Strongest score areas: ${topCategories}` : ""}\n\nWrite ONE sentence (under 20 words) that is specific and honest, not generic. No exclamation points. No em-dashes. Do not start with "You" or "Both". Output only the sentence, nothing else.`
    : `Write ONE sentence (under 20 words) describing a strong compatibility between two people. Be specific, not generic. No exclamation points. Output only the sentence.`;

  let headline: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 80,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const raw = aiData?.content?.[0]?.text?.trim() ?? "";
      if (raw) headline = raw.replace(/^["']|["']$/g, "").trim();

      const inputTokens  = aiData?.usage?.input_tokens  ?? 0;
      const outputTokens = aiData?.usage?.output_tokens ?? 0;
      const costUsd = (inputTokens * 0.0000008) + (outputTokens * 0.000004);
      admin.from("ai_cost_log").insert({
        feature: "match_explainer",
        user_id: user.id,
        model: "claude-haiku-4-5-20251001",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[explainer] AI call failed:", err);
  }

  if (headline) {
    await admin.from("match_explainer_cache").upsert(
      { user_id: user.id, matched_user_id: matchId, headline, created_at: new Date().toISOString() },
      { onConflict: "user_id,matched_user_id" }
    );
  }

  return json({ headline });
}

async function handleDateOutcome(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const matchedUserId = String(body.matchedUserId ?? "").trim();
  const outcome = String(body.outcome ?? "").trim();

  if (!matchedUserId) return json({ error: "Missing matchedUserId" }, 400);
  if (!["yes", "maybe", "no"].includes(outcome)) return json({ error: "Invalid outcome" }, 400);

  const admin = adminClient();

  const { data: flagRow } = await admin
    .from("feature_flags")
    .select("enabled")
    .eq("flag_key", "feature_feedback_loop_enabled")
    .maybeSingle();
  if (!flagRow?.enabled) return json({ error: "Feature not enabled" }, 403);

  await admin.from("date_outcomes").upsert(
    { user_id: user.id, matched_user_id: matchedUserId, outcome, created_at: new Date().toISOString() },
    { onConflict: "user_id,matched_user_id" }
  );

  if (outcome !== "maybe") {
    const delta = outcome === "yes" ? 5 : -3;

    const { data: currentWeights } = await admin
      .from("user_category_weights")
      .select("user_id, values_life_goals, relationship_psychology, lifestyle_compatibility, attraction_preferences, life_logistics, attachment_emotional_health, communication_conflict, intimacy_connection")
      .eq("user_id", user.id)
      .maybeSingle();

    const base: Record<string, any> = currentWeights ?? {
      user_id: user.id,
      values_life_goals:          32,
      relationship_psychology:    25,
      lifestyle_compatibility:    20,
      attraction_preferences:     13,
      life_logistics:             10,
      attachment_emotional_health: 0,
      communication_conflict:      0,
      intimacy_connection:         0,
    };

    const currentVal = typeof base.attraction_preferences === "number" ? base.attraction_preferences : 13;
    const updated = { ...base, user_id: user.id, attraction_preferences: Math.max(5, Math.min(50, currentVal + delta)) };
    await admin.from("user_category_weights").upsert(updated, { onConflict: "user_id" });
  }

  return json({ success: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/matches\/?/i, "/").replace(/\/$/, "") || "/";
  try {
    if (path === "/" || path === "/health") return json({ ok: true, service: "matches", version: "13" });
    if (path === "/list" && req.method === "GET") return await handleMatchesList(req);
    if (path === "/mutual" && req.method === "GET") return await handleMatchesMutual(req);
    if (path === "/mutual-waiting" && req.method === "GET") return await handleMatchesMutualWaiting(req);
    if (path === "/action" && req.method === "POST") return await handleMatchesAction(req);
    if (path === "/feedback/structured" && req.method === "POST") return await handleFeedbackStructured(req);
    if (path === "/feedback/confirm-met" && req.method === "POST") return await handleFeedbackConfirmMet(req);
    if (path === "/feedback/tier2" && req.method === "POST") return await handleFeedbackTier2(req);
    if (path === "/recovery-signal" && req.method === "POST") return await handleRecoverySignal(req);
    if (path === "/explainer" && req.method === "GET") return await handleExplainer(req);
    if (path === "/date-outcome" && req.method === "POST") return await handleDateOutcome(req);
    return json({ error: "Not found", path, method: req.method }, 404);
  } catch (err) { console.error("[matches] unhandled:", err); return json({ error: "Internal server error" }, 500); }
});

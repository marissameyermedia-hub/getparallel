// Parallel — onboarding edge function v15
// v15: Add /accept-tos — records tos_version_accepted + tos_accepted_at for the
//      authenticated user. Called when the ToS gate modal is accepted in-app.
// v14: Fire-and-forget run-matching after /complete-onboarding so newly onboarded
//      users get matches immediately instead of waiting for the next scheduled run.
// v13: Stamp last_active_at on every GET /user/profile call (= every app open).
//      Used by re-engagement SMS job to find dormant users with pending matches.
// v12: Add field_visibility to PROFILE_FIELDS in handleUserProfilePut so
//      users can toggle which profile fields are shown on their card.
// v11: Align category-weights GET/POST to new algorithm-facing columns
//      (values_life_goals, relationship_psychology, lifestyle_compatibility,
//       attraction_preferences, life_logistics + 3 shared). Returns raw DB
//      column keys instead of display names. Removes WEIGHT_KEY_TO_DISPLAY.
// v10: After /complete-onboarding succeeds, fire compute-shadow-matches
//      for the new user (fire-and-forget, release_status defaults to 'pending').
//      Uses EdgeRuntime.waitUntil so the background fetch completes even
//      after the HTTP response is sent.
//
// v9: PARTIAL-ANSWER RESCUE. /complete-onboarding now merges any saved
//     partial_answers from onboarding_progress INTO the answers payload
//     before saving. This protects users when the FE sends an incomplete
//     payload at the final step (real bug observed 2026-05-10).
//     Also: don't delete onboarding_progress until user_answers row is
//     confirmed populated, so a future bug can't wipe partial answers.
//
// v8: Rollback v7's hard-reject. Validator soft-warns only.
// v7: Save-time canonical validator (too strict, rolled back)
// v6: complete-onboarding requires phone_verified=true if phone provided
// v5: PhotoDNA URL scanning
// v4: bigdatacloud as primary geocoder
// v3: hasActivated field on profile GET
// v2: Privacy fix for location pickers
// v1: initial

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PHOTODNA_API_KEY = Deno.env.get("PHOTODNA_API_KEY") || "";

const PHOTODNA_URL = "https://api.microsoftmoderator.com/photodna/v1.0/Match";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

let CANONICAL: any = null;
let CANONICAL_HASH: string = "unloaded";
const QUESTIONS_BY_ID: Record<string, any> = {};
// Pre-canonical valid question-id prefixes (kept as a fallback recognizer)
const Q_ID_RE = /^\d+\.\d+[a-z]?$/;

async function loadCanonical(): Promise<void> {
  if (CANONICAL) return;
  const admin = adminClient();
  const { data, error } = await admin
    .from("matching_config")
    .select("value")
    .eq("key", "canonical_questionnaire")
    .single();
  if (error || !data) {
    console.error("[validator] canonical load failed:", error?.message || "no row");
    return;
  }
  CANONICAL = data.value;
  CANONICAL_HASH = CANONICAL.content_hash || "unknown";
  for (const q of CANONICAL.questions || []) QUESTIONS_BY_ID[q.id] = q;
  console.log(`[validator] canonical loaded: ${CANONICAL.questions?.length} questions, hash=${CANONICAL_HASH}`);
}

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/['']/g, "'").replace(/[""]/g, '"').replace(/\s+/g, " ").trim();
}
function optionMatches(answer: string, options: string[]): boolean {
  if (!options || options.length === 0) return true;
  if (options.indexOf(answer) !== -1) return true;
  const na = normalizeStr(answer);
  for (const opt of options) {
    if (normalizeStr(opt) === na) return true;
    if (na.length >= 4 && normalizeStr(opt).includes(na)) return true;
    if (normalizeStr(opt).length >= 4 && na.includes(normalizeStr(opt))) return true;
  }
  return false;
}

interface ValidationResult { hardErrors: string[]; softWarnings: string[]; }

function validateAnswers(answers: Record<string, any>): ValidationResult {
  const hardErrors: string[] = [];
  const softWarnings: string[] = [];
  if (!CANONICAL) return { hardErrors, softWarnings };
  for (const [qid, rawValue] of Object.entries(answers)) {
    const q = QUESTIONS_BY_ID[qid];
    if (!q) { hardErrors.push(`unknown question id: ${qid}`); continue; }
    const value = (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
      && "value" in rawValue && "isDealbreaker" in rawValue) ? rawValue.value : rawValue;
    if (value === null || value === undefined || value === "") continue;
    switch (q.type) {
      case "MC": case "MC_OTHER": {
        if (typeof value !== "string") { hardErrors.push(`q${qid}: expected string, got ${typeof value}`); break; }
        if (!optionMatches(value, q.options)) softWarnings.push(`q${qid} drift: "${value.slice(0, 60)}" not in canonical options`);
        break;
      }
      case "MS": case "MS_MAX": {
        if (!Array.isArray(value)) { hardErrors.push(`q${qid}: expected array, got ${typeof value}`); break; }
        for (const item of value) {
          if (typeof item !== "string") { hardErrors.push(`q${qid}: array item must be string, got ${typeof item}`); break; }
          if (!optionMatches(item, q.options)) softWarnings.push(`q${qid} drift: "${String(item).slice(0, 60)}" not in canonical options`);
        }
        break;
      }
      case "AGE_RANGE": {
        if (typeof value !== "object" || value === null) { hardErrors.push(`q${qid}: expected {min, max}`); break; }
        if (typeof (value as any).min !== "number" || typeof (value as any).max !== "number") { hardErrors.push(`q${qid}: min/max must be numbers`); break; }
        const min = (value as any).min, max = (value as any).max;
        if (min < 18 || max > 99 || min > max) hardErrors.push(`q${qid}: invalid age range [${min},${max}]`);
        break;
      }
      case "HEIGHT": case "HEIGHT_RANGE": case "LOCATION":
        if (typeof value !== "object" || value === null) hardErrors.push(`q${qid}: expected object`);
        break;
      case "DOB": if (typeof value !== "string") hardErrors.push(`q${qid}: expected ISO date string`); break;
      case "TEXT": if (typeof value !== "string") hardErrors.push(`q${qid}: expected string`); break;
      default: softWarnings.push(`q${qid}: unknown type ${q.type}, skipping validation`);
    }
  }
  return { hardErrors, softWarnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// v9: Helpers for the partial-answer rescue path
// ─────────────────────────────────────────────────────────────────────────────

function onlyQuestionAnswers(obj: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof k === "string" && Q_ID_RE.test(k)) out[k] = v;
  }
  return out;
}

function sanitizeAnswers(answers: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (!answers || typeof answers !== "object") return out;
  for (const [k, v] of Object.entries(answers)) {
    if (typeof k === "string" && Q_ID_RE.test(k)) out[k] = v;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// PhotoDNA
// ─────────────────────────────────────────────────────────────────────────────
async function scanWithPhotoDNA(photoUrl: string): Promise<{ match: boolean; isMatch: boolean; statusCode: number | null; response: any; error: boolean; errorMessage?: string; }> {
  if (!PHOTODNA_API_KEY) { console.warn("[photodna] PHOTODNA_API_KEY not set — skipping scan"); return { match: false, isMatch: false, statusCode: null, response: null, error: true, errorMessage: "not_configured" }; }
  try {
    const res = await fetch(PHOTODNA_URL, { method: "POST", headers: { "Content-Type": "application/json", "Ocp-Apim-Subscription-Key": PHOTODNA_API_KEY }, body: JSON.stringify({ DataRepresentation: "URL", Value: photoUrl }) });
    const body = await res.json().catch(() => ({}));
    if (res.status >= 300) { console.error("[photodna] API error", res.status, JSON.stringify(body)); return { match: false, isMatch: false, statusCode: res.status, response: body, error: true, errorMessage: `api_${res.status}` }; }
    const statusCode = body?.Status?.Code ?? null;
    const isMatch = statusCode === 3000 && body?.IsMatch === true;
    return { match: isMatch, isMatch, statusCode, response: body, error: false };
  } catch (err) { console.error("[photodna] fetch threw", err); return { match: false, isMatch: false, statusCode: null, response: null, error: true, errorMessage: String(err) }; }
}

async function handleCsamMatch(admin: ReturnType<typeof adminClient>, userId: string, storagePath: string, photoUrl: string, photodnaResponse: any): Promise<void> {
  console.error("[photodna] CSAM MATCH — userId:", userId, "path:", storagePath);
  const { error: delErr } = await admin.storage.from("user-photos").remove([storagePath]);
  if (delErr) console.error("[photodna] storage delete failed:", delErr.message);
  await admin.from("csam_flags").insert({ user_id: userId, photo_url: photoUrl, storage_path: storagePath, photodna_response: photodnaResponse, status: "pending_review" });
  await admin.from("profiles").update({ is_suspended: true, is_hidden_pending_review: true, suspension_reason: "Account suspended pending review. Contact support@getparallel.vip if you believe this is an error.", updated_at: new Date().toISOString() }).eq("id", userId);
  const { data: profile } = await admin.from("profiles").select("email, phone").eq("id", userId).maybeSingle();
  if (profile?.email || profile?.phone) await admin.from("banned_identifiers").insert({ source_user_id: userId, email: profile?.email ?? null, phone: profile?.phone ?? null, reason: "csam_photodna_match" });
}

async function handlePhotoUpload(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let formData: FormData;
  try { formData = await req.formData(); } catch { return json({ error: "Invalid form data" }, 400); }
  const file = formData.get("photo") as File | null;
  const positionRaw = formData.get("position");
  const position = positionRaw ? parseInt(String(positionRaw), 10) : 0;
  if (!file) return json({ error: "No photo provided" }, 400);
  if (file.size === 0) return json({ error: "Empty file" }, 400);
  if (file.size > 10 * 1024 * 1024) return json({ error: "File too large (max 10MB)" }, 400);
  const ct = file.type || "image/jpeg";
  if (!ct.startsWith("image/")) return json({ error: "Only image files are allowed" }, 400);
  const ext = ct.split("/")[1]?.split(";")[0] || "jpg";
  const filename = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const admin = adminClient();
  const arrayBuffer = await file.arrayBuffer();
  const { error: upErr } = await admin.storage.from("user-photos").upload(filename, arrayBuffer, { contentType: ct, upsert: false });
  if (upErr) { console.error("[photos/upload storage]", upErr); return json({ error: "Failed to upload photo" }, 500); }
  const { data: pub } = admin.storage.from("user-photos").getPublicUrl(filename);
  const photoUrl = pub?.publicUrl;
  if (!photoUrl) return json({ error: "Failed to get photo URL" }, 500);
  const scan = await scanWithPhotoDNA(photoUrl);
  if (!scan.error && scan.match) { await handleCsamMatch(admin, user.id, filename, photoUrl, scan.response); return json({ error: "We were unable to process this photo. Please try a different image." }, 400); }
  if (scan.error && scan.errorMessage !== "not_configured") console.error("[photodna] scan error on upload — failing open:", scan.errorMessage, "url:", photoUrl);
  const { error: rowErr } = await admin.from("user_photos").insert({ user_id: user.id, photo_url: photoUrl, position });
  if (rowErr) console.error("[photos/upload row]", rowErr);
  return json({ url: photoUrl, position });
}

async function handleOnboardingProgressGet(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { data, error } = await admin.from("onboarding_progress").select("current_step, completed_steps, partial_answers, partial_photos, updated_at").eq("user_id", user.id).maybeSingle();
  if (error) { console.error("[onboarding/progress GET]", error); return json({ error: "Failed to load progress" }, 500); }
  return json({ progress: data });
}

async function handleOnboardingProgressPost(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const row: Record<string, any> = { user_id: user.id, updated_at: new Date().toISOString() };
  if (typeof body.current_step === "string") row.current_step = body.current_step;
  if (Array.isArray(body.completed_steps)) row.completed_steps = body.completed_steps;
  if (body.partial_answers && typeof body.partial_answers === "object") row.partial_answers = body.partial_answers;
  if (Array.isArray(body.partial_photos)) row.partial_photos = body.partial_photos;
  const admin = adminClient();
  const { error } = await admin.from("onboarding_progress").upsert(row, { onConflict: "user_id" });
  if (error) { console.error("[onboarding/progress POST]", error); return json({ error: "Failed to save progress" }, 500); }
  return json({ success: true });
}

async function handleUserProfileGet(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  admin.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", user.id).then(() => {}).catch(() => {});
  const [profileRes, photosRes, answersRes, dealbreakersRes, subRes] = await Promise.all([
    admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    admin.from("user_photos").select("photo_url, position").eq("user_id", user.id).order("position", { ascending: true }),
    admin.from("user_answers").select("answers").eq("user_id", user.id).maybeSingle(),
    admin.from("user_dealbreakers").select("question_ids").eq("user_id", user.id).maybeSingle(),
    admin.from("subscriptions").select("plan, status, current_period_end").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profileRes.error) { console.error("[user/profile GET]", profileRes.error); return json({ error: "Failed to load profile" }, 500); }
  const profile = profileRes.data;
  if (!profile) return json({ error: "Profile not found" }, 404);
  if (profile.is_suspended) return json({ suspended: true, suspensionMessage: profile.suspension_reason || "Your account has been suspended. Please contact support if you believe this is an error." }, 403);
  const sub = subRes.data;
  const hasActivated = !!(sub?.status === "active" && sub?.current_period_end && new Date(sub.current_period_end) > new Date());
  const rawAns = answersRes.data?.answers ?? {};
  const cleanAns = sanitizeAnswers(rawAns);
  return json({ ...profile, photos: (photosRes.data ?? []).map((p) => p.photo_url), answers: cleanAns, dealbreakers: dealbreakersRes.data?.question_ids ?? [], subscriptionPlan: sub?.plan ?? null, currentPeriodEnd: sub?.current_period_end ?? null, isFoundingMember: sub?.plan === "annual_founding", isPaused: profile.is_paused ?? false, subscription_status: sub?.status ?? null, hasActivated });
}

async function handleUserProfilePut(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const admin = adminClient();

  if (body.answers && typeof body.answers === "object") {
    const cleanAnswers = sanitizeAnswers(body.answers);
    await loadCanonical();
    const { hardErrors, softWarnings } = validateAnswers(cleanAnswers);
    if (hardErrors.length > 0) console.error(`[validator] /user/profile PUT user ${user.id} hard errors (logging only):`, hardErrors);
    if (softWarnings.length > 0) console.warn(`[validator] /user/profile PUT user ${user.id} soft warnings:`, softWarnings.slice(0, 5));

    const { data: existing } = await admin.from("user_answers").select("answers").eq("user_id", user.id).maybeSingle();
    const existingClean = sanitizeAnswers(existing?.answers ?? {});
    const merged = { ...existingClean, ...cleanAnswers };

    const { error } = await admin.from("user_answers").upsert({ user_id: user.id, answers: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) { console.error("[user/profile PUT answers]", error); return json({ error: "Failed to save answers" }, 500); }
  }
  if (Array.isArray(body.dealbreakers)) {
    const { error } = await admin.from("user_dealbreakers").upsert({ user_id: user.id, question_ids: body.dealbreakers, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) { console.error("[user/profile PUT dealbreakers]", error); return json({ error: "Failed to save dealbreakers" },500); }
  }
  const PROFILE_FIELDS = ["name", "bio", "career", "education", "instagram", "pronouns", "politics", "religion", "relationship_intention", "children_status", "is_paused"];
  const profileUpdate: Record<string, any> = {};
  for (const f of PROFILE_FIELDS) if (body[f] !== undefined) profileUpdate[f] = body[f];
  // field_visibility is JSONB — validate it's a plain object before saving
  if (body.field_visibility !== undefined && typeof body.field_visibility === "object" && !Array.isArray(body.field_visibility)) {
    profileUpdate.field_visibility = body.field_visibility;
  }
  if (Object.keys(profileUpdate).length > 0) {
    profileUpdate.updated_at = new Date().toISOString();
    const { error } = await admin.from("profiles").update(profileUpdate).eq("id", user.id);
    if (error) { console.error("[user/profile PUT profile]", error); return json({ error: "Failed to save profile" }, 500); }
  }
  if (Array.isArray(body.photos)) {
    const { error: delErr } = await admin.from("user_photos").delete().eq("user_id", user.id);
    if (delErr) { console.error("[user/profile PUT photos delete]", delErr); return json({ error: "Failed to update photos" }, 500); }
    if (body.photos.length > 0) {
      const rows = body.photos.map((url: string, i: number) => ({ user_id: user.id, photo_url: url, position: i }));
      const { error: insErr } = await admin.from("user_photos").insert(rows);
      if (insErr) { console.error("[user/profile PUT photos insert]", insErr); return json({ error: "Failed to update photos" }, 500); }
    }
  }
  return json({ success: true });
}

async function handleCompleteOnboarding(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const admin = adminClient();

  const { data: profile } = await admin.from("profiles").select("latitude, longitude, city, phone, phone_verified").eq("id", user.id).maybeSingle();
  if (profile?.phone && profile.phone_verified !== true) return json({ error: "Please verify your phone number before completing your profile.", phoneVerificationRequired: true, phone: profile.phone }, 403);
  if (!profile?.latitude || !profile?.longitude) return json({ error: "Please set your location before finishing your profile.", locationRequired: true }, 400);

  const [existingAnsRes, progressRes] = await Promise.all([
    admin.from("user_answers").select("answers").eq("user_id", user.id).maybeSingle(),
    admin.from("onboarding_progress").select("partial_answers").eq("user_id", user.id).maybeSingle(),
  ]);
  const existingClean = sanitizeAnswers(existingAnsRes.data?.answers ?? {});
  const progressClean = sanitizeAnswers(progressRes.data?.partial_answers ?? {});
  const bodyClean = (body.answers && typeof body.answers === "object") ? sanitizeAnswers(body.answers) : {};

  const merged: Record<string, any> = { ...bodyClean, ...progressClean, ...existingClean };

  console.log(`[complete-onboarding] user ${user.id} merge sources — body:${Object.keys(bodyClean).length} progress:${Object.keys(progressClean).length} existing:${Object.keys(existingClean).length} final:${Object.keys(merged).length}`);

  await loadCanonical();
  const { hardErrors, softWarnings } = validateAnswers(merged);
  if (hardErrors.length > 0) console.error(`[validator] /complete-onboarding user ${user.id} hard errors (logging only):`, hardErrors);
  if (softWarnings.length > 0) console.warn(`[validator] /complete-onboarding user ${user.id} soft warnings:`, softWarnings.slice(0, 5));

  if (Object.keys(merged).length > 0) {
    const { error } = await admin.from("user_answers").upsert({ user_id: user.id, answers: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) { console.error("[complete-onboarding answers]", error); return json({ error: "Failed to save answers" }, 500); }
  }

  if (Array.isArray(body.dealbreakers)) {
    const { error } = await admin.from("user_dealbreakers").upsert({ user_id: user.id, question_ids: body.dealbreakers, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) console.error("[complete-onboarding dealbreakers]", error);
  }

  const PROFILE_FIELDS = ["bio", "career", "education", "instagram", "pronouns"];
  const profileUpdate: Record<string, any> = { has_completed_onboarding: true, updated_at: new Date().toISOString() };
  for (const f of PROFILE_FIELDS) if (body[f] !== undefined) profileUpdate[f] = body[f];
  const { error: profErr } = await admin.from("profiles").update(profileUpdate).eq("id", user.id);
  if (profErr) { console.error("[complete-onboarding profile]", profErr); return json({ error: "Failed to finalize profile" }, 500); }

  if (Array.isArray(body.photos) && body.photos.length > 0) {
    await admin.from("user_photos").delete().eq("user_id", user.id);
    const rows = body.photos.map((url: string, i: number) => ({ user_id: user.id, photo_url: url, position: i }));
    const { error: photoErr } = await admin.from("user_photos").insert(rows);
    if (photoErr) console.error("[complete-onboarding photos]", photoErr);
  }

  const { data: finalAns } = await admin.from("user_answers").select("answers").eq("user_id", user.id).maybeSingle();
  const finalCount = finalAns?.answers ? Object.keys(sanitizeAnswers(finalAns.answers)).length : 0;
  if (finalCount >= 5) {
    await admin.from("onboarding_progress").delete().eq("user_id", user.id);
    console.log(`[complete-onboarding] cleaned progress row for user ${user.id} (final answer count: ${finalCount})`);
  } else {
    console.warn(`[complete-onboarding] PRESERVING progress row for user ${user.id} — only ${finalCount} answers saved, would have wiped partials`);
  }

  const shadowTask = fetch(`${SUPABASE_URL}/functions/v1/compute-shadow-matches`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ userId: user.id }),
  }).catch(err => console.error("[complete-onboarding] shadow-match trigger failed:", err));
  try { (globalThis as any).EdgeRuntime?.waitUntil(shadowTask); } catch (_) {}

  const matchTask = fetch(`${SUPABASE_URL}/functions/v1/run-matching`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ userId: user.id }),
  }).catch(err => console.error("[complete-onboarding] run-matching trigger failed:", err));
  try { (globalThis as any).EdgeRuntime?.waitUntil(matchTask); } catch (_) {}

  return json({ success: true, mergedAnswerCount: Object.keys(merged).length, finalAnswerCount: finalCount });
}

async function handleUserLocation(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof body.latitude === "number" && isFinite(body.latitude)) update.latitude = snapCoord(body.latitude);
  if (typeof body.longitude === "number" && isFinite(body.longitude)) update.longitude = snapCoord(body.longitude);
  if (typeof body.city === "string") update.city = body.city;
  if (typeof body.country === "string") update.country = body.country;
  const incomingDisplay = typeof body.locationDisplay === "string" ? body.locationDisplay : "";
  if (looksLikeStreetAddress(incomingDisplay)) {
    const parts = [body.city, body.state, body.country].filter((p) => typeof p === "string" && p.trim() !== "");
    update.location_display = parts.join(", ");
  } else if (incomingDisplay) update.location_display = incomingDisplay;
  const admin = adminClient();
  const { error } = await admin.from("profiles").update(update).eq("id", user.id);
  if (error) { console.error("[user/location]", error); return json({ error: "Failed to save location" }, 500); }
  return json({ success: true });
}

const WEIGHT_COLUMNS = ["attachment_emotional_health", "communication_conflict", "values_life_goals", "relationship_psychology", "lifestyle_compatibility", "attraction_preferences", "life_logistics", "intimacy_connection"] as const;
type WeightColumn = typeof WEIGHT_COLUMNS[number];
const WEIGHT_DEFAULTS: Record<WeightColumn, number> = { attachment_emotional_health: 8, communication_conflict: 6, values_life_goals: 7, relationship_psychology: 6, lifestyle_compatibility: 5, attraction_preferences: 4, life_logistics: 2, intimacy_connection: 2 };

async function handleCategoryWeightsGet(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { data } = await admin.from("user_category_weights").select(WEIGHT_COLUMNS.join(", ")).eq("user_id", user.id).maybeSingle();
  const weights: Record<string, number> = {};
  for (const col of WEIGHT_COLUMNS) weights[col] = (data as any)?.[col] ?? WEIGHT_DEFAULTS[col];
  return json({ weights });
}

async function handleCategoryWeightsPost(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const row: Record<string, any> = { user_id: user.id, updated_at: new Date().toISOString() };
  for (const col of WEIGHT_COLUMNS) if (typeof body[col] === "number") row[col] = body[col];
  const admin = adminClient();
  const { error } = await admin.from("user_category_weights").upsert(row, { onConflict: "user_id" });
  if (error) { console.error("[category-weights POST]", error); return json({ error: "Failed to save weights" }, 500); }
  return json({ success: true });
}

const NOMINATIM_HEADERS = { "User-Agent": "Parallel-Dating-App/1.0 (contact@getparallel.vip)", "Accept-Language": "en" };
const COORD_GRID = 0.02;
function snapCoord(n: number): number { return Math.round(n / COORD_GRID) * COORD_GRID; }

function buildSafeDisplay(address: any, fallbackName?: string): string {
  if (!address || typeof address !== "object") return (fallbackName ?? "").trim();
  const city = address.city || address.town || address.village || address.hamlet || address.municipality || fallbackName || "";
  const state = address.state || address.region || address.province || "";
  const country = address.country || "";
  const parts = [city, state, country].filter((p) => p && String(p).trim() !== "");
  return parts.join(", ");
}

function looksLikeStreetAddress(s: string): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  if (/^\d+[ ,]/.test(trimmed)) return true;
  if (/\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|place|pl|boulevard|blvd|way|terrace|ter|highway|hwy|parkway|pkwy|circle|cir)\b/i.test(trimmed)) {
    if (trimmed.split(",").length >= 4) return true;
  }
  return false;
}

async function handleLocationSearch(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  if (q.length < 2) return json({ results: [] });
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1&featuretype=city`, { headers: NOMINATIM_HEADERS });
    if (!res.ok) { console.error("[location/search] nominatim status", res.status); return json({ results: [] }); }
    const raw = await res.json();
    const results = (Array.isArray(raw) ? raw : []).map((r: any) => {
      const lat = parseFloat(r.lat); const lon = parseFloat(r.lon);
      if (!isFinite(lat) || !isFinite(lon)) return null;
      return { latitude: snapCoord(lat), longitude: snapCoord(lon), city: r.address?.city || r.address?.town || r.address?.village || r.address?.hamlet || r.address?.municipality || r.name || "", state: r.address?.state || r.address?.region || r.address?.province || "", country: r.address?.country || "", displayName: buildSafeDisplay(r.address, r.name) };
    }).filter((r: any) => r && r.city);
    return json({ results });
  } catch (err) { console.error("[location/search]", err); return json({ results: [] }); }
}

async function reverseGeocode(lat: string, lng: string): Promise<{ city: string; state: string; country: string; displayName: string } | null> {
  const fetchWithTimeout = async (url: string, init?: RequestInit, timeoutMs = 4000): Promise<Response | null> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try { const res = await fetch(url, { ...init, signal: ctrl.signal }); return res; } catch { return null; } finally { clearTimeout(t); }
  };
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
    const res = await fetchWithTimeout(url);
    if (res && res.ok) {
      const r = await res.json();
      const city = r.city || r.locality || r.localityInfo?.administrative?.find((a: any) => a.adminLevel >= 7)?.name || "";
      const state = r.principalSubdivision || "";
      const country = r.countryName || "";
      if (city || state || country) { const parts = [city, state, country].filter((p: string) => p && p.trim() !== ""); return { city, state, country, displayName: parts.join(", ") }; }
    }
  } catch (err) { console.error("[reverseGeocode bigdatacloud]", err); }
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1&zoom=10`;
    const res = await fetchWithTimeout(url, { headers: NOMINATIM_HEADERS });
    if (res && res.ok) {
      const r = await res.json();
      const city = r.address?.city || r.address?.town || r.address?.village || r.address?.hamlet || r.address?.municipality || "";
      const state = r.address?.state || r.address?.region || r.address?.province || "";
      const country = r.address?.country || "";
      if (city || state || country) return { city, state, country, displayName: buildSafeDisplay(r.address) };
    }
  } catch (err) { console.error("[reverseGeocode nominatim]", err); }
  return null;
}

async function handleLocationReverse(req: Request) {
  const url = new URL(req.url);
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");
  if (!lat || !lng) return json({ error: "Missing lat/lng" }, 400);
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const snappedLat = isFinite(latNum) ? snapCoord(latNum) : null;
  const snappedLng = isFinite(lngNum) ? snapCoord(lngNum) : null;
  const result = await reverseGeocode(lat, lng);
  if (result) return json({ city: result.city, state: result.state, country: result.country, displayName: result.displayName, latitude: snappedLat, longitude: snappedLng });
  return json({ city: "", state: "", country: "", displayName: "", latitude: snappedLat, longitude: snappedLng, autoLookupFailed: true });
}

async function handleAttachmentScore(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const letters: string[] = [body.answerA, body.answerB, body.answerC].filter((x: any) => typeof x === "string").map((s: string) => s.toLowerCase());
  const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
  for (const l of letters) if (l in counts) counts[l]++;
  let topLetter = "a"; let topCount = -1;
  for (const l of ["a", "b", "c", "d"]) if (counts[l] > topCount) { topLetter = l; topCount = counts[l]; }
  const styleMap: Record<string, string> = { a: "secure", b: "anxious", c: "avoidant", d: "fearful" };
  const style = styleMap[topLetter] ?? "secure";
  const admin = adminClient();
  const { error } = await admin.from("attachment_styles").upsert({ user_id: user.id, style, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) { console.error("[attachment/score]", error); return json({ error: "Failed to save attachment style" }, 500); }
  return json({ style });
}

async function handleAcceptTos(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      tos_version_accepted: new Date().toISOString().slice(0, 10),
      tos_accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) { console.error("[accept-tos]", error); return json({ error: "Failed to record acceptance" }, 500); }
  console.log(`[accept-tos] user ${user.id} accepted ToS`);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/onboarding\/?/i, "/").replace(/\/$/, "") || "/";
  try {
    if (path === "/" || path === "/health") {
      await loadCanonical();
      return json({ ok: true, service: "onboarding", version: "15", photodna: Boolean(PHOTODNA_API_KEY), canonical_loaded: !!CANONICAL, canonical_hash: CANONICAL_HASH });
    }
    if (path === "/progress" && req.method === "GET") return await handleOnboardingProgressGet(req);
    if (path === "/progress" && req.method === "POST") return await handleOnboardingProgressPost(req);
    if (path === "/user/profile" && req.method === "GET") return await handleUserProfileGet(req);
    if (path === "/user/profile" && req.method === "PUT") return await handleUserProfilePut(req);
    if (path === "/user/complete-onboarding" && req.method === "POST") return await handleCompleteOnboarding(req);
    if (path === "/user/location" && req.method === "POST") return await handleUserLocation(req);
    if (path === "/user/category-weights" && req.method === "GET") return await handleCategoryWeightsGet(req);
    if (path === "/user/category-weights" && req.method === "POST") return await handleCategoryWeightsPost(req);
    if (path === "/location/search" && req.method === "GET") return await handleLocationSearch(req);
    if (path === "/location/reverse" && req.method === "GET") return await handleLocationReverse(req);
    if (path === "/photos/upload" && req.method === "POST") return await handlePhotoUpload(req);
    if (path === "/attachment/score" && req.method === "POST") return await handleAttachmentScore(req);
    if (path === "/accept-tos" && req.method === "POST") return await handleAcceptTos(req);
    return json({ error: "Not found", path, method: req.method }, 404);
  } catch (err) { console.error("[onboarding] unhandled:", err); return json({ error: "Internal server error" }, 500); }
});

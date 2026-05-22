// Parallel — misc edge function v28
// v28: Re-engagement SMS: fix cron to 5pm UTC (10am PDT), add "Reply STOP to
//      unsubscribe" to copy. Inbound SMS catch-all now auto-replies instead
//      of silently ignoring non-keyword replies.
// v27: Add POST /re-engagement/run — finds users dormant 7+ days with unacted matches
//      and sends an SMS nudge via Telnyx. Auth: admin user OR x-cron-secret header.
//      Respects sms_opt_outs and last_reengagement_sms_at (7-day cooldown).
// v26: Cancel policy — trial cancels (last_payment_amount IS NULL = never charged) immediately
//      set is_paused=true. BILLING.SUBSCRIPTION.EXPIRED webhook sets is_paused=true (paid period
//      ended). BILLING.SUBSCRIPTION.ACTIVATED webhook sets is_paused=false (resubscribed).
// v25: PAYMENT.SALE.COMPLETED now saves last_payment_amount + inserts into payment_events for revenue tracking.
// v24: /payment/cancel now cancels PayPal subscription via API + sends cancellation confirmation email.
// v23: Default PERSONA_ENV to "production" (was "sandbox")
// v22: Add POST /paypal/webhook — handles BILLING.SUBSCRIPTION.* and PAYMENT.SALE.COMPLETED events
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TELNYX_API_KEY = Deno.env.get("TELNYX_API_KEY") || "";
const TELNYX_FROM_NUMBER = Deno.env.get("TELNYX_PHONE_NUMBER") || Deno.env.get("TELNYX_FROM_NUMBER") || "";
const TELNYX_MESSAGING_PROFILE_ID = Deno.env.get("TELNYX_MESSAGING_PROFILE_ID") || "";
const PAYPAL_ENV = (Deno.env.get("PAYPAL_ENV") || "sandbox").toLowerCase();
const IS_LIVE = PAYPAL_ENV === "live" || PAYPAL_ENV === "production";
const PAYPAL_CLIENT_ID = IS_LIVE ? (Deno.env.get("PAYPAL_LIVE_CLIENT_ID") || "") : (Deno.env.get("PAYPAL_SANDBOX_CLIENT_ID") || "");
const PAYPAL_CLIENT_SECRET = IS_LIVE ? (Deno.env.get("PAYPAL_LIVE_SECRET") || "") : (Deno.env.get("PAYPAL_SANDBOX_SECRET") || "");
const PAYPAL_WEBHOOK_ID = IS_LIVE ? (Deno.env.get("PAYPAL_WEBHOOK_ID_LIVE") || "") : (Deno.env.get("PAYPAL_WEBHOOK_ID_SANDBOX") || "");
const PAYPAL_BASE_URL = IS_LIVE ? "https://api.paypal.com" : "https://api.sandbox.paypal.com";
const PAYPAL_PLAN_ANNUAL = IS_LIVE ? (Deno.env.get("PAYPAL_PLAN_ANNUAL_LIVE") || "") : (Deno.env.get("PAYPAL_PLAN_ANNUAL_SANDBOX") || "");
const PERSONA_ENV = (Deno.env.get("PERSONA_ENV") || "production").toLowerCase();
const PERSONA_TEMPLATE_ID = Deno.env.get("PERSONA_TEMPLATE_ID") || "itmpl_w7GgvrzeQ8P6sopBcayQBcBP39gG";
const PERSONA_API_KEY = Deno.env.get("PERSONA_API_KEY") || "";
const PERSONA_WEBHOOK_SECRET = Deno.env.get("PERSONA_WEBHOOK_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, persona-signature",
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

function normalizeFeedbackType(t: string | undefined): string {
  if (!t) return "general";
  const lower = String(t).toLowerCase().trim();
  const map: Record<string, string> = {
    bug: "bug_report", bug_report: "bug_report", feature: "feature_request", feature_request: "feature_request",
    pass_reason: "general", general: "general", match: "match_quality", match_quality: "match_quality",
    onboarding: "onboarding", messaging: "messaging", payment: "payment", safety: "safety",
  };
  return map[lower] ?? "general";
}

async function sendTelnyxSms(to: string, text: string): Promise<{ ok: boolean; status: number; body: string }> {
  if (!TELNYX_API_KEY || !TELNYX_FROM_NUMBER) return { ok: false, status: 0, body: "telnyx_not_configured" };
  const payload: Record<string, unknown> = { to, text, from: TELNYX_FROM_NUMBER };
  if (TELNYX_MESSAGING_PROFILE_ID) payload.messaging_profile_id = TELNYX_MESSAGING_PROFILE_ID;
  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: { "Authorization": `Bearer ${TELNYX_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

// ── PWA token ──────────────────────────────────────────────────────────────────

async function handlePwaTokenCreate(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  await admin.from("pwa_install_tokens").delete().eq("user_id", user.id).is("used_at", null);
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { error } = await admin.from("pwa_install_tokens").insert({ token, user_id: user.id, expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() });
  if (error) { console.error("[pwa-token/create]", error); return json({ error: "Failed to create install token" }, 500); }
  return json({ token });
}

async function handlePwaTokenExchange(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const token = String(body.token ?? "").trim();
  if (!token || token.length < 16) return json({ error: "Missing or invalid token" }, 400);
  const admin = adminClient();
  const { data: tokenRow } = await admin.from("pwa_install_tokens").select("user_id, expires_at, used_at").eq("token", token).maybeSingle();
  if (!tokenRow) return json({ error: "Invalid token" }, 401);
  if (tokenRow.used_at) return json({ error: "Token already used" }, 401);
  if (new Date(tokenRow.expires_at) < new Date()) return json({ error: "Token expired" }, 401);
  const { error: useErr } = await admin.from("pwa_install_tokens").update({ used_at: new Date().toISOString() }).eq("token", token);
  if (useErr) { console.error("[pwa-token/exchange] mark-used failed:", useErr); return json({ error: "Failed to process token" }, 500); }
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(tokenRow.user_id);
  if (userErr || !userData?.user?.email) { console.error("[pwa-token/exchange] getUserById:", userErr); return json({ error: "User not found" }, 404); }
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: userData.user.email, options: { redirectTo: SUPABASE_URL } });
  if (linkErr || !linkData?.properties?.action_link) { console.error("[pwa-token/exchange] generateLink:", linkErr); return json({ error: "Failed to generate session" }, 500); }
  const actionUrl = new URL(linkData.properties.action_link);
  const tokenHash = actionUrl.searchParams.get("token_hash") || actionUrl.searchParams.get("token");
  const otpType = (actionUrl.searchParams.get("type") || "magiclink") as "magiclink";
  if (!tokenHash) { console.error("[pwa-token/exchange] no token_hash in action_link"); return json({ error: "Failed to extract session token" }, 500); }
  const anonSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: verifyData, error: verifyErr } = await anonSupabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
  if (verifyErr || !verifyData?.session) { console.error("[pwa-token/exchange] verifyOtp:", verifyErr); return json({ error: "Failed to create session" }, 500); }
  return json({ access_token: verifyData.session.access_token, refresh_token: verifyData.session.refresh_token, expires_in: verifyData.session.expires_in, expires_at: verifyData.session.expires_at });
}

// ── Referral ──────────────────────────────────────────────────────────────────────────────

async function handleReferralByCode(req: Request) {
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code) return json({ firstName: null });
  const admin = adminClient();
  const { data: referralRow } = await admin.from("referrals").select("referrer_id").eq("referral_code", code).limit(1).maybeSingle();
  if (!referralRow?.referrer_id) return json({ firstName: null });
  const { data: profile } = await admin.from("profiles").select("name").eq("id", referralRow.referrer_id).maybeSingle();
  const firstName = (profile?.name ?? "").split(" ")[0] || null;
  return json({ firstName });
}

// ── Auth / email / phone ─────────────────────────────────────────────────────

async function handleEmailConfirmed(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { error } = await admin.from("profiles").update({ email_verified: true, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) { console.error("[email-confirmed]", error); return json({ error: "Failed to mark verified" }, 500); }
  return json({ success: true });
}

async function handleResendVerification(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/email/verify-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ recipientUserId: user.id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { console.error("[misc/resend-verification]", res.status, body); return json({ error: (body as any)?.error || "Could not send verification email" }, res.status); }
    return json({ success: true, ...(body as any) });
  } catch (err) {
    console.error("[misc/resend-verification]", err);
    return json({ error: "Could not send verification email" }, 500);
  }
}

async function handleUpdateEmail(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const newEmail = String(body.email ?? "").trim().toLowerCase();
  if (!newEmail || !newEmail.includes("@")) return json({ error: "Please enter a valid email address." }, 400);
  const admin = adminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", newEmail).neq("id", user.id).maybeSingle();
  if (existing) return json({ error: "That email is already associated with another account." }, 409);
  const { error: authErr } = await admin.auth.admin.updateUserById(user.id, { email: newEmail });
  if (authErr) { console.error("[account/update-email]", authErr); return json({ error: "Could not send confirmation email. Please try again." }, 500); }
  await admin.from("profiles").update({ email: newEmail, email_verified: false, updated_at: new Date().toISOString() }).eq("id", user.id);
  return json({ success: true });
}

async function handleValidateToken(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const token = String(body.token ?? "").trim();
  if (!token) return json({ success: false, error: "Missing token" }, 400);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return json({ success: false, error: "Invalid token" }, 401);
  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("name, email_verified, has_completed_onboarding").eq("id", data.user.id).maybeSingle();
  return json({ success: true, userId: data.user.id, email: data.user.email, name: profile?.name ?? null, emailVerified: profile?.email_verified ?? false, hasCompletedOnboarding: profile?.has_completed_onboarding ?? false });
}

async function handleSendPhoneOtp(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const phone = String(body.phone ?? "").trim();
  const smsConsent = body.smsConsent === true;
  const consentText = typeof body.consentText === "string" ? body.consentText : null;
  const consentVersion = typeof body.consentVersion === "string" ? body.consentVersion : null;
  if (!/^\+\d{10,15}$/.test(phone)) return json({ error: "Invalid phone format" }, 400);
  const admin = adminClient();
  const { data: optOut } = await admin.from("sms_opt_outs").select("phone").eq("phone", phone).maybeSingle();
  if (optOut) return json({ error: "This number has opted out of SMS. Reply START from this number to opt back in, or use a different number." }, 400);
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await admin.from("phone_otps").update({ used: true }).eq("user_id", user.id).eq("used", false);
  const { error: insErr } = await admin.from("phone_otps").insert({ user_id: user.id, phone, otp_code: otp, expires_at: expires, used: false });
  if (insErr) { console.error("[send-phone-otp]", insErr); return json({ error: "Failed to create OTP" }, 500); }
  if (smsConsent && consentText && consentVersion) {
    await admin.from("consent_log").insert({ user_id: user.id, consent_type: "sms", consent_version: consentVersion, consent_text: consentText, phone_number: phone, consented_at: new Date().toISOString(), ip_address: req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? null, user_agent: req.headers.get("user-agent") ?? null });
  }
  const result = await sendTelnyxSms(phone, `Your Parallel verification code is ${otp}. It expires in 10 minutes. Reply STOP to opt out.`);
  if (!result.ok) {
    console.error("[telnyx send failed]", { status: result.status, to: phone, body: result.body });
    if (result.body === "telnyx_not_configured") { console.log(`[DEV otp for ${phone}] ${otp}`); return json({ success: true, betaOtp: otp }); }
    return json({ error: "We couldn't send the code right now. Please try again in a moment, or use a different number." }, 502);
  }
  return json({ success: true });
}

async function handleVerifyPhoneOtp(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const phone = String(body.phone ?? "").trim();
  const otp = String(body.otp ?? "").trim();
  if (!phone || !otp) return json({ error: "Missing phone or otp" }, 400);
  const admin = adminClient();
  const { data: row } = await admin.from("phone_otps").select("id, otp_code, expires_at, used").eq("user_id", user.id).eq("phone", phone).eq("used", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row) return json({ success: false, error: "No pending verification" }, 400);
  if (new Date(row.expires_at).getTime() < Date.now()) return json({ success: false, error: "Code expired" }, 400);
  if (row.otp_code !== otp) return json({ success: false, error: "Incorrect code" }, 400);
  await admin.from("phone_otps").update({ used: true }).eq("id", row.id);
  await admin.from("profiles").update({ phone, phone_verified: true, updated_at: new Date().toISOString() }).eq("id", user.id);
  return json({ success: true, phoneVerified: true });
}

async function handleSmsLogConsent(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const consentText = String(body.consentText ?? "").trim();
  const consentVersion = String(body.consentVersion ?? "").trim();
  const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber : null;
  const consentTypeRaw = String(body.consentType ?? "sms").trim().toLowerCase();
  const isOptOut = consentTypeRaw === "sms_opt_out";
  if (!consentText || !consentVersion) return json({ error: "Missing consent fields" }, 400);
  const admin = adminClient();
  if (!isOptOut) {
    const { data: profile } = await admin.from("profiles").select("phone, phone_verified").eq("id", user.id).maybeSingle();
    if (!profile?.phone || !profile.phone_verified) return json({ error: "Verify your phone number before enabling SMS notifications." }, 400);
    const { data: optOut } = await admin.from("sms_opt_outs").select("phone").eq("phone", profile.phone).maybeSingle();
    if (optOut) return json({ error: "This number previously opted out. Text START to our number to opt back in, then try again." }, 400);
  }
  const { error: logErr } = await admin.from("consent_log").insert({ user_id: user.id, consent_type: isOptOut ? "sms_opt_out" : "sms", consent_version: consentVersion, consent_text: consentText, phone_number: phoneNumber, consented_at: new Date().toISOString(), ip_address: req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? null, user_agent: req.headers.get("user-agent") ?? null });
  if (logErr) { console.error("[sms/log-consent]", logErr); return json({ error: "Failed to log consent" }, 500); }
  await admin.from("notification_preferences").upsert({ user_id: user.id, sms_enabled: !isOptOut, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return json({ success: true });
}

async function handleSmsInbound(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const event = body?.data;
  if (!event || event.event_type !== "message.received") return json({ ok: true, ignored: event?.event_type ?? "unknown" });
  const payload = event.payload || {};
  const fromPhone = payload?.from?.phone_number ?? "";
  const text = String(payload?.text ?? "").trim().toUpperCase();
  if (!fromPhone || !text) return json({ ok: true, ignored: "missing_fields" });
  const admin = adminClient();
  if (["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT"].includes(text)) {
    await admin.from("sms_opt_outs").upsert({ phone: fromPhone, opted_out_at: new Date().toISOString() }, { onConflict: "phone" });
    const { data: profile } = await admin.from("profiles").select("id").eq("phone", fromPhone).maybeSingle();
    if (profile?.id) await admin.from("notification_preferences").upsert({ user_id: profile.id, sms_enabled: false, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    await sendTelnyxSms(fromPhone, "You have been unsubscribed from Parallel SMS. You will no longer receive messages. Reply START to opt back in.");
    return json({ ok: true, action: "opted_out" });
  }
  if (["START","UNSTOP","YES"].includes(text)) {
    await admin.from("sms_opt_outs").delete().eq("phone", fromPhone);
    await sendTelnyxSms(fromPhone, "You're opted back in to Parallel SMS. Reply STOP at any time to opt out. Msg & data rates may apply.");
    return json({ ok: true, action: "opted_in" });
  }
  if (["HELP","INFO"].includes(text)) {
    await sendTelnyxSms(fromPhone, "Parallel: For help, visit getparallel.vip/support or email support@getparallel.vip. Msg & data rates may apply. Reply STOP to opt out.");
    return json({ ok: true, action: "help" });
  }
  await sendTelnyxSms(fromPhone, "This is an automated message from Parallel. To manage your notifications, open the app at getparallel.vip. Reply STOP to unsubscribe.");
  return json({ ok: true, action: "auto_replied" });
}

async function handleSkipPhoneVerification(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { error } = await admin.from("profiles").update({ phone: null, phone_verified: null, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) { console.error("[auth/skip-phone-verification]", error); return json({ error: "Failed to skip verification" }, 500); }
  return json({ success: true });
}

// ── Persona ────────────────────────────────────────────────────────────────────────────────

async function verifyPersonaSignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!PERSONA_WEBHOOK_SECRET) { console.error("[persona/webhook] PERSONA_WEBHOOK_SECRET not set"); return false; }
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim());
  let timestamp = ""; let signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=", 2);
    if (k === "t") timestamp = v;
    else if (k === "v1") signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;
  const tsMs = parseInt(timestamp, 10) * 1000;
  if (!isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) { console.warn("[persona/webhook] timestamp out of window"); return false; }
  const signedPayload = `${timestamp}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(PERSONA_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((provided) => {
    if (provided.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

function mapPersonaStatus(personaStatus: string): { status: string; verified: boolean } {
  switch (personaStatus) {
    case "approved": case "completed": return { status: "verified", verified: true };
    case "declined": case "failed": return { status: "declined", verified: false };
    case "expired": return { status: "expired", verified: false };
    default: return { status: personaStatus, verified: false };
  }
}

async function handlePersonaWebhook(req: Request) {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("persona-signature") || req.headers.get("Persona-Signature");
  const valid = await verifyPersonaSignature(rawBody, sigHeader);
  if (!valid) { console.error("[persona/webhook] signature verification FAILED"); return json({ error: "Invalid signature" }, 401); }
  let body: any;
  try { body = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400); }
  const eventName: string = body?.data?.attributes?.name || "";
  const inquiryData = body?.data?.attributes?.payload?.data;
  if (!inquiryData || inquiryData.type !== "inquiry") { console.log("[persona/webhook] non-inquiry event ignored:", eventName); return json({ ok: true, ignored: eventName }); }
  const inquiryId = String(inquiryData.id || "").trim();
  const attrs = inquiryData.attributes || {};
  const personaStatus = String(attrs.status || "").toLowerCase();
  const referenceId = String(attrs["reference-id"] || attrs["reference_id"] || "").trim();
  if (!inquiryId || !referenceId) { console.error("[persona/webhook] missing ids", { inquiryId, referenceId }); return json({ ok: true, ignored: "missing_ids" }); }
  const { status, verified } = mapPersonaStatus(personaStatus);
  let declineReason: string | null = null;
  if (!verified) {
    const failures = attrs["failure-reasons"] || attrs.failure_reasons;
    if (Array.isArray(failures) && failures.length > 0) declineReason = failures.map((f: any) => f?.description || f?.reason || JSON.stringify(f)).join("; ").slice(0, 500);
    else if (typeof attrs["failure-reason"] === "string") declineReason = String(attrs["failure-reason"]).slice(0, 500);
  }
  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("id", referenceId).maybeSingle();
  if (!profile) { console.warn("[persona/webhook] unknown reference_id:", referenceId); return json({ ok: true, ignored: "unknown_user" }); }
  const now = new Date().toISOString();
  const { error: ivErr } = await admin.from("identity_verifications").upsert({ user_id: referenceId, persona_inquiry_id: inquiryId, reference_id: referenceId, status, decline_reason: declineReason, persona_payload: body, verified_at: verified ? now : null, updated_at: now }, { onConflict: "user_id" });
  if (ivErr) { console.error("[persona/webhook] upsert failed:", ivErr); return json({ error: "db error" }, 500); }
  if (verified) await admin.from("profiles").update({ is_verified: true, updated_at: now }).eq("id", referenceId);
  return json({ ok: true, status, verified });
}

async function handleVerificationStatus(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { data, error } = await admin.from("identity_verifications").select("status, verified_at, decline_reason, updated_at").eq("user_id", user.id).maybeSingle();
  if (error) { console.error("[verification/status]", error); return json({ error: "Failed to load verification status" }, 500); }
  if (!data) return json({ status: "none", verified: false });
  return json({ status: data.status, verified: data.status === "verified", verifiedAt: data.verified_at, declineReason: data.decline_reason, updatedAt: data.updated_at });
}

async function handleVerificationComplete(req: Request) { return await handleVerificationStatus(req); }

async function handleVerificationConsent(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const consentType = String(body.consent_type ?? "biometric_verification").trim();
  const consentVersion = String(body.consent_version ?? "").trim();
  const consentedAt = String(body.consented_at ?? new Date().toISOString());
  if (!consentVersion) return json({ error: "Missing consent_version" }, 400);
  const admin = adminClient();
  const { error } = await admin.from("consent_log").insert({ user_id: user.id, consent_type: consentType, consent_version: consentVersion, consented_at: consentedAt, ip_address: req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? null, user_agent: req.headers.get("user-agent") ?? null });
  if (error) { console.error("[verification/consent]", error); return json({ error: "Failed to log consent" }, 500); }
  return json({ success: true });
}

async function handlePersonaConfig(_req: Request) {
  return json({ templateId: PERSONA_TEMPLATE_ID, environment: PERSONA_ENV === "production" ? "production" : "sandbox" });
}

// ── Safety ────────────────────────────────────────────────────────────────────────────

async function handleSafetyBlock(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const blockedUserId = String(body.blockedUserId ?? "").trim();
  if (!blockedUserId) return json({ error: "Missing blockedUserId" }, 400);
  if (blockedUserId === user.id) return json({ error: "Cannot block self" }, 400);
  const admin = adminClient();
  await admin.from("blocked_users").upsert({ user_id: user.id, blocked_user_id: blockedUserId }, { onConflict: "user_id,blocked_user_id" });
  const [a, b] = [user.id, blockedUserId].sort();
  await admin.from("conversations").delete().eq("user_id_1", a).eq("user_id_2", b);
  return json({ success: true });
}

async function handleSafetyBlocked(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { data, error, count } = await admin.from("blocked_users").select("blocked_user_id, created_at", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) { console.error("[safety/blocked]", error); return json({ error: "Failed to load blocked list" }, 500); }
  return json({ blocked: data ?? [], count: count ?? (data?.length ?? 0) });
}

async function handleSafetyReport(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const reportedUserId = String(body.reportedUserId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const details = typeof body.details === "string" ? body.details : null;
  const feelsUnsafe = body.feelsUnsafe === true;
  if (!reportedUserId || !reason) return json({ error: "Missing required fields" }, 400);
  const admin = adminClient();
  const { data: target } = await admin.from("profiles").select("id").eq("id", reportedUserId).maybeSingle();
  if (!target) return json({ error: "Reported user not found" }, 400);
  const { error } = await admin.from("reported_users").insert({ reporter_id: user.id, reported_user_id: reportedUserId, reason, details, status: feelsUnsafe ? "urgent" : "pending" });
  if (error) { console.error("[safety/report]", error); if ((error as any).code === "23503") return json({ error: "Reported user not found" }, 400); return json({ error: "Failed to file report" }, 500); }
  return json({ success: true });
}

// ── Notifications ─────────────────────────────────────────────────────────────────────────────

async function handleNotificationsGet(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const [prefsRes, profileRes] = await Promise.all([
    admin.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("onesignal_player_id, phone, phone_verified").eq("id", user.id).maybeSingle(),
  ]);
  const prefs = prefsRes.data ?? { email_enabled: true, push_enabled: true, sms_enabled: false, new_matches: true, messages: true, likes: true, weekly_summary: true, date_reminders: true };
  const phone = profileRes.data?.phone ?? null;
  const phoneVerified = profileRes.data?.phone_verified ?? false;
  return json({ ...prefs, onesignal_player_id: profileRes.data?.onesignal_player_id ?? null, phone_number: phoneVerified ? phone : null, phone_verified: phoneVerified });
}

async function handleNotificationsPut(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const update: Record<string, any> = { user_id: user.id, updated_at: new Date().toISOString() };
  if (typeof body.email_enabled === "boolean") update.email_enabled = body.email_enabled;
  if (typeof body.push_enabled === "boolean") update.push_enabled = body.push_enabled;
  if (body.sms_enabled === false) update.sms_enabled = false;
  if (typeof body.match_alerts === "boolean") update.new_matches = body.match_alerts;
  if (typeof body.message_alerts === "boolean") update.messages = body.message_alerts;
  if (typeof body.date_reminders === "boolean") update.date_reminders = body.date_reminders;
  const admin = adminClient();
  const hasPrefsChange = Object.keys(update).length > 2;
  if (hasPrefsChange) {
    const { error } = await admin.from("notification_preferences").upsert(update, { onConflict: "user_id" });
    if (error) { console.error("[notifications/preferences PUT]", error); return json({ error: "Failed to save preferences" }, 500); }
  }
  if (typeof body.onesignal_player_id === "string" && body.onesignal_player_id.length > 0) {
    await admin.from("profiles").update({ onesignal_player_id: body.onesignal_player_id, updated_at: new Date().toISOString() }).eq("id", user.id);
  } else if (body.onesignal_player_id === null || body.push_enabled === false) {
    await admin.from("profiles").update({ onesignal_player_id: null, updated_at: new Date().toISOString() }).eq("id", user.id);
  }
  return json({ success: true });
}

// ── PayPal ────────────────────────────────────────────────────────────────────────────

async function handlePaypalConfig(req: Request) {
  const annualPlanId = PAYPAL_PLAN_ANNUAL || "P-7PT724153F712010ANIFAOHA";
  const clientIdPrefix = PAYPAL_CLIENT_ID ? PAYPAL_CLIENT_ID.slice(0, 6) : "EMPTY";
  try {
    const admin = adminClient();
    await admin.from("_paypal_diag").insert({
      paypal_env_raw: Deno.env.get("PAYPAL_ENV") || "(unset)",
      is_live: IS_LIVE,
      client_id_len: PAYPAL_CLIENT_ID.length,
      client_id_prefix: clientIdPrefix,
      plan_from_env: PAYPAL_PLAN_ANNUAL || "(unset)",
      plan_resolved: annualPlanId,
      live_client_set: !!Deno.env.get("PAYPAL_LIVE_CLIENT_ID"),
      sandbox_client_set: !!Deno.env.get("PAYPAL_SANDBOX_CLIENT_ID"),
      live_plan_set: !!Deno.env.get("PAYPAL_PLAN_ANNUAL_LIVE"),
      sandbox_plan_set: !!Deno.env.get("PAYPAL_PLAN_ANNUAL_SANDBOX"),
      request_ua: req.headers.get("user-agent") || null,
    });
  } catch (err) {
    console.error("[paypal/config DIAG write failed]", err);
  }
  return json({
    clientId: PAYPAL_CLIENT_ID,
    env: IS_LIVE ? "live" : "sandbox",
    plans: { annualFounding: { planId: annualPlanId, price: "79.00", currency: "USD", interval: "year", label: "Annual — 5-day free trial", trialDays: 5 } },
    annualPlanId,
  });
}

async function handlePaypalRecordSub(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const subscriptionId = String(body.subscriptionId ?? "").trim();
  const plan = String(body.plan ?? "").trim();
  if (!subscriptionId) return json({ error: "Missing subscriptionId" }, 400);
  if (!(["annual_founding"].includes(plan))) return json({ error: "Invalid plan" }, 400);
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  const admin = adminClient();
  const { data: agreement } = await admin.from("agreements").select("tos_version, privacy_version, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const tosVersion = agreement?.tos_version ?? "1.0";
  const privacyVersion = agreement?.privacy_version ?? "1.0";
  const { error } = await admin.from("subscriptions").upsert({
    user_id: user.id, plan, status: "active", paypal_subscription_id: subscriptionId,
    paypal_plan_id: PAYPAL_PLAN_ANNUAL || "P-7PT724153F712010ANIFAOHA",
    current_period_end: periodEnd.toISOString(), last_payment_at: now.toISOString(),
    updated_at: now.toISOString(), tos_version: tosVersion, privacy_version: privacyVersion,
    signed_at: now.toISOString(),
  }, { onConflict: "user_id" });
  if (error) { console.error("[paypal/record-subscription]", error); return json({ error: "Failed to save subscription" }, 500); }
  try {
    const { data: profileData } = await admin.from("profiles").select("referred_by").eq("id", user.id).maybeSingle();
    if (profileData?.referred_by) {
      await admin.from("referrals").update({ status: "subscribed", converted_at: now.toISOString() }).eq("referrer_id", profileData.referred_by).eq("referred_id", user.id).neq("status", "subscribed");
    }
  } catch (refErr) {
    console.warn("[paypal/record-subscription] referral conversion non-fatal:", refErr);
  }
  const amount = "$79.00";
  fetch(`${SUPABASE_URL}/functions/v1/email/subscription-receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ recipientUserId: user.id, plan, amount, renewalDate: periodEnd.toISOString(), paypalSubscriptionId: subscriptionId }),
  }).catch((err) => console.error("[paypal/record-subscription] receipt email failed:", err));
  return json({ success: true, status: "active" });
}

async function handlePaymentCancel(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  // Fetch before update so we have last_payment_amount to detect trial cancels
  const { data: sub } = await admin.from("subscriptions").select("paypal_subscription_id, last_payment_amount").eq("user_id", user.id).maybeSingle();
  const { error } = await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", user.id);
  if (error) { console.error("[payment/cancel]", error); return json({ error: "Failed to cancel" }, 500); }
  // Trial cancel (last_payment_amount IS NULL = never charged) — remove from matching pool immediately.
  // Paid cancels keep pool access until current_period_end (BILLING.SUBSCRIPTION.EXPIRED webhook handles that).
  if (sub?.last_payment_amount == null) {
    await admin.from("profiles").update({ is_paused: true, updated_at: new Date().toISOString() }).eq("id", user.id);
    console.log("[payment/cancel] trial cancel — profile paused:", user.id);
  }
  const paypalId = sub?.paypal_subscription_id;
  if (paypalId && IS_LIVE) {
    (async () => {
      try {
        const token = await getPaypalAccessToken();
        if (token) {
          await fetch(`${PAYPAL_BASE_URL}/v1/billing/subscriptions/${paypalId}/cancel`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "User requested cancellation" }),
          });
        }
      } catch (err) {
        console.error("[payment/cancel] PayPal cancel failed:", err);
      }
    })();
  }
  fetch(`${SUPABASE_URL}/functions/v1/email/cancellation-confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({ recipientUserId: user.id }),
  }).catch((err) => console.error("[payment/cancel] confirmation email failed:", err));
  return json({ success: true, paypalSubscriptionId: paypalId ?? null });
}

// ── PayPal Webhook ────────────────────────────────────────────────────────────────────────

async function getPaypalAccessToken(): Promise<string | null> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) return null;
  try {
    const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) { console.error("[paypal/token] failed:", res.status); return null; }
    const data = await res.json();
    return data.access_token || null;
  } catch (err) {
    console.error("[paypal/token] error:", err);
    return null;
  }
}

async function verifyPaypalWebhookSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!PAYPAL_WEBHOOK_ID) {
    console.warn("[paypal/webhook] PAYPAL_WEBHOOK_ID not set — skipping signature verification");
    return true;
  }
  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionTime = req.headers.get("paypal-transmission-time");
  const certUrl = req.headers.get("paypal-cert-url");
  const transmissionSig = req.headers.get("paypal-transmission-sig");
  const authAlgo = req.headers.get("paypal-auth-algo");
  if (!transmissionId || !transmissionTime || !certUrl || !transmissionSig || !authAlgo) {
    console.error("[paypal/webhook] missing verification headers");
    return false;
  }
  const accessToken = await getPaypalAccessToken();
  if (!accessToken) {
    console.error("[paypal/webhook] could not get access token for verification");
    return false;
  }
  try {
    const verifyRes = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        cert_url: certUrl,
        auth_algo: authAlgo,
        transmission_sig: transmissionSig,
        webhook_id: PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(rawBody),
      }),
    });
    if (!verifyRes.ok) { console.error("[paypal/webhook] verify-webhook-signature:", verifyRes.status); return false; }
    const verifyData = await verifyRes.json();
    return verifyData.verification_status === "SUCCESS";
  } catch (err) {
    console.error("[paypal/webhook] signature verification error:", err);
    return false;
  }
}

async function handlePaypalWebhook(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const valid = await verifyPaypalWebhookSignature(req, rawBody);
  if (!valid) { console.error("[paypal/webhook] unauthorized"); return json({ error: "Unauthorized" }, 401); }
  let event: any;
  try { event = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400); }
  const eventType = String(event?.event_type || "");
  const resource = event?.resource || {};
  console.log("[paypal/webhook]", eventType, resource?.id || "");
  const admin = adminClient();
  const now = new Date().toISOString();
  switch (eventType) {
    case "BILLING.SUBSCRIPTION.ACTIVATED": {
      const sid = resource?.id;
      if (sid) {
        await admin.from("subscriptions").update({ status: "active", updated_at: now }).eq("paypal_subscription_id", sid);
        // Unpause profile when subscription activates (handles resubscription after trial cancel or expiry).
        const { data: activatedSub } = await admin.from("subscriptions").select("user_id").eq("paypal_subscription_id", sid).maybeSingle();
        if (activatedSub?.user_id) {
          await admin.from("profiles").update({ is_paused: false, updated_at: now }).eq("id", activatedSub.user_id);
          console.log("[paypal/webhook] ACTIVATED — profile unpaused:", activatedSub.user_id);
        }
      }
      break;
    }
    case "BILLING.SUBSCRIPTION.CANCELLED": {
      // User cancelled but paid period may still be running — don't pause yet.
      const sid = resource?.id;
      if (sid) await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("paypal_subscription_id", sid);
      break;
    }
    case "BILLING.SUBSCRIPTION.EXPIRED": {
      // Paid period has fully ended — remove from matching pool.
      const sid = resource?.id;
      if (sid) {
        await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("paypal_subscription_id", sid);
        const { data: expiredSub } = await admin.from("subscriptions").select("user_id").eq("paypal_subscription_id", sid).maybeSingle();
        if (expiredSub?.user_id) {
          await admin.from("profiles").update({ is_paused: true, updated_at: now }).eq("id", expiredSub.user_id);
          console.log("[paypal/webhook] EXPIRED — profile paused:", expiredSub.user_id);
        }
      }
      break;
    }
    case "BILLING.SUBSCRIPTION.SUSPENDED":
    case "BILLING.SUBSCRIPTION.PAYMENT.FAILED": {
      const sid = resource?.id;
      if (sid) await admin.from("subscriptions").update({ status: "past_due", updated_at: now }).eq("paypal_subscription_id", sid);
      break;
    }
    case "PAYMENT.SALE.COMPLETED": {
      const sid = resource?.billing_agreement_id;
      if (sid) {
        const amountStr = resource?.amount?.total ?? resource?.amount?.value ?? null;
        const amountNum = amountStr ? (parseFloat(amountStr) || null) : null;
        const currency = String(resource?.amount?.currency_code ?? resource?.amount?.currency ?? "USD").toUpperCase();
        const saleId = resource?.id ?? null;
        const newEnd = new Date();
        newEnd.setFullYear(newEnd.getFullYear() + 1);
        const { data: subRow } = await admin.from("subscriptions")
          .update({ status: "active", current_period_end: newEnd.toISOString(), last_payment_at: now, last_payment_amount: amountNum, updated_at: now })
          .eq("paypal_subscription_id", sid)
          .select("user_id")
          .maybeSingle();
        if (amountNum && subRow?.user_id) {
          await admin.from("payment_events").insert({
            user_id: subRow.user_id,
            paypal_subscription_id: sid,
            paypal_sale_id: saleId,
            amount: amountNum,
            currency,
            paid_at: now,
          }).catch((e: any) => console.error("[paypal/webhook PAYMENT.SALE.COMPLETED] payment_events insert:", e));
        }
      }
      break;
    }
    default:
      break;
  }
  return json({ ok: true });
}

// ── Promo ──────────────────────────────────────────────────────────────────────────────────

async function handlePromoRedeem(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return json({ error: "Missing code" }, 400);
  const admin = adminClient();
  const { data: existing } = await admin.from("promo_redemptions").select("id").eq("user_id", user.id).eq("code", code).maybeSingle();
  if (existing) return json({ error: "You've already redeemed this code." }, 400);
  const { data: promo } = await admin.from("promo_codes").select("code, plan, duration_days, max_uses, uses_count, expires_at, active").eq("code", code).maybeSingle();
  if (!promo) return json({ error: "Invalid code" }, 400);
  if (!promo.active) return json({ error: "Code is no longer active" }, 400);
  if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) return json({ error: "Code has expired" }, 400);
  if (promo.max_uses && promo.uses_count >= promo.max_uses) return json({ error: "Code has reached its usage limit" }, 400);
  const { error: redErr } = await admin.from("promo_redemptions").insert({ user_id: user.id, code, redeemed_at: new Date().toISOString() });
  if (redErr) { console.error("[promo/redeem]", redErr); return json({ error: "Failed to redeem code" }, 500); }
  await admin.from("promo_codes").update({ uses_count: (promo.uses_count ?? 0) + 1 }).eq("code", code);
  if (promo.plan && promo.duration_days) {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + promo.duration_days * 24 * 60 * 60 * 1000);
    await admin.from("subscriptions").upsert({ user_id: user.id, plan: promo.plan, status: "active", current_period_end: periodEnd.toISOString(), updated_at: now.toISOString() }, { onConflict: "user_id" });
  }
  return json({ success: true, plan: promo.plan, durationDays: promo.duration_days });
}

// ── Referral ─────────────────────────────────────────────────────────────────────────────────────

function getTierName(ripples: number): string {
  if (ripples >= 50) return "Legend";
  if (ripples >= 35) return "Icon";
  if (ripples >= 20) return "Star";
  if (ripples >= 10) return "Trailblazer";
  if (ripples >= 1) return "Pioneer";
  return "";
}

function getNextMilestone(ripples: number): number | null {
  if (ripples < 10) return 10;
  if (ripples < 20) return 20;
  if (ripples < 35) return 35;
  if (ripples < 50) return 50;
  return null;
}

async function handleReferralDashboard(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { data: existing } = await admin.from("referrals").select("referral_code").eq("referrer_id", user.id).limit(1).maybeSingle();
  let code = existing?.referral_code;
  if (!code) {
    code = "P" + user.id.replace(/-/g, "").slice(0, 7).toUpperCase();
    await admin.from("referrals").insert({ referrer_id: user.id, referral_code: code, status: "pending" });
  }
  const { data: directRows } = await admin.from("referrals").select("referred_id, status").eq("referrer_id", user.id).not("referred_id", "is", null);
  const rows = directRows ?? [];
  let directRippleCount = 0; let friendsInvited = 0; let friendsSubscribed = 0;
  const friends: Array<{ firstName: string; status: "sent" | "joined" | "subscribed" }> = [];
  const directIds: string[] = [];
  for (const row of rows) {
    if (!row.referred_id) continue;
    friendsInvited++;
    directIds.push(row.referred_id);
    const { data: profile } = await admin.from("profiles").select("name, has_completed_onboarding").eq("id", row.referred_id).maybeSingle();
    const hasOnboarded = profile?.has_completed_onboarding === true;
    const isSubscribed = row.status === "subscribed";
    if (hasOnboarded) directRippleCount++;
    if (isSubscribed) friendsSubscribed++;
    const firstName = (profile?.name ?? "").split(" ")[0] || "A friend";
    let friendStatus: "sent" | "joined" | "subscribed" = "sent";
    if (isSubscribed) friendStatus = "subscribed";
    else if (hasOnboarded) friendStatus = "joined";
    friends.push({ firstName, status: friendStatus });
  }
  let indirectRippleCount = 0;
  if (directIds.length > 0) {
    const { data: indirectRows } = await admin.from("referrals").select("referred_id").in("referrer_id", directIds).not("referred_id", "is", null);
    const indirectIds = (indirectRows ?? []).map((r: any) => r.referred_id).filter(Boolean);
    if (indirectIds.length > 0) {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).in("id", indirectIds).eq("has_completed_onboarding", true);
      indirectRippleCount = count ?? 0;
    }
  }
  const rippleCount = directRippleCount + indirectRippleCount;
  const tier = getTierName(rippleCount);
  const nextMilestone = getNextMilestone(rippleCount);
  return json({ code, referralLink: `https://getparallel.vip?ref=${code}`, rippleCount, directRippleCount, indirectRippleCount, tier, nextMilestone, friendsInvited, friendsSubscribed, friends: friends.sort((a, b) => { const order = { subscribed: 0, joined: 1, sent: 2 }; return order[a.status] - order[b.status]; }) });
}

async function handleReferralMyCode(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { data: existing } = await admin.from("referrals").select("referral_code").eq("referrer_id", user.id).limit(1).maybeSingle();
  let code = existing?.referral_code;
  if (!code) {
    code = "P" + user.id.replace(/-/g, "").slice(0, 7).toUpperCase();
    const { error: insErr } = await admin.from("referrals").insert({ referrer_id: user.id, referral_code: code, status: "pending" });
    if (insErr) console.error("[referral/my-code insert]", insErr);
  }
  const { count: invited } = await admin.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", user.id).not("referred_id", "is", null);
  const { count: subscribed } = await admin.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", user.id).eq("status", "subscribed");
  return json({ code, friendsInvited: invited ?? 0, friendsSubscribed: subscribed ?? 0 });
}

// ── Feedback / NPS / Exit ──────────────────────────────────────────────────────────────────

async function handleExitFeedback(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const actionType = body.action_type ?? null;
  const admin = adminClient();
  const { error } = await admin.from("exit_feedback").insert({ user_id: user.id, action_type: actionType, found_match: typeof body.found_match === "boolean" ? body.found_match : null, reason: body.reason ?? null, additional_notes: body.additional_notes ?? null });
  if (error) { console.error("[exit-feedback]", error); return json({ error: "Failed to save" }, 500); }
  return json({ success: true });
}

async function handleAppFeedback(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const admin = adminClient();
  const feedbackType = normalizeFeedbackType(body.feedbackType ?? body.feedback_type);
  const { error } = await admin.from("app_feedback").insert({ user_id: user.id, feedback_type: feedbackType, rating: typeof body.rating === "number" ? body.rating : null, message: body.message ?? null, tags: Array.isArray(body.tags) ? body.tags : null, context: body.context ?? null, status: "new" });
  if (error) { console.error("[app-feedback]", error); return json({ error: "Failed to save" }, 500); }
  return json({ success: true });
}

async function handleNps(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const score = typeof body.score === "number" ? body.score : null;
  if (score === null || score < 0 || score > 10) return json({ error: "Invalid score" }, 400);
  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const admin = adminClient();
  const { error } = await admin.from("nps_responses").insert({ user_id: user.id, score, reason: body.reason ?? null, month_year: monthYear });
  if (error) { console.error("[nps]", error); return json({ error: "Failed to save" }, 500); }
  return json({ success: true });
}

async function handleSuccessSubmit(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const storyText = String(body.storyText ?? "").trim();
  if (storyText.length < 10) return json({ error: "Story too short" }, 400);
  const admin = adminClient();
  const { error } = await admin.from("success_stories").insert({ user_id: user.id, match_user_id: body.matchUserId ?? null, story_text: storyText, how_long_together: body.howLongTogether ?? null, approved: false, show_on_landing: false });
  if (error) { console.error("[success/submit]", error); return json({ error: "Failed to save story" }, 500); }
  return json({ success: true });
}

// ── Account ────────────────────────────────────────────────────────────────────────────────────

async function handleAccountExport(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const [profileRes, answersRes, photosRes, matchesRes, interactionsRes, messagesRes, subRes, notifRes] = await Promise.all([
    admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    admin.from("user_answers").select("answers").eq("user_id", user.id).maybeSingle(),
    admin.from("user_photos").select("photo_url, position").eq("user_id", user.id).order("position"),
    admin.from("matches").select("*").eq("user_id", user.id),
    admin.from("match_interactions").select("*").eq("user_id", user.id),
    admin.from("messages").select("id, conversation_id, text, created_at").eq("sender_id", user.id),
    admin.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
    admin.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  const data = {
    exported_at: new Date().toISOString(), user_id: user.id, email: user.email,
    profile: profileRes.data ?? null, answers: answersRes.data?.answers ?? {},
    photos: (photosRes.data ?? []).map((p: any) => p.photo_url),
    matches: matchesRes.data ?? [], match_interactions: interactionsRes.data ?? [],
    messages_sent: messagesRes.data ?? [], subscription: subRes.data ?? null,
    notification_preferences: notifRes.data ?? null,
  };
  return new Response(JSON.stringify(data, null, 2), { status: 200, headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="parallel-export-${user.id}.json"`, ...corsHeaders } });
}

async function handleReEngagement(req: Request) {
  const admin = adminClient();
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  const cronSecret = req.headers.get("x-cron-secret") || "";
  let authorized = (CRON_SECRET.length > 0 && cronSecret === CRON_SECRET);
  if (!authorized) {
    const user = await getUserFromAuth(req);
    if (user) {
      const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if ((profile as any)?.is_admin) authorized = true;
    }
  }
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Eligible: sms_enabled + last_reengagement_sms_at older than 7 days (or never sent)
  const { data: candidates } = await admin
    .from("notification_preferences")
    .select("user_id, last_reengagement_sms_at")
    .eq("sms_enabled", true);

  if (!candidates || candidates.length === 0) return json({ sent: 0, skipped: 0 });

  let sent = 0, skipped = 0;

  for (const candidate of candidates) {
    const userId = (candidate as any).user_id as string;
    const lastRe = (candidate as any).last_reengagement_sms_at as string | null;

    // Enforce 7-day cooldown
    if (lastRe && new Date(lastRe) > new Date(sevenDaysAgo)) { skipped++; continue; }

    // Check profile: not paused/suspended, dormant 7+ days
    const { data: profile } = await admin
      .from("profiles")
      .select("phone, is_paused, is_suspended, last_active_at")
      .eq("id", userId)
      .maybeSingle();

    const p = profile as any;
    if (!p?.phone || p.is_paused || p.is_suspended) { skipped++; continue; }
    if (p.last_active_at && new Date(p.last_active_at) > new Date(sevenDaysAgo)) { skipped++; continue; }

    // Count unacted matches (in matches table but no match_interactions row)
    const [matchesRes, interactionsRes] = await Promise.all([
      admin.from("matches").select("matched_user_id").eq("user_id", userId),
      admin.from("match_interactions").select("matched_user_id").eq("user_id", userId),
    ]);
    const matchedIds = new Set(((matchesRes.data ?? []) as any[]).map((m) => m.matched_user_id));
    const actedIds = new Set(((interactionsRes.data ?? []) as any[]).map((m) => m.matched_user_id));
    const pendingCount = [...matchedIds].filter((id) => !actedIds.has(id)).length;
    if (pendingCount === 0) { skipped++; continue; }

    // Check opt-out
    const { data: optOut } = await admin.from("sms_opt_outs").select("phone").eq("phone", p.phone).maybeSingle();
    if (optOut) { skipped++; continue; }

    const matchWord = pendingCount === 1 ? "match" : "matches";
    const msgText = `You have ${pendingCount} ${matchWord} waiting on Parallel — see who: https://getparallel.vip\n\nReply STOP to unsubscribe.`;
    const telnyxBody: Record<string, string> = { to: p.phone, text: msgText, from: TELNYX_FROM_NUMBER };
    if (TELNYX_MESSAGING_PROFILE_ID) telnyxBody.messaging_profile_id = TELNYX_MESSAGING_PROFILE_ID;

    const telnyxRes = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TELNYX_API_KEY}` },
      body: JSON.stringify(telnyxBody),
    });
    const telnyxJson = await telnyxRes.json().catch(() => null);

    if (telnyxRes.ok) {
      await admin.from("notification_preferences").update({
        last_reengagement_sms_at: now.toISOString(),
        updated_at: now.toISOString(),
      }).eq("user_id", userId);
      await admin.from("notification_events").insert({
        user_id: userId, category: "reengagement_sms", sent: true,
        skipped_reason: null, onesignal_response: { pending_matches: pendingCount },
      });
      sent++;
    } else {
      await admin.from("notification_events").insert({
        user_id: userId, category: "reengagement_sms", sent: false,
        skipped_reason: "telnyx_error", onesignal_response: telnyxJson,
      });
      skipped++;
    }
  }

  return json({ sent, skipped, total: sent + skipped });
}

async function handleUserDelete(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const uid = user.id;
  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("email, phone").eq("id", uid).maybeSingle();
  const tables: Array<[string, string]> = [
    ["matches","user_id"],["matches","matched_user_id"],["subscriptions","user_id"],["user_answers","user_id"],
    ["user_dealbreakers","user_id"],["user_photos","user_id"],["onboarding_progress","user_id"],
    ["referrals","referrer_id"],["referrals","referred_id"],["user_category_weights","user_id"],
    ["attachment_styles","user_id"],["blocked_users","user_id"],["blocked_users","blocked_user_id"],
    ["match_interactions","user_id"],["match_interactions","matched_user_id"],["match_feedback","user_id"],
    ["match_feedback","matched_user_id"],["message_reads","user_id"],["messages","sender_id"],
    ["conversations","user_id_1"],["conversations","user_id_2"],["date_confirmations","user_id"],
    ["date_confirmations","matched_user_id"],["date_reviews","user_id"],["date_reviews","matched_user_id"],
    ["reported_users","reporter_id"],["reported_users","reported_user_id"],["notification_preferences","user_id"],
    ["pause_profile","user_id"],["exit_feedback","user_id"],["phone_otps","user_id"],
    ["identity_verifications","user_id"],["agreements","user_id"],["consent_log","user_id"],
    ["nps_responses","user_id"],["app_feedback","user_id"],["structured_feedback","user_id"],
    ["structured_feedback","matched_user_id"],["success_stories","user_id"],["success_stories","match_user_id"],
    ["promo_redemptions","user_id"],["pwa_install_tokens","user_id"],["payment_events","user_id"],
  ];
  for (const [table, col] of tables) {
    const { error } = await admin.from(table).delete().eq(col, uid);
    if (error) console.error(`[delete ${table}.${col}]`, error.message);
  }
  if (profile?.email || profile?.phone) {
    const { error: bErr } = await admin.from("banned_identifiers").insert({ source_user_id: null, email: profile?.email ?? null, phone: profile?.phone ?? null, reason: "self_delete" });
    if (bErr) console.error("[banned_identifiers]", bErr.message);
  }
  await admin.from("profiles").delete().eq("id", uid);
  const { error: authErr } = await admin.auth.admin.deleteUser(uid);
  if (authErr) { console.error("[auth.admin.deleteUser]", authErr); return json({ error: "Failed to delete auth user" }, 500); }
  return json({ success: true });
}

// ── Router ────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/misc\/?/i, "/").replace(/\/$/, "") || "/";
  try {
    if (path === "/" || path === "/health") return json({ ok: true, service: "misc", version: "28" });
    if (path === "/auth/pwa-token/create" && req.method === "POST") return await handlePwaTokenCreate(req);
    if (path === "/auth/pwa-token/exchange" && req.method === "POST") return await handlePwaTokenExchange(req);
    if (path === "/referral/by-code" && req.method === "GET") return await handleReferralByCode(req);
    if (path === "/auth/email-confirmed" && req.method === "POST") return await handleEmailConfirmed(req);
    if (path === "/auth/resend-verification" && req.method === "POST") return await handleResendVerification(req);
    if (path === "/auth/validate-token" && req.method === "POST") return await handleValidateToken(req);
    if (path === "/auth/send-phone-otp" && req.method === "POST") return await handleSendPhoneOtp(req);
    if (path === "/auth/verify-phone-otp" && req.method === "POST") return await handleVerifyPhoneOtp(req);
    if (path === "/sms/log-consent" && req.method === "POST") return await handleSmsLogConsent(req);
    if (path === "/sms/inbound" && req.method === "POST") return await handleSmsInbound(req);
    if (path === "/persona/webhook" && req.method === "POST") return await handlePersonaWebhook(req);
    if (path === "/persona/config" && req.method === "GET") return await handlePersonaConfig(req);
    if (path === "/verification/status" && req.method === "GET") return await handleVerificationStatus(req);
    if (path === "/verification/complete" && req.method === "POST") return await handleVerificationComplete(req);
    if (path === "/verification/consent" && req.method === "POST") return await handleVerificationConsent(req);
    if (path === "/safety/block" && req.method === "POST") return await handleSafetyBlock(req);
    if (path === "/safety/blocked" && req.method === "GET") return await handleSafetyBlocked(req);
    if (path === "/safety/report" && req.method === "POST") return await handleSafetyReport(req);
    if (path === "/notifications/preferences" && req.method === "GET") return await handleNotificationsGet(req);
    if (path === "/notifications/preferences" && req.method === "PUT") return await handleNotificationsPut(req);
    if (path === "/paypal/config" && req.method === "GET") return await handlePaypalConfig(req);
    if (path === "/paypal/record-subscription" && req.method === "POST") return await handlePaypalRecordSub(req);
    if (path === "/paypal/webhook" && req.method === "POST") return await handlePaypalWebhook(req);
    if (path === "/payment/cancel" && req.method === "POST") return await handlePaymentCancel(req);
    if (path === "/promo/redeem" && req.method === "POST") return await handlePromoRedeem(req);
    if (path === "/referral/dashboard" && req.method === "GET") return await handleReferralDashboard(req);
    if (path === "/referral/my-code" && req.method === "GET") return await handleReferralMyCode(req);
    if (path === "/account/update-email" && req.method === "POST") return await handleUpdateEmail(req);
    if (path === "/exit-feedback" && req.method === "POST") return await handleExitFeedback(req);
    if (path === "/app-feedback" && req.method === "POST") return await handleAppFeedback(req);
    if (path === "/nps" && req.method === "POST") return await handleNps(req);
    if (path === "/success/submit" && req.method === "POST") return await handleSuccessSubmit(req);
    if (path === "/user/feedback" && req.method === "POST") return await handleAppFeedback(req);
    if (path === "/account/export" && req.method === "GET") return await handleAccountExport(req);
    if (path === "/re-engagement/run" && req.method === "POST") return await handleReEngagement(req);
    if (path === "/user/delete" && req.method === "DELETE") return await handleUserDelete(req);
    if (path === "/auth/skip-phone-verification" && req.method === "POST") return await handleSkipPhoneVerification(req);
    return json({ error: "Not found", path, method: req.method }, 404);
  } catch (err) {
    console.error("[misc] unhandled:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

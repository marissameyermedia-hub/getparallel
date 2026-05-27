// Parallel — email edge function v13
// v13: Affiliate approval email CTA links to ?view=affiliate-portal deep link.
// v12: Add /affiliate-approved — sends approval email with promo code + tracked link.
// v11: Add /affiliate-application — sends application received confirmation.
// v10: Add /cancellation-confirm — sends cancellation confirmation email.
// v9: /date-confirmed handler.
//     - Background: White #FFFFFF (Cream per tailwind.config.ts brand tokens)
//     - Wordmark: PARA//EL. with // in Purple #7B5EA7 (was plain "Parallel" text)
//     - CTA button: Purple #7B5EA7 (was black)
//     - Borders: Linen #E8E4DE (was #e5e5e5)
//     - Body/heading text: Void #0D0D0F (was #000/#1a1a1a)
//     - Muted/footer text: Stone #8A8690 (was #666666)
//     - tplRenewalReminder inline body colors also updated to brand palette.
// v7: /renewal-reminder — 7-day auto-renewal warning for annual subscribers.
//     Required by CA auto-renewal law (SB 313). Called by Supabase cron job
//     (pg_cron) that runs daily at 09:00 UTC and finds annual subscribers
//     whose current_period_end is exactly 7 days away.
//     Handler also callable manually: POST /email/renewal-reminder with
//     { recipientUserId } to send to a specific user (service-role only).
// v6: /verify-confirm returns a session so users land signed-in after
//     clicking the email verify link.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";

const FROM_ADDRESS = "Parallel <hello@getparallel.vip>";
const APP_URL = "https://getparallel.vip";

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

async function getCaller(req: Request): Promise<{
  user: { id: string; email: string | null } | null;
  serviceRole: boolean;
}> {
  const apikey = req.headers.get("apikey") ?? "";
  const serviceRole = apikey === SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^bearer\s+/i, "").trim();
  if (!token) return { user: null, serviceRole };
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { user: null, serviceRole };
  return { user: { id: data.user.id, email: data.user.email ?? null }, serviceRole };
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

async function resendSend(args: SendArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    console.error("[email] RESEND_API_KEY not configured");
    return { ok: false, error: "Email service not configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo ?? "hello@getparallel.vip",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[resend] non-200", res.status, body);
      return { ok: false, error: (body as any)?.message || `Resend ${res.status}` };
    }
    return { ok: true, id: (body as any)?.id };
  } catch (err) {
    console.error("[resend] fetch failed", err);
    return { ok: false, error: "Network error sending email" };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// ── Brand palette ─────────────────────────────────────────────────────────────
// Locked brand colors from the Parallel brand book (April 2026).
// Do not substitute generic blacks/whites — use these exact values.
const B = {
  cream:  "#FFFFFF",  // White. Light backgrounds, text on dark.
  void_:  "#0D0D0F",  // Primary text — never pure black
  purple: "#7B5EA7",  // CTA buttons, // in wordmark on light bg
  linen:  "#E8E4DE",  // Borders and dividers
  stone:  "#8A8690",  // Secondary / muted text
};

// PARA//EL. wordmark — hosted PNG, transparent background (works on white email bg).
const WORDMARK_HTML =
  `<img src="https://getparallel.vip/PARA-EL-transparent-dark.png" alt="PARA//EL." width="140" height="auto" style="display:block;border:0;max-width:140px;" />`;

function shellHtml(opts: { heading: string; body: string; ctaUrl?: string; ctaLabel?: string }) {
  const { heading, body, ctaUrl, ctaLabel } = opts;
  const cta = ctaUrl && ctaLabel
    ? `<tr><td style="padding:8px 32px 32px 32px;text-align:center;"><a href="${ctaUrl}" style="display:inline-block;background-color:${B.purple};color:${B.cream};text-decoration:none;padding:14px 40px;border-radius:9999px;font-weight:600;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><span style="color:${B.cream};">${ctaLabel}</span></a></td></tr>`
    : "";
  return (
    `<!doctype html><html lang="en">` +
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="only light"><meta name="supported-color-schemes" content="light">` +
    `<style>:root{color-scheme:only light;supported-color-schemes:light;}` +
    `[data-ogsc] body,[data-ogsb] body{background:${B.cream} !important;color:${B.void_} !important;}</style>` +
    `</head>` +
    `<body style="margin:0;padding:0;background-color:${B.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${B.void_};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${B.cream};padding:32px 16px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:${B.cream};border:1px solid ${B.linen};border-radius:16px;overflow:hidden;">` +
    `<tr><td style="padding:32px 32px 8px 32px;">${WORDMARK_HTML}</td></tr>` +
    `<tr><td style="padding:8px 32px 0 32px;"><h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;font-weight:600;color:${B.void_};">${heading}</h1></td></tr>` +
    `<tr><td style="padding:0 32px;font-size:15px;line-height:1.6;color:${B.void_};">${body}</td></tr>` +
    `${cta}` +
    `<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid ${B.linen};">` +
    `<p style="margin:0;font-size:12px;line-height:1.6;color:${B.stone};">Parallel — professional matchmaking.<br>This email was sent to a verified Parallel account. Need help? Reply to this email.</p>` +
    `</td></tr>` +
    `</table></td></tr></table>` +
    `</body></html>`
  ).trim();
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Email templates ───────────────────────────────────────────────────────────

function tplVerify(verifyUrl: string) {
  const html = shellHtml({ heading: "Welcome to Parallel — verify your email", body: `<p style="margin:0 0 12px 0;">Click the button below to verify your email address.</p><p style="margin:0 0 12px 0;color:${B.stone};font-size:14px;">This link expires in 24 hours.</p>`, ctaUrl: verifyUrl, ctaLabel: "Verify email" });
  return { subject: "Verify your email — Parallel", html, text: `Welcome to Parallel.\n\nVerify your email: ${verifyUrl}\n\nThis link expires in 24 hours.` };
}

function tplWelcome(name: string | null) {
  const greeting = name ? `Welcome, ${name}.` : "Welcome to Parallel.";
  const html = shellHtml({ heading: greeting, body: `<p style="margin:0 0 12px 0;">Your email is verified. You're all set to start matching.</p><p style="margin:0 0 12px 0;">Parallel is built around compatibility — your answers to 55 questions match you to people you'd genuinely fit with. Less swiping, more connection.</p>`, ctaUrl: APP_URL, ctaLabel: "Open Parallel" });
  return { subject: "You're verified — welcome to Parallel", html, text: `${greeting}\n\nYour email is verified.\n\n${APP_URL}` };
}

function tplMatchAlert(opts: { recipientName: string | null; matchName: string; matchScore: number; reveal: "full" | "minimal" | "thumbnail-only" }) {
  const { recipientName } = opts;
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";
  const html = shellHtml({ heading: "You have a new match on Parallel", body: `<p style="margin:0 0 12px 0;">${greeting}</p><p style="margin:0 0 12px 0;">Open the app to see your new match.</p>`, ctaUrl: APP_URL, ctaLabel: "Open Parallel" });
  return { subject: "You have a new match on Parallel", html, text: `${greeting}\n\nOpen the app to see your new match.\n\n${APP_URL}` };
}

function tplSubscriptionReceipt(opts: { recipientName: string | null; plan: "monthly" | "annual_founding"; amount: string; renewalDate: string; paypalSubscriptionId: string }) {
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi,";
  const planLabel = opts.plan === "annual_founding" ? "Founding annual ($79/year)" : "Monthly ($24.99/month)";
  const renewal = new Date(opts.renewalDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const html = shellHtml({ heading: "Thanks for subscribing to Parallel", body: `<p style="margin:0 0 12px 0;">${greeting}</p><p style="margin:0 0 12px 0;">Plan: ${planLabel}<br>Amount: ${opts.amount}<br>Renews on: ${renewal}</p>`, ctaUrl: APP_URL, ctaLabel: "Open Parallel" });
  return { subject: "Your Parallel subscription receipt", html, text: `${greeting}\n\nPlan: ${planLabel}\nAmount: ${opts.amount}\nRenews: ${renewal}\n\n${APP_URL}` };
}

function tplRenewalReminder(opts: { recipientName: string | null; plan: "monthly" | "annual_founding"; amount: string; renewalDate: string }) {
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi,";
  const planLabel = opts.plan === "annual_founding" ? "Founding annual — $79" : "Monthly — $24.99";
  const renewal = new Date(opts.renewalDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  // CA SB 313 requires: charge amount, renewal date, and an easy cancel path
  // all in the same email. The cancel link goes directly to the account page
  // where the cancel flow is one tap.
  const cancelUrl = `${APP_URL}/account`;
  const body = [
    `<p style="margin:0 0 12px 0;">${greeting}</p>`,
    `<p style="margin:0 0 12px 0;">Your Parallel subscription renews in <strong>7 days</strong>.</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;background:${B.linen};border-radius:10px;padding:16px 20px;width:100%;">`,
    `  <tr><td style="font-size:14px;color:${B.stone};">Plan</td><td style="font-size:14px;color:${B.void_};font-weight:600;text-align:right;">${planLabel}</td></tr>`,
    `  <tr><td style="font-size:14px;color:${B.stone};padding-top:6px;">Renewal date</td><td style="font-size:14px;color:${B.void_};font-weight:600;text-align:right;padding-top:6px;">${renewal}</td></tr>`,
    `</table>`,
    `<p style="margin:0 0 16px 0;font-size:13px;color:${B.stone};">Your subscription will automatically renew unless you cancel before ${renewal}. To cancel, tap the button below — it only takes one tap inside the app.</p>`,
    `<p style="margin:0 0 12px 0;"><a href="${cancelUrl}" style="font-size:13px;color:${B.void_};font-weight:600;text-decoration:underline;">Cancel subscription</a></p>`,
  ].join("");
  const html = shellHtml({ heading: "Your Parallel subscription renews in 7 days", body, ctaUrl: APP_URL, ctaLabel: "Open Parallel" });
  const text = [
    `${greeting}`,
    ``,
    `Your Parallel subscription renews in 7 days.`,
    ``,
    `Plan: ${planLabel}`,
    `Renewal date: ${renewal}`,
    ``,
    `Your subscription will automatically renew unless you cancel before ${renewal}.`,
    `To cancel: ${cancelUrl}`,
    ``,
    APP_URL,
  ].join("\n");
  return { subject: `Your Parallel subscription renews on ${renewal}`, html, text };
}

function tplPauseConfirm(name: string | null) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const html = shellHtml({ heading: "Your Parallel account is paused", body: `<p style="margin:0 0 12px 0;">${greeting}</p><p style="margin:0 0 12px 0;">Your account is paused. Profile hidden, billing stopped, messaging suspended. Your answers and matches are preserved.</p>`, ctaUrl: APP_URL, ctaLabel: "Resume anytime" });
  return { subject: "Your Parallel account is paused", html, text: `${greeting}\n\nYour Parallel account is paused.\n\n${APP_URL}` };
}

function tplResumeConfirm(name: string | null) {
  const greeting = name ? `Welcome back, ${name}.` : "Welcome back.";
  const html = shellHtml({ heading: greeting, body: `<p style="margin:0 0 12px 0;">Your Parallel account is active again.</p>`, ctaUrl: APP_URL, ctaLabel: "Open Parallel" });
  return { subject: "Welcome back to Parallel", html, text: `${greeting}\n\n${APP_URL}` };
}

function tplCancellationConfirm(name: string | null) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const html = shellHtml({
    heading: "Your Parallel subscription has been cancelled",
    body: `<p style="margin:0 0 12px 0;">${greeting}</p>
<p style="margin:0 0 12px 0;">Your subscription has been cancelled. You'll keep access through the end of your current billing period.</p>
<p style="margin:0 0 12px 0;">Your questionnaire answers and match history are saved — you can resubscribe anytime to pick up right where you left off.</p>`,
    ctaUrl: APP_URL,
    ctaLabel: "Resubscribe anytime",
  });
  return {
    subject: "Your Parallel subscription has been cancelled",
    html,
    text: `${greeting}\n\nYour subscription has been cancelled. You'll keep access through the end of your current billing period.\n\nYour data is saved — resubscribe anytime at ${APP_URL}`,
  };
}

function tplDateConfirmed(opts: { recipientName: string | null; matchName: string; dateTime: string; location: string }) {
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi,";
  const when = new Date(opts.dateTime).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const html = shellHtml({ heading: `Your date with ${opts.matchName} is confirmed`, body: `<p style="margin:0 0 12px 0;">${greeting}</p><p style="margin:0 0 12px 0;">When: ${when}<br>Where: ${escapeHtml(opts.location)}</p>`, ctaUrl: APP_URL, ctaLabel: "Open Parallel" });
  return { subject: `Your date with ${opts.matchName} is confirmed`, html, text: `${greeting}\n\nWhen: ${when}\nWhere: ${opts.location}\n\n${APP_URL}` };
}

// ── Session helper (v6) ───────────────────────────────────────────────────────

async function mintSessionForUser(userEmail: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const admin = adminClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: userEmail });
    if (error || !data?.properties?.action_link) { console.error("[mintSession] generateLink failed", error); return null; }
    const link = data.properties.action_link as string;
    const verifyRes = await fetch(link, { redirect: "manual" });
    const location = verifyRes.headers.get("location") || "";
    if (!location) { console.error("[mintSession] no Location header", verifyRes.status); return null; }
    const hashIdx = location.indexOf("#");
    if (hashIdx < 0) { console.error("[mintSession] no hash:", location); return null; }
    const params = new URLSearchParams(location.substring(hashIdx + 1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) { console.error("[mintSession] missing tokens:", location); return null; }
    return { accessToken, refreshToken };
  } catch (err) { console.error("[mintSession] threw", err); return null; }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleVerifySend(req: Request) {
  const { user, serviceRole } = await getCaller(req);
  let recipientUserId: string | null = null;
  if (serviceRole) { try { const body = await req.clone().json(); if (body?.recipientUserId) recipientUserId = String(body.recipientUserId); } catch {} }
  const targetUserId = recipientUserId ?? user?.id;
  if (!targetUserId) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("name, email, email_verified").eq("id", targetUserId).maybeSingle();
  const recipientEmail = profile?.email ?? user?.email ?? null;
  if (!recipientEmail) return json({ error: "No email on file" }, 400);
  if (profile?.email_verified) return json({ ok: true, alreadyVerified: true });
  const { data: recent } = await admin.from("email_verification_tokens").select("created_at").eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recent?.created_at) {
    const ageSec = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
    if (ageSec < 60) return json({ error: `Please wait ${Math.ceil(60 - ageSec)}s before resending.` }, 429);
  }
  await admin.from("email_verification_tokens").update({ used_at: new Date().toISOString() }).eq("user_id", targetUserId).is("used_at", null);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: insErr } = await admin.from("email_verification_tokens").insert({ user_id: targetUserId, token, expires_at: expiresAt });
  if (insErr) { console.error("[verify-send] token insert", insErr); return json({ error: "Could not send verification email" }, 500); }
  const verifyUrl = `${APP_URL}/?verify=${token}`;
  const tpl = tplVerify(verifyUrl);
  const sendRes = await resendSend({ to: recipientEmail, subject: tpl.subject, html: tpl.html, text: tpl.text });
  if (!sendRes.ok) return json({ error: sendRes.error || "Could not send verification email" }, 500);
  return json({ ok: true });
}

async function handleVerifyConfirm(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const token = String(body.token ?? "").trim();
  if (!token) return json({ error: "Missing token" }, 400);
  const admin = adminClient();
  const { data: row } = await admin.from("email_verification_tokens").select("user_id, expires_at, used_at").eq("token", token).maybeSingle();
  if (!row) return json({ error: "Invalid or expired link." }, 400);
  if (row.used_at) return json({ error: "This link has already been used." }, 400);
  if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: "This link has expired. Request a new one." }, 400);
  const now = new Date().toISOString();
  await admin.from("email_verification_tokens").update({ used_at: now }).eq("token", token);
  const { data: profile, error: profErr } = await admin.from("profiles").update({ email_verified: true, updated_at: now }).eq("id", row.user_id).select("name, email, email_verified").maybeSingle();
  if (profErr || !profile) { console.error("[verify-confirm] profile update", profErr); return json({ error: "Could not finalize verification" }, 500); }
  if (profile.email) { const tpl = tplWelcome(profile.name); resendSend({ to: profile.email, subject: tpl.subject, html: tpl.html, text: tpl.text }).catch((err) => console.error("[verify-confirm] welcome send failed", err)); }
  let session: { accessToken: string; refreshToken: string } | null = null;
  if (profile.email) session = await mintSessionForUser(profile.email);
  return json({ ok: true, accessToken: session?.accessToken ?? null, refreshToken: session?.refreshToken ?? null, userId: row.user_id });
}

async function shouldSendOptional(userId: string): Promise<{ send: boolean; email: string | null; name: string | null }> {
  const admin = adminClient();
  const [profileRes, prefRes] = await Promise.all([
    admin.from("profiles").select("name, email, email_verified").eq("id", userId).maybeSingle(),
    admin.from("notification_preferences").select("email_enabled").eq("user_id", userId).maybeSingle(),
  ]);
  const profile = profileRes.data;
  if (!profile?.email) return { send: false, email: null, name: null };
  if (!profile.email_verified) return { send: false, email: profile.email, name: profile.name };
  const enabled = prefRes.data?.email_enabled !== false;
  return { send: enabled, email: profile.email, name: profile.name };
}

async function handleMatchAlert(req: Request) {
  const { user, serviceRole } = await getCaller(req);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const recipientUserId = serviceRole && body.recipientUserId ? String(body.recipientUserId) : user?.id;
  if (!recipientUserId) return json({ error: "Unauthorized" }, 401);
  const matchName = String(body.matchName ?? "").trim();
  const matchScore = typeof body.matchScore === "number" ? Math.round(body.matchScore) : 0;
  if (!matchName) return json({ error: "Missing matchName" }, 400);
  const { send, email, name } = await shouldSendOptional(recipientUserId);
  if (!send) return json({ ok: true, skipped: true });
  const tpl = tplMatchAlert({ recipientName: name, matchName, matchScore, reveal: "minimal" });
  const sendRes = await resendSend({ to: email!, subject: tpl.subject, html: tpl.html, text: tpl.text });
  if (!sendRes.ok) return json({ error: sendRes.error }, 500);
  return json({ ok: true });
}

async function handleSubscriptionReceipt(req: Request) {
  const { user, serviceRole } = await getCaller(req);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const recipientUserId = serviceRole && body.recipientUserId ? String(body.recipientUserId) : user?.id;
  if (!recipientUserId) return json({ error: "Unauthorized" }, 401);
  const plan = String(body.plan ?? "");
  if (!["monthly", "annual_founding"].includes(plan)) return json({ error: "Invalid plan" }, 400);
  const amount = String(body.amount ?? "");
  const renewalDate = String(body.renewalDate ?? "");
  const paypalSubscriptionId = String(body.paypalSubscriptionId ?? "");
  if (!amount || !renewalDate || !paypalSubscriptionId) return json({ error: "Missing receipt fields" }, 400);
  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("name, email").eq("id", recipientUserId).maybeSingle();
  if (!profile?.email) return json({ ok: true, skipped: true });
  const tpl = tplSubscriptionReceipt({ recipientName: profile.name, plan: plan as "monthly" | "annual_founding", amount, renewalDate, paypalSubscriptionId });
  const sendRes = await resendSend({ to: profile.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
  if (!sendRes.ok) return json({ error: sendRes.error }, 500);
  return json({ ok: true });
}

// v7: Sends 7-day renewal reminder. Can be triggered two ways:
//   1. By the pg_cron job (service-role, no body needed — scans all due subs)
//   2. Manually for a specific user (service-role + { recipientUserId })
//
// CA SB 313 compliance: email must include charge amount, renewal date,
// and a direct cancel link. tplRenewalReminder() covers all three.
async function handleRenewalReminder(req: Request) {
  const { user, serviceRole } = await getCaller(req);
  if (!serviceRole && !user) return json({ error: "Unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch {}

  const admin = adminClient();

  // Manual single-user send (service-role + recipientUserId)
  if (serviceRole && body.recipientUserId) {
    const userId = String(body.recipientUserId);
    const { data: sub } = await admin.from("subscriptions")
      .select("plan, current_period_end")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (!sub) return json({ ok: true, skipped: true, reason: "no_active_sub" });
    const plan = sub.plan as "monthly" | "annual_founding";
    const amount = plan === "annual_founding" ? "$79.00" : "$24.99";
    const { send, email, name } = await shouldSendOptional(userId);
    if (!send || !email) return json({ ok: true, skipped: true, reason: "email_disabled" });
    const tpl = tplRenewalReminder({ recipientName: name, plan, amount, renewalDate: sub.current_period_end });
    const sendRes = await resendSend({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
    if (!sendRes.ok) return json({ error: sendRes.error }, 500);
    return json({ ok: true, sent: 1 });
  }

  // Batch send — called by cron. Finds all active annual subscribers whose
  // current_period_end is between now+6d and now+8d (i.e. ~7 days out).
  // Monthly subscribers are excluded — their renewal cycle is too short
  // for a 7-day warning to be practically useful (and CA SB 313 technically
  // only requires it for annual subscriptions that auto-renew).
  if (serviceRole) {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString();
    const windowEnd   = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const { data: subs, error: subsErr } = await admin.from("subscriptions")
      .select("user_id, plan, current_period_end")
      .eq("status", "active")
      .eq("plan", "annual_founding")
      .gte("current_period_end", windowStart)
      .lte("current_period_end", windowEnd);
    if (subsErr) { console.error("[renewal-reminder] subs query", subsErr); return json({ error: "DB error" }, 500); }
    const rows = subs ?? [];
    let sent = 0, skipped = 0;
    for (const sub of rows) {
      try {
        const { send, email, name } = await shouldSendOptional(sub.user_id);
        if (!send || !email) { skipped++; continue; }
        const plan = sub.plan as "monthly" | "annual_founding";
        const amount = plan === "annual_founding" ? "$79.00" : "$24.99";
        const tpl = tplRenewalReminder({ recipientName: name, plan, amount, renewalDate: sub.current_period_end });
        const sendRes = await resendSend({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
        if (sendRes.ok) sent++; else { console.error("[renewal-reminder] send failed for", sub.user_id, sendRes.error); skipped++; }
      } catch (err) { console.error("[renewal-reminder] per-user error", sub.user_id, err); skipped++; }
    }
    return json({ ok: true, sent, skipped, total: rows.length });
  }

  return json({ error: "Unauthorized" }, 401);
}

async function handlePauseConfirm(req: Request) {
  const { user, serviceRole } = await getCaller(req);
  let body: any = {};
  try { body = await req.json(); } catch {}
  const recipientUserId = serviceRole && body.recipientUserId ? String(body.recipientUserId) : user?.id;
  if (!recipientUserId) return json({ error: "Unauthorized" }, 401);
  const { send, email, name } = await shouldSendOptional(recipientUserId);
  if (!send) return json({ ok: true, skipped: true });
  const tpl = tplPauseConfirm(name);
  const sendRes = await resendSend({ to: email!, subject: tpl.subject, html: tpl.html, text: tpl.text });
  if (!sendRes.ok) return json({ error: sendRes.error }, 500);
  return json({ ok: true });
}

async function handleResumeConfirm(req: Request) {
  const { user, serviceRole } = await getCaller(req);
  let body: any = {};
  try { body = await req.json(); } catch {}
  const recipientUserId = serviceRole && body.recipientUserId ? String(body.recipientUserId) : user?.id;
  if (!recipientUserId) return json({ error: "Unauthorized" }, 401);
  const { send, email, name } = await shouldSendOptional(recipientUserId);
  if (!send) return json({ ok: true, skipped: true });
  const tpl = tplResumeConfirm(name);
  const sendRes = await resendSend({ to: email!, subject: tpl.subject, html: tpl.html, text: tpl.text });
  if (!sendRes.ok) return json({ error: sendRes.error }, 500);
  return json({ ok: true });
}

async function handleCancellationConfirm(req: Request) {
  const { user, serviceRole } = await getCaller(req);
  let body: any = {};
  try { body = await req.json(); } catch {}
  const recipientUserId = serviceRole && body.recipientUserId ? String(body.recipientUserId) : user?.id;
  if (!recipientUserId) return json({ error: "Unauthorized" }, 401);
  const { send, email, name } = await shouldSendOptional(recipientUserId);
  if (!send) return json({ ok: true, skipped: true });
  const tpl = tplCancellationConfirm(name);
  const sendRes = await resendSend({ to: email!, subject: tpl.subject, html: tpl.html, text: tpl.text });
  if (!sendRes.ok) return json({ error: sendRes.error }, 500);
  return json({ ok: true });
}

function tplAffiliateAppReceived(name: string | null, tier: string) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const tierLabels: Record<string, string> = { seeds: "Seeds", voices: "Voices", anchors: "Anchors" };
  const tierLabel = tierLabels[tier] ?? tier;
  const body = [
    `<p style="margin:0 0 12px 0;">${greeting}</p>`,
    `<p style="margin:0 0 12px 0;">We received your application to join the Parallel Affiliate Army as a <strong>${tierLabel}</strong> affiliate. Thanks for applying!</p>`,
    `<p style="margin:0 0 12px 0;">Our team reviews every application personally. We'll be in touch within a few business days with a decision.</p>`,
    `<p style="margin:0 0 4px 0;">In the meantime, you can check your application status anytime by opening the Affiliate Program section in your account.</p>`,
  ].join("");
  const html = shellHtml({ heading: "Application received", body, ctaUrl: APP_URL, ctaLabel: "Open Parallel" });
  return {
    subject: "We got your Affiliate Army application",
    html,
    text: `${greeting}\n\nWe received your application to join the Parallel Affiliate Army (${tierLabel} tier).\n\nWe'll review it and be in touch within a few business days.\n\n${APP_URL}`,
  };
}

function tplAffiliateApproved(opts: { name: string | null; tier: string; promoCode: string; trackedLinkSlug: string; commissionRate: number }) {
  const greeting = opts.name ? `Hi ${opts.name},` : "Hi,";
  const tierLabels: Record<string, string> = { seeds: "Seeds", voices: "Voices", anchors: "Anchors" };
  const tierLabel = tierLabels[opts.tier] ?? opts.tier;
  const commissionPct = Math.round(opts.commissionRate * 100);
  const trackedLink = `https://getparallel.vip/r/${opts.trackedLinkSlug}`;
  const body = [
    `<p style="margin:0 0 12px 0;">${greeting}</p>`,
    `<p style="margin:0 0 16px 0;">You've been approved as a <strong>${tierLabel}</strong> affiliate — welcome to the Parallel Affiliate Army!</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;background:${B.linen};border-radius:10px;padding:16px 20px;width:100%;">`,
    `  <tr><td style="font-size:13px;color:${B.stone};padding-bottom:8px;">Your promo code</td></tr>`,
    `  <tr><td style="font-size:22px;font-weight:700;color:${B.purple};letter-spacing:0.05em;font-family:monospace;">${opts.promoCode}</td></tr>`,
    `  <tr><td style="font-size:13px;color:${B.stone};padding-top:12px;padding-bottom:4px;">Your tracked link</td></tr>`,
    `  <tr><td style="font-size:13px;color:${B.void_};word-break:break-all;">${trackedLink}</td></tr>`,
    `  <tr><td style="font-size:13px;color:${B.stone};padding-top:12px;padding-bottom:4px;">Your commission</td></tr>`,
    `  <tr><td style="font-size:13px;font-weight:600;color:${B.void_};">${commissionPct}% of every membership you refer</td></tr>`,
    `</table>`,
    `<p style="margin:0 0 12px 0;font-size:14px;color:${B.stone};">Share your link or promo code on social. Every time someone signs up and subscribes, you earn ${commissionPct}%. Open the app to see your full dashboard.</p>`,
  ].join("");
  const html = shellHtml({ heading: "You're in — welcome to the Affiliate Army!", body, ctaUrl: `${APP_URL}?view=affiliate-portal`, ctaLabel: "Open your dashboard" });
  return {
    subject: "You're approved — Parallel Affiliate Army",
    html,
    text: `${greeting}\n\nYou're approved as a ${tierLabel} affiliate!\n\nPromo code: ${opts.promoCode}\nTracked link: ${trackedLink}\nCommission: ${commissionPct}% per referral\n\nOpen your dashboard: ${APP_URL}?view=affiliate-portal`,
  };
}

async function handleAffiliateApproved(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const email         = String(body.email         ?? "").trim();
  const tier          = String(body.tier          ?? "").trim();
  const promoCode     = String(body.promo_code    ?? "").trim();
  const trackedLinkSlug = String(body.tracked_link_slug ?? "").trim();
  const commissionRate  = typeof body.commission_rate === "number" ? body.commission_rate : 0.10;
  const name          = body.name ? String(body.name).trim() : null;
  if (!email || !tier || !promoCode || !trackedLinkSlug) return json({ error: "email, tier, promo_code, tracked_link_slug required" }, 400);
  const tpl = tplAffiliateApproved({ name, tier, promoCode, trackedLinkSlug, commissionRate });
  const sendRes = await resendSend({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
  if (!sendRes.ok) return json({ error: sendRes.error }, 500);
  return json({ ok: true });
}

async function handleAffiliateAppReceived(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const email = String(body.email ?? "").trim();
  const tier  = String(body.tier  ?? "").trim();
  const name  = body.name ? String(body.name).trim() : null;
  if (!email || !tier) return json({ error: "email and tier required" }, 400);
  const tpl = tplAffiliateAppReceived(name, tier);
  const sendRes = await resendSend({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
  if (!sendRes.ok) return json({ error: sendRes.error }, 500);
  return json({ ok: true });
}

async function handleDateConfirmed(req: Request) {
  const { user, serviceRole } = await getCaller(req);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const recipientUserId = serviceRole && body.recipientUserId ? String(body.recipientUserId) : user?.id;
  if (!recipientUserId) return json({ error: "Unauthorized" }, 401);
  const matchName = String(body.matchName ?? "").trim();
  const dateTime = String(body.dateTime ?? "");
  const location = String(body.location ?? "").trim();
  if (!matchName || !dateTime || !location) return json({ error: "Missing date fields" }, 400);
  const { send, email, name } = await shouldSendOptional(recipientUserId);
  if (!send) return json({ ok: true, skipped: true });
  const tpl = tplDateConfirmed({ recipientName: name, matchName, dateTime, location });
  const sendRes = await resendSend({ to: email!, subject: tpl.subject, html: tpl.html, text: tpl.text });
  if (!sendRes.ok) return json({ error: sendRes.error }, 500);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/email\/?/i, "/").replace(/\/$/, "") || "/";
  try {
    if (path === "/" || path === "/health") return json({ ok: true, service: "email", version: "13" });
    if (path === "/verify-send"        && req.method === "POST") return await handleVerifySend(req);
    if (path === "/resend"             && req.method === "POST") return await handleVerifySend(req);
    if (path === "/verify-confirm"     && req.method === "POST") return await handleVerifyConfirm(req);
    if (path === "/match-alert"        && req.method === "POST") return await handleMatchAlert(req);
    if (path === "/subscription-receipt" && req.method === "POST") return await handleSubscriptionReceipt(req);
    if (path === "/renewal-reminder"   && req.method === "POST") return await handleRenewalReminder(req);
    if (path === "/pause-confirm"      && req.method === "POST") return await handlePauseConfirm(req);
    if (path === "/resume-confirm"     && req.method === "POST") return await handleResumeConfirm(req);
    if (path === "/date-confirmed"        && req.method === "POST") return await handleDateConfirmed(req);
    if (path === "/cancellation-confirm"  && req.method === "POST") return await handleCancellationConfirm(req);
    if (path === "/affiliate-application" && req.method === "POST") return await handleAffiliateAppReceived(req);
    if (path === "/affiliate-approved"    && req.method === "POST") return await handleAffiliateApproved(req);
    return json({ error: "Not found", path, method: req.method }, 404);
  } catch (err) {
    console.error("[email] unhandled:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

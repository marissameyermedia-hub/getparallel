// Parallel — auth edge function
// Routes:
//   POST /auth/signup            — create auth user + profile + log agreement (atomic, idempotent on email)
//   GET  /auth/health            — health check
//
// Frontend response contract (must match what AccountCreationPage.tsx expects):
//   200: { accessToken: string, userId: string, emailConfirmed: boolean }
//   4xx/5xx: { error: string }
//
// v9 (2026-05-29): Dev test number bypass. Skip phone-taken check and clear
//   existing profile phone for +12539486670 so it can be reused across test
//   accounts without hitting the unique constraint. Real users are unaffected.
// v8 (2026-04-30): Referral capture. Accepts optional `referralCode` in the
//   signup body. If present, resolves the code → referrer_id, writes
//   profiles.referred_by, and updates the referrals row to link the new user.
//   Reward grant deferred to subscription activation (handled elsewhere).
//   Self-referral and unknown-code attempts are logged and silently ignored
//   so a bad code never blocks a real signup.
// v7 (2026-04-29): DOB age gate hardened.
// v6 (2026-04-29): Dev allowlist for testing.
// v5 (2026-04-28): Generate session token via service-role JWT.
// v4: MX check + disposable blocklist + forbidden TLDs.
// v3: email_confirm=false + generateLink for verification email.

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

function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizeEmail(input: unknown): string {
  return String(input ?? "").trim().toLowerCase();
}

function normalizePhone(input: unknown): string {
  const raw = String(input ?? "").trim();
  if (raw.startsWith("+")) {
    return "+" + raw.slice(1).replace(/[^\d]/g, "");
  }
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return "+" + digits;
}

// Referral codes are generated as P + first 7 chars of user UUID (uppercase).
// We accept any 1–20 char alphanumeric string here and let the DB resolve it.
function normalizeReferralCode(input: unknown): string {
  return String(input ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

const DEV_ALLOWLIST_EMAILS = new Set([
  "mmeyershop@gmail.com",
  "marissameyer8@gmail.com",
]);
const DEV_ALLOWLIST_PHONES = new Set([
  "+12539486670",
]);

function isDevAllowlisted(email: string, phone: string): boolean {
  return DEV_ALLOWLIST_EMAILS.has(email) || DEV_ALLOWLIST_PHONES.has(phone);
}

function isValidISODate(s: string): boolean {
  if (typeof s !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (y < 1900 || y > 2100) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function ageFromDob(dobIso: string): number {
  if (!isValidISODate(dobIso)) return -1;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobIso)!;
  const dobY = parseInt(m[1], 10);
  const dobM = parseInt(m[2], 10);
  const dobD = parseInt(m[3], 10);
  const now = new Date();
  const nowY = now.getUTCFullYear();
  const nowM = now.getUTCMonth() + 1;
  const nowD = now.getUTCDate();
  let age = nowY - dobY;
  if (nowM < dobM || (nowM === dobM && nowD < dobD)) age--;
  return age;
}

const FORBIDDEN_TLDS = new Set([
  "test", "example", "invalid", "localhost", "local", "internal", "lan",
]);

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "mailinator.net", "sogetthis.com", "reallymymail.com",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "guerrillamail.biz", "guerrillamail.de", "sharklasers.com", "grr.la",
  "pokemail.net", "spam4.me",
  "10minutemail.com", "10minutemail.net", "10mail.org",
  "tempmail.com", "temp-mail.org", "tempr.email", "discard.email",
  "discardmail.com", "discardmail.de", "throwawaymail.com",
  "yopmail.com", "yopmail.fr", "yopmail.net",
  "maildrop.cc", "inboxbear.com", "mohmal.com", "fakeinbox.com",
  "trbvm.com", "emailondeck.com", "getnada.com", "nada.email",
  "mintemail.com", "mytemp.email", "tempinbox.com", "jetable.org",
  "dispostable.com", "trashmail.com", "trashmail.net", "trashmail.de",
  "mailnesia.com", "spambox.us", "spamgourmet.com", "spamex.com",
]);

const TYPO_DOMAINS: Record<string, string> = {
  "gail.com": "gmail.com",       "gail.co": "gmail.com",      "gail.cm": "gmail.com",
  "gmial.com": "gmail.com",      "gmal.com": "gmail.com",     "gmaill.com": "gmail.com",
  "gmai.com": "gmail.com",       "gnail.com": "gmail.com",    "gmali.com": "gmail.com",
  "ggmail.com": "gmail.com",     "gmail.co": "gmail.com",     "gmail.cm": "gmail.com",
  "gmail.con": "gmail.com",      "gmail.cmo": "gmail.com",    "gmail.om": "gmail.com",
  "gmail.coom": "gmail.com",     "gmail.comm": "gmail.com",   "gmail.ccom": "gmail.com",
  "yahooo.com": "yahoo.com",     "yaho.com": "yahoo.com",     "yhoo.com": "yahoo.com",
  "yaoo.com": "yahoo.com",       "yahoo.co": "yahoo.com",     "yahoo.cm": "yahoo.com",
  "yahoo.con": "yahoo.com",      "yahho.com": "yahoo.com",    "ahoo.com": "yahoo.com",
  "outloook.com": "outlook.com", "outlok.com": "outlook.com", "oulook.com": "outlook.com",
  "hotmial.com": "hotmail.com",  "hotmal.com": "hotmail.com", "hotmaill.com": "hotmail.com",
  "hotmai.com": "hotmail.com",   "hotmail.co": "hotmail.com", "hotmail.cm": "hotmail.com",
  "hotmail.con": "hotmail.com",  "hormail.com": "hotmail.com",
  "icloud.co": "icloud.com",     "icloud.cm": "icloud.com",   "icoud.com": "icloud.com",
  "iclooud.com": "icloud.com",
  "aol.co": "aol.com",           "aol.cm": "aol.com",         "aoll.com": "aol.com",
  "protonmial.com": "protonmail.com", "protomail.com": "protonmail.com",
};

async function validateEmailDomain(email: string): Promise<string | null> {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return "Please enter a valid email address.";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || !domain.includes(".")) return "Please enter a valid email address.";
  if (/[\s"'<>(),;:[\]\\]/.test(email)) return "Please enter a valid email address.";
  const suggested = TYPO_DOMAINS[domain];
  if (suggested) return `Did you mean ${local}@${suggested}? Please double-check your email and try again.`;
  const tld = domain.split(".").pop()!.toLowerCase();
  if (FORBIDDEN_TLDS.has(tld)) return "That email domain isn't deliverable. Please use a different email.";
  if (DISPOSABLE_DOMAINS.has(domain)) return "Please use a permanent email address — disposable inboxes aren't supported.";
  try {
    let hasMx = false;
    try {
      const mx = await Deno.resolveDns(domain, "MX");
      hasMx = Array.isArray(mx) && mx.length > 0;
    } catch { hasMx = false; }
    if (!hasMx) {
      let hasA = false;
      try {
        const a = await Deno.resolveDns(domain, "A");
        hasA = Array.isArray(a) && a.length > 0;
      } catch { hasA = false; }
      if (!hasA) {
        try {
          const aaaa = await Deno.resolveDns(domain, "AAAA");
          hasA = Array.isArray(aaaa) && aaaa.length > 0;
        } catch { /* ignore */ }
      }
      if (!hasA) return "That email domain doesn't accept mail. Please check for typos.";
    }
  } catch (err) {
    console.warn("[auth/signup] DNS check threw, failing open:", err);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Signup handler
// ---------------------------------------------------------------------------

async function handleSignup(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  const phone = normalizePhone(body.phone);
  const dateOfBirth = String(body.dateOfBirth ?? "").trim();
  const referralCode = normalizeReferralCode(body.referralCode);

  if (!email || !email.includes("@")) return json({ error: "A valid email is required." }, 400);
  if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
  if (!name) return json({ error: "Name is required." }, 400);
  if (!phone || phone.length < 10) return json({ error: "A valid phone number is required." }, 400);
  if (!isValidISODate(dateOfBirth)) return json({ error: "A valid date of birth is required (YYYY-MM-DD)." }, 400);
  if (ageFromDob(dateOfBirth) < 18) return json({ error: "You must be at least 18 to use Parallel." }, 400);

  const emailErr = await validateEmailDomain(email);
  if (emailErr) return json({ error: emailErr }, 400);

  const admin = adminClient();

  // Dev test number bypasses the phone-taken check so it can be reused across
  // test accounts. All other numbers are blocked if already on another profile.
  const isDevTestPhone = phone === "+12539486670";

  if (!isDevTestPhone) {
    const { data: phoneTaken } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (phoneTaken) {
      return json(
        { error: "That phone number is already linked to an account. Try signing in instead." },
        409
      );
    }
  }

  if (!isDevAllowlisted(email, phone)) {
    const { data: banned } = await admin
      .from("banned_identifiers")
      .select("id")
      .or(`phone.eq.${phone},email.eq.${email}`)
      .maybeSingle();
    if (banned) {
      return json({ error: "We couldn't create that account. Please contact support." }, 403);
    }
  } else {
    console.log(`[auth/signup] dev allowlist hit — bypassing banned_identifiers for ${email} / ${phone}`);
  }

  // ── Referral code resolution (v8) ──
  // Resolve the code BEFORE creating the user so we can populate profiles.referred_by
  // in the same insert. If the code is unknown or self-referential, log and ignore —
  // never block a real signup over a bad code.
  let referrerId: string | null = null;
  if (referralCode) {
    const { data: referralRow } = await admin
      .from("referrals")
      .select("referrer_id")
      .eq("referral_code", referralCode)
      .limit(1)
      .maybeSingle();
    if (referralRow?.referrer_id) {
      referrerId = referralRow.referrer_id;
    } else {
      console.warn(`[auth/signup] referral code ${referralCode} did not match any row — ignoring`);
    }
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createErr || !created?.user) {
    const msg = createErr?.message || "Failed to create account.";
    if (
      /already been registered/i.test(msg) ||
      /email_exists/i.test(msg) ||
      /User already registered/i.test(msg)
    ) {
      return json(
        { error: "An account with that email already exists. Try signing in instead." },
        409
      );
    }
    console.error("[auth/signup] createUser failed:", createErr);
    return json({ error: msg }, 500);
  }

  const userId = created.user.id;

  // Ignore self-referral (would only happen if a user pasted their own code).
  if (referrerId === userId) {
    console.warn(`[auth/signup] self-referral attempted by ${userId} — dropping referrer link`);
    referrerId = null;
  }

  // For the dev test number, clear it from any existing profile so the DB
  // unique constraint doesn't block the insert.
  if (isDevTestPhone) {
    await admin.from("profiles").update({ phone: null, phone_verified: false }).neq("id", userId).eq("phone", phone);
  }

  // profiles.referred_by is TEXT, stores the referrer's user_id as a string.
  const profileInsert: Record<string, any> = {
    id: userId,
    name,
    email,
    phone,
    date_of_birth: dateOfBirth,
    email_verified: false,
  };
  if (referrerId) profileInsert.referred_by = referrerId;

  const { error: profileErr } = await admin.from("profiles").insert(profileInsert);

  if (profileErr) {
    console.error("[auth/signup] profile insert failed, rolling back auth user:", profileErr);
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch (rollbackErr) {
      console.error("[auth/signup] rollback also failed:", rollbackErr);
    }

    const msg = profileErr.message || "";
    if (msg.includes("profiles_phone_key") || (msg.includes("duplicate") && msg.includes("phone"))) {
      return json(
        { error: "That phone number is already linked to an account. Try signing in instead." },
        409
      );
    }
    if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
      return json({ error: "An account with that information already exists." }, 409);
    }
    return json({ error: "Could not create profile. Please try again." }, 500);
  }

  await admin
    .from("profiles")
    .update({ email_verified: false })
    .eq("id", userId);

  // ── Referral link in referrals table (v8) ──
  // The referrer originally got a row when they generated their code (referrer_id
  // set, referred_id null). Update that row so we know who the code converted.
  // If multiple existed for the same referrer (shouldn't, but defensive), update
  // the matching one.
  if (referrerId) {
    const { error: linkErr } = await admin
      .from("referrals")
      .update({ referred_id: userId, status: "signed_up" })
      .eq("referrer_id", referrerId)
      .eq("referral_code", referralCode)
      .is("referred_id", null);
    if (linkErr) console.warn("[auth/signup] referral link update failed (non-fatal):", linkErr);
  }

  try {
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    await admin.from("agreements").insert({
      user_id: userId,
      tos_version: "1.0",
      privacy_version: "1.0",
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  } catch (agreementErr) {
    console.warn("[auth/signup] agreement insert failed (non-fatal):", agreementErr);
  }

  const anon = anonClient();
  const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signInData?.session) {
    console.warn("[auth/signup] auto sign-in failed:", signInErr);
    return json(
      { error: "Account created but sign-in failed. Please sign in manually." },
      200
    );
  }

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/email/resend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${signInData.session.access_token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
    });
  } catch (resendErr) {
    console.warn("[auth/signup] verification email send failed (non-fatal):", resendErr);
  }

  return json({
    accessToken: signInData.session.access_token,
    userId,
    emailConfirmed: false,
    referrerLinked: !!referrerId,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/auth\/?/i, "/").replace(/\/$/, "") || "/";

  try {
    if (req.method === "POST" && path === "/signup") {
      return await handleSignup(req);
    }
    if (req.method === "GET" && (path === "/" || path === "/health")) {
      return json({ ok: true, service: "auth", version: "9" });
    }
    return json({ error: "Not found", path }, 404);
  } catch (err) {
    console.error("[auth] unhandled error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

// Parallel — weekly-match-nudge v1
// Sends a weekly push/email nudge to released users who have unacted matches.
// Runs every Thursday at 18:00 UTC via pg_cron.
// Channels: push (OneSignal) first → email fallback (Resend).
// Skips users who have weekly_summary=false or were nudged in the last 6 days.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY") || "";
const ONESIGNAL_APP_ID = "ac575970-18c4-4f71-9ff9-aa323baef90f";

const FROM_ADDRESS = "Parallel <hello@getparallel.vip>";
const APP_URL = "https://getparallel.vip";

const B = { cream: "#FFFFFF", void_: "#0D0D0F", purple: "#7B5EA7", linen: "#E8E4DE", stone: "#8A8690" };
const WORDMARK = `<img src="${APP_URL}/PARA-EL-transparent-dark.png" alt="PARA//EL." width="140" height="auto" style="display:block;border:0;max-width:140px;" />`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isServiceRole(req: Request): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^bearer\s+/i, "").trim();
  const apikey = req.headers.get("apikey") ?? "";
  return token === SUPABASE_SERVICE_ROLE_KEY || apikey === SUPABASE_SERVICE_ROLE_KEY;
}

async function logNotif(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  sent: boolean,
  reason?: string,
) {
  try {
    await admin.from("notification_events").insert({
      user_id: userId,
      category: "weekly_nudge",
      sent,
      skipped_reason: reason ?? null,
    });
  } catch (err) {
    console.error("[weekly-nudge] logNotif failed:", err);
  }
}

async function trySendPush(playerId: string, matchCount: number): Promise<boolean> {
  if (!ONESIGNAL_API_KEY || !playerId) return false;
  const s = matchCount === 1 ? "1 match" : `${matchCount} matches`;
  try {
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${ONESIGNAL_API_KEY}` },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: [playerId],
        headings: { en: "Your matches are waiting" },
        contents: { en: `You have ${s} waiting — open Parallel to see who you've been paired with` },
        data: { type: "weekly_nudge" },
        url: APP_URL,
        web_push_topic: "parallel_match",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function trySendEmail(email: string, name: string | null, matchCount: number): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const firstName = name?.split(" ")[0] ?? null;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const s = matchCount === 1 ? "match" : "matches";
  const subject = `You have ${matchCount} ${s} waiting on Parallel`;
  const heading = `You have ${matchCount} ${s} waiting`;
  const bodyHtml = `<p style="margin:0 0 12px 0;">${greeting}</p><p style="margin:0 0 12px 0;">You have <strong>${matchCount} ${s}</strong> waiting on Parallel. Thursday's a great time to plan something for the weekend — open the app to see who you've been paired with.</p>`;
  const cta = `<tr><td style="padding:8px 32px 32px 32px;text-align:center;"><a href="${APP_URL}" style="display:inline-block;background-color:${B.purple};color:${B.cream};text-decoration:none;padding:14px 40px;border-radius:9999px;font-weight:600;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><span style="color:${B.cream};">See my matches</span></a></td></tr>`;
  const footer = `<p style="margin:0;font-size:12px;line-height:1.6;color:${B.stone};">Parallel — compatibility-first dating.<br>This email was sent to a verified Parallel account. Need help? Reply to this email.</p>`;
  const html = [
    `<!doctype html><html lang="en">`,
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="color-scheme" content="only light"><meta name="supported-color-schemes" content="light">`,
    `<style>:root{color-scheme:only light;}[data-ogsc] body,[data-ogsb] body{background:${B.cream}!important;color:${B.void_}!important;}</style>`,
    `</head><body style="margin:0;padding:0;background-color:${B.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${B.void_};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${B.cream};padding:32px 16px;">`,
    `<tr><td align="center">`,
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:${B.cream};border:1px solid ${B.linen};border-radius:16px;overflow:hidden;">`,
    `<tr><td style="padding:32px 32px 8px 32px;">${WORDMARK}</td></tr>`,
    `<tr><td style="padding:8px 32px 0 32px;"><h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;font-weight:600;color:${B.void_};">${heading}</h1></td></tr>`,
    `<tr><td style="padding:0 32px;font-size:15px;line-height:1.6;color:${B.void_};">${bodyHtml}</td></tr>`,
    cta,
    `<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid ${B.linen};">${footer}</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
  const text = [
    greeting, "",
    `You have ${matchCount} ${s} waiting on Parallel.`,
    `Thursday's a great time to plan something for the weekend — open the app to see who you've been paired with.`,
    "", APP_URL,
  ].join("\n");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: email, subject, html, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/weekly-match-nudge\/?/i, "/").replace(/\/$/, "") || "/";

  if ((path === "/" || path === "/health") && req.method === "GET") {
    return json({ ok: true, service: "weekly-match-nudge", version: "1" });
  }

  if (!isServiceRole(req)) return json({ error: "Unauthorized" }, 401);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = adminClient();
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

  // 1. All released, onboarded users
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, name, email, email_verified, onesignal_player_id")
    .eq("has_completed_onboarding", true)
    .in("release_status", ["released", "released_paying"]);

  if (profErr) { console.error("[weekly-nudge] profiles query", profErr); return json({ error: "DB error" }, 500); }

  const allIds = (profiles ?? []).map((p: any) => p.id);
  if (allIds.length === 0) return json({ ok: true, sent: 0, skipped: 0, total: 0 });

  // 2. Notification prefs — filter out opted-out and recently-nudged users
  const { data: prefs } = await admin
    .from("notification_preferences")
    .select("user_id, push_enabled, email_enabled, weekly_summary, last_nudge_at")
    .in("user_id", allIds);

  const prefMap = new Map<string, any>();
  for (const p of prefs ?? []) prefMap.set(p.user_id, p);

  const eligible = (profiles ?? []).filter((p: any) => {
    const pref = prefMap.get(p.id);
    if (pref?.weekly_summary === false) return false;
    if (pref?.last_nudge_at && new Date(pref.last_nudge_at) > new Date(sixDaysAgo)) return false;
    return true;
  });

  if (eligible.length === 0) return json({ ok: true, sent: 0, skipped: 0, total: 0 });
  const eligibleIds = eligible.map((p: any) => p.id);

  // 3. Count unacted matches — in matches table but no like/pass in match_interactions
  const [matchRes, actedRes] = await Promise.all([
    admin.from("matches").select("user_id, matched_user_id").in("user_id", eligibleIds),
    admin.from("match_interactions").select("user_id, matched_user_id").in("user_id", eligibleIds).in("action", ["like", "pass"]),
  ]);

  const actedSet = new Set<string>();
  for (const r of actedRes.data ?? []) actedSet.add(`${r.user_id}:${r.matched_user_id}`);

  const unactedCount = new Map<string, number>();
  for (const r of matchRes.data ?? []) {
    if (!actedSet.has(`${r.user_id}:${r.matched_user_id}`)) {
      unactedCount.set(r.user_id, (unactedCount.get(r.user_id) ?? 0) + 1);
    }
  }

  const profileMap = new Map<string, any>();
  for (const p of eligible) profileMap.set((p as any).id, p);

  let sent = 0, skipped = 0;
  const now = new Date().toISOString();

  for (const userId of eligibleIds) {
    const count = unactedCount.get(userId) ?? 0;
    if (count === 0) { skipped++; continue; }

    const profile = profileMap.get(userId);
    const pref = prefMap.get(userId);
    let notified = false;

    // Push first
    if (profile?.onesignal_player_id && pref?.push_enabled !== false) {
      const ok = await trySendPush(profile.onesignal_player_id, count);
      if (ok) { await logNotif(admin, userId, true); notified = true; }
    }

    // Email fallback
    if (!notified && pref?.email_enabled !== false && profile?.email && profile?.email_verified) {
      const ok = await trySendEmail(profile.email, profile.name, count);
      if (ok) { await logNotif(admin, userId, true); notified = true; }
      else await logNotif(admin, userId, false, "email_failed");
    }

    if (notified) {
      await admin.from("notification_preferences").upsert(
        { user_id: userId, last_nudge_at: now },
        { onConflict: "user_id" },
      );
      sent++;
    } else {
      if (!profile?.onesignal_player_id && (!profile?.email || !profile?.email_verified)) {
        await logNotif(admin, userId, false, "no_channel");
      }
      skipped++;
    }
  }

  console.log(`[weekly-nudge] done. sent=${sent} skipped=${skipped} total=${eligibleIds.length}`);
  return json({ ok: true, sent, skipped, total: eligibleIds.length });
});

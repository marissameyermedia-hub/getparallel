// date-reminders v1 — cron-triggered edge function
// Runs daily at 10:00 UTC. Finds scheduled_dates happening tomorrow
// and inserts a reminder message into each conversation from the proposer.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function formatTime(hour: number | null): string {
  if (hour === null || hour === undefined) return "";
  const period = hour >= 12 ? "pm" : "am";
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return ` at ${h}${period}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Accept both cron invocations (GET/POST from pg_cron via service role) and
  // manual POST calls authenticated with a shared CRON_SECRET header.
  const authHeader = req.headers.get("authorization") ?? "";
  const isCronSecret = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
  const isServiceRole = authHeader.includes(SUPABASE_SERVICE_ROLE_KEY);

  if (!isCronSecret && !isServiceRole) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = adminClient();

  // Find dates that start tomorrow (UTC date window)
  const tomorrowStart = new Date();
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
  tomorrowStart.setUTCHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setUTCDate(tomorrowEnd.getUTCDate() + 1);

  const { data: upcoming, error: fetchErr } = await admin
    .from("scheduled_dates")
    .select("id, conversation_id, proposer_id, venue_name, date_iso, time_hour, label")
    .eq("reminder_sent", false)
    .gte("date_iso", tomorrowStart.toISOString())
    .lt("date_iso", tomorrowEnd.toISOString());

  if (fetchErr) return json({ error: fetchErr.message }, 500);
  if (!upcoming || upcoming.length === 0) return json({ sent: 0 });

  let sent = 0;
  const errors: string[] = [];

  for (const date of upcoming) {
    try {
      const timeStr = date.label
        ? ` (${date.label.split(" at ")[1] ?? date.label})`
        : formatTime(date.time_hour);
      const reminderText = `Just a heads up — you have a date at ${date.venue_name} tomorrow${timeStr}! See you there.`;

      const { error: msgErr } = await admin.from("messages").insert({
        conversation_id: date.conversation_id,
        sender_id: date.proposer_id,
        text: reminderText,
      });

      if (msgErr) throw new Error(msgErr.message);

      await admin.from("scheduled_dates").update({ reminder_sent: true }).eq("id", date.id);
      sent++;
    } catch (err) {
      errors.push(`${date.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return json({ sent, errors: errors.length > 0 ? errors : undefined });
});

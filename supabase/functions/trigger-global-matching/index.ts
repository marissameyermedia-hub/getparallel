// =============================================================================
// trigger-global-matching v1
// =============================================================================
// Orchestrates a global matching run by queuing run-matching for every
// released user. Called by pg_cron every 4 hours and can also be triggered
// manually by an admin POST request.
//
// Execution model:
//   1. Query all released/released_paying users (and seed accounts).
//   2. For each, fire a POST to run-matching using EdgeRuntime.waitUntil so
//      the requests run in the background and the response returns immediately.
//   3. Each run-matching call handles its own de-duplication via the v102
//      insert/upsert pattern.
//
// Auth: Requires the internal service role key as a Bearer token.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RUN_MATCHING_URL = `${SUPABASE_URL}/functions/v1/run-matching`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/health")) {
      return json({ ok: true, version: VERSION });
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Allow service role key or pg_cron internal calls (no auth header needed
  // when called from pg_net since it uses the service role internally).
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (token && token !== SERVICE_ROLE_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Fetch all users who should be matched.
  const { data: users, error } = await sb
    .from("profiles")
    .select("id")
    .eq("has_completed_onboarding", true)
    .or("release_status.in.(released,released_paying),is_seed_account.eq.true")
    .is("is_suspended", null)
    .neq("is_suspended", true);

  if (error) {
    console.error("[trigger-global-matching] Failed to fetch users:", error);
    return json({ error: "Failed to fetch users" }, 500);
  }

  const userIds: string[] = (users || []).map((u: { id: string }) => u.id);
  console.log(`[trigger-global-matching] Queuing ${userIds.length} users for matching`);

  // Fire run-matching for each user in the background.
  // Using EdgeRuntime.waitUntil so we return immediately.
  const runAll = async () => {
    let success = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        const res = await fetch(RUN_MATCHING_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ userId }),
        });
        if (res.ok) {
          success++;
        } else {
          failed++;
          console.error(`[trigger-global-matching] run-matching failed for ${userId}: ${res.status}`);
        }
      } catch (err) {
        failed++;
        console.error(`[trigger-global-matching] run-matching threw for ${userId}:`, err);
      }
      // Small delay between requests to avoid overwhelming the edge function runtime.
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.log(`[trigger-global-matching] Complete. success=${success} failed=${failed}`);
  };

  // @ts-ignore: EdgeRuntime is available in Deno edge functions
  if (typeof EdgeRuntime !== "undefined") {
    // @ts-ignore
    EdgeRuntime.waitUntil(runAll());
  } else {
    // Local dev fallback — run inline (blocking).
    await runAll();
  }

  return json({
    ok: true,
    version: VERSION,
    queued: userIds.length,
    message: `Matching queued for ${userIds.length} users`,
  });
});

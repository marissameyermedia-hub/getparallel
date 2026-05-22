// Parallel — messages edge function v12
// v10: adds GET /starters — 4 AI-generated initial conversation starters per match.
//      Generated once, cached forever on conversations.ai_starters (jsonb).
// v12: Fix push notification heading "Notification" → "New message".
// v11: SMS fallback for new-message notifications.
//      Push fires if onesignal_player_id exists and push_enabled=true.
//      If no push, and sms_enabled=true + phone verified + not opted out,
//      sends an SMS digest via Telnyx with a 4-hour cooldown per user.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY") || "";
const ONESIGNAL_APP_ID = "ac575970-18c4-4f71-9ff9-aa323baef90f";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const TELNYX_API_KEY = Deno.env.get("TELNYX_API_KEY") || "";
const TELNYX_FROM_NUMBER = Deno.env.get("TELNYX_FROM_NUMBER") || "";
const TELNYX_MESSAGING_PROFILE_ID = Deno.env.get("TELNYX_MESSAGING_PROFILE_ID") || "";
const SMS_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

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

async function getOrCreateConversation(admin: ReturnType<typeof adminClient>, userA: string, userB: string) {
  const [a, b] = [userA, userB].sort();
  const { data: existing } = await admin.from("conversations").select("id, user_id_1, user_id_2, created_at").eq("user_id_1", a).eq("user_id_2", b).maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await admin.from("conversations").insert({ user_id_1: a, user_id_2: b }).select("id, user_id_1, user_id_2, created_at").single();
  if (error) throw error;
  return created;
}

async function logNotifEvent(admin: ReturnType<typeof adminClient>, userId: string, category: string, sent: boolean, skippedReason?: string, onesignalResponse?: unknown) {
  try {
    await admin.from("notification_events").insert({ user_id: userId, category, sent, skipped_reason: skippedReason ?? null, onesignal_response: onesignalResponse ?? null });
  } catch (err) { console.error("[logNotifEvent] failed:", err); }
}

async function sendPushToRecipient(recipientId: string, senderName: string, senderId: string) {
  const admin = adminClient();
  try {
    const [prefRes, profileRes] = await Promise.all([
      admin.from("notification_preferences")
        .select("push_enabled, messages, sms_enabled, last_sms_notification_at")
        .eq("user_id", recipientId).maybeSingle(),
      admin.from("profiles")
        .select("onesignal_player_id, phone, phone_verified")
        .eq("id", recipientId).maybeSingle(),
    ]);
    const prefs = prefRes.data;
    const playerId = profileRes.data?.onesignal_player_id;

    // Push is active when: API key set, player ID registered, neither push nor category disabled.
    const hasPush = !!(
      ONESIGNAL_API_KEY &&
      playerId &&
      prefs?.push_enabled !== false &&
      prefs?.messages !== false
    );

    if (hasPush) {
      const firstName = senderName.split(" ")[0];
      const collapseId = `msg_${recipientId.slice(0, 8)}_${senderId.slice(0, 8)}`;
      const res = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Basic ${ONESIGNAL_API_KEY}` },
        body: JSON.stringify({ app_id: ONESIGNAL_APP_ID, include_player_ids: [playerId], headings: { en: "New message" }, contents: { en: `${firstName} sent you a message` }, url: `https://getparallel.vip/?notify=message&from=${senderId}`, web_push_topic: "new_message", collapse_id: collapseId }),
      });
      const responseJson = await res.json().catch(() => null);
      await logNotifEvent(admin, recipientId, "message", res.ok, res.ok ? undefined : "onesignal_error", responseJson);
      return; // Push sent — SMS not needed.
    }

    // Log why push was skipped.
    const pushSkipReason = !ONESIGNAL_API_KEY ? "no_api_key"
      : !playerId ? "no_player_id"
      : prefs?.push_enabled === false ? "push_disabled"
      : "category_disabled";
    await logNotifEvent(admin, recipientId, "message", false, pushSkipReason);

    // ── SMS fallback ──────────────────────────────────────────────────────────
    if (!TELNYX_API_KEY || !TELNYX_FROM_NUMBER) return; // Telnyx not configured
    if (prefs?.sms_enabled !== true) return;            // User hasn't opted in to SMS

    const phone = profileRes.data?.phone;
    const phoneVerified = profileRes.data?.phone_verified === true;
    if (!phone || !phoneVerified) return;

    // Opt-out check.
    const { data: optOut } = await admin.from("sms_opt_outs").select("phone").eq("phone", phone).maybeSingle();
    if (optOut) return;

    // 4-hour cooldown — never double-text within a session.
    const lastSms = prefs?.last_sms_notification_at;
    if (lastSms && Date.now() - new Date(lastSms).getTime() < SMS_COOLDOWN_MS) {
      await logNotifEvent(admin, recipientId, "message_sms", false, "cooldown_active");
      return;
    }

    // Count unread messages (last 30 days) so the digest is accurate.
    let unreadCount = 1;
    const { data: convs } = await admin.from("conversations")
      .select("id")
      .or(`user_id_1.eq.${recipientId},user_id_2.eq.${recipientId}`);
    const convIds = (convs ?? []).map((c: any) => c.id);
    if (convIds.length > 0) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: fromOthers } = await admin.from("messages")
        .select("id")
        .in("conversation_id", convIds)
        .neq("sender_id", recipientId)
        .gte("created_at", since);
      if (fromOthers && fromOthers.length > 0) {
        const allIds = fromOthers.map((m: any) => m.id);
        const { data: reads } = await admin.from("message_reads")
          .select("message_id")
          .eq("user_id", recipientId)
          .in("message_id", allIds);
        const readSet = new Set((reads ?? []).map((r: any) => r.message_id));
        const computed = fromOthers.filter((m: any) => !readSet.has(m.id)).length;
        if (computed > 0) unreadCount = computed;
      }
    }

    const msgText = unreadCount === 1
      ? `You have a new message on Parallel. Open the app: https://getparallel.vip`
      : `You have ${unreadCount} unread messages on Parallel. Open the app: https://getparallel.vip`;

    const telnyxBody: Record<string, string> = { to: phone, text: msgText, from: TELNYX_FROM_NUMBER };
    if (TELNYX_MESSAGING_PROFILE_ID) telnyxBody.messaging_profile_id = TELNYX_MESSAGING_PROFILE_ID;

    const telnyxRes = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TELNYX_API_KEY}` },
      body: JSON.stringify(telnyxBody),
    });
    const telnyxJson = await telnyxRes.json().catch(() => null);
    await logNotifEvent(admin, recipientId, "message_sms", telnyxRes.ok, telnyxRes.ok ? undefined : "telnyx_error", telnyxJson);

    if (telnyxRes.ok) {
      // Record cooldown timestamp so next message within 4h is suppressed.
      await admin.from("notification_preferences").upsert(
        { user_id: recipientId, last_sms_notification_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    }
  } catch (err) {
    console.error("[push/sms] failed:", err);
    await logNotifEvent(admin, recipientId, "message", false, "exception");
  }
}

async function handleConversationsList(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const { data: convoRows, error: convErr } = await admin.from("conversations").select("id, user_id_1, user_id_2, created_at").or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`).order("created_at", { ascending: false });
  if (convErr) return json({ error: "Failed to load conversations" }, 500);
  if (!convoRows || convoRows.length === 0) return json({ conversations: [] });
  const otherIds = new Set<string>(); const convoIds: string[] = [];
  for (const c of convoRows) { convoIds.push(c.id); otherIds.add(c.user_id_1 === user.id ? c.user_id_2 : c.user_id_1); }
  const [profilesRes, photosRes, lastMsgRes] = await Promise.all([
    admin.from("profiles").select("id, name").in("id", Array.from(otherIds)),
    admin.from("user_photos").select("user_id, photo_url, position").in("user_id", Array.from(otherIds)).order("position", { ascending: true }),
    admin.from("messages").select("conversation_id, text, created_at, sender_id").in("conversation_id", convoIds).order("created_at", { ascending: false }),
  ]);
  const usersById = new Map<string, any>(); const photosByUser = new Map<string, string>();
  for (const p of photosRes.data ?? []) { if (!photosByUser.has(p.user_id)) photosByUser.set(p.user_id, p.photo_url); }
  for (const p of profilesRes.data ?? []) { usersById.set(p.id, { id: p.id, name: p.name ?? "", photoUrl: photosByUser.get(p.id) ?? "" }); }
  const latestByConvo = new Map<string, any>();
  for (const m of lastMsgRes.data ?? []) { if (!latestByConvo.has(m.conversation_id)) latestByConvo.set(m.conversation_id, { text: m.text, created_at: m.created_at, sender_id: m.sender_id }); }
  const conversations = convoRows.map((c) => {
    const otherId = c.user_id_1 === user.id ? c.user_id_2 : c.user_id_1;
    const otherUser = usersById.get(otherId) ?? { id: otherId, name: "Unknown", photoUrl: "" };
    const last = latestByConvo.get(c.id);
    return { id: c.id, user_id_1: c.user_id_1, user_id_2: c.user_id_2, created_at: c.created_at, last_message_at: last?.created_at ?? null, last_message: last?.text ?? null, user1: c.user_id_1 === otherId ? otherUser : { id: user.id, name: "", photoUrl: "" }, user2: c.user_id_2 === otherId ? otherUser : { id: user.id, name: "", photoUrl: "" } };
  });
  conversations.sort((a, b) => { const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0; const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0; if (tb !== ta) return tb - ta; return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); });
  return json({ conversations });
}

async function handleMessagesList(req: Request, matchId: string) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const admin = adminClient();
  const conversation = await getOrCreateConversation(admin, user.id, matchId);
  const { data: messages, error } = await admin.from("messages").select("id, sender_id, text, created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: true });
  if (error) return json({ error: "Failed to load messages" }, 500);
  return json({ conversationId: conversation.id, messages: (messages ?? []).map((m) => ({ id: m.id, senderId: m.sender_id, text: m.text, created_at: m.created_at })) });
}

async function handleMarkRead(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const matchId = String(body.matchId ?? "").trim();
  if (!matchId) return json({ error: "Missing matchId" }, 400);
  const admin = adminClient();
  const conversation = await getOrCreateConversation(admin, user.id, matchId);
  const { data: theirMessages } = await admin.from("messages").select("id").eq("conversation_id", conversation.id).eq("sender_id", matchId);
  if (!theirMessages || theirMessages.length === 0) return json({ success: true, count: 0 });
  const messageIds = theirMessages.map((m) => m.id);
  const { data: alreadyRead } = await admin.from("message_reads").select("message_id").eq("user_id", user.id).in("message_id", messageIds);
  const readSet = new Set((alreadyRead ?? []).map((r) => r.message_id));
  const newlyRead = messageIds.filter((id) => !readSet.has(id));
  if (newlyRead.length === 0) return json({ success: true, count: 0 });
  const { error } = await admin.from("message_reads").insert(newlyRead.map((id) => ({ message_id: id, user_id: user.id, read_at: new Date().toISOString() })));
  if (error) return json({ error: "Failed to mark read" }, 500);
  return json({ success: true, count: newlyRead.length });
}

async function handleRealtimeConfig(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const url = new URL(req.url); const matchId = url.searchParams.get("matchId") ?? "";
  if (!matchId) return json({ error: "Missing matchId" }, 400);
  const admin = adminClient();
  const conversation = await getOrCreateConversation(admin, user.id, matchId);
  return json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY, conversationId: conversation.id, filter: `conversation_id=eq.${conversation.id}` });
}

async function handleMessageSend(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const matchId = String(body.matchId ?? "").trim();
  const text = String(body.text ?? "").trim();
  if (!matchId) return json({ error: "Missing matchId" }, 400);
  if (!text) return json({ error: "Empty message" }, 400);
  if (text.length > 4000) return json({ error: "Message too long" }, 400);
  if (matchId === user.id) return json({ error: "Cannot message self" }, 400);
  const admin = adminClient();
  const { data: theirLike } = await admin.from("match_interactions").select("id").eq("user_id", matchId).eq("matched_user_id", user.id).eq("action", "like").maybeSingle();
  const { data: myLike } = await admin.from("match_interactions").select("id").eq("user_id", user.id).eq("matched_user_id", matchId).eq("action", "like").maybeSingle();
  if (!theirLike || !myLike) return json({ error: "Not a mutual match" }, 403);
  const { data: blocks } = await admin.from("blocked_users").select("user_id, blocked_user_id").or(`and(user_id.eq.${user.id},blocked_user_id.eq.${matchId}),and(user_id.eq.${matchId},blocked_user_id.eq.${user.id})`);
  if (blocks && blocks.length > 0) return json({ error: "Conversation no longer available" }, 403);
  const conversation = await getOrCreateConversation(admin, user.id, matchId);
  const { data: inserted, error } = await admin.from("messages").insert({ conversation_id: conversation.id, sender_id: user.id, text }).select("id, sender_id, text, created_at").single();
  if (error) return json({ error: "Failed to send message" }, 500);
  const senderId = user.id;
  admin.from("profiles").select("name").eq("id", senderId).maybeSingle().then(({ data }) => { sendPushToRecipient(matchId, data?.name ?? "Someone", senderId); });
  return json({ success: true, message: { id: inserted.id, senderId: inserted.sender_id, text: inserted.text, created_at: inserted.created_at }, conversationId: conversation.id });
}

const PHONE_REGEX = /\b\d{3}[-.[\s]?\d{3}[-.[\s]?\d{4}\b/;
const CONTACT_KEYWORDS = ["instagram","ig handle","snapchat","snap me","my number","text me","call me","dm me","venmo"];
function hasContactShareSignal(text: string): boolean {
  if (PHONE_REGEX.test(text)) return true;
  const lower = text.toLowerCase();
  for (const kw of CONTACT_KEYWORDS) { if (new RegExp(`\\b${kw.replace(/\s+/g,"\\s+")}\\b`,"i").test(lower)) return true; }
  return false;
}

async function handleMetBannerEligibility(req: Request) {
  const user = await getUserFromAuth(req); if (!user) return json({ error: "Unauthorized" }, 401);
  const url = new URL(req.url); const matchId = url.searchParams.get("matchId") ?? "";
  if (!matchId) return json({ error: "Missing matchId" }, 400);
  const admin = adminClient(); const [a,b]=[user.id,matchId].sort();
  const {data:conversation} = await admin.from("conversations").select("id, created_at").eq("user_id_1",a).eq("user_id_2",b).maybeSingle();
  if (!conversation) return json({eligible:false,reason:null,snoozeUntil:null});
  const [blockRes,unmatchRes,bannerStateRes,dateConfirmRes,profilesRes] = await Promise.all([
    admin.from("blocked_users").select("id",{count:"exact",head:true}).or(`and(user_id.eq.${user.id},blocked_user_id.eq.${matchId}),and(user_id.eq.${matchId},blocked_user_id.eq.${user.id})`),
    admin.from("match_interactions").select("id",{count:"exact",head:true}).in("action",["pass","unmatch"]).or(`and(user_id.eq.${user.id},matched_user_id.eq.${matchId}),and(user_id.eq.${matchId},matched_user_id.eq.${user.id})`).gt("created_at",conversation.created_at),
    admin.from("met_banner_state").select("status, snooze_until").eq("conversation_id",conversation.id).maybeSingle(),
    admin.from("date_confirmations").select("id",{count:"exact",head:true}).or(`and(user_id.eq.${user.id},matched_user_id.eq.${matchId}),and(user_id.eq.${matchId},matched_user_id.eq.${user.id})`),
    admin.from("profiles").select("id, email, is_suspended, is_seed_account").in("id",[user.id,matchId]),
  ]);
  if ((blockRes.count??0)>0) return json({eligible:false,reason:"blocked",snoozeUntil:null});
  if ((unmatchRes.count??0)>0) return json({eligible:false,reason:"unmatched",snoozeUntil:null});
  const bs=bannerStateRes.data;
  if (bs?.status==="confirmed"||bs?.status==="dismissed_permanent") return json({eligible:false,reason:bs.status,snoozeUntil:null});
  if (bs?.snooze_until&&new Date(bs.snooze_until)>new Date()) return json({eligible:false,reason:"snoozed",snoozeUntil:bs.snooze_until});
  if ((dateConfirmRes.count??0)>0) return json({eligible:false,reason:"already_confirmed",snoozeUntil:null});
  for (const p of (profilesRes.data??[])) {
    if (p.is_suspended) return json({eligible:false,reason:"suspended",snoozeUntil:null});
    if (p.is_seed_account) return json({eligible:false,reason:"seed_account",snoozeUntil:null});
    if (p.email?.toLowerCase().includes("test")&&p.email.toLowerCase().endsWith("@getparallel.vip")) return json({eligible:false,reason:"test_account",snoozeUntil:null});
  }
  const {data:msgRows}=await admin.from("messages").select("text, created_at").eq("conversation_id",conversation.id).order("created_at",{ascending:false}).limit(1000);
  const msgs=msgRows??[]; const msgCount=msgs.length;
  if (msgCount===0) return json({eligible:false,reason:"no_messages",snoozeUntil:null});
  const totalChars=msgs.reduce((s,m)=>s+(m.text?.length??0),0);
  const lastMsgAgeDays=(Date.now()-new Date(msgs[0].created_at).getTime())/86400000;
  const firstMsgAgeDays=(Date.now()-new Date(msgs[msgs.length-1].created_at).getTime())/86400000;
  for (const msg of msgs.slice(0,50)){if(hasContactShareSignal(msg.text??""))return json({eligible:true,reason:"moved-offline-detected",snoozeUntil:null});}
  if (msgCount>=20&&lastMsgAgeDays>=3&&totalChars>=300) return json({eligible:true,reason:"active-then-quiet",snoozeUntil:null});
  if (msgCount>=40&&firstMsgAgeDays>=7&&totalChars>=1500) return json({eligible:true,reason:"sustained-chemistry",snoozeUntil:null});
  if (msgCount>=10&&lastMsgAgeDays>=5&&totalChars>=300) return json({eligible:true,reason:"long-stall",snoozeUntil:null});
  if (firstMsgAgeDays>=14&&msgCount>=10&&totalChars>=300) return json({eligible:true,reason:"timer-fallback",snoozeUntil:null});
  return json({eligible:false,reason:null,snoozeUntil:null});
}

async function handleMetBannerAction(req: Request) {
  const user = await getUserFromAuth(req); if (!user) return json({ error: "Unauthorized" }, 401);
  let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const matchId=String(body.matchId??"").trim(); const action=String(body.action??"").trim();
  const source=["banner","kebab"].includes(String(body.source??""))?String(body.source):"banner";
  if (!matchId) return json({error:"Missing matchId"},400);
  if (!["confirmed","not-yet","never","dismissed"].includes(action)) return json({error:"Invalid action"},400);
  const admin=adminClient(); const [a,b]=[user.id,matchId].sort();
  const {data:conversation}=await admin.from("conversations").select("id").eq("user_id_1",a).eq("user_id_2",b).maybeSingle();
  if (!conversation) return json({error:"Conversation not found"},404);
  const now=new Date().toISOString();
  if (action==="confirmed") {
    await admin.from("date_confirmations").upsert({user_id:user.id,matched_user_id:matchId,confirmed_at:now,source},{onConflict:"user_id,matched_user_id"});
    await admin.from("met_banner_state").upsert({conversation_id:conversation.id,status:"confirmed",snooze_until:null,triggered_by:source,last_evaluated_at:now,updated_at:now},{onConflict:"conversation_id"});
    const {data:tc}=await admin.from("date_confirmations").select("id").eq("user_id",matchId).eq("matched_user_id",user.id).maybeSingle();
    return json({success:true,bothConfirmed:!!tc});
  }
  if (action==="not-yet") { await admin.from("met_banner_state").upsert({conversation_id:conversation.id,status:"snoozed",snooze_until:new Date(Date.now()+7*86400000).toISOString(),last_evaluated_at:now,updated_at:now},{onConflict:"conversation_id"}); return json({success:true}); }
  if (action==="never") { await admin.from("met_banner_state").upsert({conversation_id:conversation.id,status:"dismissed_permanent",snooze_until:null,last_evaluated_at:now,updated_at:now},{onConflict:"conversation_id"}); return json({success:true}); }
  if (action==="dismissed") { await admin.from("met_banner_state").upsert({conversation_id:conversation.id,status:"snoozed",snooze_until:new Date(Date.now()+3*86400000).toISOString(),last_evaluated_at:now,updated_at:now},{onConflict:"conversation_id"}); return json({success:true}); }
  return json({success:true});
}

// ── Static fallback starters — used when AI is unavailable ───────────────────
const FALLBACK_STARTERS = [
  "What's something you've been looking forward to this week?",
  "If you could go anywhere right now, where would it be?",
  "What's the best thing you've eaten recently?",
  "Are you more of a plan-everything or figure-it-out-as-you-go person?",
  "What's been taking up most of your time lately?",
  "What's a spot in the city you keep meaning to check out?",
];

function pickFallback(conversationId: string): string {
  // Deterministic per conversation so both users see the same fallback
  let hash = 0;
  for (let i = 0; i < conversationId.length; i++) { hash = (hash * 31 + conversationId.charCodeAt(i)) >>> 0; }
  return FALLBACK_STARTERS[hash % FALLBACK_STARTERS.length];
}

async function logAiCost(admin: ReturnType<typeof adminClient>, userId: string, model: string, inputTokens: number, outputTokens: number, feature = "unsticker") {
  // Claude Haiku 3.5 pricing: $0.80/1M input, $4.00/1M output
  const costUsd = (inputTokens * 0.80 / 1_000_000) + (outputTokens * 4.00 / 1_000_000);
  try {
    await admin.from("ai_cost_log").insert({ feature, user_id: userId, model, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd });
  } catch (err) { console.error("[ai_cost_log] failed:", err); }
}

async function handleUnsticker(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId") ?? "";
  if (!matchId) return json({ error: "Missing matchId" }, 400);
  if (matchId === user.id) return json({ error: "Invalid matchId" }, 400);

  const admin = adminClient();

  // Check feature flag
  const { data: flag } = await admin.from("feature_flags").select("enabled").eq("flag_key", "feature_unsticker_enabled").maybeSingle();
  if (!flag?.enabled) return json({ error: "Feature not available" }, 403);

  // Verify user is a participant in a conversation with matchId
  const [a, b] = [user.id, matchId].sort();
  const { data: conversation } = await admin.from("conversations").select("id").eq("user_id_1", a).eq("user_id_2", b).maybeSingle();
  if (!conversation) return json({ error: "Conversation not found" }, 404);

  // Per-user rate limit: max 3 AI calls per conversation per 24h
  const rateLimitWindow = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: recentCount } = await admin.from("ai_cost_log")
    .select("id", { count: "exact", head: true })
    .eq("feature", "unsticker")
    .eq("user_id", user.id)
    .gte("created_at", rateLimitWindow);
  // Return cached starter if rate limited — don't surface an error
  const isRateLimited = (recentCount ?? 0) >= 3;

  // Check cache (valid for 24h)
  const { data: cached } = await admin.from("conversation_starters")
    .select("starter_text")
    .eq("conversation_id", conversation.id)
    .gt("expires_at", new Date().toISOString())
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) return json({ starter: cached.starter_text, cached: true });
  if (isRateLimited) return json({ starter: pickFallback(conversation.id), cached: false, fallback: true });

  if (!ANTHROPIC_API_KEY) return json({ starter: pickFallback(conversation.id), cached: false, fallback: true });

  // Gather match context — questionnaire overlap only, no message content
  const [matchA, matchB, profilesRes, answersRes] = await Promise.all([
    admin.from("matches").select("shared_hobbies, why_you_matched, breakdown, compatibility_score").eq("user_id", user.id).eq("matched_user_id", matchId).maybeSingle(),
    admin.from("matches").select("shared_hobbies, why_you_matched, breakdown, compatibility_score").eq("user_id", matchId).eq("matched_user_id", user.id).maybeSingle(),
    admin.from("profiles").select("id, career, city, relationship_intention, children_status").in("id", [user.id, matchId]),
    admin.from("user_answers").select("user_id, answers").in("user_id", [user.id, matchId]),
  ]);

  const matchData = matchA.data ?? matchB.data;
  const profiles = profilesRes.data ?? [];
  const answers = answersRes.data ?? [];

  // Build context strings
  const sharedHobbies: string[] = matchData?.shared_hobbies ?? [];
  const whyMatched: string[] = matchData?.why_you_matched ?? [];
  const compatScore = matchData?.compatibility_score ?? null;

  const profileMap = new Map(profiles.map(p => [p.id, p]));
  const userProfile = profileMap.get(user.id);
  const matchProfile = profileMap.get(matchId);

  const answersMap = new Map(answers.map(a => [a.user_id, a.answers]));
  const userAnswers = answersMap.get(user.id) ?? {};
  const matchAnswers = answersMap.get(matchId) ?? {};

  // Extract high-level structured fields from answers (no free-text)
  const safeKeys = ["relationship_intention", "children_status", "politics", "religion", "love_language", "attachment_style"];
  const overlapPoints: string[] = [];
  for (const key of safeKeys) {
    const uVal = userAnswers[key]; const mVal = matchAnswers[key];
    if (uVal && mVal && uVal === mVal) overlapPoints.push(`${key.replace(/_/g, " ")}: ${uVal}`);
  }

  // Build prompt
  const contextLines: string[] = [];
  if (sharedHobbies.length > 0) contextLines.push(`Shared interests: ${sharedHobbies.slice(0, 5).join(", ")}`);
  if (whyMatched.length > 0) contextLines.push(`Why they matched: ${whyMatched.slice(0, 3).join("; ")}`);
  if (overlapPoints.length > 0) contextLines.push(`Things they have in common: ${overlapPoints.slice(0, 3).join(", ")}`);
  if (userProfile?.city && matchProfile?.city && userProfile.city === matchProfile.city) {
    contextLines.push(`Both based in ${userProfile.city}`);
  } else if (userProfile?.city || matchProfile?.city) {
    const cities = [userProfile?.city, matchProfile?.city].filter(Boolean);
    if (cities.length > 0) contextLines.push(`Cities: ${cities.join(" / ")}`);
  }
  if (compatScore !== null) contextLines.push(`Compatibility score: ${compatScore}%`);

  const contextBlock = contextLines.length > 0
    ? contextLines.join("\n")
    : "Limited overlap data available — write something warm and open-ended.";

  const systemPrompt = `You write one natural, warm conversation starter for Parallel, a premium dating app. Parallel is dry, premium, and anti-marketing. Write ONE sentence only. No exclamation points. Reference something specific the two people share if possible. The starter should invite a response without being an interview question. Max 120 characters.`;

  const userPrompt = `Two people matched on Parallel and haven't messaged in 2+ days. Here's their overlap:\n${contextBlock}\n\nWrite one conversation starter one of them could send to re-open the thread.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!aiRes.ok) throw new Error(`Anthropic API error: ${aiRes.status}`);

    const aiData = await aiRes.json();
    const rawText: string = aiData.content?.[0]?.text?.trim() ?? "";
    const inputTokens: number = aiData.usage?.input_tokens ?? 0;
    const outputTokens: number = aiData.usage?.output_tokens ?? 0;

    // Truncate to 120 chars if needed
    const starterText = rawText.length > 120 ? rawText.slice(0, 117) + "..." : rawText;

    if (!starterText) throw new Error("Empty response from AI");

    // Cache for 24h and log cost in parallel
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await Promise.all([
      admin.from("conversation_starters").insert({ conversation_id: conversation.id, starter_text: starterText, model: "claude-haiku-4-5-20251001", expires_at: expiresAt }),
      logAiCost(admin, user.id, "claude-haiku-4-5-20251001", inputTokens, outputTokens, "unsticker"),
    ]);

    return json({ starter: starterText, cached: false });
  } catch (err) {
    console.error("[unsticker] AI call failed:", err);
    return json({ starter: pickFallback(conversation.id), cached: false, fallback: true });
  }
}

// ── GET /starters — 4 personalized AI starters for a brand-new conversation ──
// Generated once per match pair, cached forever on conversations.ai_starters.
// Returns null on failure — client falls back to hobby-based/generic starters.
async function handleStarters(req: Request) {
  const user = await getUserFromAuth(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const matchId = url.searchParams.get("matchId") ?? "";
  if (!matchId) return json({ error: "Missing matchId" }, 400);
  if (matchId === user.id) return json({ error: "Invalid matchId" }, 400);

  const admin = adminClient();

  // Find existing conversation (don't create — starters are only for opened chats)
  const [a, b] = [user.id, matchId].sort();
  const { data: conversation } = await admin
    .from("conversations")
    .select("id, ai_starters")
    .eq("user_id_1", a)
    .eq("user_id_2", b)
    .maybeSingle();

  // No conversation yet — client should use local fallbacks
  if (!conversation) return json({ starters: null });

  // Return cached starters (generated once, no expiry needed)
  if (Array.isArray(conversation.ai_starters) && conversation.ai_starters.length > 0) {
    return json({ starters: conversation.ai_starters, cached: true });
  }

  if (!ANTHROPIC_API_KEY) return json({ starters: null });

  // Gather match context
  const [matchA, matchB, profilesRes] = await Promise.all([
    admin.from("matches").select("shared_hobbies, why_you_matched, compatibility_score").eq("user_id", user.id).eq("matched_user_id", matchId).maybeSingle(),
    admin.from("matches").select("shared_hobbies, why_you_matched, compatibility_score").eq("user_id", matchId).eq("matched_user_id", user.id).maybeSingle(),
    admin.from("profiles").select("id, city").in("id", [user.id, matchId]),
  ]);

  const matchData = matchA.data ?? matchB.data;
  const profiles = profilesRes.data ?? [];

  const sharedHobbies: string[] = matchData?.shared_hobbies ?? [];
  const whyMatched: string[] = matchData?.why_you_matched ?? [];
  const compatScore = matchData?.compatibility_score ?? null;

  const profileMap = new Map(profiles.map(p => [p.id, p]));
  const matchProfile = profileMap.get(matchId);

  const contextLines: string[] = [];
  if (sharedHobbies.length > 0) contextLines.push(`Shared interests: ${sharedHobbies.slice(0, 5).join(", ")}`);
  if (whyMatched.length > 0) contextLines.push(`Why they matched: ${whyMatched.slice(0, 3).join("; ")}`);
  if (compatScore !== null) contextLines.push(`Compatibility score: ${compatScore}%`);
  if (matchProfile?.city) contextLines.push(`Their city: ${matchProfile.city}`);

  const contextBlock = contextLines.length > 0
    ? contextLines.join("\n")
    : "Limited overlap data — write warm, open-ended starters.";

  const systemPrompt = `You write conversation starters for Parallel, a premium dating app. Parallel is warm, dry, and never cheesy or try-hard. Write exactly 4 conversation starters as a JSON array of strings. Rules: max 100 characters each, no exclamation points, each invites a genuine response, reference shared context when available, vary the angle (activity, curiosity, preference, light story). Return ONLY the JSON array, no other text.`;

  const userPrompt = `Two people just matched on Parallel and are opening their chat for the first time. Here's their overlap:\n${contextBlock}\n\nReturn exactly 4 conversation starters as a JSON array of strings.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!aiRes.ok) throw new Error(`Anthropic API error: ${aiRes.status}`);

    const aiData = await aiRes.json();
    const rawText: string = aiData.content?.[0]?.text?.trim() ?? "";
    const inputTokens: number = aiData.usage?.input_tokens ?? 0;
    const outputTokens: number = aiData.usage?.output_tokens ?? 0;

    // Parse and validate the JSON array
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Invalid AI response format");

    const starters: string[] = parsed
      .slice(0, 4)
      .map((s: unknown) => String(s).trim().slice(0, 120))
      .filter((s: string) => s.length > 0);

    if (starters.length === 0) throw new Error("No valid starters in AI response");

    // Cache on conversation (no expiry — these are personal to this match pair)
    await Promise.all([
      admin.from("conversations").update({ ai_starters: starters }).eq("id", conversation.id),
      logAiCost(admin, user.id, "claude-haiku-4-5-20251001", inputTokens, outputTokens, "initial_starters"),
    ]);

    return json({ starters, cached: false });
  } catch (err) {
    console.error("[starters] AI call failed:", err);
    return json({ starters: null });
  }
}

Deno.serve(async (req) => {
  if (req.method==="OPTIONS") return new Response(null,{status:204,headers:corsHeaders});
  const url=new URL(req.url);
  const path=url.pathname.replace(/^\/messages\/?/i,"/").replace(/\/$/,"")||"//";
  try {
    if (path==="/"||path==="/health") return json({ok:true,service:"messages",version:"11"});
    if (path==="/conversations"&&req.method==="GET") return await handleConversationsList(req);
    if (path==="/mark-read"&&req.method==="POST") return await handleMarkRead(req);
    if (path==="/realtime-config"&&req.method==="GET") return await handleRealtimeConfig(req);
    if (path==="/send"&&req.method==="POST") return await handleMessageSend(req);
    if (path==="/met-banner-eligibility"&&req.method==="GET") return await handleMetBannerEligibility(req);
    if (path==="/met-banner-action"&&req.method==="POST") return await handleMetBannerAction(req);
    if (path==="/unsticker"&&req.method==="GET") return await handleUnsticker(req);
    if (path==="/starters"&&req.method==="GET") return await handleStarters(req);
    if (req.method==="GET") { const matchId=path.replace(/^\//, ""); if (/^[0-9a-fA-F-]{8,}$/.test(matchId)) return await handleMessagesList(req,matchId); }
    return json({error:"Not found",path,method:req.method},404);
  } catch(err) { console.error("[messages] unhandled:",err); return json({error:"Internal server error"},500); }
});

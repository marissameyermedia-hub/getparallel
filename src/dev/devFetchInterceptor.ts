// Intercepts fetch() calls to the Supabase edge function while the DevGallery
// is mounted. Returns mock JSON so screens look populated without a backend.
import { EDGE_FUNCTION_URL } from "../utils/supabase/client";
import {
  MOCK_INBOX,
  MOCK_MATCHES,
  MOCK_MESSAGES,
  MOCK_PROFILE,
  MOCK_USER_ID,
} from "./mockData";

let installed = false;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function routeFor(path: string): unknown | null {
  // Strip query string for matching
  const clean = path.split("?")[0];

  if (clean.endsWith("/user/profile")) return MOCK_PROFILE;
  if (clean.endsWith("/matches/mutual")) {
    return { mutualMatchIds: ["match-1", "match-2"], mutualMatches: ["match-1", "match-2"] };
  }
  if (clean.endsWith("/matches/mutual-waiting")) return { waiting: [] };
  if (clean.endsWith("/matches")) {
    return { matches: MOCK_MATCHES, emailConfirmationRequired: false };
  }
  if (clean.endsWith("/messages/conversations")) {
    return {
      conversations: MOCK_INBOX.map((m) => ({
        user_id_1: MOCK_USER_ID,
        user_id_2: m.matchId,
        user1: { name: "You" },
        user2: { name: m.matchName },
        last_message_at: m.hasMessages ? m.timestamp : null,
        created_at: m.timestamp,
      })),
    };
  }
  if (clean.includes("/messages/")) {
    return { messages: MOCK_MESSAGES };
  }
  if (clean.endsWith("/auth/validate-token")) {
    return { success: true, name: "Riley" };
  }
  if (clean.endsWith("/notifications/preferences")) {
    return { preferences: { matches: true, messages: true, marketing: false } };
  }
  if (clean.endsWith("/payments/status")) {
    return { activated: true, plan: "monthly" };
  }
  // Default empty success — many endpoints just need a 200.
  return {};
}

export function installDevFetchInterceptor() {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.startsWith(EDGE_FUNCTION_URL)) {
      const path = url.slice(EDGE_FUNCTION_URL.length);
      const method = (init?.method || "GET").toUpperCase();
      const body = routeFor(path);
      // For writes, just echo success.
      if (method !== "GET" && body && Object.keys(body as object).length === 0) {
        return jsonResponse({ success: true });
      }
      return jsonResponse(body ?? {});
    }

    return originalFetch(input as RequestInfo, init);
  };
}

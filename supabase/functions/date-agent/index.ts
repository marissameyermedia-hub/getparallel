// date-agent v33 — block tour/excursion venues by name regardless of Google type tags
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

interface VenueBase {
  name: string;
  category: string;
  priceLevel: string;
  rating: number | null;
  address: string;
  mapsUrl: string;
  whyItFits: string;
  suggestionMessage: string;
  photoUrl?: string;
  atmosphereTags?: string[];
  latitude?: number;
  longitude?: number;
  reservable?: boolean;
}

interface VenueCard extends VenueBase {
  areaKey: "you" | "them" | "middle";
}

interface AreaInfo {
  key: "you" | "them" | "middle";
  tagline: string;
}

const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

// When the caller specifies an occasion, this becomes category #1 in the search
const OCCASION_TYPES: Record<string, { types: string[]; label: string }> = {
  dinner: { types: ["restaurant"], label: "Dinner" },
  drinks: { types: ["wine_bar", "cocktail_bar", "bar"], label: "Drinks" },
  coffee: { types: ["cafe", "coffee_shop"], label: "Café" },
  activity: { types: ["bowling_alley", "miniature_golf_course", "aquarium", "museum", "art_gallery"], label: "Activity" },
};

const VENUE_NAME_BLOCKLIST = [
  "mall", "shopping center", "shopping centre", "outlet",
  "trampoline", "jump", "skyzone", "sky zone", "rebounder",
  "laser tag", "escape room", "casino", "speedway", "racetrack",
  "community center", "community centre", "rec center", "recreation center",
  "ymca", "city hall", "library", "fire station", "visitor center", "visitor centre",
  "mcdonald", "burger king", "wendy's", "wendys", "taco bell", "jack in the box",
  "kfc", "popeyes", "chick-fil-a", "chickfila", "carl's jr", "carls jr",
  "arby's", "arbys", "domino", "pizza hut", "little caesars",
  "dairy queen", "sonic drive", "whataburger", "in-n-out", "five guys",
  "starbucks", "dutch bros", "panda express", "chipotle", "panera",
  "7-eleven", "7eleven", "seven-eleven", "circle k", "am/pm", "ampm",
  "wawa", "quiktrip", "quicktrip", "casey's", "caseys",
  "hard rock cafe", "rainforest cafe", "bubba gump", "planet hollywood",
  "margaritaville", "dave & buster", "dave and buster",
  "centurion lounge", "priority lounge", "sky club", "admirals club", "admiral's club",
  "united club", "delta sky club", "club at seatac", "airside",
];

const BLOCKED_PLACE_TYPES = new Set([
  "convenience_store", "gas_station", "grocery_store", "supermarket",
  "drugstore", "pharmacy", "car_wash", "laundry",
  "fast_food_restaurant", "airport", "transit_depot",
]);

// Types that make a venue a valid date spot (food, drink, culture, activity, outdoors)
const DATE_VENUE_TYPES = new Set([
  "restaurant", "cafe", "coffee_shop", "bakery", "bar", "wine_bar", "cocktail_bar",
  "museum", "art_gallery", "bowling_alley", "miniature_golf_course", "aquarium", "zoo",
  "park", "nature_reserve", "hiking_area", "national_park",
]);

function isBlocklisted(name: string, types: string[]): boolean {
  const lower = name.toLowerCase();
  if (VENUE_NAME_BLOCKLIST.some(b => lower.includes(b))) return true;
  if (types.some(t => BLOCKED_PLACE_TYPES.has(t))) return true;
  // Block tour/excursion/sightseeing venues by name regardless of how Google types them —
  // \b guards prevent false positives on "Detour", "Contour", etc.
  if (/\b(tours?|sightseeing|excursion|ghost hunt|pub crawl|walking tour|bus tour)\b/i.test(name)) return true;
  // Block pure tourist attractions that aren't also a dining/activity venue
  if (types.includes("tourist_attraction") && !types.some(t => DATE_VENUE_TYPES.has(t))) return true;
  return false;
}

function isInsideAirport(address: string): boolean {
  if (/\b(terminal|concourse|airside)\b/i.test(address)) return true;
  if (/#[a-z]t-?\d/i.test(address)) return true;
  return false;
}

function passesMaxPrice(priceLevel: string, maxPrice: string): boolean {
  if (maxPrice === "any") return true;
  const order = ["Free", "$", "$$", "$$$", "$$$$"];
  const maxIdx = order.indexOf(maxPrice);
  const cardIdx = order.indexOf(priceLevel);
  if (cardIdx === -1 || maxIdx === -1) return true;
  return cardIdx <= maxIdx;
}

function qualityScore(rating: number | null, reviewCount: number | null): number {
  const r = rating ?? 3.0;
  const n = Math.max(reviewCount ?? 0, 1);
  return r * Math.log10(n + 10);
}

function dateScore(place: any, vibe = "any"): number {
  let bonus = 0;
  const types: string[] = place.types ?? [];
  const reviewCount: number = place.userRatingCount ?? 0;

  if (place.outdoorSeating) bonus += vibe === "outdoor" ? 0.8 : 0.3;
  if (place.liveMusic) bonus += 0.3;
  if (place.servesCocktails || place.servesWine) bonus += 0.4;
  if (place.goodForChildren === true) bonus -= 0.5;
  if (place.goodForWatchingSports === true) bonus -= 0.3;
  if (types.includes("tourist_attraction")) bonus -= 0.6;

  if (vibe === "local_gem") {
    // Sweet spot: well-reviewed but not a tourist magnet
    if (reviewCount >= 50 && reviewCount <= 500) bonus += 0.6;
    if (reviewCount > 2000) bonus -= 0.5;
    if (reviewCount > 10000) bonus -= 1.0;
  } else if (vibe === "trendy") {
    if (reviewCount > 1000) bonus += 0.4;
    if (reviewCount > 5000) bonus += 0.2;
  } else if (vibe === "outdoor") {
    if (types.some(t => ["park", "nature_reserve", "hiking_area"].includes(t))) bonus += 1.0;
  }

  // Anti-tourist penalty for any deliberate vibe
  if (vibe !== "any" && reviewCount > 10000) bonus -= 0.4;

  return bonus;
}

function extractAtmosphereTags(place: any): string[] {
  const tags: string[] = [];
  if (place.outdoorSeating) tags.push("Outdoor seating");
  if (place.liveMusic) tags.push("Live music");
  if (place.servesCocktails) tags.push("Cocktails");
  else if (place.servesWine) tags.push("Wine");
  return tags.slice(0, 3);
}

function buildPhotoUrl(place: any): string | undefined {
  const photoName = place.photos?.[0]?.name;
  if (!photoName || !GOOGLE_PLACES_API_KEY) return undefined;
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=400&key=${GOOGLE_PLACES_API_KEY}`;
}

function detectCategory(types: string[]): string {
  // Check wine_bar/cocktail_bar before cafe to avoid misclassifying "Purple Café and Wine Bar" etc.
  if (types.some(t => ["wine_bar", "cocktail_bar"].includes(t))) return "Drinks";
  if (types.some(t => ["cafe", "coffee_shop", "bakery"].includes(t))) return "Café";
  if (types.some(t => ["restaurant"].includes(t))) return "Dinner";
  if (types.some(t => ["bar"].includes(t))) return "Drinks";
  if (types.some(t => ["hiking_area", "nature_reserve", "national_park"].includes(t))) return "Outdoors";
  if (types.some(t => ["park"].includes(t))) return "Park";
  if (types.some(t => ["museum"].includes(t))) return "Museum";
  if (types.some(t => ["art_gallery"].includes(t))) return "Art Gallery";
  if (types.some(t => ["tourist_attraction"].includes(t))) return "Attraction";
  if (types.some(t => ["bowling_alley"].includes(t))) return "Bowling";
  if (types.some(t => ["miniature_golf_course"].includes(t))) return "Mini Golf";
  if (types.some(t => ["aquarium"].includes(t))) return "Aquarium";
  return "Place";
}

type TimeOfDay = "morning" | "afternoon" | "evening";

function buildSearchCategories(
  sharedHobbies: string[], myHobbies: string[], theirHobbies: string[],
  myWeekend: string[], theirWeekend: string[],
  timeOfDay: TimeOfDay,
  occasion = "any",
  vibe = "any",
): Array<{ types: string[]; label: string }> {
  const all = [...sharedHobbies, ...myHobbies, ...theirHobbies];
  const weeks = [...myWeekend, ...theirWeekend];
  const isEvening = timeOfDay === "evening";
  const isMorning = timeOfDay === "morning";
  const isAfternoon = timeOfDay === "afternoon";

  type Cat = { types: string[]; label: string; score: number };
  const cats: Cat[] = [];

  const cafeBase = all.some(h => h.toLowerCase().includes("coffee")) ? 6 : 4;
  cats.push({ types: ["cafe", "coffee_shop"], label: "Café",
    score: (isMorning || isAfternoon) ? cafeBase + 3 : cafeBase });

  const drinkKeys = ["wine", "cocktail", "craft beer", "whiskey", "bar"];
  const drinkBase = all.some(h => drinkKeys.some(k => h.toLowerCase().includes(k))) ? 7 : 5;
  cats.push({ types: ["wine_bar", "cocktail_bar", "bar"], label: "Drinks",
    score: isEvening ? drinkBase + 3 : drinkBase });

  const dinnerBase = all.some(h => ["restaurant", "dining", "food"].some(k => h.toLowerCase().includes(k))) ? 7 : 5;
  cats.push({ types: ["restaurant"], label: "Dinner",
    score: isEvening ? dinnerBase + 3 : dinnerBase });

  const outdoorKeys = ["walk", "hik", "kayak", "cycl", "camp", "yoga", "pilates", "nature", "outdoor", "garden", "scuba", "snorkel"];
  let outdoorScore = all.some(h => outdoorKeys.some(k => h.toLowerCase().includes(k))) || weeks.some(w => w.toLowerCase().includes("active"))
    ? (isAfternoon ? 7 : 5) : (isAfternoon ? 3 : 1);
  if (vibe === "outdoor") outdoorScore += 5; // vibe boost
  cats.push({ types: ["park", "nature_reserve"], label: "Outdoors", score: outdoorScore });

  const cultureKeys = ["astronom", "histor", "science", "museum", "philosoph", "documentar", "art", "paint", "potter", "read", "aviation"];
  const cultureScore = all.some(h => cultureKeys.some(k => h.toLowerCase().includes(k))) ? (isAfternoon ? 7 : 5) : 0;
  if (cultureScore > 0) cats.push({ types: ["museum", "art_gallery"], label: "Culture", score: cultureScore });

  const funKeys = ["bowl", "mini golf", "board game", "trivia"];
  const funScore = all.some(h => funKeys.some(k => h.toLowerCase().includes(k))) ? 5
    : weeks.some(w => w.toLowerCase().includes("going out")) ? 3 : 0;
  if (funScore > 0) cats.push({ types: ["bowling_alley", "miniature_golf_course"], label: "Activity", score: funScore });

  const wildKeys = ["wildlife", "aquarium", "zoo", "birdwatch", "conservation", "nature"];
  const wildScore = all.some(h => wildKeys.some(k => h.toLowerCase().includes(k))) ? 5 : 0;
  if (wildScore > 0) cats.push({ types: ["aquarium", "zoo"], label: "Nature Spot", score: wildScore });

  const seen = new Set<string>();
  const sorted = cats
    .sort((a, b) => b.score - a.score)
    .filter(c => { if (seen.has(c.label)) return false; seen.add(c.label); return true; })
    .slice(0, 4)
    .map(c => ({ types: c.types, label: c.label }));

  // Pin occasion as category #1 when explicitly requested
  if (occasion !== "any" && OCCASION_TYPES[occasion]) {
    const pinned = OCCASION_TYPES[occasion];
    const rest = sorted.filter(c => c.label !== pinned.label);
    return [pinned, ...rest].slice(0, 4);
  }

  return sorted;
}

async function nearbySearch(
  lat: number, lon: number, includedTypes: string[], radius: number, signal: AbortSignal, skip: number, vibe: string,
): Promise<VenueBase[]> {
  if (!GOOGLE_PLACES_API_KEY) return [];
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.photos,places.outdoorSeating,places.liveMusic,places.servesCocktails,places.servesWine,places.goodForChildren,places.goodForWatchingSports,places.reservable,places.businessStatus",
      },
      body: JSON.stringify({
        includedTypes, maxResultCount: 20, rankPreference: "POPULARITY",
        locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius } },
      }),
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json();

    const candidates = (data.places ?? [])
      .filter((p: any) =>
        p?.displayName?.text &&
        // Skip permanently or temporarily closed venues
        (p.businessStatus === undefined || p.businessStatus === "OPERATIONAL") &&
        !isBlocklisted(p.displayName.text, p.types ?? []) &&
        !isInsideAirport(p.formattedAddress ?? "") &&
        (p.userRatingCount ?? 0) >= 15 // quality baseline: must have meaningful reviews
      )
      .sort((a: any, b: any) => {
        const scoreA = qualityScore(a.rating, a.userRatingCount) + dateScore(a, vibe);
        const scoreB = qualityScore(b.rating, b.userRatingCount) + dateScore(b, vibe);
        return scoreB - scoreA;
      });

    const sliced = candidates.slice(skip, skip + 5);
    const toReturn = sliced.length > 0 ? sliced : candidates.slice(0, 5);

    return toReturn.map((place: any) => ({
      name: place.displayName.text,
      category: detectCategory(place.types ?? []),
      priceLevel: PRICE_MAP[place.priceLevel ?? ""] ?? "$$",
      rating: typeof place.rating === "number" ? Math.round(place.rating * 10) / 10 : null,
      address: place.formattedAddress ?? "",
      mapsUrl: place.googleMapsUri ?? "",
      whyItFits: "",
      suggestionMessage: "",
      photoUrl: buildPhotoUrl(place),
      atmosphereTags: extractAtmosphereTags(place),
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      reservable: typeof place.reservable === "boolean" ? place.reservable : undefined,
    }));
  } catch { return []; }
}

function buildAreaTagline(
  cards: VenueCard[], areaKey: string, distKm: number,
  sharedHobbies: string[], myHobbies: string[], theirHobbies: string[],
): string {
  const cats = [...new Set(cards.map(c => c.category))].slice(0, 2);
  const catStr = cats.join(" & ") || "local spots";
  if (areaKey === "middle") {
    if (distKm <= 0) return `Halfway between you both · ${catStr}`;
    const miles = Math.round(distKm / 2 * 0.6214);
    return `~${miles} mi from each · ${catStr}`;
  }
  const relevantHobbies = areaKey === "you" ? [...sharedHobbies, ...myHobbies] : [...sharedHobbies, ...theirHobbies];
  const outdoorMatch = relevantHobbies.some(h => ["walk", "hik", "kayak", "nature", "outdoor", "pilates", "yoga", "scuba", "cycl"].some(k => h.toLowerCase().includes(k)));
  const foodMatch = relevantHobbies.some(h => ["wine", "cocktail", "dining", "restaurant", "whiskey", "beer"].some(k => h.toLowerCase().includes(k)));
  let callout = "";
  if (outdoorMatch && cats.some(c => ["Park", "Outdoors"].includes(c))) callout = " · fits your outdoor streak";
  else if (foodMatch && cats.some(c => ["Dinner", "Drinks"].includes(c))) callout = " · fits your dining taste";
  return `${catStr} options${callout}`;
}

const GENERIC_FALLBACK: VenueCard[] = [
  { name: "A local coffee shop", category: "Café", priceLevel: "$", rating: null, address: "", mapsUrl: "", whyItFits: "Low stakes, easy to extend if things click.", suggestionMessage: "There's a coffee shop I had in mind for us. Low-key, easy to extend if the conversation flows. Want to?", areaKey: "middle" },
  { name: "A neighborhood restaurant", category: "Dinner", priceLevel: "$$", rating: null, address: "", mapsUrl: "", whyItFits: "A real meal gives you time to actually talk.", suggestionMessage: "Thinking a proper sit-down dinner could be a good call for us. More time to actually talk. What do you think?", areaKey: "middle" },
  { name: "A nearby park or waterfront", category: "Outdoors", priceLevel: "Free", rating: null, address: "", mapsUrl: "", whyItFits: "Walking and talking covers more ground than sitting still.", suggestionMessage: "Walking dates are underrated. I was thinking a park or waterfront somewhere near us. Up for it?", areaKey: "middle" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/date-agent\/?/i, "/").replace(/\/$/, "") || "/";

  try {
    if (path === "/" || path === "/health") return json({ ok: true, version: "33" });

    // ── /search — Google Places text-search proxy (API key stays server-side) ──
    if (path === "/search" && req.method === "GET") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (!q || q.length < 2) return json({ results: [] });

      const token = (req.headers.get("authorization") ?? "").replace(/^bearer\s+/i, "").trim();
      if (!token) return json({ error: "Unauthorized" }, 401);
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: authData, error: authErr } = await anonClient.auth.getUser(token);
      if (authErr || !authData?.user) return json({ error: "Unauthorized" }, 401);
      const userId = authData.user.id;

      if (!GOOGLE_PLACES_API_KEY) return json({ results: [] });

      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      let searchLat: number | null = null, searchLon: number | null = null;
      try {
        const matchIdParam = url.searchParams.get("matchId") ?? "";
        const ids = [userId, matchIdParam].filter(Boolean);
        const { data: profiles } = await admin.from("profiles").select("id, latitude, longitude").in("id", ids);
        const me = profiles?.find((p: any) => p.id === userId);
        const them = matchIdParam ? profiles?.find((p: any) => p.id === matchIdParam) : null;
        if (me?.latitude && me?.longitude) {
          searchLat = me.latitude;
          searchLon = me.longitude;
          if (them?.latitude && them?.longitude) {
            searchLat = (me.latitude + them.latitude) / 2;
            searchLon = (me.longitude + them.longitude) / 2;
          }
        }
      } catch { /* proceed without location bias */ }

      try {
        const body: Record<string, unknown> = { textQuery: q, maxResultCount: 10 };
        if (searchLat !== null && searchLon !== null) {
          body.locationBias = {
            circle: { center: { latitude: searchLat, longitude: searchLon }, radius: 20000 },
          };
        }

        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.photos,places.outdoorSeating,places.servesCocktails,places.servesWine,places.reservable,places.businessStatus",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) return json({ results: [] });
        const data = await res.json();

        const results: VenueCard[] = (data.places ?? [])
          .filter((p: any) =>
            p?.displayName?.text &&
            (p.businessStatus === undefined || p.businessStatus === "OPERATIONAL") &&
            !isBlocklisted(p.displayName.text, p.types ?? []) &&
            !isInsideAirport(p.formattedAddress ?? "")
          )
          .slice(0, 5)
          .map((place: any) => ({
            name: place.displayName.text,
            category: detectCategory(place.types ?? []),
            priceLevel: PRICE_MAP[place.priceLevel ?? ""] ?? "$$",
            rating: typeof place.rating === "number" ? Math.round(place.rating * 10) / 10 : null,
            address: place.formattedAddress ?? "",
            mapsUrl: place.googleMapsUri ?? "",
            whyItFits: "",
            suggestionMessage: "",
            photoUrl: buildPhotoUrl(place),
            atmosphereTags: extractAtmosphereTags(place),
            latitude: place.location?.latitude,
            longitude: place.location?.longitude,
            reservable: typeof place.reservable === "boolean" ? place.reservable : undefined,
            areaKey: "middle" as const,
          }));

        return json({ results });
      } catch {
        return json({ results: [] });
      }
    }

    // ── /decline — AI-generated graceful decline options ─────────────────────
    if (path === "/decline" && req.method === "POST") {
      const token = (req.headers.get("authorization") ?? "").replace(/^bearer\s+/i, "").trim();
      if (!token) return json({ error: "Unauthorized" }, 401);
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: authData, error: authErr } = await anonClient.auth.getUser(token);
      if (authErr || !authData?.user) return json({ error: "Unauthorized" }, 401);

      let messages: string[] = [];
      let matchName = "";
      try {
        const body = await req.json() as { messages?: unknown; matchName?: string };
        if (Array.isArray(body.messages)) {
          messages = body.messages.filter((m): m is string => typeof m === "string").slice(-10);
        }
        if (typeof body.matchName === "string") matchName = body.matchName.trim().split(/\s+/)[0] ?? "";
      } catch { /* ok */ }

      const STATIC_DECLINES = [
        "I appreciate you asking! I'm not quite ready to meet just yet — can we keep chatting a bit more first?",
        "The timing isn't perfect for me right now — maybe another week or two?",
        "I'd love to eventually, but let's keep getting to know each other a little longer first.",
      ];

      if (!ANTHROPIC_API_KEY) return json({ options: STATIC_DECLINES });

      const ctrl = new AbortController();
      const aiTimer = setTimeout(() => ctrl.abort(), 8000);
      let options = STATIC_DECLINES;
      try {
        const ctx = messages.length > 0
          ? `\n\nRecent chat:\n${messages.map((m, i) => `${i % 2 === 0 ? "Me" : (matchName || "Them")}: ${m}`).join("\n")}`
          : "";
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 300,
            messages: [{ role: "user", content: `You are helping someone on a dating app politely decline or delay a date request. Write exactly 3 short, warm, non-ghosting responses (1-2 sentences each). Vary tone: one about timing, one about wanting to chat more first, one open-ended. Sound natural, not robotic. No emojis.${ctx}\n\nReturn ONLY a JSON array of 3 strings, no other text.` }],
          }),
          signal: ctrl.signal,
        });
        clearTimeout(aiTimer);
        if (res.ok) {
          const data = await res.json();
          const raw = (data?.content?.[0]?.text ?? "").trim();
          const m = raw.match(/\[[\s\S]*\]/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            if (Array.isArray(parsed) && parsed.length >= 2) {
              options = parsed.filter((s: unknown): s is string => typeof s === "string").slice(0, 3);
            }
          }
        }
      } catch { /* use static */ } finally { clearTimeout(aiTimer); }
      return json({ options });
    }

    // ── /auto-pick — AI picks venue + time slots automatically ───────────────
    if (path === "/auto-pick" && req.method === "POST") {
      const token = (req.headers.get("authorization") ?? "").replace(/^bearer\s+/i, "").trim();
      if (!token) return json({ error: "Unauthorized" }, 401);
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: authData, error: authErr } = await anonClient.auth.getUser(token);
      if (authErr || !authData?.user) return json({ error: "Unauthorized" }, 401);
      const userId = authData.user.id;

      const apMatchId = url.searchParams.get("matchId") ?? "";
      if (!apMatchId || apMatchId === userId) return json({ error: "Invalid matchId" }, 400);

      const apOccasion = url.searchParams.get("occasion") ?? "any";
      const apMaxPrice = url.searchParams.get("maxPrice") ?? "any";

      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: apFlag } = await admin.from("feature_flags").select("enabled").eq("flag_key", "feature_date_agent_enabled").maybeSingle();
      if (!apFlag?.enabled) return json({ error: "Feature not available" }, 403);

      let apMyLat: number | null = null, apMyLon: number | null = null;
      let apTheirLat: number | null = null, apTheirLon: number | null = null;
      let apShared: string[] = [], apMyH: string[] = [], apTheirH: string[] = [];
      let apMyW: string[] = [], apTheirW: string[] = [];

      try {
        const [pr, m1, m2, ar] = await Promise.all([
          admin.from("profiles").select("id, latitude, longitude").in("id", [userId, apMatchId]),
          admin.from("matches").select("shared_hobbies").eq("user_id", userId).eq("matched_user_id", apMatchId).maybeSingle(),
          admin.from("matches").select("shared_hobbies").eq("user_id", apMatchId).eq("matched_user_id", userId).maybeSingle(),
          admin.from("user_answers").select("user_id, answers").in("user_id", [userId, apMatchId]),
        ]);
        for (const p of pr.data ?? []) {
          if (p.id === userId) { apMyLat = p.latitude; apMyLon = p.longitude; }
          else { apTheirLat = p.latitude; apTheirLon = p.longitude; }
        }
        apShared = ((m1.data ?? m2.data) as any)?.shared_hobbies ?? [];
        for (const row of ar.data ?? []) {
          const ans = (row.answers ?? {}) as Record<string, unknown>;
          const h = Array.isArray(ans["3.9"]) ? ans["3.9"] as string[] : [];
          const w = Array.isArray(ans["3.7"]) ? ans["3.7"] as string[] : [];
          if (row.user_id === userId) { apMyH = h; apMyW = w; } else { apTheirH = h; apTheirW = w; }
        }
      } catch { /* optional */ }

      // Build 3 upcoming weekend evening slots
      const apNow = new Date();
      const apSlots: Array<{ label: string; shortLabel: string; dateIso: string; period: "afternoon" | "evening" }> = [];
      for (let d = 1; d <= 14 && apSlots.length < 3; d++) {
        const c = new Date(apNow);
        c.setDate(apNow.getDate() + d);
        c.setHours(0, 0, 0, 0);
        if ([5, 6, 0].includes(c.getDay())) {
          apSlots.push({
            label: `${c.toLocaleDateString("en-US", { weekday: "long" })} evening`,
            shortLabel: `${c.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · Eve`,
            dateIso: c.toISOString(),
            period: "evening",
          });
        }
      }
      // Fallback: next 3 days
      if (apSlots.length === 0) {
        for (let d = 1; d <= 3; d++) {
          const c = new Date(apNow);
          c.setDate(apNow.getDate() + d);
          c.setHours(0, 0, 0, 0);
          apSlots.push({
            label: `${c.toLocaleDateString("en-US", { weekday: "long" })} evening`,
            shortLabel: `${c.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · Eve`,
            dateIso: c.toISOString(),
            period: "evening",
          });
        }
      }

      let topVenue: VenueCard = { ...GENERIC_FALLBACK[0] };

      if (GOOGLE_PLACES_API_KEY && apMyLat && apMyLon) {
        try {
          const sLat = apTheirLat != null ? (apMyLat + apTheirLat) / 2 : apMyLat;
          const sLon = apTheirLon != null ? (apMyLon + apTheirLon) / 2 : apMyLon;
          const cats = buildSearchCategories(apShared, apMyH, apTheirH, apMyW, apTheirW, "evening", apOccasion, "any");
          const apCtrl = new AbortController();
          const apTimer = setTimeout(() => apCtrl.abort(), 10000);
          try {
            const venues = await nearbySearch(sLat, sLon, cats[0].types, 8000, apCtrl.signal, 0, "any");
            const filtered = apMaxPrice !== "any" ? venues.filter(v => passesMaxPrice(v.priceLevel, apMaxPrice)) : venues;
            const pick = (filtered.length > 0 ? filtered : venues)[0];
            if (pick) topVenue = { ...pick, areaKey: "middle" };
          } finally { clearTimeout(apTimer); }
        } catch { /* use fallback */ }
      }

      if (ANTHROPIC_API_KEY && topVenue.name !== GENERIC_FALLBACK[0].name) {
        try {
          const apCtrl2 = new AbortController();
          const apTimer2 = setTimeout(() => apCtrl2.abort(), 6000);
          try {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
              body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 120,
                messages: [{ role: "user", content: `Write a 1-2 sentence casual date proposal for going to "${topVenue.name}" (${topVenue.category}). Warm, direct, no emojis. Return ONLY the message text.` }],
              }),
              signal: apCtrl2.signal,
            });
            clearTimeout(apTimer2);
            if (res.ok) {
              const data = await res.json();
              const text = (data?.content?.[0]?.text ?? "").trim();
              if (text) topVenue = { ...topVenue, suggestionMessage: text + (topVenue.mapsUrl ? `\n${topVenue.mapsUrl}` : "") };
            }
          } finally { clearTimeout(apTimer2); }
        } catch { /* keep default */ }
      }

      if (!topVenue.suggestionMessage) {
        topVenue = { ...topVenue, suggestionMessage: `${topVenue.name} looks like a great spot for us — want to check it out?${topVenue.mapsUrl ? `\n${topVenue.mapsUrl}` : ""}` };
      }

      return json({ venue: topVenue, slots: apSlots });
    }

    if (path !== "/generate" || req.method !== "POST") return json({ error: "Not found" }, 404);

    const token = (req.headers.get("authorization") ?? "").replace(/^bearer\s+/i, "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: authData, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !authData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = authData.user.id;

    const matchId = url.searchParams.get("matchId") ?? "";
    if (!matchId || matchId === userId) return json({ error: "Invalid matchId" }, 400);

    // Parse conversation messages from POST body (last 20, used for AI ranking)
    let conversationMessages: string[] = [];
    try {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const body = await req.json() as { messages?: unknown };
        if (Array.isArray(body.messages)) {
          conversationMessages = body.messages.filter((m): m is string => typeof m === "string").slice(-20);
        }
      }
    } catch { /* body is optional */ }

    const maxPrice = url.searchParams.get("maxPrice") ?? "any";
    const forceRefresh = url.searchParams.get("force") === "true";
    const skip = Math.max(0, Math.min(18, parseInt(url.searchParams.get("skip") ?? "0") || 0));
    const rawTimeOfDay = url.searchParams.get("timeOfDay") ?? "";
    const timeOfDay: TimeOfDay = (["morning", "afternoon", "evening"] as const).includes(rawTimeOfDay as TimeOfDay)
      ? rawTimeOfDay as TimeOfDay
      : (() => {
          const h = new Date().getUTCHours();
          return h >= 22 || h < 5 ? "evening" : h >= 13 && h < 18 ? "morning" : "afternoon";
        })();

    // New v25 params
    const occasion = url.searchParams.get("occasion") ?? "any";
    const vibe = url.searchParams.get("vibe") ?? "any";
    const skipIdsParam = url.searchParams.get("skipIds") ?? "";
    const skipIds = new Set(skipIdsParam.split(",").filter(Boolean));
    const conversationHints = url.searchParams.get("hints") ?? "";

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: flag } = await admin.from("feature_flags").select("enabled").eq("flag_key", "feature_date_agent_enabled").maybeSingle();
    if (!flag?.enabled) return json({ error: "Feature not available" }, 403);

    const sorted = [userId, matchId].sort();
    const { data: conv } = await admin.from("conversations").select("id").eq("user_id_1", sorted[0]).eq("user_id_2", sorted[1]).maybeSingle();
    if (!conv) return json({ error: "Conversation not found" }, 404);

    let rateLimited = false;
    try {
      const rateWindow = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const r = await admin.from("ai_cost_log").select("id", { count: "exact", head: true }).eq("feature", "date_agent").eq("user_id", userId).gte("created_at", rateWindow);
      rateLimited = (r.count ?? 0) >= 5;
    } catch { /* allow through */ }

    if (forceRefresh) {
      try { await admin.from("date_suggestions").delete().eq("conversation_id", conv.id); } catch { /* ok */ }
    }

    if (!forceRefresh && skip === 0 && occasion === "any" && vibe === "any") {
      try {
        const r = await admin.from("date_suggestions").select("suggestions").eq("conversation_id", conv.id).gt("expires_at", new Date().toISOString()).order("generated_at", { ascending: false }).limit(1).maybeSingle();
        if (r.data?.suggestions) {
          const cached = r.data.suggestions as VenueCard[];
          const priceFiltered = maxPrice !== "any" ? cached.filter(c => passesMaxPrice(c.priceLevel, maxPrice)) : cached;
          const toServe = priceFiltered.length > 0 ? priceFiltered : cached;
          let cachedDistKm = 0;
          try {
            const pr = await admin.from("profiles").select("id, latitude, longitude").in("id", [userId, matchId]);
            const profiles = pr.data ?? [];
            const me = profiles.find(p => p.id === userId);
            const them = profiles.find(p => p.id === matchId);
            if (me?.latitude && me?.longitude && them?.latitude && them?.longitude) {
              const dLat = (them.latitude - me.latitude) * Math.PI / 180;
              const dLon = (them.longitude - me.longitude) * Math.PI / 180;
              const a = Math.sin(dLat / 2) ** 2 + Math.cos(me.latitude * Math.PI / 180) * Math.cos(them.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
              cachedDistKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            }
          } catch { /* use 0 */ }
          const areaOrder: Array<"you" | "them" | "middle"> = ["you", "them", "middle"];
          const presentKeys = areaOrder.filter(k => toServe.some(s => s.areaKey === k));
          const areas: AreaInfo[] = presentKeys.map(k => ({ key: k, tagline: buildAreaTagline(toServe.filter(s => s.areaKey === k), k, cachedDistKm, [], [], []) }));
          return json({ suggestions: toServe, areas, cached: true });
        }
      } catch { /* ignore */ }
    }

    if (rateLimited) return json({ suggestions: GENERIC_FALLBACK, areas: [], cached: false, fallback: true });

    let myLat: number | null = null, myLon: number | null = null, myCity: string | null = null;
    let theirLat: number | null = null, theirLon: number | null = null, theirCity: string | null = null;
    let sharedHobbies: string[] = [], whyMatched: string[] = [];
    let myHobbies: string[] = [], theirHobbies: string[] = [];
    let myWeekend: string[] = [], theirWeekend: string[] = [];
    let myDrinking = "", theirDrinking = "", mySocial = "", theirSocial = "";

    try {
      const [profilesRes, m1, m2, answersRes] = await Promise.all([
        admin.from("profiles").select("id, latitude, longitude, city").in("id", [userId, matchId]),
        admin.from("matches").select("shared_hobbies, why_you_matched").eq("user_id", userId).eq("matched_user_id", matchId).maybeSingle(),
        admin.from("matches").select("shared_hobbies, why_you_matched").eq("user_id", matchId).eq("matched_user_id", userId).maybeSingle(),
        admin.from("user_answers").select("user_id, answers").in("user_id", [userId, matchId]),
      ]);
      for (const p of profilesRes.data ?? []) {
        if (p.id === userId) { myLat = p.latitude; myLon = p.longitude; myCity = p.city; }
        else { theirLat = p.latitude; theirLon = p.longitude; theirCity = p.city; }
      }
      const md = ((m1.data ?? m2.data) as any);
      sharedHobbies = md?.shared_hobbies ?? [];
      whyMatched = md?.why_you_matched ?? [];
      for (const row of answersRes.data ?? []) {
        const ans = (row.answers ?? {}) as Record<string, unknown>;
        const h = Array.isArray(ans["3.9"]) ? ans["3.9"] as string[] : [];
        const w = Array.isArray(ans["3.7"]) ? ans["3.7"] as string[] : [];
        const d1 = typeof ans["3.1"] === "string" ? ans["3.1"] : "";
        const d2 = typeof ans["3.2"] === "string" ? ans["3.2"] : "";
        const drinking = [d1, d2].filter(Boolean).join(" — ");
        const social = typeof ans["5.4"] === "string" ? ans["5.4"] : "";
        if (row.user_id === userId) { myHobbies = h; myWeekend = w; myDrinking = drinking; mySocial = social; }
        else { theirHobbies = h; theirWeekend = w; theirDrinking = drinking; theirSocial = social; }
      }
    } catch { /* optional */ }

    let distKm = 0;
    if (myLat && myLon && theirLat != null && theirLon != null) {
      const dLat = (theirLat - myLat) * Math.PI / 180;
      const dLon = (theirLon - myLon) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(myLat * Math.PI / 180) * Math.cos(theirLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const tooFar = distKm > 80;
    const useDual = !tooFar && distKm >= 20 && theirLat != null && theirLon != null;

    type SearchSpec = { lat: number; lon: number; radius: number; areaKey: "you" | "them" | "middle" };
    const searchSpecs: SearchSpec[] = [];

    if (!tooFar && myLat && myLon) {
      if (useDual) {
        const r = Math.max(5000, Math.min(15000, distKm * 150));
        const midLat = (myLat + theirLat!) / 2;
        const midLon = (myLon + theirLon!) / 2;
        searchSpecs.push({ lat: myLat, lon: myLon, radius: r, areaKey: "you" });
        searchSpecs.push({ lat: theirLat!, lon: theirLon!, radius: Math.max(5000, r), areaKey: "them" });
        searchSpecs.push({ lat: midLat, lon: midLon, radius: Math.max(5000, r), areaKey: "middle" });
      } else {
        const searchLat = theirLat != null ? (myLat + theirLat) / 2 : myLat;
        const searchLon = theirLon != null ? (myLon + theirLon) / 2 : myLon;
        const r = distKm > 0 ? Math.max(3000, Math.min(20000, distKm * 300)) : 5000;
        searchSpecs.push({ lat: searchLat, lon: searchLon, radius: r, areaKey: "middle" });
      }
    }

    let allVenueCards: VenueCard[] = [];

    if (GOOGLE_PLACES_API_KEY && searchSpecs.length > 0) {
      const categories = buildSearchCategories(sharedHobbies, myHobbies, theirHobbies, myWeekend, theirWeekend, timeOfDay, occasion, vibe);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        const specResults = await Promise.all(
          searchSpecs.map(async spec => {
            const categoryResults = await Promise.all(
              categories.map(cat => nearbySearch(spec.lat, spec.lon, cat.types, spec.radius, ctrl.signal, skip, vibe))
            );
            return { spec, categoryResults };
          })
        );
        for (const { spec, categoryResults } of specResults) {
          const allForArea: VenueBase[] = [];
          const filteredForArea: VenueBase[] = [];
          const seenAll = new Set<string>();
          const seenFiltered = new Set<string>();
          for (const venues of categoryResults) {
            for (const v of venues) {
              if (!seenAll.has(v.name)) { seenAll.add(v.name); allForArea.push(v); }
              if (!seenFiltered.has(v.name) && passesMaxPrice(v.priceLevel, maxPrice)) {
                seenFiltered.add(v.name); filteredForArea.push(v);
              }
            }
          }
          // Take top 10 per area to give Claude a bigger pool to pick from
          const toAdd = (filteredForArea.length > 0 ? filteredForArea : allForArea).slice(0, 10);
          for (const v of toAdd) allVenueCards.push({ ...v, areaKey: spec.areaKey });
        }
      } finally { clearTimeout(timer); }
    }

    // When an occasion is explicitly selected, strip out venues that don't match it
    // so e.g. "The 5 Point Cafe" never appears when the user picked Activity
    if (occasion !== "any") {
      const occasionAllowed: Record<string, Set<string>> = {
        dinner: new Set(["Dinner"]),
        drinks: new Set(["Drinks"]),
        coffee: new Set(["Café"]),
        activity: new Set(["Museum", "Art Gallery", "Bowling", "Mini Golf", "Aquarium", "Outdoors", "Park", "Activity"]),
      };
      const allowed = occasionAllowed[occasion];
      if (allowed) {
        const filtered = allVenueCards.filter(v => allowed.has(v.category));
        if (filtered.length >= 3) allVenueCards = filtered;
      }
    }

    // Filter out already-seen venues (skipIds are mapsUrls)
    if (skipIds.size > 0) {
      const filtered = allVenueCards.filter(v => !skipIds.has(v.mapsUrl));
      if (filtered.length > 0) allVenueCards = filtered;
    }

    const usingGeneric = allVenueCards.length === 0;
    if (usingGeneric) allVenueCards = GENERIC_FALLBACK.map(s => ({ ...s }));

    const areaOrder: Array<"you" | "them" | "middle"> = ["you", "them", "middle"];
    const areaGroups = new Map<string, VenueCard[]>();
    for (const card of allVenueCards) {
      if (!areaGroups.has(card.areaKey)) areaGroups.set(card.areaKey, []);
      areaGroups.get(card.areaKey)!.push(card);
    }
    const areas: AreaInfo[] = areaOrder
      .filter(k => areaGroups.has(k))
      .map(k => ({ key: k, tagline: buildAreaTagline(areaGroups.get(k)!, k, distKm, sharedHobbies, myHobbies, theirHobbies) }));

    let topPickIndex = 0;
    let altIndices: number[] = [];

    if (ANTHROPIC_API_KEY && !usingGeneric) {
      try {
        const ctx: string[] = [];
        if (sharedHobbies.length) ctx.push(`Shared interests: ${sharedHobbies.slice(0, 6).join(", ")}`);
        if (myHobbies.length) ctx.push(`Your interests: ${myHobbies.slice(0, 5).join(", ")}`);
        if (theirHobbies.length) ctx.push(`Their interests: ${theirHobbies.slice(0, 5).join(", ")}`);
        if (whyMatched.length) ctx.push(`Why matched: ${whyMatched.slice(0, 2).join("; ")}`);
        const cities = [myCity, theirCity].filter(Boolean);
        if (cities.length) ctx.push(`Cities: ${cities.join(" / ")}`);
        const sharedWeekend = [...new Set([...myWeekend, ...theirWeekend])].slice(0, 4);
        if (sharedWeekend.length) ctx.push(`Weekend style: ${sharedWeekend.join(", ")}`);
        if (myDrinking || theirDrinking) ctx.push(`Drinking: ${[myDrinking, theirDrinking].filter(Boolean).join(" / ")}`);
        if (mySocial || theirSocial) ctx.push(`Social style: ${[mySocial, theirSocial].filter(Boolean).join(" / ")}`);
        ctx.push(`Date time: ${timeOfDay}`);

        const AREA_LABEL: Record<string, string> = { you: "near you", them: "near them", middle: "midway" };
        const venueList = allVenueCards.map((v, i) => {
          const tags = v.atmosphereTags?.length ? ` [${v.atmosphereTags.join(", ")}]` : "";
          const area = v.areaKey ? ` — ${AREA_LABEL[v.areaKey] ?? v.areaKey}` : "";
          return `${i}. ${v.name} (${v.category}, ${v.priceLevel}${tags}${area})`;
        }).join("\n");

        const convoSection = conversationMessages.length > 0
          ? `Recent conversation between these two people:\n${conversationMessages.join("\n")}\n\n`
          : "";

        const prompt = `Two people matched on a dating app. Help pick where they should go on their first date — casual, low-pressure, good for conversation. Recommend LOCAL neighborhood spots, not tourist traps or chains.\n\n${convoSection}Profile context: ${ctx.join(" | ") || "No context"}\n\nAvailable venues (0-indexed):\n${venueList}\n\nYour task:\n1. Read the conversation carefully. Pick the SINGLE best venue for this specific couple — if they mentioned specific cuisines, interests, or neighborhoods, that's your primary signal. Otherwise use their profile interests.\n2. Pick 3 alternatives (good options but not the top pick). Cover different categories if possible.\n3. For the top pick and each alternative, write:\n   - "why": One warm sentence (max 14 words) explaining why this spot suits THIS couple. Reference something specific from their conversation or a shared interest — e.g. "You both mentioned loving wine, and this place has a great natural wine list." Be specific, not generic.\n   - "suggest": A natural first-person message (15–25 words) proposing this spot. Specific to the venue. No addresses. No exclamation marks. Don't start with 'I' or use the word 'suggest'.\n\nReturn JSON only — no other text:\n{"topPickIndex":0,"altIndices":[2,5,8],"picks":[{"index":0,"why":"...","suggest":"..."},{"index":2,"why":"...","suggest":"..."},{"index":5,"why":"...","suggest":"..."},{"index":8,"why":"...","suggest":"..."}]}`;

        const ctrl = new AbortController();
        const aiTimer = setTimeout(() => ctrl.abort(), 20000);
        try {
          const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001", max_tokens: 900,
              messages: [{ role: "user", content: prompt }],
            }),
            signal: ctrl.signal,
          });
          clearTimeout(aiTimer);
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const raw: string = aiData?.content?.[0]?.text?.trim() ?? "";
            const m = raw.match(/\{.*\}/s);
            if (m) {
              try {
                const parsed = JSON.parse(m[0]) as {
                  topPickIndex: number;
                  altIndices: number[];
                  picks: Array<{ index: number; why: string; suggest: string }>;
                };
                if (typeof parsed.topPickIndex === "number" && parsed.topPickIndex >= 0 && parsed.topPickIndex < allVenueCards.length) {
                  topPickIndex = parsed.topPickIndex;
                }
                if (Array.isArray(parsed.altIndices)) {
                  altIndices = parsed.altIndices.filter(
                    (i) => typeof i === "number" && i >= 0 && i < allVenueCards.length && i !== topPickIndex
                  ).slice(0, 3);
                }
                if (Array.isArray(parsed.picks)) {
                  for (const item of parsed.picks) {
                    if (typeof item.index === "number" && item.index >= 0 && item.index < allVenueCards.length) {
                      if (item.why) allVenueCards[item.index].whyItFits = String(item.why);
                      if (item.suggest) allVenueCards[item.index].suggestionMessage = String(item.suggest);
                    }
                  }
                }
              } catch { /* keep defaults */ }
            }
            admin.from("ai_cost_log").insert({
              feature: "date_agent", user_id: userId, model: "claude-haiku-4-5-20251001",
              input_tokens: aiData?.usage?.input_tokens ?? 0, output_tokens: aiData?.usage?.output_tokens ?? 0,
              cost_usd: ((aiData?.usage?.input_tokens ?? 0) * 0.80 + (aiData?.usage?.output_tokens ?? 0) * 4.00) / 1_000_000,
            }).then(() => {}).catch(() => {});
          }
        } finally { clearTimeout(aiTimer); }
      } catch { /* AI optional */ }
    }

    for (const card of allVenueCards) {
      if (!card.suggestionMessage) card.suggestionMessage = `${card.name} looks like a good spot for us. Worth checking out?`;
      if (card.mapsUrl) card.suggestionMessage += `\n${card.mapsUrl}`;
    }

    if (skip === 0 && occasion === "any" && vibe === "any") {
      admin.from("date_suggestions").insert({
        conversation_id: conv.id, suggestions: allVenueCards,
        venue_api: GOOGLE_PLACES_API_KEY && !usingGeneric ? "google_places_v1" : "none",
        model: ANTHROPIC_API_KEY && !usingGeneric ? "claude-haiku-4-5-20251001" : "none",
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      }).then(() => {}).catch(() => {});
    }

    return json({ suggestions: allVenueCards, areas, topPickIndex, altIndices, cached: false });

  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("[v33] unhandled:", detail);
    return json({ error: "Internal server error", detail, version: 33 }, 500);
  }
});

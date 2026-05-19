// ─────────────────────────────────────────────────────────────────────────────
// SOURCE OF TRUTH
// This file IS the canonical run-matching source. The deployed Supabase edge
// function MUST match this file byte-for-byte after every deploy.
//
// To deploy:
//   1. Edit this file.
//   2. From the project root, run `deploy_edge_function` via the Supabase MCP
//      (or the documented fallback in supabase/functions/run-matching/DEPLOYMENT.md).
//   3. Verify by re-pulling the live source and diffing against this file.
//
// DO NOT deploy from a fork or stale checkout without first pulling the live
// version and confirming it matches this file. A silent rollback to an older
// version has happened before (v100 was deployed out-of-band, leaving the repo
// at v64 for weeks).
//
// History:
//   v71  → archived in git history (was previously in _claude_v71_src table)
//   v100 → current. Clean rewrite, replaced v71 directly. No v72-v99 exist.
// ─────────────────────────────────────────────────────────────────────────────
// =============================================================================
// run-matching v100 (deployed as run-matching, replacing v71)
// =============================================================================
// Clean rewrite. Loads canonical questionnaire from public.matching_config at startup
// so every option string matches the FE exactly.
//
// Behavior changes from v71:
//   1. Q12.2 religion-preference dealbreaker now actually fires (was no-op).
//   2. Single source of truth: canonical JSON drives cluster tables, hard
//      filter pools, dealbreaker eligibility, pref->behavior pairs.
//   3. FE/BE category drift impossible — categories come from canonical.
//
// To regenerate canonical: run scripts/build_canonical.py and upsert into
// public.matching_config (key='canonical_questionnaire').
//
// Author: Claude (Anthropic) for Marissa Meyer / PARALLEL VIP LLC.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "100";

let CANONICAL: any = null;
let CANONICAL_HASH: string = "unloaded";
const QUESTIONS_BY_ID_INTERNAL: Record<string, any> = {};

async function loadCanonical(supabase: any): Promise<void> {
  if (CANONICAL) return;
  const { data, error } = await supabase
    .from("matching_config")
    .select("value")
    .eq("key", "canonical_questionnaire")
    .single();
  if (error || !data) {
    throw new Error(`canonical load failed: ${error?.message || "no row"}`);
  }
  CANONICAL = data.value;
  CANONICAL_HASH = CANONICAL.content_hash;
  for (const q of CANONICAL.questions) {
    QUESTIONS_BY_ID_INTERNAL[q.id] = q;
  }
  console.log(`[v${VERSION}] canonical loaded: ${CANONICAL.questions.length} questions, hash=${CANONICAL_HASH}`);
}

type Tag = "Hard Filter" | "Compatibility Score" | "Dealbreaker Eligible" | "Profile Information";

interface CanonicalQuestion {
  id: string;
  text: string;
  type: string;
  category: string;
  weight: number;
  tags: Tag[];
  has_dealbreaker: boolean | null;
  optional: boolean | null;
  options: string[];
}

interface Profile {
  id: string;
  name: string;
  date_of_birth: string;
  latitude: number | null;
  longitude: number | null;
  has_completed_onboarding: boolean;
  is_suspended: boolean | null;
  is_paused: boolean | null;
  is_hidden_pending_review: boolean | null;
  is_seed_account: boolean | null;
}

type Answers = Record<string, any>;

const QUESTIONS_BY_ID = QUESTIONS_BY_ID_INTERNAL as Record<string, CanonicalQuestion>;

function isScored(qid: string): boolean {
  const q = QUESTIONS_BY_ID[qid];
  if (!q) return false;
  return q.tags.includes("Compatibility Score") && q.weight > 0
    && !q.tags.includes("Hard Filter")
    && q.id !== "1.5" && q.id !== "9.3";
}

function unwrap(v: any): any {
  if (v && typeof v === "object" && !Array.isArray(v) && "value" in v && "isDealbreaker" in v) {
    return v.value;
  }
  return v;
}

function isDealbreakerSet(v: any): boolean {
  return v && typeof v === "object" && !Array.isArray(v) && v.isDealbreaker === true;
}

function getAnswer(answers: Answers, qid: string): any {
  return unwrap(answers[qid]);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

function getCluster(answer: string | null | undefined, options: string[], qid: string): number {
  if (!answer || typeof answer !== "string") return -1;
  const exact = options.indexOf(answer);
  if (exact !== -1) return exact;
  const na = normalize(answer);
  for (let i = 0; i < options.length; i++) {
    if (normalize(options[i]) === na) return i;
  }
  let bestIdx = -1; let bestLen = 0;
  for (let i = 0; i < options.length; i++) {
    const no = normalize(options[i]);
    if (na.length > bestLen && no.includes(na)) { bestLen = na.length; bestIdx = i; }
    else if (no.length > bestLen && na.includes(no)) { bestLen = no.length; bestIdx = i; }
  }
  if (bestIdx === -1) console.warn(`[v${VERSION}] cluster miss q${qid}: "${answer}"`);
  return bestIdx;
}

function clusterDistanceScore(a: string, b: string, options: string[], qid: string): number {
  const ia = getCluster(a, options, qid); const ib = getCluster(b, options, qid);
  if (ia === -1 || ib === -1) return 50;
  const dist = Math.abs(ia - ib);
  const maxDist = Math.max(options.length - 1, 1);
  return Math.round(100 * (1 - dist / maxDist));
}

const GENDER_MAP: Record<string, string[]> = {
  "Woman": ["Women"], "Man": ["Men"],
  "Non-binary": ["Non-binary people", "Gender diverse people"],
  "Genderqueer": ["Non-binary people", "Gender diverse people"],
  "Genderfluid": ["Non-binary people", "Gender diverse people"],
  "Agender": ["Non-binary people", "Gender diverse people"],
  "Transgender woman": ["Women", "Transgender women", "Gender diverse people"],
  "Transgender man": ["Men", "Transgender men", "Gender diverse people"],
  "Prefer to self-describe": ["Non-binary people", "Gender diverse people"],
};

function genderMatches(myGender: string, partnerSeek: string[]): boolean {
  if (!partnerSeek || partnerSeek.length === 0) return false;
  if (partnerSeek.includes("Open to all genders")) return true;
  const myCategories = GENDER_MAP[myGender] || [];
  return myCategories.some(c => partnerSeek.includes(c));
}

function ageOf(dob: string): number {
  const birth = new Date(dob); const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

function heightInInches(h: any): number | null {
  if (!h || typeof h !== "object") return null;
  if (h.unit === "imperial" || h.feet !== undefined) {
    const ft = Number(h.feet) || 0; const inch = Number(h.inches) || 0;
    if (ft < 3 || ft > 8) return null;
    const total = ft * 12 + inch;
    if (total < 54 || total > 88) return null;
    return total;
  }
  if (h.unit === "metric" && h.cm) {
    const total = Math.round(Number(h.cm) / 2.54);
    if (total < 54 || total > 88) return null;
    return total;
  }
  return null;
}

function distancePrefMiles(pref: string | undefined): number {
  if (!pref) return 50;
  const s = String(pref).toLowerCase();
  if (s.includes("25")) return 25;
  if (s.includes("50")) return 50;
  if (s.includes("100")) return 100;
  if (s.includes("state") || s.includes("region")) return 300;
  if (s.includes("country")) return 3000;
  if (s.includes("continent")) return 7000;
  if (s.includes("world") || s.includes("anywhere")) return 25000;
  return 50;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const POLITICS_CLUSTERS: Record<string, string[]> = {
  "Very liberal": ["Very liberal", "Liberal"],
  "Liberal": ["Liberal", "Very liberal", "Moderate"],
  "Moderate": ["Moderate", "Liberal", "Conservative", "Apolitical"],
  "Conservative": ["Conservative", "Very conservative", "Moderate"],
  "Very conservative": ["Very conservative", "Conservative"],
  "Apolitical": ["Apolitical", "Moderate"],
};

function politicsMatches(myView: string, partnerPrefs: string[]): boolean {
  if (!myView || !partnerPrefs || partnerPrefs.length === 0) return false;
  if (partnerPrefs.includes("No preference")) return true;
  if (partnerPrefs.includes(myView)) return true;
  for (const pref of partnerPrefs) {
    if (myView.toLowerCase().includes(pref.toLowerCase())) return true;
    const cluster = POLITICS_CLUSTERS[pref] || [pref];
    for (const c of cluster) {
      if (myView.toLowerCase().includes(c.toLowerCase())) return true;
    }
  }
  return false;
}

interface FilterResult { passed: boolean; reason?: string; }

function checkHardFilters(a: Profile, aAns: Answers, b: Profile, bAns: Answers): FilterResult {
  const aGender = getAnswer(aAns, "1.1");
  const bGender = getAnswer(bAns, "1.1");
  const aSeek = getAnswer(aAns, "9.1") || [];
  const bSeek = getAnswer(bAns, "9.1") || [];
  if (!genderMatches(bGender, aSeek)) return { passed: false, reason: "gender:b-not-in-a-seek" };
  if (!genderMatches(aGender, bSeek)) return { passed: false, reason: "gender:a-not-in-b-seek" };

  const aAge = ageOf(a.date_of_birth); const bAge = ageOf(b.date_of_birth);
  const aRange = getAnswer(aAns, "9.2") || {}; const bRange = getAnswer(bAns, "9.2") || {};
  if (typeof aRange.min === "number" && typeof aRange.max === "number") {
    if (bAge < aRange.min || bAge > aRange.max) return { passed: false, reason: `age:b(${bAge})-outside-a[${aRange.min},${aRange.max}]` };
  }
  if (typeof bRange.min === "number" && typeof bRange.max === "number") {
    if (aAge < bRange.min || aAge > bRange.max) return { passed: false, reason: `age:a(${aAge})-outside-b[${bRange.min},${bRange.max}]` };
  }

  const aHeight = heightInInches(getAnswer(aAns, "1.5"));
  const bHeight = heightInInches(getAnswer(bAns, "1.5"));
  const aHRange = getAnswer(aAns, "9.3");
  const bHRange = getAnswer(bAns, "9.3");
  if (aHeight !== null && bHRange) {
    const min = (Number(bHRange.minFeet) || 0) * 12 + (Number(bHRange.minInches) || 0);
    const max = (Number(bHRange.maxFeet) || 0) * 12 + (Number(bHRange.maxInches) || 0);
    if (min > 0 && max > 0 && (aHeight < min || aHeight > max)) {
      return { passed: false, reason: `height:a(${aHeight}in)-outside-b[${min},${max}]` };
    }
  }
  if (bHeight !== null && aHRange) {
    const min = (Number(aHRange.minFeet) || 0) * 12 + (Number(aHRange.minInches) || 0);
    const max = (Number(aHRange.maxFeet) || 0) * 12 + (Number(aHRange.maxInches) || 0);
    if (min > 0 && max > 0 && (bHeight < min || bHeight > max)) {
      return { passed: false, reason: `height:b(${bHeight}in)-outside-a[${min},${max}]` };
    }
  }

  if (a.latitude !== null && a.longitude !== null && b.latitude !== null && b.longitude !== null) {
    const dist = haversineMiles(a.latitude, a.longitude, b.latitude, b.longitude);
    const aMaxDist = distancePrefMiles(getAnswer(aAns, "9.4"));
    const bMaxDist = distancePrefMiles(getAnswer(bAns, "9.4"));
    if (dist > aMaxDist) return { passed: false, reason: `distance:${dist.toFixed(0)}mi>a-max-${aMaxDist}` };
    if (dist > bMaxDist) return { passed: false, reason: `distance:${dist.toFixed(0)}mi>b-max-${bMaxDist}` };
  }

  const aView = getAnswer(aAns, "6.1"); const bView = getAnswer(bAns, "6.1");
  const aPolPref = getAnswer(aAns, "12.1") || []; const bPolPref = getAnswer(bAns, "12.1") || [];
  if (aView && Array.isArray(bPolPref) && bPolPref.length > 0) {
    if (!politicsMatches(aView, bPolPref)) return { passed: false, reason: "politics:a-not-in-b-pref" };
  }
  if (bView && Array.isArray(aPolPref) && aPolPref.length > 0) {
    if (!politicsMatches(bView, aPolPref)) return { passed: false, reason: "politics:b-not-in-a-pref" };
  }

  return { passed: true };
}

interface DealbreakerResult { passed: boolean; reason?: string; }

function passesPreferenceDealbreaker(qid: string, prefValue: string, partnerBehavior: string): boolean {
  switch (qid) {
    case "11.1": {
      if (!prefValue) return true;
      if (prefValue === "Must not drink") return partnerBehavior === "Never drink";
      if (prefValue === "Prefer non-drinker") return partnerBehavior === "Never drink" || /rarely/i.test(partnerBehavior);
      return true;
    }
    case "11.1b": {
      if (!prefValue) return true;
      if (prefValue.includes("drinks with me") || prefValue.includes("part of how I connect")) {
        return partnerBehavior !== "Never drink";
      }
      return true;
    }
    case "11.2": {
      if (!prefValue) return true;
      if (prefValue === "Must not smoke" || prefValue === "Prefer non-smoker") {
        return partnerBehavior === "Never" || /quit|trying/i.test(partnerBehavior);
      }
      return true;
    }
    case "11.3": {
      if (!prefValue) return true;
      if (/prefer they don't/i.test(prefValue) || /No.*prefer they don't/i.test(prefValue)) {
        return partnerBehavior === "Never";
      }
      return true;
    }
    case "11.6": {
      if (!prefValue) return true;
      const noPets = partnerBehavior === "No pets";
      if (/allergies|cannot be around/i.test(prefValue)) return noPets;
      if (/prefer no pets/i.test(prefValue)) return noPets;
      if (/Small pets only/i.test(prefValue)) return noPets || /other pets/i.test(partnerBehavior);
      if (/Dogs are fine but I'm not a cat/i.test(prefValue)) return !/Cat\(s\)/i.test(partnerBehavior);
      if (/Cats are fine but I'm not a dog/i.test(prefValue)) return !/Dog\(s\)/i.test(partnerBehavior);
      return true;
    }
    case "11.7": {
      if (!prefValue) return true;
      if (/Not okay|important to me/i.test(prefValue)) {
        return /^No/i.test(partnerBehavior);
      }
      return true;
    }
    case "11.8": {
      if (!prefValue) return true;
      if (/participates|part of how I experience/i.test(prefValue)) {
        return /sometimes|regularly/i.test(partnerBehavior);
      }
      return true;
    }
  }
  return true;
}

const PREF_TO_BEHAVIOR: Record<string, string> = {
  "11.1": "3.1", "11.1b": "3.2", "11.2": "3.3", "11.3": "3.4", "11.4": "3.5",
  "11.6": "3.8", "11.7": "3.10", "11.8": "3.10", "12.2b": "6.2b", "12.7": "8.7",
};
const PREF_WEIGHTS: Record<string, number> = {
  "11.1": 3, "11.1b": 3, "11.2": 3, "11.3": 2, "11.4": 2,
  "11.6": 1, "11.7": 3, "11.8": 3, "12.2b": 3, "12.7": 3,
};
const PREF_CATEGORIES: Record<string, string> = {
  "11.1": "Lifestyle Behaviors", "11.1b": "Lifestyle Behaviors",
  "11.2": "Lifestyle Behaviors", "11.3": "Lifestyle Behaviors",
  "11.4": "Lifestyle Behaviors", "11.6": "Lifestyle Behaviors",
  "11.7": "Lifestyle Behaviors", "11.8": "Lifestyle Behaviors",
  "12.2b": "Values & Beliefs", "12.7": "Life Goals",
};

function religionMatches(partnerBelief: string, prefArr: string[]): boolean {
  if (!partnerBelief || !prefArr || prefArr.length === 0) return true;
  if (prefArr.includes("Open to different beliefs") || prefArr.includes("No preference")) return true;
  if (prefArr.includes(partnerBelief)) return true;
  if (prefArr.includes("Prefer secular / non-religious")) {
    return /atheist|agnostic|spiritual but not|prefer not to label/i.test(partnerBelief);
  }
  return false;
}

const ACTIVE_HOBBIES = new Set([
  "Hiking", "Cycling", "Running", "Yoga", "Climbing", "Surfing", "Skiing",
  "Snowboarding", "Tennis", "Pickleball", "Crossfit", "Weightlifting",
  "Swimming", "Dancing", "Martial arts", "Biking",
]);

function passesAdventurePartnerCheck(myAns: Answers, partnerAns: Answers): boolean {
  const myHobbies: string[] = getAnswer(myAns, "3.9") || [];
  const theirHobbies: string[] = getAnswer(partnerAns, "3.9") || [];
  const shared = myHobbies.filter(h => theirHobbies.includes(h));
  if (shared.length >= 3) return true;
  const myActive = myHobbies.filter(h => ACTIVE_HOBBIES.has(h));
  const theirActive = theirHobbies.filter(h => ACTIVE_HOBBIES.has(h));
  if (myActive.length >= 3 && theirActive.length >= 3) return true;
  return false;
}

function checkDealbreakers(meAns: Answers, meDB: Set<string>, partnerAns: Answers): DealbreakerResult {
  for (const qid of meDB) {
    if (qid in PREF_TO_BEHAVIOR) {
      const prefV = getAnswer(meAns, qid);
      const behaviorQ = PREF_TO_BEHAVIOR[qid];
      const behaviorV = getAnswer(partnerAns, behaviorQ);
      if (prefV && behaviorV && !passesPreferenceDealbreaker(qid, String(prefV), String(behaviorV))) {
        return { passed: false, reason: `q${qid}-pref-vs-q${behaviorQ}-behavior` };
      }
    }
  }

  if (meDB.has("12.2")) {
    const prefArr = getAnswer(meAns, "12.2");
    const partnerBelief = getAnswer(partnerAns, "6.2");
    let prefList: string[];
    if (Array.isArray(prefArr)) prefList = prefArr;
    else if (typeof prefArr === "string") prefList = [prefArr];
    else prefList = [];
    if (prefList.length > 0 && partnerBelief) {
      if (prefList.includes("Similar beliefs to mine")) {
        const myBelief = getAnswer(meAns, "6.2");
        if (myBelief && partnerBelief !== myBelief) {
          return { passed: false, reason: "q12.2-strict-belief-mismatch" };
        }
      } else if (!religionMatches(partnerBelief, prefList)) {
        return { passed: false, reason: "q12.2-belief-not-in-pref" };
      }
    }
  }

  if (meDB.has("3.11")) {
    const v = getAnswer(meAns, "3.11");
    if (v && /adventure partner|actively does life/i.test(String(v))) {
      if (!passesAdventurePartnerCheck(meAns, partnerAns)) {
        return { passed: false, reason: "q3.11-adventure-partner-no-overlap" };
      }
    }
  }

  if (meDB.has("9.4")) {
    const myMax = distancePrefMiles(getAnswer(meAns, "9.4"));
    const theirMax = distancePrefMiles(getAnswer(partnerAns, "9.4"));
    if (theirMax < myMax) {
      return { passed: false, reason: "q9.4-partner-more-restrictive" };
    }
  }

  return { passed: true };
}

function scorePets(a: string, b: string): number {
  const opts = QUESTIONS_BY_ID["3.8"]?.options || [];
  const ia = getCluster(a, opts, "3.8"); const ib = getCluster(b, opts, "3.8");
  if (ia === -1 || ib === -1) return 50;
  const matrix: number[][] = [
    [100, 75, 75, 80, 70, 40],
    [75, 100, 60, 85, 70, 80],
    [75, 60, 100, 70, 70, 80],
    [80, 85, 70, 100, 70, 75],
    [70, 70, 70, 70, 100, 75],
    [40, 80, 80, 75, 75, 100],
  ];
  return matrix[ia]?.[ib] ?? 50;
}

function scoreWeekdayEve(a: string, b: string): number {
  const opts = QUESTIONS_BY_ID["4.2"]?.options || [];
  const ia = getCluster(a, opts, "4.2"); const ib = getCluster(b, opts, "4.2");
  if (ia === -1 || ib === -1) return 50;
  if (ia === ib) return 100;
  return clusterDistanceScore(a, b, opts, "4.2");
}

function scoreLocation(a: string, b: string): number {
  const opts = QUESTIONS_BY_ID["4.7"]?.options || [];
  const ia = getCluster(a, opts, "4.7"); const ib = getCluster(b, opts, "4.7");
  if (ia === -1 || ib === -1) return 50;
  if (a.includes("Wherever") || b.includes("Wherever")) return 85;
  if (ia === ib) return 100;
  return clusterDistanceScore(a, b, opts, "4.7");
}

function scoreReligion(a: string, b: string, aOpenInQ12_2?: boolean, bOpenInQ12_2?: boolean): number {
  if (a === b) return 100;
  const aLower = a.toLowerCase(); const bLower = b.toLowerCase();
  let baseline = 30;
  if (aOpenInQ12_2 && bOpenInQ12_2) baseline = 45;
  const seculars = ["atheist", "agnostic", "spiritual but not", "prefer not to label"];
  const aSec = seculars.some(s => aLower.includes(s));
  const bSec = seculars.some(s => bLower.includes(s));
  if (aSec && bSec) return 70;
  const christianish = ["christian", "catholic", "protestant"];
  if (christianish.some(s => aLower.includes(s)) && christianish.some(s => bLower.includes(s))) return 70;
  return baseline;
}

function scoreStress(a: string, b: string): number {
  const opts = QUESTIONS_BY_ID["7.6"]?.options || [];
  const aPullBack = /pull back|space|process|keep it separate/i.test(a);
  const bPullBack = /pull back|space|process|keep it separate/i.test(b);
  const aLeanIn = /lean on/i.test(a);
  const bLeanIn = /lean on/i.test(b);
  if (aPullBack && bPullBack) return 90;
  if (aLeanIn && bLeanIn) return 80;
  if ((aPullBack && bLeanIn) || (aLeanIn && bPullBack)) return 20;
  return clusterDistanceScore(a, b, opts, "7.6");
}

const GOTTMAN: number[][] = [
  [100, 90, 65, 60, 45],
  [90, 90, 60, 55, 40],
  [65, 60, 50, 30, 25],
  [60, 55, 30, 50, 25],
  [45, 40, 25, 25, 30],
];

function classifyGottman(answer: string): number {
  const s = answer.toLowerCase();
  if (/catastrophize|make it personal|explode|blow up|lash out/.test(s)) return 4;
  if (/go quiet|pull away|withdraw|shut down|disengage/.test(s)) return 3;
  if (/harsher than I intend|criticize|sharp|sarcas/.test(s)) return 2;
  if (/let the small things go|pick.{0,5}battle|raise the bigger/.test(s)) return 1;
  if (/bring it up directly|staying curious|talk it through/.test(s)) return 0;
  return 1;
}

function scoreGottman(a: string, b: string): number {
  return GOTTMAN[classifyGottman(a)][classifyGottman(b)];
}

function scoreChildrenStatus(a: string, b: string): number {
  if (a === b) return 100;
  const noKids = (s: string) => /no children/i.test(s);
  const grown = (s: string) => /adult children|grown/i.test(s);
  const young = (s: string) => /young children|teenagers/i.test(s);
  if ((noKids(a) && grown(b)) || (grown(a) && noKids(b))) return 50;
  if ((noKids(a) && young(b)) || (young(a) && noKids(b))) return 20;
  return 60;
}

function scoreHousehold(a: string, b: string): number {
  if (a === b) return 100;
  const aMore = /carry more/i.test(a);
  const aLess = /partner to carry more/i.test(a);
  const bMore = /carry more/i.test(b);
  const bLess = /partner to carry more/i.test(b);
  if ((aMore && bLess) || (aLess && bMore)) return 90;
  const opts = QUESTIONS_BY_ID["11.9"]?.options || [];
  return clusterDistanceScore(a, b, opts, "11.9");
}

const BODY_TYPE_SCALE = ["Slim", "Athletic", "Average / Medium build", "Curvy", "Muscular", "Broad / Solid", "Full-figured", "Plus-size"];

function scoreBodyType(myBuild: string[], partnerPref: string[]): number {
  if (!myBuild || myBuild.length === 0) return 50;
  if (!partnerPref || partnerPref.length === 0) return 75;
  if (partnerPref.includes("Open to all body types")) return 100;
  for (const bt of myBuild) if (partnerPref.includes(bt)) return 100;
  let bestScore = 0;
  for (const my of myBuild) {
    const myIdx = BODY_TYPE_SCALE.indexOf(my);
    if (myIdx < 0) continue;
    for (const pref of partnerPref) {
      const prefIdx = BODY_TYPE_SCALE.indexOf(pref);
      if (prefIdx < 0) continue;
      const dist = Math.abs(myIdx - prefIdx);
      const s = Math.max(0, 100 - dist * 25);
      if (s > bestScore) bestScore = s;
    }
  }
  return bestScore || 30;
}

function scoreMultiSelectJaccard(a: string[], b: string[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a); const bSet = new Set(b);
  let intersection = 0; for (const v of aSet) if (bSet.has(v)) intersection++;
  const union = new Set([...aSet, ...bSet]).size;
  return Math.round(100 * intersection / union);
}

function scoreMultiSelectOverlapMin(a: string[], b: string[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a); const bSet = new Set(b);
  let intersection = 0; for (const v of aSet) if (bSet.has(v)) intersection++;
  return Math.round(100 * intersection / Math.min(aSet.size, bSet.size));
}

type AttachmentStyle = "secure" | "anxious" | "avoidant" | "fearful";

function classifyAttachment(q71a: string, q71b: string): AttachmentStyle {
  const a = (q71a || "").toLowerCase();
  const b = (q71b || "").toLowerCase();
  const aSecure = /assume.*busy|don't stress/.test(a);
  const aAnxious = /uneasy|checking my phone|still thinking about it|worry/.test(a);
  const aAvoidant = /irritated.*pull back|pull back/.test(a);
  const bSecure = /natural.*lean into|lean into/.test(b);
  const bAnxious = /exciting.*nervous|nervous/.test(b);
  const bAvoidant = /too much.*space|need space|urge to pull away/.test(b);
  if (aSecure && bSecure) return "secure";
  if ((aAnxious && bAvoidant) || (aAvoidant && bAnxious)) return "fearful";
  if (aAnxious || bAnxious) return "anxious";
  if (aAvoidant || bAvoidant) return "avoidant";
  return "secure";
}

function scoreAttachmentPair(meStyle: AttachmentStyle, themStyle: AttachmentStyle): { score: number; isAnxiousAvoidant: boolean } {
  const matrix: Record<AttachmentStyle, Record<AttachmentStyle, number>> = {
    secure:   { secure: 100, anxious: 80, avoidant: 70, fearful: 65 },
    anxious:  { secure: 80, anxious: 70, avoidant: 25, fearful: 50 },
    avoidant: { secure: 70, anxious: 25, avoidant: 65, fearful: 55 },
    fearful:  { secure: 65, anxious: 50, avoidant: 55, fearful: 40 },
  };
  const score = matrix[meStyle][themStyle];
  const isAnxiousAvoidant = (meStyle === "anxious" && themStyle === "avoidant")
    || (meStyle === "avoidant" && themStyle === "anxious");
  return { score, isAnxiousAvoidant };
}

interface QuestionScore { qid: string; score: number; weight: number; category: string; }

function scoreQuestion(qid: string, meAns: Answers, partnerAns: Answers): QuestionScore | null {
  const q = QUESTIONS_BY_ID[qid];
  if (!q) return null;
  const meV = getAnswer(meAns, qid);
  const themV = getAnswer(partnerAns, qid);

  if (qid === "3.8") { if (!meV || !themV) return null; return { qid, score: scorePets(String(meV), String(themV)), weight: q.weight, category: q.category }; }
  if (qid === "4.2") { if (!meV || !themV) return null; return { qid, score: scoreWeekdayEve(String(meV), String(themV)), weight: q.weight, category: q.category }; }
  if (qid === "4.7") { if (!meV || !themV) return null; return { qid, score: scoreLocation(String(meV), String(themV)), weight: q.weight, category: q.category }; }
  if (qid === "6.2") {
    if (!meV || !themV) return null;
    const mePref = getAnswer(meAns, "12.2"); const themPref = getAnswer(partnerAns, "12.2");
    const aOpen = (Array.isArray(mePref) && mePref.includes("Open to different beliefs")) || mePref === "Open to different beliefs";
    const bOpen = (Array.isArray(themPref) && themPref.includes("Open to different beliefs")) || themPref === "Open to different beliefs";
    return { qid, score: scoreReligion(String(meV), String(themV), aOpen, bOpen), weight: q.weight, category: q.category };
  }
  if (qid === "7.6") { if (!meV || !themV) return null; return { qid, score: scoreStress(String(meV), String(themV)), weight: q.weight, category: q.category }; }
  if (qid === "7.11") { if (!meV || !themV) return null; return { qid, score: scoreGottman(String(meV), String(themV)), weight: q.weight, category: q.category }; }
  if (qid === "8.1") { if (!meV || !themV) return null; return { qid, score: scoreChildrenStatus(String(meV), String(themV)), weight: q.weight, category: q.category }; }
  if (qid === "11.9") { if (!meV || !themV) return null; return { qid, score: scoreHousehold(String(meV), String(themV)), weight: q.weight, category: q.category }; }
  if (qid === "1.7") {
    const myBuild = Array.isArray(meV) ? meV : (meV ? [String(meV)] : []);
    const partnerPref = getAnswer(partnerAns, "10.1");
    const partnerPrefArr = Array.isArray(partnerPref) ? partnerPref : (partnerPref ? [String(partnerPref)] : []);
    if (myBuild.length === 0) return null;
    return { qid, score: scoreBodyType(myBuild, partnerPrefArr), weight: q.weight, category: q.category };
  }
  if (qid === "12.2") {
    const themBelief = getAnswer(partnerAns, "6.2");
    const myPrefArr = Array.isArray(meV) ? meV : (meV ? [String(meV)] : []);
    if (!themBelief || myPrefArr.length === 0) return null;
    if (myPrefArr.includes("Open to different beliefs") || myPrefArr.includes("No preference")) {
      return { qid, score: 90, weight: q.weight, category: q.category };
    }
    if (myPrefArr.includes(String(themBelief))) {
      return { qid, score: 100, weight: q.weight, category: q.category };
    }
    if (religionMatches(String(themBelief), myPrefArr)) {
      return { qid, score: 80, weight: q.weight, category: q.category };
    }
    return { qid, score: 30, weight: q.weight, category: q.category };
  }

  if (q.type === "MS" || q.type === "MS_MAX") {
    const aArr = Array.isArray(meV) ? meV.map(String) : (meV ? [String(meV)] : []);
    const bArr = Array.isArray(themV) ? themV.map(String) : (themV ? [String(themV)] : []);
    if (aArr.length === 0 || bArr.length === 0) return null;
    const score = qid === "3.9" ? scoreMultiSelectOverlapMin(aArr, bArr) : scoreMultiSelectJaccard(aArr, bArr);
    return { qid, score, weight: q.weight, category: q.category };
  }

  if (!meV || !themV) return null;
  return { qid, score: clusterDistanceScore(String(meV), String(themV), q.options, qid), weight: q.weight, category: q.category };
}

function scorePrefVsBehavior(prefQid: string, mePref: any, partnerBehavior: any): number {
  const prefStr = String(unwrap(mePref) || "");
  const behStr = String(unwrap(partnerBehavior) || "");
  if (!prefStr || !behStr) return 0;
  const passes = passesPreferenceDealbreaker(prefQid, prefStr, behStr);
  if (passes) {
    if (/No preference|Open/i.test(prefStr)) return 75;
    return 100;
  }
  return 30;
}

const CATEGORY_TOKENS: Record<string, number> = {
  "Attachment & Emotional Health": 8, "Communication & Conflict": 6,
  "Life Goals": 6, "Values & Beliefs": 6,
  "Lifestyle Behaviors": 4, "Social & Shared Life": 4,
  "Financial & Career": 3, "Intimacy & Connection": 3,
};

function scoreDirectional(meAns: Answers, partnerAns: Answers): { total: number; byCategory: Record<string, number>; questionScores: QuestionScore[]; attachmentStyle: AttachmentStyle; isAnxiousAvoidant: boolean; } {
  const questionScores: QuestionScore[] = [];
  for (const q of CANONICAL.questions as CanonicalQuestion[]) {
    if (!isScored(q.id)) continue;
    if (q.id === "7.1a" || q.id === "7.1b") continue;
    const s = scoreQuestion(q.id, meAns, partnerAns);
    if (s) questionScores.push(s);
  }

  const meStyle = classifyAttachment(getAnswer(meAns, "7.1a") || "", getAnswer(meAns, "7.1b") || "");
  const themStyle = classifyAttachment(getAnswer(partnerAns, "7.1a") || "", getAnswer(partnerAns, "7.1b") || "");
  const { score: attachScore, isAnxiousAvoidant } = scoreAttachmentPair(meStyle, themStyle);
  questionScores.push({ qid: "7.1", score: attachScore, weight: 10, category: "Attachment & Emotional Health" });

  for (const [prefQid, behaviorQid] of Object.entries(PREF_TO_BEHAVIOR)) {
    const myPref = getAnswer(meAns, prefQid);
    const partnerBeh = getAnswer(partnerAns, behaviorQid);
    if (myPref === undefined || partnerBeh === undefined) continue;
    const score = scorePrefVsBehavior(prefQid, myPref, partnerBeh);
    questionScores.push({
      qid: `${prefQid}->${behaviorQid}`, score,
      weight: PREF_WEIGHTS[prefQid] || 1,
      category: PREF_CATEGORIES[prefQid] || "Lifestyle Behaviors",
    });
  }

  const byCategory: Record<string, number> = {};
  const categoryWeights: Record<string, number> = {};
  for (const s of questionScores) {
    byCategory[s.category] = (byCategory[s.category] || 0) + s.score * s.weight;
    categoryWeights[s.category] = (categoryWeights[s.category] || 0) + s.weight;
  }
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat] = Math.round(byCategory[cat] / categoryWeights[cat]);
  }

  let totalWeighted = 0; let totalTokens = 0;
  for (const [cat, tokens] of Object.entries(CATEGORY_TOKENS)) {
    const catScore = byCategory[cat];
    if (catScore !== undefined) {
      totalWeighted += catScore * tokens;
      totalTokens += tokens;
    }
  }
  let total = totalTokens > 0 ? Math.round(totalWeighted / totalTokens) : 0;
  if (isAnxiousAvoidant) total = Math.round(total * 0.90);

  return { total, byCategory, questionScores, attachmentStyle: meStyle, isAnxiousAvoidant };
}

function buildWhyYouMatched(meAns: Answers, themAns: Answers, byCategory: Record<string, number>): string[] {
  const reasons: string[] = [];
  for (const [cat, sc] of Object.entries(byCategory)) {
    if (sc >= 80) reasons.push(`Strong alignment on ${cat.toLowerCase()}`);
    if (reasons.length >= 5) break;
  }
  const myH: string[] = getAnswer(meAns, "3.9") || [];
  const themH: string[] = getAnswer(themAns, "3.9") || [];
  const shared = myH.filter(h => themH.includes(h));
  if (shared.length >= 3 && reasons.length < 5) reasons.push(`Shared interests: ${shared.slice(0, 3).join(", ")}`);
  const a86 = getAnswer(meAns, "8.6"); const b86 = getAnswer(themAns, "8.6");
  if (a86 && a86 === b86 && reasons.length < 5) reasons.push("Both looking for the same kind of relationship");
  const a82 = getAnswer(meAns, "8.2"); const b82 = getAnswer(themAns, "8.2");
  if (a82 && a82 === b82 && reasons.length < 5) reasons.push("Aligned on whether you want children");
  return reasons.slice(0, 5);
}

function buildPotentialDifferences(qScores: QuestionScore[]): string[] {
  const diffs: string[] = [];
  for (const s of qScores) {
    if (s.score < 50 && diffs.length < 3) {
      const q = QUESTIONS_BY_ID[s.qid.split("->")[0]];
      if (q) diffs.push(`Different views on: ${q.text}`);
    }
  }
  return diffs;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const HARMONIC_FLOOR = 40;
const DIRECTIONAL_FLOOR = 30;

async function loadProfilesAndAnswers(userId: string) {
  const { data: meProfile, error: meErr } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (meErr || !meProfile) throw new Error(`profile not found: ${userId}`);
  const { data: meAnsRow } = await sb.from("user_answers").select("answers").eq("user_id", userId).single();
  const { data: meDBRow } = await sb.from("user_dealbreakers").select("question_ids").eq("user_id", userId).maybeSingle();
  const meAnswers = (meAnsRow?.answers || {}) as Answers;
  const meDB = new Set<string>((meDBRow?.question_ids || []) as string[]);
  for (const [qid, val] of Object.entries(meAnswers)) {
    if (isDealbreakerSet(val)) meDB.add(qid);
  }

  const { data: candidates } = await sb.from("profiles").select("*").eq("has_completed_onboarding", true).neq("id", userId);
  const candidateAnswers: Record<string, Answers> = {};
  const candidateDBs: Record<string, Set<string>> = {};
  if (candidates && candidates.length > 0) {
    const ids = candidates.map((c: any) => c.id);
    const { data: ansRows } = await sb.from("user_answers").select("user_id, answers").in("user_id", ids);
    const { data: dbRows } = await sb.from("user_dealbreakers").select("user_id, question_ids").in("user_id", ids);
    for (const r of ansRows || []) candidateAnswers[r.user_id] = r.answers || {};
    for (const r of dbRows || []) candidateDBs[r.user_id] = new Set(r.question_ids || []);
    for (const [uid, ans] of Object.entries(candidateAnswers)) {
      if (!candidateDBs[uid]) candidateDBs[uid] = new Set();
      for (const [qid, val] of Object.entries(ans)) {
        if (isDealbreakerSet(val)) candidateDBs[uid].add(qid);
      }
    }
  }

  return { me: meProfile as Profile, meAnswers, meDB, candidates: (candidates || []) as Profile[], candidateAnswers, candidateDBs };
}

async function runMatching(userId: string) {
  const { me, meAnswers, meDB, candidates, candidateAnswers, candidateDBs } = await loadProfilesAndAnswers(userId);

  await sb.from("matches").delete().eq("user_id", userId);
  await sb.from("matches").delete().eq("matched_user_id", userId);

  const inserts: any[] = [];
  let hardFilterRejects = 0; let dealbreakerRejects = 0; let scoreRejects = 0;
  const sampleRejects: string[] = [];

  for (const c of candidates) {
    if (c.is_suspended || c.is_paused || c.is_hidden_pending_review) continue;
    const cAns = candidateAnswers[c.id] || {};
    const cDB = candidateDBs[c.id] || new Set();

    const hf = checkHardFilters(me, meAnswers, c, cAns);
    if (!hf.passed) { hardFilterRejects++; if (sampleRejects.length < 8) sampleRejects.push(`${c.name}: HF ${hf.reason}`); continue; }

    const dbMe = checkDealbreakers(meAnswers, meDB, cAns);
    if (!dbMe.passed) { dealbreakerRejects++; if (sampleRejects.length < 8) sampleRejects.push(`${c.name}: my-DB ${dbMe.reason}`); continue; }
    const dbThem = checkDealbreakers(cAns, cDB, meAnswers);
    if (!dbThem.passed) { dealbreakerRejects++; if (sampleRejects.length < 8) sampleRejects.push(`${c.name}: their-DB ${dbThem.reason}`); continue; }

    const dirA = scoreDirectional(meAnswers, cAns);
    const dirB = scoreDirectional(cAns, meAnswers);

    if (dirA.total < DIRECTIONAL_FLOOR || dirB.total < DIRECTIONAL_FLOOR) {
      scoreRejects++;
      if (sampleRejects.length < 8) sampleRejects.push(`${c.name}: dir<${DIRECTIONAL_FLOOR} (a=${dirA.total} b=${dirB.total})`);
      continue;
    }

    const harmonic = (dirA.total + dirB.total) > 0 ? Math.round((2 * dirA.total * dirB.total) / (dirA.total + dirB.total)) : 0;
    if (harmonic < HARMONIC_FLOOR) {
      scoreRejects++;
      if (sampleRejects.length < 8) sampleRejects.push(`${c.name}: harmonic ${harmonic}<${HARMONIC_FLOOR}`);
      continue;
    }

    let asymmetryCategory: string | undefined; let asymmetryGap = 0;
    for (const cat of Object.keys(dirA.byCategory)) {
      const a = dirA.byCategory[cat] || 0; const b = dirB.byCategory[cat] || 0;
      const gap = Math.abs(a - b);
      if (gap > asymmetryGap) { asymmetryGap = gap; asymmetryCategory = cat; }
    }

    const myH: string[] = getAnswer(meAnswers, "3.9") || [];
    const themH: string[] = getAnswer(cAns, "3.9") || [];
    const sharedHobbies = myH.filter(h => themH.includes(h));

    inserts.push({
      user_id: userId, matched_user_id: c.id,
      compatibility_score: harmonic, individual_score: dirA.total,
      breakdown: dirA.byCategory,
      why_you_matched: buildWhyYouMatched(meAnswers, cAns, dirA.byCategory),
      potential_differences: buildPotentialDifferences(dirA.questionScores),
      asymmetry_category: asymmetryCategory, asymmetry_gap: asymmetryGap,
      shared_hobbies: sharedHobbies.slice(0, 5),
    });
    inserts.push({
      user_id: c.id, matched_user_id: userId,
      compatibility_score: harmonic, individual_score: dirB.total,
      breakdown: dirB.byCategory,
      why_you_matched: buildWhyYouMatched(cAns, meAnswers, dirB.byCategory),
      potential_differences: buildPotentialDifferences(dirB.questionScores),
      asymmetry_category: asymmetryCategory, asymmetry_gap: asymmetryGap,
      shared_hobbies: sharedHobbies.slice(0, 5),
    });
  }

  if (inserts.length > 0) await sb.from("matches").insert(inserts);

  return {
    success: true, version: VERSION, canonical_hash: CANONICAL_HASH,
    matched: inserts.length / 2, totalInserted: inserts.length,
    candidatesConsidered: candidates.length,
    hardFilterRejects, dealbreakerRejects, scoreRejects, sampleRejects,
  };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  if (url.pathname.endsWith("/health")) {
    try {
      await loadCanonical(sb);
      return new Response(JSON.stringify({
        version: VERSION, canonical_hash: CANONICAL_HASH,
        scored_questions: (CANONICAL.questions as CanonicalQuestion[]).filter((q: CanonicalQuestion) => isScored(q.id)).length,
        hard_filters: (CANONICAL.questions as CanonicalQuestion[]).filter((q: CanonicalQuestion) => q.tags.includes("Hard Filter")).length,
        loaded: true,
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    } catch (err: any) {
      return new Response(JSON.stringify({ version: VERSION, loaded: false, error: err.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const userId = body.userId || body.user_id;
  if (!userId) {
    return new Response(JSON.stringify({ error: "userId required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  try {
    await loadCanonical(sb);
    const result = await runMatching(String(userId));
    return new Response(JSON.stringify(result, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(`[v${VERSION}] error:`, err);
    return new Response(JSON.stringify({ error: err.message || String(err), version: VERSION }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});

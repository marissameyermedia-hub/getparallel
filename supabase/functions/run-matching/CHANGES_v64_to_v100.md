# run-matching: v64 → v100

Generated: 2026-05-15

## Summary

v100 is a clean rewrite of v64. The most significant structural change is that v100
loads all question definitions (options, weights, categories, tags) dynamically from
`public.matching_config` (key `canonical_questionnaire`) at cold-start, eliminating
the hardcoded option arrays that caused FE/BE drift in v64. The scoring logic was
largely preserved but rewritten to use the canonical data: cluster matching, all
specialty scorers (pets, attachment, Gottman, religion, body type, etc.) remain, but
now reference `QUESTIONS_BY_ID` populated from the canonical instead of inline arrays.
Notable behavioral changes: Q12.2 religion-preference dealbreaker now fires (was a
no-op in v71 and v64); `PREF_TO_BEHAVIOR` mapping replaces inline dealbreaker checks;
`CATEGORY_TOKENS` weights are unchanged; anxious-avoidant harmonic penalty remains 10%.
The Supabase client import changed from `npm:` to `esm.sh`. No v72–v99 exist; the path
was v64 (repo) → v71 (prior live) → v100 (current live, clean rewrite).

## Full diff

```diff
--- /tmp/run-matching-v64.ts	2026-05-15 16:54:59.202727038 +0000
+++ /home/user/getparallel/supabase/functions/run-matching/index.ts	2026-05-15 16:54:50.438727239 +0000
@@ -1,747 +1,931 @@
-import { createClient } from 'npm:@supabase/supabase-js@2';
-
-const supabase = createClient(
-  Deno.env.get('SUPABASE_URL')!,
-  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
-);
-
-// =====================================================
-// run-matching v64
+// ─────────────────────────────────────────────────────────────────────────────
+// SOURCE OF TRUTH
+// This file IS the canonical run-matching source. The deployed Supabase edge
+// function MUST match this file byte-for-byte after every deploy.
 //
-// Changes from v63:
-//   ENHANCE: Q7.10 (therapy openness) wired into Attachment, w=2
-//   ENHANCE: Q7.11 (repeat-bother instinct) wired into Comm & Conflict, w=4
-//   ENHANCE: Q11.9 (household division) wired into Lifestyle, w=3
-//   FIX: Hard-filter dealbreaker leak — skip Q-IDs 9.1, 9.1b, 9.2, 9.3, 9.4, 12.1
-//        in checkDealbreakers since checkHardFilters already enforces them.
-//   FIX: Anxious-avoidant penalty threshold tightened from >=2 to >=1.
-//   CLEANUP: Phantom Q12.5 removed (was scored but never collected).
+// To deploy:
+//   1. Edit this file.
+//   2. From the project root, run `deploy_edge_function` via the Supabase MCP
+//      (or the documented fallback in supabase/functions/run-matching/DEPLOYMENT.md).
+//   3. Verify by re-pulling the live source and diffing against this file.
 //
-// Changes from v62:
-//   FIX: Dealbreaker bug for preference questions (11.x).
+// DO NOT deploy from a fork or stale checkout without first pulling the live
+// version and confirming it matches this file. A silent rollback to an older
+// version has happened before (v100 was deployed out-of-band, leaving the repo
+// at v64 for weeks).
 //
-//   Previous behavior: dealbreaker check used scorePrefVsBehavior < 25
-//   as the gate. That function returns soft-compatibility scores tuned
-//   for ranking, so 'Must not drink' + 'Rarely (special occasions)'
-//   returned 70 — well above 25 — letting through a partner who DOES
-//   drink for someone whose dealbreaker is no alcohol.
+// History:
+//   v71  → archived in git history (was previously in _claude_v71_src table)
+//   v100 → current. Clean rewrite, replaced v71 directly. No v72-v99 exist.
+// ─────────────────────────────────────────────────────────────────────────────
+// =============================================================================
+// run-matching v100 (deployed as run-matching, replacing v71)
+// =============================================================================
+// Clean rewrite. Loads canonical questionnaire from public.matching_config at startup
+// so every option string matches the FE exactly.
 //
-//   New behavior: dedicated passesPreferenceDealbreaker() function with
-//   absolute semantics. When a user toggles a preference as a
-//   dealbreaker, ANY violation of that preference fails the gate. The
-//   soft scoring is preserved for compatibility ranking after the gate.
+// Behavior changes from v71:
+//   1. Q12.2 religion-preference dealbreaker now actually fires (was no-op).
+//   2. Single source of truth: canonical JSON drives cluster tables, hard
+//      filter pools, dealbreaker eligibility, pref->behavior pairs.
+//   3. FE/BE category drift impossible — categories come from canonical.
 //
-//   Also added: defensive read of isDealbreaker:true on the answer
-//   object itself (in addition to user_dealbreakers.question_ids) to
-//   prevent silent regressions if frontend ever fails to sync the array.
+// To regenerate canonical: run scripts/build_canonical.py and upsert into
+// public.matching_config (key='canonical_questionnaire').
 //
-// Changes from v61:
-//   DEFAULT_TOKEN_WEIGHTS synced to frontend 40-token scale.
-// =====================================================
-
-const DEFAULT_TOKEN_WEIGHTS: Record<string, number> = {
-  'Attachment & Emotional Health': 8,
-  'Communication & Conflict':      6,
-  'Life Goals':                    6,
-  'Values & Beliefs':              6,
-  'Financial & Career':            3,
-  'Intimacy & Connection':         3,
-  'Lifestyle Behaviors':           4,
-  'Social & Shared Life':          4,
-};
+// Author: Claude (Anthropic) for Marissa Meyer / PARALLEL VIP LLC.
+// =============================================================================
 
-const CORE_SCORED_QUESTIONS = [
-  '3.1','3.4','3.5','3.6','3.9a',
-  '4.1','4.2','5.1','5.2','5.3','5.4',
-  '6.1','7.3','7.4','7.6',
-  '8.1','8.2','8.3','8.4','8.6',
-  '12.4','13.1',
-];
-const MIN_CORE_ANSWERS = 20;
+import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
-const HOBBY_CATEGORIES: Record<string, string[]> = {
-  'Active & Outdoor': [
-    'Hiking & backpacking','Running & jogging','Walking & nature walks','Cycling',
-    'Swimming','Scuba diving & snorkeling','Rock climbing','Skiing & snowboarding',
-    'Surfing','Kayaking & paddleboarding','Camping','Yoga','Pilates',
-    'Going to the gym','Weightlifting','CrossFit','Martial arts','Golf',
-    'Tennis','Pickleball','Basketball','Soccer','Volleyball','Softball & baseball',
-    'Boating & sailing','Jet skiing','Fishing','Hunting','Skateboarding',
-    'Archery','Disc golf','Horseback riding','Motorcycle riding',
-    'Off-roading & overlanding','Van life & road trips',
-  ],
-  'Social & Nightlife': [
-    'Going out to bars & nightlife','Going to concerts & live music','Dancing',
-    'Theater & improv','Karaoke','Attending musicals & opera',
-    'Trivia & game nights','Festival going','Casino nights & poker',
-    'Sports betting & gambling','Spending time with friends',
-  ],
-  'Travel & Adventure': [
-    'Traveling & exploring new places','Theme parks & experiences',
-    'Birdwatching','Wildlife & nature conservation','Farm life & homesteading',
-  ],
-  'Creative & Intellectual': [
-    'Photography','Videography & filmmaking','Painting & drawing',
-    'Pottery & ceramics','Woodworking','Sewing & fashion design',
-    'Jewelry making','Graphic design','Writing & journaling',
-    'Knitting & crocheting','Sculpting','Interior design & decorating',
-    'Tattooing & body art','Comic book & illustration',
-    'Candle & soap making','Scrapbooking & memory keeping',
-    'Playing an instrument','Singing & choir','DJing & music production',
-    'Reading','Podcasts','Philosophy & big ideas','History',
-    'Learning languages','Chess & strategy games','Puzzles & brain games',
-    'Astronomy & stargazing','Psychology & self-development',
-    'Science & technology','Documentaries','Political science & current events',
-    'Streaming & content creation',
-  ],
-  'Food & Drink': [
-    'Cooking & grilling','Baking','Trying new restaurants',
-    'Wine tasting','Craft beer & home brewing','Cocktail making',
-    'Coffee culture','Farmers markets & local food','Meal prepping & nutrition',
-    'Wine & whiskey collecting',
-  ],
-  'Homebody & Cozy': [
-    'Video gaming','Board games & tabletop RPGs','Anime & manga',
-    'Dungeons & Dragons','Collecting (cards, figures, memorabilia)',
-    'Napping & rest','Watching TV & movies','True crime',
-    'Self-care & wellness routines','Spa days & massages',
-    'Fashion & style','Shopping','Home improvement & DIY',
-    'Gardening & plants','Thrifting & antiquing',
-  ],
-  'Sports Watching': [
-    'Watching sports','Going to live sporting events','Football Sundays',
-    'March Madness & brackets','Fantasy football & fantasy leagues',
-    'Combat sports (UFC, boxing)','Golf watching','NASCAR & motorsports watching',
-    'Fantasy sports','Cars & motorsports',
-  ],
-  'Community & Wellness': [
-    'Volunteering & community service','Spirituality & mindfulness',
-    'Meditation & breathwork','Political activism & advocacy',
-    'Dog ownership & training','Cat person','Aquariums & fishkeeping',
-    'Fostering & animal rescue','Beekeeping',
-  ],
-};
+const VERSION = "100";
+
+let CANONICAL: any = null;
+let CANONICAL_HASH: string = "unloaded";
+const QUESTIONS_BY_ID_INTERNAL: Record<string, any> = {};
 
-const HOBBY_TO_CATEGORY: Record<string, string> = {};
-for (const [cat, hobbies] of Object.entries(HOBBY_CATEGORIES)) {
-  for (const hobby of hobbies) HOBBY_TO_CATEGORY[hobby] = cat;
+async function loadCanonical(supabase: any): Promise<void> {
+  if (CANONICAL) return;
+  const { data, error } = await supabase
+    .from("matching_config")
+    .select("value")
+    .eq("key", "canonical_questionnaire")
+    .single();
+  if (error || !data) {
+    throw new Error(`canonical load failed: ${error?.message || "no row"}`);
+  }
+  CANONICAL = data.value;
+  CANONICAL_HASH = CANONICAL.content_hash;
+  for (const q of CANONICAL.questions) {
+    QUESTIONS_BY_ID_INTERNAL[q.id] = q;
+  }
+  console.log(`[v${VERSION}] canonical loaded: ${CANONICAL.questions.length} questions, hash=${CANONICAL_HASH}`);
 }
 
-const ACTIVE_LIFESTYLE_HOBBIES = new Set([
-  ...HOBBY_CATEGORIES['Active & Outdoor'],
-  ...HOBBY_CATEGORIES['Travel & Adventure'],
-]);
+type Tag = "Hard Filter" | "Compatibility Score" | "Dealbreaker Eligible" | "Profile Information";
 
-function hobbyProfile(hobbies: string[]): Record<string, number> {
-  const profile: Record<string, number> = {};
-  for (const h of hobbies) {
-    const cat = HOBBY_TO_CATEGORY[h];
-    if (cat) profile[cat] = (profile[cat] || 0) + 1;
-  }
-  return profile;
-}
-
-function passesAdventurePartnerCheck(userHobbies: any, candidateHobbies: any): boolean {
-  const h1 = Array.isArray(userHobbies) ? userHobbies : [];
-  const h2 = Array.isArray(candidateHobbies) ? candidateHobbies : [];
-  if (!h1.length || !h2.length) return false;
-  const p1 = hobbyProfile(h1); const p2 = hobbyProfile(h2);
-  for (const cat of Object.keys(p1)) { if ((p1[cat]||0)>=2&&(p2[cat]||0)>=2) return true; }
-  const set2 = new Set(h2);
-  if (h1.filter((h:string)=>set2.has(h)).length>=3) return true;
-  const ac1=h1.filter((h:string)=>ACTIVE_LIFESTYLE_HOBBIES.has(h)).length;
-  const ac2=h2.filter((h:string)=>ACTIVE_LIFESTYLE_HOBBIES.has(h)).length;
-  if (ac1>=3&&ac2>=3) return true;
-  return false;
+interface CanonicalQuestion {
+  id: string;
+  text: string;
+  type: string;
+  category: string;
+  weight: number;
+  tags: Tag[];
+  has_dealbreaker: boolean | null;
+  optional: boolean | null;
+  options: string[];
 }
 
-const CLUSTERS: Record<string, string[][]> = {
-  '7.4':[['None','genuinely closed'],['Some','comes to mind occasionally',"doesn't affect"],['A fair amount','still working'],['A lot','not fully over']],
-  '7.6':[['lean on my partner','need closeness when life'],['pull back and need space','space to process before'],['keep it separate',"don't want to burden"],['lose patience','affects how I show up']],
-  '7.7':[['reconnect quickly','tension feels worse to me'],['Give it a day','come back ready to move on'],['Need the other person to acknowledge','acknowledge what happened'],['Hold onto it','hard to let things go']],
-  '7.8':[['Stop what I\'m doing and fully engage'],['Respond warmly but keep it light','present but don\'t make it a big'],['Acknowledge it but','often still focused on what I was doing'],['stay in my own headspace','not naturally great at this']],
-  '7.9':[['Comfortable','trust matters more than history'],['Fine, but I\'d appreciate some transparency'],['It depends on the nature','how it\'s handled'],['find it difficult','prefer clearer boundaries around this']],
-  '7.10':[['strong believer','everyone benefits'],['open to it if things get hard','consider it, but it\'s not something I\'d seek'],['skeptical','prefer handling things privately','not for me']],
-  '7.11':[['Bring it up directly, staying curious','staying curious about where they\'re coming from'],['Let the small things go','only raise the bigger patterns'],['Say something, but I know I can be harsher','harsher than I intend'],['Go quiet and pull away','pull away rather than engage'],['catastrophize','make it personal']],
-  '7.2':[['Address it immediately'],['Take space first, then come back','Internalize it and bring it up later'],['I tend to go quiet','Try to stay calm and focus on solutions'],['I avoid conflict','Avoid the conflict']],
-  '7.3':[['I say it directly as soon as I feel it'],['I wait until I\'ve had time to process','I write or message first'],['I bring it up, but I worry','worry about how they\'ll react'],['I share selectively','I tend to drop hints'],['I tend to keep emotions private','I struggle to bring it up']],
-  '8.1':[['No children','Expecting or newly expecting'],['young children at home','shared custody','live with their other parent'],['teenagers at home'],['adult children','children from multiple stages']],
-  '8.4':[['Taking it slow','Slow and intentional'],['Moderate \u2014 let things develop naturally','I go with the flow'],['I move quickly when I feel a connection','Fast if the connection']],
-  '8.2':[['Definitely yes','Probably yes','I have young children and would like more'],['Maybe','Unsure','Open to it','My children are grown \u2014 open','I\'m open to being a stepparent','Open to it if my partner'],['Probably not','Definitely not','I have young children and I\'m done','My children are grown \u2014 I\'m not looking','I prefer a partner without young children']],
-  '8.3':[['Marriage is the goal'],['Open to marriage if it feels right','Committed partnership'],['Not sure, taking it as it comes','Not sure yet'],['Don\'t believe in marriage','Not interested in marriage']],
-  '8.6':[['A serious long-term relationship','A relationship that could become serious','open, but ultimately looking for something meaningful','I\'m open, but ultimately'],['Something casual','Honestly not sure yet','I\'m still figuring'],['Open to whatever feels right']],
-  '8.7':[['Structure and clear expectations','consistency is how children'],['Emotional attunement','deeply understood'],['A balance','firm on some things','relaxed and flexible'],['Autonomy and experience','independent, curious']],
-  '12.4':[['Very important'],['Moderately important'],['Slightly important'],['Not very important']],
-  '12.7':[['Very important','genuine priority'],['Moderately important','understand their approach'],['Somewhat important','navigate differences'],['Not very important','figure it out together']],
-  '6.1':[['Very liberal','Liberal'],['Moderate','Apolitical'],['Conservative','Very conservative']],
-  '6.2':[['Atheist','Agnostic'],['Spiritual but not religious'],['Christian','Catholic','Protestant'],['Mormon','LDS'],['Jewish'],['Muslim'],['Buddhist','Hindu'],['Other','Prefer not to say']],
-  '6.2b':[['Actively','attend services','observe traditions','shapes my daily','practices alongside'],['Moderately','important to me','not rigid'],['Privately','believe but don\'t practice','not formally','not publicly'],['cultural','more cultural','than spiritual']],
-  '5.2':[['Extremely important','Very important'],['Moderately important'],['Not very important','Not important','Slightly important','Not a major factor']],
-  '5.1':[['Very close','Close \u2014 we\'re in regular contact','Close \u2014 we'],['It varies','Somewhat close'],['not very close','Not very close','Estranged']],
-  '4.1':[['Highly ambitious','Ambitious but balanced','Extremely driven'],['Moderately ambitious','I prefer stability','Still figuring it out'],['Not very ambitious']],
-  '12.6':[['Very important','Extremely important'],['Moderately important'],['Slightly important','Not important','Not very important']],
-  '4.3':[['Very stable'],['Generally stable'],['It varies','working on some things','In transition'],['Going through a difficult period','Working toward stability']],
-  '4.5':[['PhD','Master\'s','Professional degree','JD','MD','Doctorate','Doctorate or professional'],['Bachelor\'s degree'],['Some college','Associate\'s','Trade','vocational','certification','Associate degree'],['High school','GED']],
-  '4.6':[['natural saver','pay myself first','saver','I\'m a natural saver'],['balanced','save but','enjoy spending','I\'m balanced','It varies','life stage','varies','rather not share','I\'d rather not'],['spender','enjoy life now','free spender','I\'m more of a spender']],
-  '4.7':[['A city','culture, career energy'],['Suburbs','space and community'],['Rural','small town','quiet, land'],['Wherever makes sense','the right person matters more than the place']],
-  '13.1':[['Central','primary ways I feel connected and loved'],['Important','matters significantly but'],['Moderately important','emotional intimacy'],['Less important','emotional closeness is what I prioritize']],
-  '13.2':[['Very important','strong alignment'],['Moderately important','some alignment'],['Somewhat important','think we\'d figure'],['Not a major factor']],
-  '3.1':[['Never drink','I don\'t drink','Never'],['Rarely \u2014 special occasions only','Rarely'],['Socially \u2014 a few times a month','Socially / occasionally'],['Regularly \u2014 a few times a week'],['Frequently','Daily']],
-  '3.2':[
-    ['A glass of wine or beer at home'],
-    ['Drinks with dinner or friends'],
-    ['Going out \u2014 bars, restaurants, events'],
-    ['Drinking heavily when I do drink'],
-  ],
-  '3.3':[['Never','I do not smoke'],['I used to smoke but quit','Trying to quit','I\'m trying to quit'],['I smoke occasionally','socially','Socially / occasionally'],['I smoke regularly','Regularly']],
-  '3.4':[['Never','I don\'t use'],['Occasionally','past experimentation','Rarely'],['Regularly'],['Daily']],
-  '3.5':[['Daily or almost daily','Daily','Several times a week'],['Once or twice a week','A few times per week'],['A few times a month','Rarely or never','Occasionally']],
-  '3.6':[
-    ['Early bird','up before 7am','in bed by 10pm','Strong morning person','Slight morning person'],
-    ['Standard','up by 8am','in bed around midnight','Balanced'],
-    ['Night owl','up past midnight','sleep in late','Slight night owl','Strong night owl'],
-    ['Irregular','shifts a lot'],
-  ],
-  '3.8':[
-    ['Dog(s)','Both dogs and cats','Multiple pets of different kinds','Other pets','I love pets'],
-    ['Cat(s)'],
-    ['No pets but I\'d love some','No pets, open'],
-    ['No pets','No pets and I prefer to keep it that way','No pets and prefer to keep it that way'],
-    ['Allergic'],
-  ],
-  '3.9a':[
-    ['Very tidy','everything has a place','Very clean','Generally clean and organized'],
-    ['Generally clean but not obsessive','Lived-in but I tidy','Lived-in but comfortable'],
-    ['Lived-in','comfortable with some clutter','Organized chaos'],
-    ['pretty messy','Comfortably messy','Messy','it gets pretty messy'],
-  ],
-  '3.10':[['No \u2014 I don\'t use recreational drugs','No','don\'t use recreational','I don\'t use','do not use'],['Occasionally','a few times a year','past experimentation','experimented','once or twice','Rarely'],['Sometimes','a few times a month','socially','events','occasional'],['Regularly','part of my lifestyle','regularly']],
-  '5.3':[['I need a lot of alone time','A lot'],['Some \u2014 I need regular quiet time but also enjoy','regular quiet time'],['A little \u2014 I occasionally need to decompress','I rarely need alone time','Rarely']],
-  '11.9':[['Shared equally','50/50','Whoever has more bandwidth'],['I\'d carry more','high standards and I\'m okay'],['I\'d expect my partner to carry more','contribute in other ways'],['Whoever cares more','I\'m easy-going about this']],
-  '11.1':[['Must not drink','Prefer non-drinker'],['No preference','Occasional drinking is fine','Regular drinking is fine']],
-  '11.1b':[['drinks with me','participates','shares that lifestyle','join me','part of how I connect'],['don\'t need them to drink','fine either way','either way','happy either way','comfortable in drinking']],
-  '11.2':[['Must not smoke','Prefer non-smoker'],['No preference','Occasionally is fine','Occasional smoking is okay']],
-  '11.6':[['I love pets','any pet is fine','Dogs are fine','Cats are fine'],['No strong preference','Prefer no pets','Allergic','allergies','Small pets only','cannot be around pets']],
-  '11.7':[['Not okay','important to me','not okay with it'],['Prefer they don\'t','occasional','past use is fine','prefer they'],['No preference']],
-  '11.8':[['participates with me','part of how I experience','joins me','does drugs with me'],['don\'t mind either way','they don\'t need to join','fine either way','either way']],
-  '11.4':[['Very active','Extremely active'],['Moderately active'],['Somewhat active'],['Not very active','Mostly sedentary','No preference']],
-  '12.2b':[['practices alongside me','Very important','participates','practices with me'],['respect and engage','Somewhat important','engage with it'],['fine if they','Not important','different or no practice']],
-  '2.2':[['Yes','Open for the right person','Very open'],['Preferably not','it depends'],['No \u2014 I need someone nearby','Not open','Not open to relocating']],
-  '3.11':[['adventure partner','actively does life','true adventure','do life with me'],['Mostly shared','real overlap','own things too'],['healthy mix','some shared','independence'],['Independent','own world','their own']],
-  '4.2':[['Working or catching up','evenings are part of my productive'],['Protecting that time firmly','evenings belong to me'],['A mix','some nights work','some nights fully offline'],['It varies completely','go wherever life needs me']],
-  '5.4':[['Very social','Very active \u2014 I have a full social calendar','Very active'],['Moderately social','Moderately social \u2014 I go out regularly'],['Selectively social'],['Mostly a homebody']],
-  '9.4':[['Within 25 miles'],['Within 50 miles'],['Within 100 miles'],['Anywhere within my state','Anywhere within my region','state or region'],['Anywhere within my country'],['Anywhere within my continent'],['Open to anywhere in the world','anywhere in the world']],
-};
+interface Profile {
+  id: string;
+  name: string;
+  date_of_birth: string;
+  latitude: number | null;
+  longitude: number | null;
+  has_completed_onboarding: boolean;
+  is_suspended: boolean | null;
+  is_paused: boolean | null;
+  is_hidden_pending_review: boolean | null;
+  is_seed_account: boolean | null;
+}
 
-function getCluster(qId: string, answer: string): number {
-  const clusters = CLUSTERS[qId];
-  if (!clusters || !answer) return -1;
-  const lower = answer.toLowerCase();
-  for (let i = 0; i < clusters.length; i++) {
-    if (clusters[i].some(a => lower.includes(a.toLowerCase()) || a.toLowerCase().includes(lower))) return i;
-  }
-  return -1;
-}
-
-const CREDIT_TABLES: Record<string, number[]> = {
-  '7.4':[65,25,0],'7.7':[65,30,0],'7.8':[70,35,0],'7.9':[70,35,0],
-  '7.3':[60,45,25,15],
-  '7.10':[60,15],
-  '11.9':[60,30],
-  '8.4':[65,20],'8.2':[40,0],'8.3':[65,25,0],'8.6':[60,60],'8.7':[60,30,0],
-  '12.4':[65,25,0],'12.7':[65,25,0],'5.2':[60,10],'5.1':[65,15],'4.1':[60,10],
-  '12.6':[55,10],'4.3':[65,25,0],'4.5':[70,40,15],'4.6':[65,20],
-  '13.1':[70,30,0],'13.2':[65,25,0],
-  '3.1':[70,35,10,0],
-  '3.2':[70,30,0],
-  '3.3':[75,20,0],
-  '3.4':[70,30,0,0],
-  '3.5':[65,15],
-  '3.6':[60,0],
-  '3.8':[65,10],
-  '3.9a':[65,10],
-  '3.10':[65,25,0],
-  '5.3':[65,20],'11.7':[60,10],
-  '11.1b':[0],'11.8':[0],'12.2b':[65,20],'11.4':[60,30,0],
-  '2.2':[55,10],'3.11':[70,30,0],'5.4':[65,25,0],
-  '6.2b':[70,30,0],
-};
+type Answers = Record<string, any>;
 
-// v64: Q7.11 Gottman-style compatibility matrix (asymmetric).
-// Cluster index meaning: 0=healthy direct, 1=discerning (lets small things go), 2=harsh,
-// 3=withdrawn (goes quiet), 4=dysregulated (catastrophizing).
-const Q711_MATRIX: Record<string, number> = {
-  '0,0':100,'0,1':80, '0,2':45,'0,3':40,'0,4':30,
-  '1,0':80, '1,1':85, '1,2':50,'1,3':50,'1,4':35,
-  '2,0':45, '2,1':50, '2,2':55,'2,3':25,'2,4':25,
-  '3,0':40, '3,1':50, '3,2':25,'3,3':50,'3,4':20,
-  '4,0':30, '4,1':35, '4,2':25,'4,3':20,'4,4':35,
-};
-// v64: Q11.9 household-load complementary matrix.
-// Cluster index meaning: 0=shared equally, 1=I'd carry more, 2=I'd expect partner to carry more,
-// 3=whoever cares more / easy-going. 1<->2 is a complementary fit (90).
-const Q119_MATRIX: Record<string, number> = {
-  '0,0':100,'0,1':70,'0,2':40,'0,3':75,
-  '1,0':70, '1,1':70,'1,2':90,'1,3':65,
-  '2,0':40, '2,1':90,'2,2':25,'2,3':50,
-  '3,0':75, '3,1':65,'3,2':50,'3,3':80,
-};
+const QUESTIONS_BY_ID = QUESTIONS_BY_ID_INTERNAL as Record<string, CanonicalQuestion>;
 
-function scoreByCluster(qId: string, a1: string, a2: string): number {
-  const c1=getCluster(qId,a1); const c2=getCluster(qId,a2);
-  if (c1===-1||c2===-1) return 0;
-  if (qId==='7.11') return Q711_MATRIX[`${c1},${c2}`]??0;
-  if (qId==='11.9') return Q119_MATRIX[`${c1},${c2}`]??0;
-  if (c1===c2) return 100;
-  if (qId==='8.1') { const p:Record<string,number>={'0,1':20,'1,0':20,'0,2':20,'2,0':20,'0,3':50,'3,0':50,'1,2':60,'2,1':60,'1,3':40,'3,1':40,'2,3':65,'3,2':65}; return p[`${c1},${c2}`]??0; }
-  if (qId==='3.8') { if (c1===4||c2===4) return 0; if ((c1===3&&(c2===0||c2===1))||(c2===3&&(c1===0||c1===1))) return 30; if ((c1===3&&c2===2)||(c2===3&&c1===2)) return 60; if ((c1===0&&c2===2)||(c2===0&&c1===2)) return 75; if ((c1===1&&c2===2)||(c2===1&&c1===2)) return 75; if ((c1===0&&c2===1)||(c2===0&&c1===1)) return 60; return 50; }
-  if (qId==='6.2') { const a:Record<string,number>={'0,1':70,'1,0':70,'1,2':45,'2,1':45,'1,6':45,'6,1':45}; return a[`${c1},${c2}`]??0; }
-  if (qId==='7.6') { const p:Record<string,number>={'0,1':20,'1,0':20,'0,2':45,'2,0':45,'0,3':40,'3,0':40,'1,1':80,'2,2':90,'3,3':60,'1,2':75,'2,1':75,'1,3':35,'3,1':35,'2,3':50,'3,2':50}; return p[`${c1},${c2}`]??50; }
-  if (qId==='4.2') { const p:Record<string,number>={'0,1':30,'1,0':30,'0,2':65,'2,0':65,'0,3':70,'3,0':70,'1,2':70,'2,1':70,'1,3':80,'3,1':80,'2,3':80,'3,2':80}; return p[`${c1},${c2}`]??60; }
-  if (qId==='4.7') { if (c1===3||c2===3) return 85; const p:Record<string,number>={'0,1':70,'1,0':70,'1,2':65,'2,1':65,'0,2':20,'2,0':20}; return p[`${c1},${c2}`]??50; }
-  if (qId==='3.6') { if (c1===3||c2===3) return 50; }
-  const table=CREDIT_TABLES[qId]; if (!table) return 0;
-  const dist=Math.abs(c1-c2);
-  return dist<=table.length?table[dist-1]:0;
-}
-
-type AttSig='secure'|'anxious'|'avoidant'|'fearful';
-function classifyAtt(text:string):AttSig|null{if(!text)return null;const t=text.toLowerCase();if(t.includes("assume they're busy")||t.includes("don't stress")||t.includes('feels natural')||t.includes('lean into it')||t.includes('bring it up directly')||t.includes('say something directly')||t.includes('secure'))return 'secure';if(t.includes('checking my phone')||t.includes('uneasy')||t.includes('makes me nervous')||t.includes('exciting but')||t.includes('worried')||t.includes('anxious')||t.includes('feared abandonment')||t.includes('craved closeness')||t.includes('worry about how they'))return 'anxious';if(t.includes('pull back')||t.includes('irritated')||t.includes('need space')||t.includes('too much')||t.includes('go quiet')||t.includes('shut down')||t.includes('valued independence')||t.includes('avoidant')||t.includes("tell myself i don't care")||t.includes("tell myself i don"))return 'avoidant';if(t.includes('go back and forth')||t.includes('back and forth')||t.includes("sometimes i say")||t.includes("sometimes i don")||t.includes('fearful')||t.includes('pushed it away')||t.includes('disorganized'))return 'fearful';return null;}
-function scoreAttPair(s1:AttSig|null,s2:AttSig|null):{score:number;isToxic:boolean}{if(!s1||!s2)return{score:75,isToxic:false};if(s1===s2){const same:Record<AttSig,number>={secure:100,avoidant:68,anxious:62,fearful:45};return{score:same[s1],isToxic:false};}const key=[s1,s2].sort().join('+');const scores:Record<string,number>={'anxious+secure':85,'avoidant+secure':80,'fearful+secure':82,'anxious+fearful':35,'avoidant+fearful':30,'anxious+avoidant':15};return{score:scores[key]??50,isToxic:key==='anxious+avoidant'};}
-function scoreAttachmentQuiz(a1:Record<string,any>,a2:Record<string,any>):{score:number;penalize:boolean}{const questions=['7.1a','7.1b','7.3'];let total=0,count=0,toxicCount=0;for(const q of questions){const raw1=a1[q];const raw2=a2[q];const t1=Array.isArray(raw1)?raw1.join(' '):String(raw1||'');const t2=Array.isArray(raw2)?raw2.join(' '):String(raw2||'');if(!t1&&!t2)continue;const{score,isToxic}=scoreAttPair(classifyAtt(t1),classifyAtt(t2));total+=score;count++;if(isToxic)toxicCount++;}if(count===0)return{score:0,penalize:false};return{score:Math.round(total/count),penalize:toxicCount>=1};}
-function scoreAttachmentLegacy(a1:string,a2:string):{score:number;penalize:boolean}{const isSecure=(s:string)=>s.toLowerCase().includes('secure');const isAnxious=(s:string)=>s.toLowerCase().includes('anxious');const isAvoidant=(s:string)=>s.toLowerCase().includes('avoidant')&&!s.toLowerCase().includes('fearful');if(a1===a2)return{score:100,penalize:false};if(isSecure(a1)||isSecure(a2))return{score:85,penalize:false};if((isAnxious(a1)&&isAvoidant(a2))||(isAvoidant(a1)&&isAnxious(a2)))return{score:15,penalize:true};if(a1.toLowerCase().includes('fearful')||a2.toLowerCase().includes('fearful'))return{score:35,penalize:false};return{score:30,penalize:false};}
-function scoreReligionPref(pref1:string,pref2:string,rel1:string,rel2:string):number{const wantsSimilar=(p:string)=>p.toLowerCase().includes('similar')||p.toLowerCase().includes('same');const isOpen=(p:string)=>p.toLowerCase().includes('open')||p.toLowerCase().includes('different');const sameCluster=rel1&&rel2&&getCluster('6.2',rel1)===getCluster('6.2',rel2)&&getCluster('6.2',rel1)!==-1;if(isOpen(pref1)&&isOpen(pref2))return 80;if(wantsSimilar(pref1)&&wantsSimilar(pref2))return sameCluster?100:0;if(wantsSimilar(pref1)&&isOpen(pref2))return sameCluster?90:30;if(isOpen(pref1)&&wantsSimilar(pref2))return sameCluster?90:30;return 40;}
-
-const PREF_TO_ANSWER:Record<string,string>={
-  '11.1':'3.1',
-  '11.1b':'3.2',
-  '11.2':'3.3',
-  '11.3':'3.4',
-  '11.4':'3.5',
-  '11.6':'3.8',
-  '11.7':'3.10',
-  '11.8':'3.10',
-  '12.2b':'6.2b',
-  '12.7':'8.7',
-};
-const PREF_WEIGHTS:Record<string,number>={'11.1':3,'11.2':3,'11.3':2,'11.6':1,'11.4':2,'11.7':3,'11.8':3,'11.1b':3,'12.2b':3,'12.7':3};
-const PREF_CATS:Record<string,string>={'11.1':'Lifestyle Behaviors','11.2':'Lifestyle Behaviors','11.3':'Lifestyle Behaviors','11.4':'Lifestyle Behaviors','11.6':'Lifestyle Behaviors','11.7':'Lifestyle Behaviors','11.8':'Lifestyle Behaviors','11.1b':'Lifestyle Behaviors','12.2b':'Values & Beliefs','12.7':'Life Goals'};
-const PREF_DEALBREAKER_QIDS=new Set(['11.1','11.1b','11.2','11.3','11.6','11.7','11.8']);
-// v64: hard-filter Q-IDs are enforced by checkHardFilters() and must never be re-evaluated as preference dealbreakers.
-const HARD_FILTER_QIDS=new Set(['9.1','9.1b','9.2','9.3','9.4','12.1']);
+function isScored(qid: string): boolean {
+  const q = QUESTIONS_BY_ID[qid];
+  if (!q) return false;
+  return q.tags.includes("Compatibility Score") && q.weight > 0
+    && !q.tags.includes("Hard Filter")
+    && q.id !== "1.5" && q.id !== "9.3";
+}
+
+function unwrap(v: any): any {
+  if (v && typeof v === "object" && !Array.isArray(v) && "value" in v && "isDealbreaker" in v) {
+    return v.value;
+  }
+  return v;
+}
+
+function isDealbreakerSet(v: any): boolean {
+  return v && typeof v === "object" && !Array.isArray(v) && v.isDealbreaker === true;
+}
 
-const BI_PAN_ORIENTATIONS=new Set(['bisexual','pansexual','queer','questioning']);
-function checkOrientationPref(userAnswers:any,candidateAnswers:any):boolean{const pref=extractValue(userAnswers['1.3b']);if(!pref)return true;const p=String(pref).toLowerCase();if(p.includes('open')||p.includes('no preference'))return true;if(p.includes('exclusively straight')||p.includes('exclusively gay')){const co=String(extractValue(candidateAnswers['1.3'])||'').toLowerCase();if(BI_PAN_ORIENTATIONS.has(co))return false;for(const o of BI_PAN_ORIENTATIONS){if(co.includes(o))return false;}}return true;}
+function getAnswer(answers: Answers, qid: string): any {
+  return unwrap(answers[qid]);
+}
 
-function checkPoliticsFilter(u1:any,u2:any):boolean{const pol1=extractValue(u1.answers['6.1']);const pol2=extractValue(u2.answers['6.1']);const pref1=extractValue(u1.answers['12.1']);const pref2=extractValue(u2.answers['12.1']);if(pref1&&pol2){const a=Array.isArray(pref1)?pref1:[pref1];if(!a.some((v:string)=>v.toLowerCase().includes('no preference'))&&!a.some((v:string)=>v.toLowerCase()===String(pol2).toLowerCase()))return false;}if(pref2&&pol1){const a=Array.isArray(pref2)?pref2:[pref2];if(!a.some((v:string)=>v.toLowerCase().includes('no preference'))&&!a.some((v:string)=>v.toLowerCase()===String(pol1).toLowerCase()))return false;}return true;}
+function normalize(s: string): string {
+  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
+}
 
-// =====================================================
-// v63 NEW: passesPreferenceDealbreaker
-// Absolute-semantics gate for preference dealbreakers (11.x).
-// Returns true = pass (no veto), false = blocked (veto).
-// Used ONLY for the dealbreaker check, NOT for compatibility scoring.
-// =====================================================
-function passesPreferenceDealbreaker(prefQId:string, behaviorAnswer:string, prefAnswer:string):boolean{
-  const pref=prefAnswer.toLowerCase().trim();
-  const behavior=behaviorAnswer.toLowerCase().trim();
+function getCluster(answer: string | null | undefined, options: string[], qid: string): number {
+  if (!answer || typeof answer !== "string") return -1;
+  const exact = options.indexOf(answer);
+  if (exact !== -1) return exact;
+  const na = normalize(answer);
+  for (let i = 0; i < options.length; i++) {
+    if (normalize(options[i]) === na) return i;
+  }
+  let bestIdx = -1; let bestLen = 0;
+  for (let i = 0; i < options.length; i++) {
+    const no = normalize(options[i]);
+    if (na.length > bestLen && no.includes(na)) { bestLen = na.length; bestIdx = i; }
+    else if (no.length > bestLen && na.includes(no)) { bestLen = no.length; bestIdx = i; }
+  }
+  if (bestIdx === -1) console.warn(`[v${VERSION}] cluster miss q${qid}: "${answer}"`);
+  return bestIdx;
+}
 
-  // "No preference" / "Open" — never blocks (defensive, also gated upstream)
-  if (pref.includes('no preference')||pref.includes('open')) return true;
+function clusterDistanceScore(a: string, b: string, options: string[], qid: string): number {
+  const ia = getCluster(a, options, qid); const ib = getCluster(b, options, qid);
+  if (ia === -1 || ib === -1) return 50;
+  const dist = Math.abs(ia - ib);
+  const maxDist = Math.max(options.length - 1, 1);
+  return Math.round(100 * (1 - dist / maxDist));
+}
 
-  // 11.1 — DRINKING FREQUENCY tolerance
-  if (prefQId==='11.1'){
-    if (pref.includes('must not drink')){
-      // Strict: ANY drinking fails. Only "never drink" passes.
-      return behavior.includes('never')||behavior.includes("don't drink")||behavior.includes('do not drink')||behavior.includes('i don\'t drink');
-    }
-    if (pref.includes('prefer non-drinker')){
-      // Strong pref: never or rarely (special occasions) is acceptable.
-      return behavior.includes('never')||behavior.includes("don't drink")||behavior.includes('do not drink')||behavior.includes('rarely')||behavior.includes('special occasion');
-    }
-    // "Occasional drinking is fine" — block only daily/frequently
-    if (pref.includes('occasional drinking is fine')){
-      return !(behavior.includes('daily')||behavior.includes('frequently'));
+const GENDER_MAP: Record<string, string[]> = {
+  "Woman": ["Women"], "Man": ["Men"],
+  "Non-binary": ["Non-binary people", "Gender diverse people"],
+  "Genderqueer": ["Non-binary people", "Gender diverse people"],
+  "Genderfluid": ["Non-binary people", "Gender diverse people"],
+  "Agender": ["Non-binary people", "Gender diverse people"],
+  "Transgender woman": ["Women", "Transgender women", "Gender diverse people"],
+  "Transgender man": ["Men", "Transgender men", "Gender diverse people"],
+  "Prefer to self-describe": ["Non-binary people", "Gender diverse people"],
+};
+
+function genderMatches(myGender: string, partnerSeek: string[]): boolean {
+  if (!partnerSeek || partnerSeek.length === 0) return false;
+  if (partnerSeek.includes("Open to all genders")) return true;
+  const myCategories = GENDER_MAP[myGender] || [];
+  return myCategories.some(c => partnerSeek.includes(c));
+}
+
+function ageOf(dob: string): number {
+  const birth = new Date(dob); const now = new Date();
+  let age = now.getUTCFullYear() - birth.getUTCFullYear();
+  const m = now.getUTCMonth() - birth.getUTCMonth();
+  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
+  return age;
+}
+
+function heightInInches(h: any): number | null {
+  if (!h || typeof h !== "object") return null;
+  if (h.unit === "imperial" || h.feet !== undefined) {
+    const ft = Number(h.feet) || 0; const inch = Number(h.inches) || 0;
+    if (ft < 3 || ft > 8) return null;
+    const total = ft * 12 + inch;
+    if (total < 54 || total > 88) return null;
+    return total;
+  }
+  if (h.unit === "metric" && h.cm) {
+    const total = Math.round(Number(h.cm) / 2.54);
+    if (total < 54 || total > 88) return null;
+    return total;
+  }
+  return null;
+}
+
+function distancePrefMiles(pref: string | undefined): number {
+  if (!pref) return 50;
+  const s = String(pref).toLowerCase();
+  if (s.includes("25")) return 25;
+  if (s.includes("50")) return 50;
+  if (s.includes("100")) return 100;
+  if (s.includes("state") || s.includes("region")) return 300;
+  if (s.includes("country")) return 3000;
+  if (s.includes("continent")) return 7000;
+  if (s.includes("world") || s.includes("anywhere")) return 25000;
+  return 50;
+}
+
+function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
+  const R = 3959; const toRad = (d: number) => d * Math.PI / 180;
+  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
+  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
+  return 2 * R * Math.asin(Math.sqrt(a));
+}
+
+const POLITICS_CLUSTERS: Record<string, string[]> = {
+  "Very liberal": ["Very liberal", "Liberal"],
+  "Liberal": ["Liberal", "Very liberal", "Moderate"],
+  "Moderate": ["Moderate", "Liberal", "Conservative", "Apolitical"],
+  "Conservative": ["Conservative", "Very conservative", "Moderate"],
+  "Very conservative": ["Very conservative", "Conservative"],
+  "Apolitical": ["Apolitical", "Moderate"],
+};
+
+function politicsMatches(myView: string, partnerPrefs: string[]): boolean {
+  if (!myView || !partnerPrefs || partnerPrefs.length === 0) return false;
+  if (partnerPrefs.includes("No preference")) return true;
+  if (partnerPrefs.includes(myView)) return true;
+  for (const pref of partnerPrefs) {
+    if (myView.toLowerCase().includes(pref.toLowerCase())) return true;
+    const cluster = POLITICS_CLUSTERS[pref] || [pref];
+    for (const c of cluster) {
+      if (myView.toLowerCase().includes(c.toLowerCase())) return true;
     }
-    // "Regular drinking is fine" — anything passes
-    return true;
   }
+  return false;
+}
 
-  // 11.1b — DRINKING STYLE / participation pref (the user wants partner to drink with them)
-  if (prefQId==='11.1b'){
-    if (pref.includes('drinks with me')||pref.includes('participates')||pref.includes('shares that lifestyle')||pref.includes('join me')||pref.includes('part of how i connect')){
-      // Need partner who actually drinks. "Never drink" / no answer fails.
-      // Acceptable: any of the 4 drinking-style answers (which means they drink at all).
-      if (!behavior||behavior.trim()==='') return false;
-      return behavior.includes('home')||behavior.includes('dinner')||behavior.includes('friends')||behavior.includes('going out')||behavior.includes('bars')||behavior.includes('restaurant')||behavior.includes('event')||behavior.includes('heavily')||behavior.includes('wine')||behavior.includes('beer');
-    }
-    return true;
+interface FilterResult { passed: boolean; reason?: string; }
+
+function checkHardFilters(a: Profile, aAns: Answers, b: Profile, bAns: Answers): FilterResult {
+  const aGender = getAnswer(aAns, "1.1");
+  const bGender = getAnswer(bAns, "1.1");
+  const aSeek = getAnswer(aAns, "9.1") || [];
+  const bSeek = getAnswer(bAns, "9.1") || [];
+  if (!genderMatches(bGender, aSeek)) return { passed: false, reason: "gender:b-not-in-a-seek" };
+  if (!genderMatches(aGender, bSeek)) return { passed: false, reason: "gender:a-not-in-b-seek" };
+
+  const aAge = ageOf(a.date_of_birth); const bAge = ageOf(b.date_of_birth);
+  const aRange = getAnswer(aAns, "9.2") || {}; const bRange = getAnswer(bAns, "9.2") || {};
+  if (typeof aRange.min === "number" && typeof aRange.max === "number") {
+    if (bAge < aRange.min || bAge > aRange.max) return { passed: false, reason: `age:b(${bAge})-outside-a[${aRange.min},${aRange.max}]` };
+  }
+  if (typeof bRange.min === "number" && typeof bRange.max === "number") {
+    if (aAge < bRange.min || aAge > bRange.max) return { passed: false, reason: `age:a(${aAge})-outside-b[${bRange.min},${bRange.max}]` };
   }
 
-  // 11.2 — SMOKING tolerance
-  if (prefQId==='11.2'){
-    if (pref.includes('must not smoke')){
-      // Strict: only "never" / "do not smoke" passes. Quitters still failed prefs the user explicitly toggled as a dealbreaker.
-      // Note: "used to / quit" person no longer smokes, so they DO pass.
-      return behavior.includes('never')||behavior.includes('do not smoke')||behavior.includes("don't smoke")||behavior.includes('used to')||behavior.includes('quit')||behavior.includes('trying to quit');
+  const aHeight = heightInInches(getAnswer(aAns, "1.5"));
+  const bHeight = heightInInches(getAnswer(bAns, "1.5"));
+  const aHRange = getAnswer(aAns, "9.3");
+  const bHRange = getAnswer(bAns, "9.3");
+  if (aHeight !== null && bHRange) {
+    const min = (Number(bHRange.minFeet) || 0) * 12 + (Number(bHRange.minInches) || 0);
+    const max = (Number(bHRange.maxFeet) || 0) * 12 + (Number(bHRange.maxInches) || 0);
+    if (min > 0 && max > 0 && (aHeight < min || aHeight > max)) {
+      return { passed: false, reason: `height:a(${aHeight}in)-outside-b[${min},${max}]` };
     }
-    if (pref.includes('prefer non-smoker')){
-      // Same as must-not but a bit softer — already handled equivalently above.
-      return behavior.includes('never')||behavior.includes('do not smoke')||behavior.includes("don't smoke")||behavior.includes('used to')||behavior.includes('quit')||behavior.includes('trying to quit');
+  }
+  if (bHeight !== null && aHRange) {
+    const min = (Number(aHRange.minFeet) || 0) * 12 + (Number(aHRange.minInches) || 0);
+    const max = (Number(aHRange.maxFeet) || 0) * 12 + (Number(aHRange.maxInches) || 0);
+    if (min > 0 && max > 0 && (bHeight < min || bHeight > max)) {
+      return { passed: false, reason: `height:b(${bHeight}in)-outside-a[${min},${max}]` };
     }
-    return true;
   }
 
-  // 11.3 — MARIJUANA tolerance
-  if (prefQId==='11.3'){
-    if (pref.includes("prefer they don't")||pref==='no'||pref.startsWith('no ')){
-      // Strict: any current use fails. Past experimentation OK (counts as "never" current).
-      return behavior.includes('never')||behavior.includes("don't use")||behavior.includes('do not use')||behavior.includes('past experimentation');
-    }
-    if (pref.includes('occasional')){
-      // "Occasional is fine" — block only regular/daily
-      return !(behavior.includes('regularly')||behavior.includes('daily'));
-    }
-    return true;
+  if (a.latitude !== null && a.longitude !== null && b.latitude !== null && b.longitude !== null) {
+    const dist = haversineMiles(a.latitude, a.longitude, b.latitude, b.longitude);
+    const aMaxDist = distancePrefMiles(getAnswer(aAns, "9.4"));
+    const bMaxDist = distancePrefMiles(getAnswer(bAns, "9.4"));
+    if (dist > aMaxDist) return { passed: false, reason: `distance:${dist.toFixed(0)}mi>a-max-${aMaxDist}` };
+    if (dist > bMaxDist) return { passed: false, reason: `distance:${dist.toFixed(0)}mi>b-max-${bMaxDist}` };
   }
 
-  // 11.6 — PETS tolerance
-  if (prefQId==='11.6'){
-    if (pref.includes('allergic')||pref.includes('cannot be around pets')){
-      // Medical block: only "no pets" answers pass
-      return behavior.includes('no pets');
-    }
-    if (pref.includes('prefer no pets')){
-      // Strong pref: "no pets" or "no pets but I'd love some" pass; cats/dogs/both fail.
-      return behavior.includes('no pets');
+  const aView = getAnswer(aAns, "6.1"); const bView = getAnswer(bAns, "6.1");
+  const aPolPref = getAnswer(aAns, "12.1") || []; const bPolPref = getAnswer(bAns, "12.1") || [];
+  if (aView && Array.isArray(bPolPref) && bPolPref.length > 0) {
+    if (!politicsMatches(aView, bPolPref)) return { passed: false, reason: "politics:a-not-in-b-pref" };
+  }
+  if (bView && Array.isArray(aPolPref) && aPolPref.length > 0) {
+    if (!politicsMatches(bView, aPolPref)) return { passed: false, reason: "politics:b-not-in-a-pref" };
+  }
+
+  return { passed: true };
+}
+
+interface DealbreakerResult { passed: boolean; reason?: string; }
+
+function passesPreferenceDealbreaker(qid: string, prefValue: string, partnerBehavior: string): boolean {
+  switch (qid) {
+    case "11.1": {
+      if (!prefValue) return true;
+      if (prefValue === "Must not drink") return partnerBehavior === "Never drink";
+      if (prefValue === "Prefer non-drinker") return partnerBehavior === "Never drink" || /rarely/i.test(partnerBehavior);
+      return true;
     }
-    if (pref.includes('small pets only')){
-      return behavior.includes('no pets')||behavior.includes('other pets')||(behavior.includes('cat')&&!behavior.includes('dog'));
+    case "11.1b": {
+      if (!prefValue) return true;
+      if (prefValue.includes("drinks with me") || prefValue.includes("part of how I connect")) {
+        return partnerBehavior !== "Never drink";
+      }
+      return true;
     }
-    if (pref.includes('dogs are fine')){
-      // Dogs OK, no pets OK; cats / cats+dogs fail since user opted no cats
-      return !behavior.includes('cat')||behavior.includes('no pets')||behavior.startsWith('dog');
+    case "11.2": {
+      if (!prefValue) return true;
+      if (prefValue === "Must not smoke" || prefValue === "Prefer non-smoker") {
+        return partnerBehavior === "Never" || /quit|trying/i.test(partnerBehavior);
+      }
+      return true;
     }
-    if (pref.includes('cats are fine')){
-      return !behavior.includes('dog')||behavior.includes('no pets')||behavior.startsWith('cat');
+    case "11.3": {
+      if (!prefValue) return true;
+      if (/prefer they don't/i.test(prefValue) || /No.*prefer they don't/i.test(prefValue)) {
+        return partnerBehavior === "Never";
+      }
+      return true;
     }
-    return true;
-  }
-
-  // 11.7 — REC DRUG tolerance (beyond cannabis)
-  if (prefQId==='11.7'){
-    if (pref.includes('not okay')||pref.includes('important to me')){
-      // Strict: only non-users pass. Past experimentation also OK (no longer using).
-      return behavior.includes('no')&&(behavior.includes("don't use")||behavior.includes('do not use')||behavior.startsWith('no '))||behavior.includes('past experimentation');
+    case "11.6": {
+      if (!prefValue) return true;
+      const noPets = partnerBehavior === "No pets";
+      if (/allergies|cannot be around/i.test(prefValue)) return noPets;
+      if (/prefer no pets/i.test(prefValue)) return noPets;
+      if (/Small pets only/i.test(prefValue)) return noPets || /other pets/i.test(partnerBehavior);
+      if (/Dogs are fine but I'm not a cat/i.test(prefValue)) return !/Cat\(s\)/i.test(partnerBehavior);
+      if (/Cats are fine but I'm not a dog/i.test(prefValue)) return !/Dog\(s\)/i.test(partnerBehavior);
+      return true;
+    }
+    case "11.7": {
+      if (!prefValue) return true;
+      if (/Not okay|important to me/i.test(prefValue)) {
+        return /^No/i.test(partnerBehavior);
+      }
+      return true;
     }
-    if (pref.includes("prefer they don't")){
-      // Softer: occasional / past use is fine. Sometimes/regularly fails.
-      return !(behavior.includes('sometimes')||behavior.includes('regularly')||behavior.includes('part of my lifestyle'));
+    case "11.8": {
+      if (!prefValue) return true;
+      if (/participates|part of how I experience/i.test(prefValue)) {
+        return /sometimes|regularly/i.test(partnerBehavior);
+      }
+      return true;
     }
-    return true;
   }
+  return true;
+}
 
-  // 11.8 — DRUG COMPANION pref (the user wants partner to use drugs with them)
-  if (prefQId==='11.8'){
-    if (pref.includes('participates with me')||pref.includes('part of how i experience')||pref.includes('joins me')||pref.includes('does drugs with me')){
-      // Need a partner who uses. "No" / "never" / "don't use" fails.
-      return behavior.includes('sometimes')||behavior.includes('regularly')||behavior.includes('part of my lifestyle')||behavior.includes('a few times a month');
-    }
-    return true;
+const PREF_TO_BEHAVIOR: Record<string, string> = {
+  "11.1": "3.1", "11.1b": "3.2", "11.2": "3.3", "11.3": "3.4", "11.4": "3.5",
+  "11.6": "3.8", "11.7": "3.10", "11.8": "3.10", "12.2b": "6.2b", "12.7": "8.7",
+};
+const PREF_WEIGHTS: Record<string, number> = {
+  "11.1": 3, "11.1b": 3, "11.2": 3, "11.3": 2, "11.4": 2,
+  "11.6": 1, "11.7": 3, "11.8": 3, "12.2b": 3, "12.7": 3,
+};
+const PREF_CATEGORIES: Record<string, string> = {
+  "11.1": "Lifestyle Behaviors", "11.1b": "Lifestyle Behaviors",
+  "11.2": "Lifestyle Behaviors", "11.3": "Lifestyle Behaviors",
+  "11.4": "Lifestyle Behaviors", "11.6": "Lifestyle Behaviors",
+  "11.7": "Lifestyle Behaviors", "11.8": "Lifestyle Behaviors",
+  "12.2b": "Values & Beliefs", "12.7": "Life Goals",
+};
+
+function religionMatches(partnerBelief: string, prefArr: string[]): boolean {
+  if (!partnerBelief || !prefArr || prefArr.length === 0) return true;
+  if (prefArr.includes("Open to different beliefs") || prefArr.includes("No preference")) return true;
+  if (prefArr.includes(partnerBelief)) return true;
+  if (prefArr.includes("Prefer secular / non-religious")) {
+    return /atheist|agnostic|spiritual but not|prefer not to label/i.test(partnerBelief);
   }
+  return false;
+}
 
-  // Unknown pref Q — default to pass (no veto on something we don't know how to check)
-  return true;
+const ACTIVE_HOBBIES = new Set([
+  "Hiking", "Cycling", "Running", "Yoga", "Climbing", "Surfing", "Skiing",
+  "Snowboarding", "Tennis", "Pickleball", "Crossfit", "Weightlifting",
+  "Swimming", "Dancing", "Martial arts", "Biking",
+]);
+
+function passesAdventurePartnerCheck(myAns: Answers, partnerAns: Answers): boolean {
+  const myHobbies: string[] = getAnswer(myAns, "3.9") || [];
+  const theirHobbies: string[] = getAnswer(partnerAns, "3.9") || [];
+  const shared = myHobbies.filter(h => theirHobbies.includes(h));
+  if (shared.length >= 3) return true;
+  const myActive = myHobbies.filter(h => ACTIVE_HOBBIES.has(h));
+  const theirActive = theirHobbies.filter(h => ACTIVE_HOBBIES.has(h));
+  if (myActive.length >= 3 && theirActive.length >= 3) return true;
+  return false;
 }
 
-function collectActiveDealbreakers(user:any):Set<string>{
-  // Combine the array AND any answer-object-level isDealbreaker:true flags.
-  // Defensive: prevents silent regressions if the frontend ever fails to sync the array.
-  const out=new Set<string>(user.dealbreakers||[]);
-  if (user.answers && typeof user.answers==='object'){
-    for (const[qId,raw]of Object.entries(user.answers)){
-      if (raw&&typeof raw==='object'&&!Array.isArray(raw)&&(raw as any).isDealbreaker===true){
-        out.add(qId);
+function checkDealbreakers(meAns: Answers, meDB: Set<string>, partnerAns: Answers): DealbreakerResult {
+  for (const qid of meDB) {
+    if (qid in PREF_TO_BEHAVIOR) {
+      const prefV = getAnswer(meAns, qid);
+      const behaviorQ = PREF_TO_BEHAVIOR[qid];
+      const behaviorV = getAnswer(partnerAns, behaviorQ);
+      if (prefV && behaviorV && !passesPreferenceDealbreaker(qid, String(prefV), String(behaviorV))) {
+        return { passed: false, reason: `q${qid}-pref-vs-q${behaviorQ}-behavior` };
       }
     }
   }
-  return out;
-}
 
-function checkDealbreakers(u1:any,u2:any):{passed:boolean;reason?:string}{
-  for(const[user,other]of[[u1,u2],[u2,u1]]){
-    const activeDb=collectActiveDealbreakers(user);
-    if(!activeDb.size)continue;
-    for(const qId of activeDb){
-      // v64 FIX: hard-filter questions are enforced by checkHardFilters(); never re-evaluate here.
-      if(HARD_FILTER_QIDS.has(qId))continue;
-      const userPref=extractValue(user.answers[qId]);
-      if(!userPref)continue;
-
-      // Q3.11 adventure-partner soft block (uses hobby overlap, not preference scoring)
-      if(qId==='3.11'){
-        const prefStr=Array.isArray(userPref)?String(userPref[0]):String(userPref);
-        if(prefStr.toLowerCase().includes('adventure partner')||prefStr.toLowerCase().includes('actively does life')){
-          if(!passesAdventurePartnerCheck(extractValue(user.answers['3.9']),extractValue(other.answers['3.9'])))return{passed:false,reason:'Dealbreaker q3.11: no adventure partner signal'};
+  if (meDB.has("12.2")) {
+    const prefArr = getAnswer(meAns, "12.2");
+    const partnerBelief = getAnswer(partnerAns, "6.2");
+    let prefList: string[];
+    if (Array.isArray(prefArr)) prefList = prefArr;
+    else if (typeof prefArr === "string") prefList = [prefArr];
+    else prefList = [];
+    if (prefList.length > 0 && partnerBelief) {
+      if (prefList.includes("Similar beliefs to mine")) {
+        const myBelief = getAnswer(meAns, "6.2");
+        if (myBelief && partnerBelief !== myBelief) {
+          return { passed: false, reason: "q12.2-strict-belief-mismatch" };
         }
-        continue;
+      } else if (!religionMatches(partnerBelief, prefList)) {
+        return { passed: false, reason: "q12.2-belief-not-in-pref" };
       }
+    }
+  }
 
-      // Q9.4 directional distance dealbreaker (partner more restrictive than me = block)
-      if(qId==='9.4'){
-        const otherPref=extractValue(other.answers['9.4']);
-        if(!otherPref)continue;
-        const uc=getCluster('9.4',String(userPref));
-        const oc=getCluster('9.4',String(otherPref));
-        if(uc!==-1&&oc!==-1&&oc<uc)return{passed:false,reason:'Dealbreaker q9.4 match too restrictive'};
-        continue;
+  if (meDB.has("3.11")) {
+    const v = getAnswer(meAns, "3.11");
+    if (v && /adventure partner|actively does life/i.test(String(v))) {
+      if (!passesAdventurePartnerCheck(meAns, partnerAns)) {
+        return { passed: false, reason: "q3.11-adventure-partner-no-overlap" };
       }
+    }
+  }
 
-      // ===== v63 FIX: preference dealbreakers use absolute-semantics gate =====
-      if(PREF_DEALBREAKER_QIDS.has(qId)){
-        const behaviorQId=PREF_TO_ANSWER[qId];
-        if(!behaviorQId)continue;
-        const otherBehavior=extractValue(other.answers[behaviorQId]);
-        const prefStr=Array.isArray(userPref)?String(userPref[0]):String(userPref);
-        // "No preference" never blocks
-        if(prefStr.toLowerCase().includes('no preference'))continue;
-        // For 11.x questions, missing partner answer means "not using" (showIf-gated questions like 3.2)
-        // EXCEPT for 11.1b which requires evidence of drinking style — handled inside passesPreferenceDealbreaker.
-        const behaviorStr=otherBehavior==null?'':(Array.isArray(otherBehavior)?otherBehavior.join(' '):String(otherBehavior));
-        if(!passesPreferenceDealbreaker(qId,behaviorStr,prefStr)){
-          return{passed:false,reason:`Dealbreaker q${qId} (pref: "${prefStr.slice(0,40)}" vs behavior: "${behaviorStr.slice(0,40)}")`};
-        }
-        continue;
-      }
+  if (meDB.has("9.4")) {
+    const myMax = distancePrefMiles(getAnswer(meAns, "9.4"));
+    const theirMax = distancePrefMiles(getAnswer(partnerAns, "9.4"));
+    if (theirMax < myMax) {
+      return { passed: false, reason: "q9.4-partner-more-restrictive" };
+    }
+  }
+
+  return { passed: true };
+}
+
+function scorePets(a: string, b: string): number {
+  const opts = QUESTIONS_BY_ID["3.8"]?.options || [];
+  const ia = getCluster(a, opts, "3.8"); const ib = getCluster(b, opts, "3.8");
+  if (ia === -1 || ib === -1) return 50;
+  const matrix: number[][] = [
+    [100, 75, 75, 80, 70, 40],
+    [75, 100, 60, 85, 70, 80],
+    [75, 60, 100, 70, 70, 80],
+    [80, 85, 70, 100, 70, 75],
+    [70, 70, 70, 70, 100, 75],
+    [40, 80, 80, 75, 75, 100],
+  ];
+  return matrix[ia]?.[ib] ?? 50;
+}
+
+function scoreWeekdayEve(a: string, b: string): number {
+  const opts = QUESTIONS_BY_ID["4.2"]?.options || [];
+  const ia = getCluster(a, opts, "4.2"); const ib = getCluster(b, opts, "4.2");
+  if (ia === -1 || ib === -1) return 50;
+  if (ia === ib) return 100;
+  return clusterDistanceScore(a, b, opts, "4.2");
+}
+
+function scoreLocation(a: string, b: string): number {
+  const opts = QUESTIONS_BY_ID["4.7"]?.options || [];
+  const ia = getCluster(a, opts, "4.7"); const ib = getCluster(b, opts, "4.7");
+  if (ia === -1 || ib === -1) return 50;
+  if (a.includes("Wherever") || b.includes("Wherever")) return 85;
+  if (ia === ib) return 100;
+  return clusterDistanceScore(a, b, opts, "4.7");
+}
+
+function scoreReligion(a: string, b: string, aOpenInQ12_2?: boolean, bOpenInQ12_2?: boolean): number {
+  if (a === b) return 100;
+  const aLower = a.toLowerCase(); const bLower = b.toLowerCase();
+  let baseline = 30;
+  if (aOpenInQ12_2 && bOpenInQ12_2) baseline = 45;
+  const seculars = ["atheist", "agnostic", "spiritual but not", "prefer not to label"];
+  const aSec = seculars.some(s => aLower.includes(s));
+  const bSec = seculars.some(s => bLower.includes(s));
+  if (aSec && bSec) return 70;
+  const christianish = ["christian", "catholic", "protestant"];
+  if (christianish.some(s => aLower.includes(s)) && christianish.some(s => bLower.includes(s))) return 70;
+  return baseline;
+}
+
+function scoreStress(a: string, b: string): number {
+  const opts = QUESTIONS_BY_ID["7.6"]?.options || [];
+  const aPullBack = /pull back|space|process|keep it separate/i.test(a);
+  const bPullBack = /pull back|space|process|keep it separate/i.test(b);
+  const aLeanIn = /lean on/i.test(a);
+  const bLeanIn = /lean on/i.test(b);
+  if (aPullBack && bPullBack) return 90;
+  if (aLeanIn && bLeanIn) return 80;
+  if ((aPullBack && bLeanIn) || (aLeanIn && bPullBack)) return 20;
+  return clusterDistanceScore(a, b, opts, "7.6");
+}
+
+const GOTTMAN: number[][] = [
+  [100, 90, 65, 60, 45],
+  [90, 90, 60, 55, 40],
+  [65, 60, 50, 30, 25],
+  [60, 55, 30, 50, 25],
+  [45, 40, 25, 25, 30],
+];
 
-      // Cluster-based dealbreakers (e.g. 12.2 religion preference, 8.x life goals)
-      const answerQId=PREF_TO_ANSWER[qId]||qId;
-      const otherAnswer=extractValue(other.answers[answerQId]);
-      if(!otherAnswer)continue;
-      if(CLUSTERS[answerQId]){
-        const oAns=Array.isArray(otherAnswer)?otherAnswer[0]:otherAnswer;
-        const oc=getCluster(answerQId,String(oAns));
-        if(oc===-1)continue;
-        const prefArr=Array.isArray(userPref)?userPref:[userPref];
-        if(prefArr.some((v:string)=>v.toLowerCase().includes('open to all')||v.toLowerCase().includes('no preference')))continue;
-        if(!prefArr.some((v:string)=>getCluster(answerQId,String(v))===oc))return{passed:false,reason:`Dealbreaker q${qId}`};
-        continue;
-      }
-      if(Array.isArray(userPref)){
-        if(userPref.some((v:string)=>v.toLowerCase().includes('open to all')))continue;
-        const otherArr=Array.isArray(otherAnswer)?otherAnswer:[otherAnswer];
-        if(!userPref.some((v:any)=>otherArr.includes(v)))return{passed:false,reason:`Dealbreaker multi q${qId}`};
+function classifyGottman(answer: string): number {
+  const s = answer.toLowerCase();
+  if (/catastrophize|make it personal|explode|blow up|lash out/.test(s)) return 4;
+  if (/go quiet|pull away|withdraw|shut down|disengage/.test(s)) return 3;
+  if (/harsher than I intend|criticize|sharp|sarcas/.test(s)) return 2;
+  if (/let the small things go|pick.{0,5}battle|raise the bigger/.test(s)) return 1;
+  if (/bring it up directly|staying curious|talk it through/.test(s)) return 0;
+  return 1;
+}
+
+function scoreGottman(a: string, b: string): number {
+  return GOTTMAN[classifyGottman(a)][classifyGottman(b)];
+}
+
+function scoreChildrenStatus(a: string, b: string): number {
+  if (a === b) return 100;
+  const noKids = (s: string) => /no children/i.test(s);
+  const grown = (s: string) => /adult children|grown/i.test(s);
+  const young = (s: string) => /young children|teenagers/i.test(s);
+  if ((noKids(a) && grown(b)) || (grown(a) && noKids(b))) return 50;
+  if ((noKids(a) && young(b)) || (young(a) && noKids(b))) return 20;
+  return 60;
+}
+
+function scoreHousehold(a: string, b: string): number {
+  if (a === b) return 100;
+  const aMore = /carry more/i.test(a);
+  const aLess = /partner to carry more/i.test(a);
+  const bMore = /carry more/i.test(b);
+  const bLess = /partner to carry more/i.test(b);
+  if ((aMore && bLess) || (aLess && bMore)) return 90;
+  const opts = QUESTIONS_BY_ID["11.9"]?.options || [];
+  return clusterDistanceScore(a, b, opts, "11.9");
+}
+
+const BODY_TYPE_SCALE = ["Slim", "Athletic", "Average / Medium build", "Curvy", "Muscular", "Broad / Solid", "Full-figured", "Plus-size"];
+
+function scoreBodyType(myBuild: string[], partnerPref: string[]): number {
+  if (!myBuild || myBuild.length === 0) return 50;
+  if (!partnerPref || partnerPref.length === 0) return 75;
+  if (partnerPref.includes("Open to all body types")) return 100;
+  for (const bt of myBuild) if (partnerPref.includes(bt)) return 100;
+  let bestScore = 0;
+  for (const my of myBuild) {
+    const myIdx = BODY_TYPE_SCALE.indexOf(my);
+    if (myIdx < 0) continue;
+    for (const pref of partnerPref) {
+      const prefIdx = BODY_TYPE_SCALE.indexOf(pref);
+      if (prefIdx < 0) continue;
+      const dist = Math.abs(myIdx - prefIdx);
+      const s = Math.max(0, 100 - dist * 25);
+      if (s > bestScore) bestScore = s;
+    }
+  }
+  return bestScore || 30;
+}
+
+function scoreMultiSelectJaccard(a: string[], b: string[]): number {
+  if (!a || !b || a.length === 0 || b.length === 0) return 0;
+  const aSet = new Set(a); const bSet = new Set(b);
+  let intersection = 0; for (const v of aSet) if (bSet.has(v)) intersection++;
+  const union = new Set([...aSet, ...bSet]).size;
+  return Math.round(100 * intersection / union);
+}
+
+function scoreMultiSelectOverlapMin(a: string[], b: string[]): number {
+  if (!a || !b || a.length === 0 || b.length === 0) return 0;
+  const aSet = new Set(a); const bSet = new Set(b);
+  let intersection = 0; for (const v of aSet) if (bSet.has(v)) intersection++;
+  return Math.round(100 * intersection / Math.min(aSet.size, bSet.size));
+}
+
+type AttachmentStyle = "secure" | "anxious" | "avoidant" | "fearful";
+
+function classifyAttachment(q71a: string, q71b: string): AttachmentStyle {
+  const a = (q71a || "").toLowerCase();
+  const b = (q71b || "").toLowerCase();
+  const aSecure = /assume.*busy|don't stress/.test(a);
+  const aAnxious = /uneasy|checking my phone|still thinking about it|worry/.test(a);
+  const aAvoidant = /irritated.*pull back|pull back/.test(a);
+  const bSecure = /natural.*lean into|lean into/.test(b);
+  const bAnxious = /exciting.*nervous|nervous/.test(b);
+  const bAvoidant = /too much.*space|need space|urge to pull away/.test(b);
+  if (aSecure && bSecure) return "secure";
+  if ((aAnxious && bAvoidant) || (aAvoidant && bAnxious)) return "fearful";
+  if (aAnxious || bAnxious) return "anxious";
+  if (aAvoidant || bAvoidant) return "avoidant";
+  return "secure";
+}
+
+function scoreAttachmentPair(meStyle: AttachmentStyle, themStyle: AttachmentStyle): { score: number; isAnxiousAvoidant: boolean } {
+  const matrix: Record<AttachmentStyle, Record<AttachmentStyle, number>> = {
+    secure:   { secure: 100, anxious: 80, avoidant: 70, fearful: 65 },
+    anxious:  { secure: 80, anxious: 70, avoidant: 25, fearful: 50 },
+    avoidant: { secure: 70, anxious: 25, avoidant: 65, fearful: 55 },
+    fearful:  { secure: 65, anxious: 50, avoidant: 55, fearful: 40 },
+  };
+  const score = matrix[meStyle][themStyle];
+  const isAnxiousAvoidant = (meStyle === "anxious" && themStyle === "avoidant")
+    || (meStyle === "avoidant" && themStyle === "anxious");
+  return { score, isAnxiousAvoidant };
+}
+
+interface QuestionScore { qid: string; score: number; weight: number; category: string; }
+
+function scoreQuestion(qid: string, meAns: Answers, partnerAns: Answers): QuestionScore | null {
+  const q = QUESTIONS_BY_ID[qid];
+  if (!q) return null;
+  const meV = getAnswer(meAns, qid);
+  const themV = getAnswer(partnerAns, qid);
+
+  if (qid === "3.8") { if (!meV || !themV) return null; return { qid, score: scorePets(String(meV), String(themV)), weight: q.weight, category: q.category }; }
+  if (qid === "4.2") { if (!meV || !themV) return null; return { qid, score: scoreWeekdayEve(String(meV), String(themV)), weight: q.weight, category: q.category }; }
+  if (qid === "4.7") { if (!meV || !themV) return null; return { qid, score: scoreLocation(String(meV), String(themV)), weight: q.weight, category: q.category }; }
+  if (qid === "6.2") {
+    if (!meV || !themV) return null;
+    const mePref = getAnswer(meAns, "12.2"); const themPref = getAnswer(partnerAns, "12.2");
+    const aOpen = (Array.isArray(mePref) && mePref.includes("Open to different beliefs")) || mePref === "Open to different beliefs";
+    const bOpen = (Array.isArray(themPref) && themPref.includes("Open to different beliefs")) || themPref === "Open to different beliefs";
+    return { qid, score: scoreReligion(String(meV), String(themV), aOpen, bOpen), weight: q.weight, category: q.category };
+  }
+  if (qid === "7.6") { if (!meV || !themV) return null; return { qid, score: scoreStress(String(meV), String(themV)), weight: q.weight, category: q.category }; }
+  if (qid === "7.11") { if (!meV || !themV) return null; return { qid, score: scoreGottman(String(meV), String(themV)), weight: q.weight, category: q.category }; }
+  if (qid === "8.1") { if (!meV || !themV) return null; return { qid, score: scoreChildrenStatus(String(meV), String(themV)), weight: q.weight, category: q.category }; }
+  if (qid === "11.9") { if (!meV || !themV) return null; return { qid, score: scoreHousehold(String(meV), String(themV)), weight: q.weight, category: q.category }; }
+  if (qid === "1.7") {
+    const myBuild = Array.isArray(meV) ? meV : (meV ? [String(meV)] : []);
+    const partnerPref = getAnswer(partnerAns, "10.1");
+    const partnerPrefArr = Array.isArray(partnerPref) ? partnerPref : (partnerPref ? [String(partnerPref)] : []);
+    if (myBuild.length === 0) return null;
+    return { qid, score: scoreBodyType(myBuild, partnerPrefArr), weight: q.weight, category: q.category };
+  }
+  if (qid === "12.2") {
+    const themBelief = getAnswer(partnerAns, "6.2");
+    const myPrefArr = Array.isArray(meV) ? meV : (meV ? [String(meV)] : []);
+    if (!themBelief || myPrefArr.length === 0) return null;
+    if (myPrefArr.includes("Open to different beliefs") || myPrefArr.includes("No preference")) {
+      return { qid, score: 90, weight: q.weight, category: q.category };
+    }
+    if (myPrefArr.includes(String(themBelief))) {
+      return { qid, score: 100, weight: q.weight, category: q.category };
+    }
+    if (religionMatches(String(themBelief), myPrefArr)) {
+      return { qid, score: 80, weight: q.weight, category: q.category };
+    }
+    return { qid, score: 30, weight: q.weight, category: q.category };
+  }
+
+  if (q.type === "MS" || q.type === "MS_MAX") {
+    const aArr = Array.isArray(meV) ? meV.map(String) : (meV ? [String(meV)] : []);
+    const bArr = Array.isArray(themV) ? themV.map(String) : (themV ? [String(themV)] : []);
+    if (aArr.length === 0 || bArr.length === 0) return null;
+    const score = qid === "3.9" ? scoreMultiSelectOverlapMin(aArr, bArr) : scoreMultiSelectJaccard(aArr, bArr);
+    return { qid, score, weight: q.weight, category: q.category };
+  }
+
+  if (!meV || !themV) return null;
+  return { qid, score: clusterDistanceScore(String(meV), String(themV), q.options, qid), weight: q.weight, category: q.category };
+}
+
+function scorePrefVsBehavior(prefQid: string, mePref: any, partnerBehavior: any): number {
+  const prefStr = String(unwrap(mePref) || "");
+  const behStr = String(unwrap(partnerBehavior) || "");
+  if (!prefStr || !behStr) return 0;
+  const passes = passesPreferenceDealbreaker(prefQid, prefStr, behStr);
+  if (passes) {
+    if (/No preference|Open/i.test(prefStr)) return 75;
+    return 100;
+  }
+  return 30;
+}
+
+const CATEGORY_TOKENS: Record<string, number> = {
+  "Attachment & Emotional Health": 8, "Communication & Conflict": 6,
+  "Life Goals": 6, "Values & Beliefs": 6,
+  "Lifestyle Behaviors": 4, "Social & Shared Life": 4,
+  "Financial & Career": 3, "Intimacy & Connection": 3,
+};
+
+function scoreDirectional(meAns: Answers, partnerAns: Answers): { total: number; byCategory: Record<string, number>; questionScores: QuestionScore[]; attachmentStyle: AttachmentStyle; isAnxiousAvoidant: boolean; } {
+  const questionScores: QuestionScore[] = [];
+  for (const q of CANONICAL.questions as CanonicalQuestion[]) {
+    if (!isScored(q.id)) continue;
+    if (q.id === "7.1a" || q.id === "7.1b") continue;
+    const s = scoreQuestion(q.id, meAns, partnerAns);
+    if (s) questionScores.push(s);
+  }
+
+  const meStyle = classifyAttachment(getAnswer(meAns, "7.1a") || "", getAnswer(meAns, "7.1b") || "");
+  const themStyle = classifyAttachment(getAnswer(partnerAns, "7.1a") || "", getAnswer(partnerAns, "7.1b") || "");
+  const { score: attachScore, isAnxiousAvoidant } = scoreAttachmentPair(meStyle, themStyle);
+  questionScores.push({ qid: "7.1", score: attachScore, weight: 10, category: "Attachment & Emotional Health" });
+
+  for (const [prefQid, behaviorQid] of Object.entries(PREF_TO_BEHAVIOR)) {
+    const myPref = getAnswer(meAns, prefQid);
+    const partnerBeh = getAnswer(partnerAns, behaviorQid);
+    if (myPref === undefined || partnerBeh === undefined) continue;
+    const score = scorePrefVsBehavior(prefQid, myPref, partnerBeh);
+    questionScores.push({
+      qid: `${prefQid}->${behaviorQid}`, score,
+      weight: PREF_WEIGHTS[prefQid] || 1,
+      category: PREF_CATEGORIES[prefQid] || "Lifestyle Behaviors",
+    });
+  }
+
+  const byCategory: Record<string, number> = {};
+  const categoryWeights: Record<string, number> = {};
+  for (const s of questionScores) {
+    byCategory[s.category] = (byCategory[s.category] || 0) + s.score * s.weight;
+    categoryWeights[s.category] = (categoryWeights[s.category] || 0) + s.weight;
+  }
+  for (const cat of Object.keys(byCategory)) {
+    byCategory[cat] = Math.round(byCategory[cat] / categoryWeights[cat]);
+  }
+
+  let totalWeighted = 0; let totalTokens = 0;
+  for (const [cat, tokens] of Object.entries(CATEGORY_TOKENS)) {
+    const catScore = byCategory[cat];
+    if (catScore !== undefined) {
+      totalWeighted += catScore * tokens;
+      totalTokens += tokens;
+    }
+  }
+  let total = totalTokens > 0 ? Math.round(totalWeighted / totalTokens) : 0;
+  if (isAnxiousAvoidant) total = Math.round(total * 0.90);
+
+  return { total, byCategory, questionScores, attachmentStyle: meStyle, isAnxiousAvoidant };
+}
+
+function buildWhyYouMatched(meAns: Answers, themAns: Answers, byCategory: Record<string, number>): string[] {
+  const reasons: string[] = [];
+  for (const [cat, sc] of Object.entries(byCategory)) {
+    if (sc >= 80) reasons.push(`Strong alignment on ${cat.toLowerCase()}`);
+    if (reasons.length >= 5) break;
+  }
+  const myH: string[] = getAnswer(meAns, "3.9") || [];
+  const themH: string[] = getAnswer(themAns, "3.9") || [];
+  const shared = myH.filter(h => themH.includes(h));
+  if (shared.length >= 3 && reasons.length < 5) reasons.push(`Shared interests: ${shared.slice(0, 3).join(", ")}`);
+  const a86 = getAnswer(meAns, "8.6"); const b86 = getAnswer(themAns, "8.6");
+  if (a86 && a86 === b86 && reasons.length < 5) reasons.push("Both looking for the same kind of relationship");
+  const a82 = getAnswer(meAns, "8.2"); const b82 = getAnswer(themAns, "8.2");
+  if (a82 && a82 === b82 && reasons.length < 5) reasons.push("Aligned on whether you want children");
+  return reasons.slice(0, 5);
+}
+
+function buildPotentialDifferences(qScores: QuestionScore[]): string[] {
+  const diffs: string[] = [];
+  for (const s of qScores) {
+    if (s.score < 50 && diffs.length < 3) {
+      const q = QUESTIONS_BY_ID[s.qid.split("->")[0]];
+      if (q) diffs.push(`Different views on: ${q.text}`);
+    }
+  }
+  return diffs;
+}
+
+const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
+const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
+const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
+
+const HARMONIC_FLOOR = 40;
+const DIRECTIONAL_FLOOR = 30;
+
+async function loadProfilesAndAnswers(userId: string) {
+  const { data: meProfile, error: meErr } = await sb.from("profiles").select("*").eq("id", userId).single();
+  if (meErr || !meProfile) throw new Error(`profile not found: ${userId}`);
+  const { data: meAnsRow } = await sb.from("user_answers").select("answers").eq("user_id", userId).single();
+  const { data: meDBRow } = await sb.from("user_dealbreakers").select("question_ids").eq("user_id", userId).maybeSingle();
+  const meAnswers = (meAnsRow?.answers || {}) as Answers;
+  const meDB = new Set<string>((meDBRow?.question_ids || []) as string[]);
+  for (const [qid, val] of Object.entries(meAnswers)) {
+    if (isDealbreakerSet(val)) meDB.add(qid);
+  }
+
+  const { data: candidates } = await sb.from("profiles").select("*").eq("has_completed_onboarding", true).neq("id", userId);
+  const candidateAnswers: Record<string, Answers> = {};
+  const candidateDBs: Record<string, Set<string>> = {};
+  if (candidates && candidates.length > 0) {
+    const ids = candidates.map((c: any) => c.id);
+    const { data: ansRows } = await sb.from("user_answers").select("user_id, answers").in("user_id", ids);
+    const { data: dbRows } = await sb.from("user_dealbreakers").select("user_id, question_ids").in("user_id", ids);
+    for (const r of ansRows || []) candidateAnswers[r.user_id] = r.answers || {};
+    for (const r of dbRows || []) candidateDBs[r.user_id] = new Set(r.question_ids || []);
+    for (const [uid, ans] of Object.entries(candidateAnswers)) {
+      if (!candidateDBs[uid]) candidateDBs[uid] = new Set();
+      for (const [qid, val] of Object.entries(ans)) {
+        if (isDealbreakerSet(val)) candidateDBs[uid].add(qid);
       }
     }
   }
-  return{passed:true};
+
+  return { me: meProfile as Profile, meAnswers, meDB, candidates: (candidates || []) as Profile[], candidateAnswers, candidateDBs };
 }
 
-function extractValue(answer:any):any{if(answer&&typeof answer==='object'&&'value' in answer)return answer.value;return answer;}
-function extractAgeRange(a:any):{min:number;max:number}|null{const val=extractValue(a);if(val&&typeof val==='object'&&'min' in val&&'max' in val)return val;return null;}
-function extractHeight(h:any):number|null{if(typeof h==='number')return h;if(h&&typeof h==='object'){if('feet' in h&&'inches' in h)return h.feet*12+h.inches;if('value' in h)return extractHeight(h.value);}return null;}
-function extractHeightRange(a:any):{min:number;max:number}|null{const val=extractValue(a);if(val&&typeof val==='object'){if('min' in val&&'max' in val)return val;if('minFeet' in val&&'maxFeet' in val)return{min:val.minFeet*12+(val.minInches||0),max:val.maxFeet*12+(val.maxInches||0)};}if(Array.isArray(val)&&val.length===2)return{min:val[0],max:val[1]};return null;}
-function calcDistance(loc1:{lat:number;lng:number},loc2:{lat:number;lng:number}):number{const R=3959;const dLat=(loc2.lat-loc1.lat)*Math.PI/180;const dLng=(loc2.lng-loc1.lng)*Math.PI/180;const a=Math.sin(dLat/2)**2+Math.cos(loc1.lat*Math.PI/180)*Math.cos(loc2.lat*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
-function parseDistancePref(pref:string):number{if(pref.includes('25'))return 25;if(pref.includes('50'))return 50;if(pref.includes('100'))return 100;if(pref.includes('state')||pref.includes('region'))return 300;if(pref.includes('country'))return 3000;if(pref.includes('continent'))return 7000;if(pref.includes('world'))return 25000;return 100;}
-function resolveLatLng(lat:number|null,lng:number|null,ans:any):{lat:number;lng:number}|null{if(lat!=null&&lng!=null)return{lat,lng};if(ans){const la=ans.lat??ans.latitude??null;const lo=ans.lng??ans.longitude??null;if(la!=null&&lo!=null)return{lat:la,lng:lo};}return null;}
-function orientationAllows(orientation:string,myGender:string,theirGender:string):boolean|null{const o=orientation.toLowerCase();const mg=myGender.toLowerCase();const tg=theirGender.toLowerCase();const isMale=(g:string)=>g==='man'||g==='transgender man';const isFemale=(g:string)=>g==='woman'||g==='transgender woman';if(o.includes('straight')||o.includes('heterosexual')){if(isMale(mg))return isFemale(tg);if(isFemale(mg))return isMale(tg);return null;}if(o==='gay'||o==='lesbian'||(o.includes('gay')&&!o.includes('okay')&&!o.includes('no preference'))||o.includes('lesbian')){if(isMale(mg))return isMale(tg);if(isFemale(mg))return isFemale(tg);return null;}return null;}
-
-function checkHardFilters(u1:any,u2:any):{passed:boolean;reason?:string}{
-  const a1=u1.answers;const a2=u2.answers;
-  const genderMap:Record<string,string[]>={'Woman':['Women'],'Man':['Men'],'Non-binary':['Non-binary people'],'Transgender woman':['Transgender women','Women'],'Transgender man':['Transgender men','Men']};
-  const gp1=extractValue(a1['9.1']);const gp2=extractValue(a2['9.1']);const g1=a1['1.1'];const g2=a2['1.1'];
-  if(gp1&&Array.isArray(gp1)&&!gp1.includes('Open to all genders')&&g2){if(!(genderMap[g2]||[]).some((c:string)=>gp1.includes(c)))return{passed:false,reason:'Gender'};}
-  if(gp2&&Array.isArray(gp2)&&!gp2.includes('Open to all genders')&&g1){if(!(genderMap[g1]||[]).some((c:string)=>gp2.includes(c)))return{passed:false,reason:'Gender reverse'};}
-  const orient1=extractValue(a1['1.3']);const orient2=extractValue(a2['1.3']);
-  if(orient1&&g1&&g2){const allowed=orientationAllows(String(orient1),String(g1),String(g2));if(allowed===false)return{passed:false,reason:'Orientation'};}
-  if(orient2&&g2&&g1){const allowed=orientationAllows(String(orient2),String(g2),String(g1));if(allowed===false)return{passed:false,reason:'Orientation reverse'};}
-  if(!checkOrientationPref(a1,a2))return{passed:false,reason:'Orientation preference (1.3b)'};
-  if(!checkOrientationPref(a2,a1))return{passed:false,reason:'Orientation preference reverse (1.3b)'};
-  const ar1=extractAgeRange(a1['9.2']);const ar2=extractAgeRange(a2['9.2']);
-  if(ar1&&u2.age&&(u2.age<ar1.min||u2.age>ar1.max))return{passed:false,reason:'Age'};
-  if(ar2&&u1.age&&(u1.age<ar2.min||u1.age>ar2.max))return{passed:false,reason:'Age reverse'};
-  const hr1=extractHeightRange(a1['9.3']);const hr2=extractHeightRange(a2['9.3']);
-  const h2=extractHeight(a2['1.5']);const h1=extractHeight(a1['1.5']);
-  if(hr1&&h2&&(h2<hr1.min||h2>hr1.max))return{passed:false,reason:'Height'};
-  if(hr2&&h1&&(h1<hr2.min||h1>hr2.max))return{passed:false,reason:'Height reverse'};
-  const loc1=resolveLatLng(u1.lat,u1.lng,a1['2.1']);const loc2=resolveLatLng(u2.lat,u2.lng,a2['2.1']);
-  if(loc1&&loc2){const dist=calcDistance(loc1,loc2);const dp1=extractValue(a1['9.4']);const dp2=extractValue(a2['9.4']);if(dp1&&!dp1.toLowerCase().includes('world')&&dist>parseDistancePref(dp1))return{passed:false,reason:'Distance'};if(dp2&&!dp2.toLowerCase().includes('world')&&dist>parseDistancePref(dp2))return{passed:false,reason:'Distance reverse'};}
-  if(!checkPoliticsFilter(u1,u2))return{passed:false,reason:'Politics'};
-  return{passed:true};
-}
-
-const BODY_TYPE_ORDER=['slim / lean','athletic / toned','average / medium','curvy / full-figured','plus-size','large / heavyset'];
-const BODY_TYPE_STEP_SCORES=[100,65,35,15,0,0];
-function normalizeBodyType(val:string):string{const v=val.toLowerCase().trim();if(v.includes('slim')||v.includes('lean'))return 'slim / lean';if(v.includes('athletic')||v.includes('toned')||v==='muscular')return 'athletic / toned';if(v.includes('average')||v.includes('medium'))return 'average / medium';if(v.includes('curvy')||v.includes('full-figured')||v.includes('full figured'))return 'curvy / full-figured';if(v.includes('plus-size')||v.includes('plus size'))return 'plus-size';if(v.includes('broad')||v.includes('solid')||v.includes('heavyset')||v.includes('large'))return 'large / heavyset';if(v.includes('open to all'))return 'open to all body types';return v;}
-function bodyTypeStepScore(cat1:string,cat2:string):number{const i1=BODY_TYPE_ORDER.indexOf(cat1);const i2=BODY_TYPE_ORDER.indexOf(cat2);if(i1===-1||i2===-1)return 0;return BODY_TYPE_STEP_SCORES[Math.abs(i1-i2)]??0;}
-function scoreBodyType(prefsRaw:any,buildRaw:any):number{const prefArr=(Array.isArray(prefsRaw)?prefsRaw:[prefsRaw]).map((v:any)=>normalizeBodyType(String(v||'')));const buildArr=(Array.isArray(buildRaw)?buildRaw:[buildRaw]).map((v:any)=>normalizeBodyType(String(v||'')));if(prefArr.some((v:string)=>v==='open to all body types'))return 100;if(!buildArr.length||buildArr.every((v:string)=>v===''))return 75;let total=0,count=0;for(const pref of prefArr){let best=0;for(const build of buildArr){const s=bodyTypeStepScore(pref,build);if(s>best)best=s;}total+=best;count++;}return count>0?Math.round(total/count):0;}
-
-function scorePrefVsBehavior(prefQId:string,behaviorAnswer:string,prefAnswer:string):number{
-  const pref=prefAnswer.toLowerCase();const behavior=behaviorAnswer.toLowerCase();
-  if(prefQId==='12.7'){if(pref.includes('not very')||pref.includes('figure it out'))return 85;if(pref.includes('somewhat'))return 80;if(pref.includes('moderately'))return 75;return 70;}
-  if(prefQId==='11.1'){if(pref.includes('must not')){if(behavior.includes('never')||behavior.includes("don't drink")||behavior.includes('i do not')||behavior.includes('never drink'))return 100;if(behavior.includes('rarely')||behavior.includes('special occasion'))return 70;if(behavior.includes('socially'))return 20;return 0;}if(pref.includes('prefer non')){if(behavior.includes('never')||behavior.includes("don't drink")||behavior.includes('i do not'))return 100;if(behavior.includes('rarely'))return 80;if(behavior.includes('socially'))return 60;if(behavior.includes('regularly')||behavior.includes('frequently'))return 30;return 10;}if(pref.includes('occasional'))return behavior.includes('daily')||behavior.includes('regularly')||behavior.includes('frequently')?65:90;if(pref.includes('regular')||pref.includes('no preference'))return 100;return 70;}
-  if(prefQId==='11.2'){if(pref.includes('must not')){if(behavior.includes('never')||behavior.includes('do not smoke'))return 100;if(behavior.includes('quit')||behavior.includes('used to')||behavior.includes('trying to quit'))return 55;if(behavior.includes('socially')||behavior.includes('occasional'))return 20;return 0;}if(pref.includes('prefer non')){if(behavior.includes('never')||behavior.includes('do not smoke'))return 100;if(behavior.includes('quit')||behavior.includes('used to')||behavior.includes('trying to quit'))return 85;if(behavior.includes('socially')||behavior.includes('occasional'))return 55;if(behavior.includes('regular'))return 25;return 15;}if(pref.includes('occasional')||pref.includes('no preference'))return 100;return 70;}
-  if(prefQId==='11.3'){if(pref.includes('no')||pref.includes("prefer they don")){if(behavior.includes('never')||behavior.includes("don't use")||behavior.includes('i do not'))return 100;if(behavior.includes('occasionally'))return 55;if(behavior.includes('regularly'))return 25;return 0;}if(pref.includes('occasional')||pref.includes('regularly')||pref.includes('no preference'))return 100;return 70;}
-  if(prefQId==='11.6'){if(pref.includes('allergic')||pref.includes('allergies')||pref.includes('cannot be around')){if(behavior.includes('no pets'))return 100;return 0;}if(pref.includes('prefer no')){if(behavior.includes('no pets'))return 100;if(behavior.includes('dog')||behavior.includes('cat')||behavior.includes('both')||behavior.includes('other pets'))return 40;return 80;}if(pref.includes('love pets')||pref.includes('any pet'))return 100;if(pref.includes('dogs are fine')&&!behavior.includes('cat'))return 90;if(pref.includes('cats are fine')&&!behavior.includes('dog'))return 90;if(pref.includes('small pets only')){if(behavior.includes('no pets'))return 90;if(behavior.includes('dog')||behavior.includes('cat'))return 40;}return 80;}
-  if(prefQId==='11.4'){if(pref.includes('no preference'))return 100;if(pref.includes('very active')){if(behavior.includes('daily'))return 100;if(behavior.includes('several times a week'))return 90;if(behavior.includes('once or twice'))return 55;if(behavior.includes('few times a month'))return 25;return 10;}if(pref.includes('moderately active')){if(behavior.includes('several times'))return 100;if(behavior.includes('once or twice')||behavior.includes('daily'))return 80;if(behavior.includes('few times a month'))return 50;return 30;}if(pref.includes('somewhat active')){if(behavior.includes('once or twice')||behavior.includes('few times a month'))return 100;if(behavior.includes('several times'))return 75;if(behavior.includes('daily'))return 60;return 50;}if(pref.includes('not very active')){if(behavior.includes('rarely')||behavior.includes('few times a month'))return 100;if(behavior.includes('once or twice'))return 70;if(behavior.includes('several times'))return 35;if(behavior.includes('daily'))return 15;return 80;}return 70;}
-  if(prefQId==='11.7'){if(pref.includes('not okay')||pref.includes('important to me')){if(behavior.includes('no')||behavior.includes("don't use")||behavior.includes('do not use'))return 100;if(behavior.includes('occasionally')||behavior.includes('a few times a year'))return 30;if(behavior.includes('sometimes'))return 10;return 0;}if(pref.includes('prefer they don\'t')||pref.includes('prefer they')){if(behavior.includes('no')||behavior.includes("don't use"))return 100;if(behavior.includes('occasionally'))return 70;if(behavior.includes('sometimes'))return 40;return 10;}if(pref.includes('no preference'))return 100;return 70;}
-  if(prefQId==='11.8'){if(pref.includes('participates')||pref.includes('joins me')||pref.includes('part of how i experience')){if(behavior.includes('regularly')||behavior.includes('part of my lifestyle'))return 100;if(behavior.includes('sometimes')||behavior.includes('a few times a month'))return 65;if(behavior.includes('occasionally')||behavior.includes('a few times a year'))return 25;return 0;}return 100;}
-  if(prefQId==='11.1b'){if(pref.includes('drinks with me')||pref.includes('participates')||pref.includes('shares that lifestyle')||pref.includes('join me')||pref.includes('part of how i connect')){if(behavior.includes('going out')||behavior.includes('bars')||behavior.includes('dinner or friends'))return 100;if(behavior.includes('glass of wine')||behavior.includes('at home'))return 50;if(behavior.includes('heavily'))return 40;return 60;}return 100;}
-  if(prefQId==='12.2b'){if(pref.includes('practices alongside')||pref.includes('very important')||pref.includes('participates')||pref.includes('practices with me')){if(behavior.includes('actively')||behavior.includes('attend services')||behavior.includes('shapes my daily'))return 100;if(behavior.includes('moderately')||behavior.includes('important to me')||behavior.includes('not rigid'))return 60;if(behavior.includes('privately')||behavior.includes('believe but'))return 25;if(behavior.includes('cultural')||behavior.includes('more cultural'))return 10;return 30;}if(pref.includes('respect and engage')||pref.includes('somewhat important')||pref.includes('engage with it')){if(behavior.includes('actively'))return 80;if(behavior.includes('moderately'))return 100;if(behavior.includes('privately'))return 70;if(behavior.includes('cultural'))return 60;return 75;}return 100;}
-  return 70;
-}
-
-const QUESTIONNAIRE_META:Record<string,{weight:number;category:string;type:string}>={
-  '1.7':{weight:3,category:'Intimacy & Connection',type:'BODYTYPE'},
-  '13.1':{weight:4,category:'Intimacy & Connection',type:'CLUSTER'},
-  '13.2':{weight:3,category:'Intimacy & Connection',type:'CLUSTER'},
-  '2.2':{weight:2,category:'Social & Shared Life',type:'CLUSTER'},
-  '3.7':{weight:3,category:'Social & Shared Life',type:'MS'},
-  '3.9':{weight:4,category:'Social & Shared Life',type:'MS'},
-  '3.11':{weight:4,category:'Social & Shared Life',type:'CLUSTER'},
-  '4.2':{weight:3,category:'Social & Shared Life',type:'CLUSTER'},
-  '5.4':{weight:3,category:'Social & Shared Life',type:'CLUSTER'},
-  '3.1':{weight:3,category:'Lifestyle Behaviors',type:'CLUSTER'},
-  '3.2':{weight:2,category:'Lifestyle Behaviors',type:'CLUSTER'},
-  '3.3':{weight:3,category:'Lifestyle Behaviors',type:'CLUSTER'},
-  '3.4':{weight:2,category:'Lifestyle Behaviors',type:'CLUSTER'},
-  '3.5':{weight:3,category:'Lifestyle Behaviors',type:'CLUSTER'},
-  '3.6':{weight:2,category:'Lifestyle Behaviors',type:'CLUSTER'},
-  '3.8':{weight:1,category:'Lifestyle Behaviors',type:'CLUSTER'},
-  '3.9a':{weight:2,category:'Lifestyle Behaviors',type:'CLUSTER'},
-  '3.10':{weight:3,category:'Lifestyle Behaviors',type:'CLUSTER'},
-  '5.3':{weight:2,category:'Lifestyle Behaviors',type:'CLUSTER'},
-  '4.3':{weight:2,category:'Financial & Career',type:'CLUSTER'},
-  '4.5':{weight:1,category:'Financial & Career',type:'CLUSTER'},
-  '4.6':{weight:3,category:'Financial & Career',type:'CLUSTER'},
-  '4.7':{weight:2,category:'Financial & Career',type:'CLUSTER'},
-  '4.1':{weight:2,category:'Values & Beliefs',type:'CLUSTER'},
-  '5.1':{weight:3,category:'Values & Beliefs',type:'CLUSTER'},
-  '5.2':{weight:3,category:'Values & Beliefs',type:'CLUSTER'},
-  '6.1':{weight:5,category:'Values & Beliefs',type:'CLUSTER'},
-  '6.2':{weight:4,category:'Values & Beliefs',type:'CLUSTER'},
-  '6.2b':{weight:3,category:'Values & Beliefs',type:'CLUSTER'},
-  '12.6':{weight:2,category:'Values & Beliefs',type:'CLUSTER'},
-  '12.2':{weight:4,category:'Values & Beliefs',type:'RELPREF'},
-  '8.1':{weight:3,category:'Life Goals',type:'CLUSTER'},
-  '8.2':{weight:7,category:'Life Goals',type:'CLUSTER'},
-  '8.3':{weight:3,category:'Life Goals',type:'CLUSTER'},
-  '8.4':{weight:2,category:'Life Goals',type:'CLUSTER'},
-  '8.6':{weight:4,category:'Life Goals',type:'CLUSTER'},
-  '8.7':{weight:4,category:'Life Goals',type:'CLUSTER'},
-  '12.4':{weight:3,category:'Life Goals',type:'CLUSTER'},
-  '12.7':{weight:3,category:'Life Goals',type:'CLUSTER'},
-  '7.3':{weight:6,category:'Communication & Conflict',type:'CLUSTER'},
-  '7.1':{weight:10,category:'Attachment & Emotional Health',type:'ATTACHMENT'},
-  '7.4':{weight:3,category:'Attachment & Emotional Health',type:'CLUSTER'},
-  '7.6':{weight:4,category:'Attachment & Emotional Health',type:'CLUSTER'},
-  '7.7':{weight:4,category:'Attachment & Emotional Health',type:'CLUSTER'},
-  '7.8':{weight:4,category:'Attachment & Emotional Health',type:'CLUSTER'},
-  '7.9':{weight:3,category:'Attachment & Emotional Health',type:'CLUSTER'},
-  '7.10':{weight:2,category:'Attachment & Emotional Health',type:'CLUSTER'},
-  '7.11':{weight:4,category:'Communication & Conflict',type:'CLUSTER'},
-  '11.9':{weight:3,category:'Lifestyle Behaviors',type:'CLUSTER'},
+async function runMatching(userId: string) {
+  const { me, meAnswers, meDB, candidates, candidateAnswers, candidateDBs } = await loadProfilesAndAnswers(userId);
+
+  await sb.from("matches").delete().eq("user_id", userId);
+  await sb.from("matches").delete().eq("matched_user_id", userId);
+
+  const inserts: any[] = [];
+  let hardFilterRejects = 0; let dealbreakerRejects = 0; let scoreRejects = 0;
+  const sampleRejects: string[] = [];
+
+  for (const c of candidates) {
+    if (c.is_suspended || c.is_paused || c.is_hidden_pending_review) continue;
+    const cAns = candidateAnswers[c.id] || {};
+    const cDB = candidateDBs[c.id] || new Set();
+
+    const hf = checkHardFilters(me, meAnswers, c, cAns);
+    if (!hf.passed) { hardFilterRejects++; if (sampleRejects.length < 8) sampleRejects.push(`${c.name}: HF ${hf.reason}`); continue; }
+
+    const dbMe = checkDealbreakers(meAnswers, meDB, cAns);
+    if (!dbMe.passed) { dealbreakerRejects++; if (sampleRejects.length < 8) sampleRejects.push(`${c.name}: my-DB ${dbMe.reason}`); continue; }
+    const dbThem = checkDealbreakers(cAns, cDB, meAnswers);
+    if (!dbThem.passed) { dealbreakerRejects++; if (sampleRejects.length < 8) sampleRejects.push(`${c.name}: their-DB ${dbThem.reason}`); continue; }
+
+    const dirA = scoreDirectional(meAnswers, cAns);
+    const dirB = scoreDirectional(cAns, meAnswers);
+
+    if (dirA.total < DIRECTIONAL_FLOOR || dirB.total < DIRECTIONAL_FLOOR) {
+      scoreRejects++;
+      if (sampleRejects.length < 8) sampleRejects.push(`${c.name}: dir<${DIRECTIONAL_FLOOR} (a=${dirA.total} b=${dirB.total})`);
+      continue;
+    }
+
+    const harmonic = (dirA.total + dirB.total) > 0 ? Math.round((2 * dirA.total * dirB.total) / (dirA.total + dirB.total)) : 0;
+    if (harmonic < HARMONIC_FLOOR) {
+      scoreRejects++;
+      if (sampleRejects.length < 8) sampleRejects.push(`${c.name}: harmonic ${harmonic}<${HARMONIC_FLOOR}`);
+      continue;
+    }
+
+    let asymmetryCategory: string | undefined; let asymmetryGap = 0;
+    for (const cat of Object.keys(dirA.byCategory)) {
+      const a = dirA.byCategory[cat] || 0; const b = dirB.byCategory[cat] || 0;
+      const gap = Math.abs(a - b);
+      if (gap > asymmetryGap) { asymmetryGap = gap; asymmetryCategory = cat; }
+    }
+
+    const myH: string[] = getAnswer(meAnswers, "3.9") || [];
+    const themH: string[] = getAnswer(cAns, "3.9") || [];
+    const sharedHobbies = myH.filter(h => themH.includes(h));
+
+    inserts.push({
+      user_id: userId, matched_user_id: c.id,
+      compatibility_score: harmonic, individual_score: dirA.total,
+      breakdown: dirA.byCategory,
+      why_you_matched: buildWhyYouMatched(meAnswers, cAns, dirA.byCategory),
+      potential_differences: buildPotentialDifferences(dirA.questionScores),
+      asymmetry_category: asymmetryCategory, asymmetry_gap: asymmetryGap,
+      shared_hobbies: sharedHobbies.slice(0, 5),
+    });
+    inserts.push({
+      user_id: c.id, matched_user_id: userId,
+      compatibility_score: harmonic, individual_score: dirB.total,
+      breakdown: dirB.byCategory,
+      why_you_matched: buildWhyYouMatched(cAns, meAnswers, dirB.byCategory),
+      potential_differences: buildPotentialDifferences(dirB.questionScores),
+      asymmetry_category: asymmetryCategory, asymmetry_gap: asymmetryGap,
+      shared_hobbies: sharedHobbies.slice(0, 5),
+    });
+  }
+
+  if (inserts.length > 0) await sb.from("matches").insert(inserts);
+
+  return {
+    success: true, version: VERSION, canonical_hash: CANONICAL_HASH,
+    matched: inserts.length / 2, totalInserted: inserts.length,
+    candidatesConsidered: candidates.length,
+    hardFilterRejects, dealbreakerRejects, scoreRejects, sampleRejects,
+  };
+}
+
+const CORS = {
+  "Access-Control-Allow-Origin": "*",
+  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
+  "Access-Control-Allow-Headers": "*",
 };
 
-function scoreHobbies(h1:any,h2:any):number{const arr1=Array.isArray(h1)?h1:[];const arr2=Array.isArray(h2)?h2:[];if(!arr1.length||!arr2.length)return 0;const set2=new Set(arr2);const overlap=arr1.filter((v:any)=>set2.has(v)).length;return Math.round((overlap/Math.min(arr1.length,arr2.length))*100);}
-function bothOpenToReligion(a1:any,a2:any):boolean{const p1=String(extractValue(a1['12.2'])||'').toLowerCase();const p2=String(extractValue(a2['12.2'])||'').toLowerCase();return(p1.includes('open')||p1.includes('different'))&&(p2.includes('open')||p2.includes('different'));}
+Deno.serve(async (req: Request) => {
+  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
 
-function scoreCompatibility(u1:any,u2:any,categoryWeights:Record<string,number>):{score:number;breakdown:Record<string,number>;sharedHobbies:string[];penalize:boolean}{
-  const cats:Record<string,{score:number;weight:number}>={'Attachment & Emotional Health':{score:0,weight:0},'Communication & Conflict':{score:0,weight:0},'Life Goals':{score:0,weight:0},'Values & Beliefs':{score:0,weight:0},'Financial & Career':{score:0,weight:0},'Intimacy & Connection':{score:0,weight:0},'Lifestyle Behaviors':{score:0,weight:0},'Social & Shared Life':{score:0,weight:0}};
-  const sharedHobbies:string[]=[]; let penalize=false;
-  for(const[qId,meta]of Object.entries(QUESTIONNAIRE_META)){
-    let qs=0;
-    if(qId==='7.1'){const att1=u1.attachmentStyle||extractValue(u1.answers['7.1']);const att2=u2.attachmentStyle||extractValue(u2.answers['7.1']);let attResult:{score:number;penalize:boolean};if(att1&&att2){attResult=scoreAttachmentLegacy(String(att1),String(att2));}else{attResult=scoreAttachmentQuiz(u1.answers,u2.answers);}if(attResult.score>0){if(attResult.penalize)penalize=true;cats[meta.category].score+=attResult.score*meta.weight;cats[meta.category].weight+=meta.weight;}continue;}
-    if(qId==='1.7'){const u2Build=extractValue(u2.answers['1.7']);const u1Pref=extractValue(u1.answers['10.1']);if(u2Build!=null&&u1Pref!=null){qs=scoreBodyType(u1Pref,u2Build);cats[meta.category].score+=qs*meta.weight;cats[meta.category].weight+=meta.weight;}continue;}
-    const raw1=extractValue(u1.answers[qId]);const raw2=extractValue(u2.answers[qId]);
-    if(raw1==null||raw2==null)continue;
-    switch(meta.type){
-      case 'CLUSTER':{const s1=Array.isArray(raw1)?raw1.join(' '):String(raw1);const s2=Array.isArray(raw2)?raw2.join(' '):String(raw2);qs=scoreByCluster(qId,s1,s2);if(qId==='6.2'&&qs===0&&bothOpenToReligion(u1.answers,u2.answers))qs=45;break;}
-      case 'RELPREF':{const rel1=extractValue(u1.answers['6.2']);const rel2=extractValue(u2.answers['6.2']);qs=scoreReligionPref(String(raw1),String(raw2),String(rel1||''),String(rel2||''));break;}
-      case 'MS':if(qId==='3.9'){qs=scoreHobbies(raw1,raw2);if(Array.isArray(raw1)&&Array.isArray(raw2)){const s2=new Set(raw2);for(const h of raw1){if(s2.has(h))sharedHobbies.push(h);}}}else if(Array.isArray(raw1)&&Array.isArray(raw2)){const overlap=raw1.filter((v:any)=>raw2.includes(v));const union=[...new Set([...raw1,...raw2])];qs=union.length>0?(overlap.length/union.length)*100:0;}else{qs=raw1===raw2?100:0;}break;
-      default:qs=raw1===raw2?100:0;
-    }
-    cats[meta.category].score+=qs*meta.weight;cats[meta.category].weight+=meta.weight;
-  }
-  for(const[prefQId,behaviorQId]of Object.entries(PREF_TO_ANSWER)){const prefAnswer=extractValue(u1.answers[prefQId]);const behaviorAnswer=extractValue(u2.answers[behaviorQId]);if(!prefAnswer||!behaviorAnswer)continue;const prefStr=Array.isArray(prefAnswer)?prefAnswer.join(' '):String(prefAnswer);const qs=scorePrefVsBehavior(prefQId,String(behaviorAnswer),prefStr);const w=PREF_WEIGHTS[prefQId]||2;const cat=PREF_CATS[prefQId]||'Lifestyle Behaviors';cats[cat].score+=qs*w;cats[cat].weight+=w;}
-  const totalTokens=Object.values(categoryWeights).reduce((a,b)=>a+b,0)||40;
-  let final=0;const breakdown:Record<string,number>={};
-  for(const[cat,{score,weight}]of Object.entries(cats)){const avg=weight>0?score/weight:0;breakdown[cat]=Math.round(avg);final+=avg*((categoryWeights[cat]||0)/totalTokens);}
-  if(penalize)final=final*0.90;
-  return{score:Math.round(final),breakdown,sharedHobbies,penalize};
-}
-
-function harmonicMean(a:number,b:number):number{if(a+b===0)return 0;return Math.round((2*a*b)/(a+b));}
-function computeAsymmetry(bAtoB:Record<string,number>,bBtoA:Record<string,number>):{category:string;gap:number}{let maxGap=0,maxCat='';for(const cat of Object.keys(bAtoB)){const gap=Math.abs((bAtoB[cat]??0)-(bBtoA[cat]??0));if(gap>maxGap){maxGap=gap;maxCat=cat;}}return{category:maxCat,gap:maxGap};}
-
-function generateWhyMatched(u1:any,u2:any,breakdown:Record<string,number>,sharedHobbies:string[]):string[]{const reasons:string[]=[]; const a1=u1.answers;const a2=u2.answers;const raw73a=a1['7.3'];const raw73b=a2['7.3'];const t73a=Array.isArray(raw73a)?raw73a.join(' '):String(raw73a||'');const t73b=Array.isArray(raw73b)?raw73b.join(' '):String(raw73b||'');const attSigs1=['7.1a','7.1b'].map((q:string)=>classifyAtt(String(a1[q]||''))).concat([classifyAtt(t73a)]);const attSigs2=['7.1a','7.1b'].map((q:string)=>classifyAtt(String(a2[q]||''))).concat([classifyAtt(t73b)]);const hasSecure1=attSigs1.some((s:AttSig|null)=>s==='secure');const hasSecure2=attSigs2.some((s:AttSig|null)=>s==='secure');const legacyAtt1=u1.attachmentStyle||extractValue(a1['7.1']);const legacyAtt2=u2.attachmentStyle||extractValue(a2['7.1']);if(legacyAtt1&&legacyAtt2){if(legacyAtt1===legacyAtt2)reasons.push(`You share the same attachment style \u2014 ${String(legacyAtt1).split(' \u2014')[0]}`);else if(String(legacyAtt1).includes('secure')||String(legacyAtt2).includes('secure'))reasons.push('One of you has a secure attachment style, which creates a stable foundation for connection');}else if(hasSecure1||hasSecure2){if(hasSecure1&&hasSecure2)reasons.push('You both bring emotional steadiness \u2014 a strong base for connection');else reasons.push('One of you brings emotional security, which creates a stabilizing dynamic');}if(sharedHobbies.length>=3)reasons.push(`You share ${sharedHobbies.length} hobbies in common \u2014 including ${sharedHobbies.slice(0,2).join(' and ').toLowerCase()}`);else if(sharedHobbies.length>=1)reasons.push(`You both enjoy ${sharedHobbies.slice(0,2).join(' and ').toLowerCase()}`);const goal1=extractValue(a1['8.6']);const goal2=extractValue(a2['8.6']);if(goal1&&goal2&&getCluster('8.6',goal1)===getCluster('8.6',goal2)&&getCluster('8.6',goal1)!==-1)reasons.push(`You're both looking for the same thing \u2014 a meaningful connection`);const kids1=extractValue(a1['8.2']);const kids2=extractValue(a2['8.2']);if(kids1&&kids2){const c1=getCluster('8.2',kids1);const c2=getCluster('8.2',kids2);if(c1===0&&c2===0)reasons.push('You both want children \u2014 a major area of alignment');if(c1===2&&c2===2)reasons.push("You're both not looking to have children \u2014 strong alignment on life direction");}const pol1=extractValue(a1['6.1']);const pol2=extractValue(a2['6.1']);if(pol1&&pol2&&getCluster('6.1',pol1)===getCluster('6.1',pol2)&&getCluster('6.1',pol1)!==-1)reasons.push('Politically aligned \u2014 you see the world similarly');const lp1=extractValue(a1['3.11']);const lp2=extractValue(a2['3.11']);if(lp1&&lp2&&getCluster('3.11',lp1)===getCluster('3.11',lp2))reasons.push('You\'re looking for the same level of shared lifestyle \u2014 a strong day-to-day foundation');const topCats=Object.entries(breakdown).sort((a,b)=>b[1]-a[1]).slice(0,2);for(const[cat,score]of topCats){if(score>=80)reasons.push(`Strong ${cat.toLowerCase()} compatibility (${score})`);}return reasons.slice(0,5);}
-
-function generateDifferences(u1:any,u2:any):string[]{const diffs:string[]=[]; const a1=u1.answers;const a2=u2.answers;
-  const sleep1=extractValue(a1['3.6']);const sleep2=extractValue(a2['3.6']);if(sleep1&&sleep2&&getCluster('3.6',sleep1)!==getCluster('3.6',sleep2))diffs.push(`Different sleep schedules \u2014 ${String(sleep1).split(' ').slice(0,2).join(' ')} vs ${String(sleep2).split(' ').slice(0,2).join(' ')}`);
-  const soc1=extractValue(a1['5.4']);const soc2=extractValue(a2['5.4']);if(soc1&&soc2&&soc1!==soc2)diffs.push(`Different social energy \u2014 ${String(soc1).toLowerCase()} vs ${String(soc2).toLowerCase()}`);
-  const lp1=extractValue(a1['3.11']);const lp2=extractValue(a2['3.11']);if(lp1&&lp2&&getCluster('3.11',lp1)!==getCluster('3.11',lp2))diffs.push('Different expectations for shared lifestyle \u2014 one wants a full adventure partner, the other values more independence');
-  const rel1=extractValue(a1['6.2']);const rel2=extractValue(a2['6.2']);if(rel1&&rel2&&getCluster('6.2',rel1)!==getCluster('6.2',rel2)&&!bothOpenToReligion(a1,a2))diffs.push('Different religious backgrounds \u2014 worth an honest conversation early on');
-  const conf1=extractValue(a1['7.2']);const conf2=extractValue(a2['7.2']);if(conf1&&conf2&&getCluster('7.2',conf1)!==getCluster('7.2',conf2))diffs.push('Different conflict styles \u2014 one prefers to address things immediately, the other avoids');
-  return diffs.slice(0,3);
-}
-
-Deno.serve(async(req:Request)=>{
-  if(req.method==='OPTIONS')return new Response('ok',{headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type'}});
-  try{
-    const{userId}=await req.json();
-    if(!userId)return new Response(JSON.stringify({error:'userId required'}),{status:400});
-    const[profileRes,answersRes,dealbreakersRes,weightsRes,attachmentRes]=await Promise.all([
-      supabase.from('profiles').select('*, latitude, longitude').eq('id',userId).single(),
-      supabase.from('user_answers').select('answers').eq('user_id',userId).maybeSingle(),
-      supabase.from('user_dealbreakers').select('question_ids').eq('user_id',userId).maybeSingle(),
-      supabase.from('user_category_weights').select('*').eq('user_id',userId).maybeSingle(),
-      supabase.from('attachment_styles').select('style').eq('user_id',userId).maybeSingle(),
-    ]);
-    if(!profileRes.data||!answersRes.data?.answers)return new Response(JSON.stringify({error:'User profile or answers not found',matched:0}),{status:200});
-    const targetAnswers=answersRes.data.answers;
-    const targetCoreCount=CORE_SCORED_QUESTIONS.filter(q=>targetAnswers[q]!=null).length;
-    if(targetCoreCount<MIN_CORE_ANSWERS)return new Response(JSON.stringify({error:'Questionnaire incomplete',matched:0,coreAnswers:targetCoreCount,minRequired:MIN_CORE_ANSWERS}),{status:200});
-    const wr=weightsRes.data;
-    const targetWeights:Record<string,number>=wr?{'Attachment & Emotional Health':wr.attachment_emotional_health??8,'Communication & Conflict':wr.communication_conflict??6,'Life Goals':wr.life_goals??6,'Values & Beliefs':wr.values_beliefs??6,'Financial & Career':wr.financial_career??3,'Intimacy & Connection':wr.intimacy_connection??3,'Lifestyle Behaviors':wr.lifestyle_behaviors??4,'Social & Shared Life':wr.social_shared_life??4}:{...DEFAULT_TOKEN_WEIGHTS};
-    const targetUser={id:userId,age:profileRes.data.date_of_birth?Math.floor((Date.now()-new Date(profileRes.data.date_of_birth).getTime())/31557600000):null,lat:profileRes.data.latitude||null,lng:profileRes.data.longitude||null,answers:targetAnswers,dealbreakers:dealbreakersRes.data?.question_ids||[],attachmentStyle:attachmentRes.data?.style||null};
-    const{data:blockedByTarget}=await supabase.from('blocked_users').select('blocked_user_id').eq('user_id',userId);
-    const{data:blockedTarget}=await supabase.from('blocked_users').select('user_id').eq('blocked_user_id',userId);
-    const blockedIds=new Set<string>([...(blockedByTarget||[]).map((r:any)=>r.blocked_user_id),...(blockedTarget||[]).map((r:any)=>r.user_id)]);
-    const{data:otherProfiles}=await supabase.from('profiles').select('id, date_of_birth, latitude, longitude').eq('has_completed_onboarding',true).neq('id',userId);
-    if(!otherProfiles?.length)return new Response(JSON.stringify({matched:0,message:'No other users yet'}),{status:200});
-    const otherIds=otherProfiles.map((p:any)=>p.id);
-    const[allAnswersRes,allDealbreakersRes,allWeightsRes,allAttachmentsRes]=await Promise.all([
-      supabase.from('user_answers').select('user_id, answers').in('user_id',otherIds),
-      supabase.from('user_dealbreakers').select('user_id, question_ids').in('user_id',otherIds),
-      supabase.from('user_category_weights').select('*').in('user_id',otherIds),
-      supabase.from('attachment_styles').select('user_id, style').in('user_id',otherIds),
-    ]);
-    const answersMap:Record<string,any>={};const dealbreakersMap:Record<string,string[]>={};const weightsMap:Record<string,Record<string,number>>={};const attachmentMap:Record<string,string>={};
-    for(const r of allAnswersRes.data||[])answersMap[r.user_id]=r.answers;
-    for(const r of allDealbreakersRes.data||[])dealbreakersMap[r.user_id]=r.question_ids;
-    for(const r of allWeightsRes.data||[])weightsMap[r.user_id]={'Attachment & Emotional Health':r.attachment_emotional_health??8,'Communication & Conflict':r.communication_conflict??6,'Life Goals':r.life_goals??6,'Values & Beliefs':r.values_beliefs??6,'Financial & Career':r.financial_career??3,'Intimacy & Connection':r.intimacy_connection??3,'Lifestyle Behaviors':r.lifestyle_behaviors??4,'Social & Shared Life':r.social_shared_life??4};
-    for(const r of allAttachmentsRes.data||[])attachmentMap[r.user_id]=r.style;
-    let matchedCount=0;const matchInserts:any[]=[];
-    let dealbreakerBlocks=0;const dealbreakerSamples:string[]=[];
-    for(const profile of otherProfiles){
-      if(blockedIds.has(profile.id))continue;
-      if(!answersMap[profile.id])continue;
-      if(CORE_SCORED_QUESTIONS.filter(q=>answersMap[profile.id]?.[q]!=null).length<MIN_CORE_ANSWERS)continue;
-      const otherUser={id:profile.id,age:profile.date_of_birth?Math.floor((Date.now()-new Date(profile.date_of_birth).getTime())/31557600000):null,lat:profile.latitude||null,lng:profile.longitude||null,answers:answersMap[profile.id],dealbreakers:dealbreakersMap[profile.id]||[],attachmentStyle:attachmentMap[profile.id]||null};
-      const hardCheck=checkHardFilters(targetUser,otherUser);if(!hardCheck.passed)continue;
-      const dbCheck=checkDealbreakers(targetUser,otherUser);if(!dbCheck.passed){dealbreakerBlocks++;if(dealbreakerSamples.length<3)dealbreakerSamples.push(`${profile.id.slice(0,8)}: ${dbCheck.reason}`);continue;}
-      const otherWeights=weightsMap[profile.id]||{...DEFAULT_TOKEN_WEIGHTS};
-      const resultAtoB=scoreCompatibility(targetUser,otherUser,targetWeights);
-      const resultBtoA=scoreCompatibility(otherUser,targetUser,otherWeights);
-      if(resultAtoB.score<30&&resultBtoA.score<30)continue;
-      const harmonic=harmonicMean(resultAtoB.score,resultBtoA.score);
-      if(harmonic<40)continue;
-      const{category:asymCat,gap:asymGap}=computeAsymmetry(resultAtoB.breakdown,resultBtoA.breakdown);
-      matchInserts.push({user_id:userId,matched_user_id:profile.id,compatibility_score:harmonic,individual_score:resultAtoB.score,breakdown:resultAtoB.breakdown,breakdown_other:resultBtoA.breakdown,asymmetry_category:asymGap>=15?asymCat:null,asymmetry_gap:asymGap>=15?asymGap:null,why_you_matched:generateWhyMatched(targetUser,otherUser,resultAtoB.breakdown,resultAtoB.sharedHobbies),potential_differences:generateDifferences(targetUser,otherUser)});
-      matchInserts.push({user_id:profile.id,matched_user_id:userId,compatibility_score:harmonic,individual_score:resultBtoA.score,breakdown:resultBtoA.breakdown,breakdown_other:resultAtoB.breakdown,asymmetry_category:asymGap>=15?asymCat:null,asymmetry_gap:asymGap>=15?asymGap:null,why_you_matched:generateWhyMatched(otherUser,targetUser,resultBtoA.breakdown,resultBtoA.sharedHobbies),potential_differences:generateDifferences(otherUser,targetUser)});
-      matchedCount++;
-    }
-    if(matchInserts.length>0)await supabase.from('matches').upsert(matchInserts,{onConflict:'user_id,matched_user_id',ignoreDuplicates:false});
-    if(blockedIds.size>0){const arr=Array.from(blockedIds);await supabase.from('matches').delete().eq('user_id',userId).in('matched_user_id',arr);await supabase.from('matches').delete().eq('matched_user_id',userId).in('user_id',arr);}
-    return new Response(JSON.stringify({success:true,matched:matchedCount,totalInserted:matchInserts.length,dealbreakerBlocks,dealbreakerSamples,version:'64'}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
-  }catch(err:any){console.error('Matching error:',err);return new Response(JSON.stringify({error:err.message}),{status:500});}
+  const url = new URL(req.url);
+  if (url.pathname.endsWith("/health")) {
+    try {
+      await loadCanonical(sb);
+      return new Response(JSON.stringify({
+        version: VERSION, canonical_hash: CANONICAL_HASH,
+        scored_questions: (CANONICAL.questions as CanonicalQuestion[]).filter((q: CanonicalQuestion) => isScored(q.id)).length,
+        hard_filters: (CANONICAL.questions as CanonicalQuestion[]).filter((q: CanonicalQuestion) => q.tags.includes("Hard Filter")).length,
+        loaded: true,
+      }), { headers: { ...CORS, "Content-Type": "application/json" } });
+    } catch (err: any) {
+      return new Response(JSON.stringify({ version: VERSION, loaded: false, error: err.message }),
+        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
+    }
+  }
+
+  if (req.method !== "POST") {
+    return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
+  }
+
+  let body: any = {};
+  try { body = await req.json(); } catch (_) {}
+  const userId = body.userId || body.user_id;
+  if (!userId) {
+    return new Response(JSON.stringify({ error: "userId required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
+  }
+
+  try {
+    await loadCanonical(sb);
+    const result = await runMatching(String(userId));
+    return new Response(JSON.stringify(result, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
+  } catch (err: any) {
+    console.error(`[v${VERSION}] error:`, err);
+    return new Response(JSON.stringify({ error: err.message || String(err), version: VERSION }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
+  }
 });
```

export type QuestionType =
  | "MC" | "MS" | "MS_MAX" | "NUM" | "HEIGHT" | "AGE_RANGE"
  | "HEIGHT_RANGE" | "LOCATION" | "TXT" | "MAP"
  | "DROPDOWN" | "DATE" | "PARA" | "LT" | "RANK" | "UPLOAD";

export type QuestionTag =
  | "Compatibility Score" | "Dealbreaker Eligible"
  | "Profile Information" | "Matching Insight Only" | "Hard Filter";

export type ScoringCategory =
  | "Attachment & Emotional Health"
  | "Communication & Conflict"
  | "Life Goals"
  | "Values & Beliefs"
  | "Financial & Career"
  | "Intimacy & Connection"
  | "Lifestyle Behaviors"
  | "Social & Shared Life";

export interface ShowIf {
  questionId: string;
  notValues?: string[];
  hasValue?: boolean;
}

export interface FilterOptionsIf {
  questionId: string;
  ifValues: string[];
  hideOptions: string[];
}

export interface Question {
  id: string;
  text: string;
  subtitle?: string;
  type: QuestionType;
  options?: string[];
  maxSelections?: number;
  minSelections?: number;
  tags: QuestionTag[];
  weight: number;
  helperText?: string;
  privacyNote?: string;
  placeholder?: string;
  category: ScoringCategory;
  hasDealbreaker?: boolean;
  dealbreakerValues?: string[];
  showIf?: ShowIf;
  filterOptionsIf?: FilterOptionsIf;
  optional?: boolean;
  multipleFields?: number;
  maxCharacters?: number;
}

export interface Section {
  id: number;
  title: string;
  subtitle?: string;
  part: 1 | 2;
  questions: Question[];
}

export const CATEGORY_TOKEN_WEIGHTS: Record<ScoringCategory, {
  defaultTokens: number;
  description: string;
  researchNote: string;
}> = {
  "Attachment & Emotional Health": {
    defaultTokens: 5,
    description: "How you bond, regulate emotionally, and show up when life gets hard",
    researchNote: "The #1 predictor of relationship quality across 40+ years of research. More predictive of long-term success than shared values, interests, or attraction.",
  },
  "Communication & Conflict": {
    defaultTokens: 4,
    description: "How you handle difficult conversations and disagreements",
    researchNote: "Gottman's research identified communication and conflict patterns as the primary predictors of divorce — not how often couples fight, but how they fight and whether they repair.",
  },
  "Life Goals": {
    defaultTokens: 3,
    description: "Children, marriage, relationship timeline, and what you're building toward",
    researchNote: "Misalignment on children and marriage are among the most common causes of long-term relationship dissolution — even when everything else aligns well.",
  },
  "Values & Beliefs": {
    defaultTokens: 3,
    description: "Religion, politics, family, and what you stand for",
    researchNote: "Shared values predict long-term compatibility more strongly than shared personality or interests. Political and religious differences have become increasingly predictive in modern relationships.",
  },
  "Financial & Career": {
    defaultTokens: 2,
    description: "Money habits, financial stability, career orientation, and where you want to live",
    researchNote: "Financial arguments are the #1 predictor of divorce when controlling for other factors — more than sex, in-laws, or parenting differences. Money reveals character.",
  },
  "Intimacy & Connection": {
    defaultTokens: 1,
    description: "Physical attraction, intimacy importance, and how you feel most connected",
    researchNote: "Physical intimacy alignment is a top-five relationship dissatisfier when mismatched, yet rarely discussed directly. Attraction fades — but intimacy needs don't.",
  },
  "Lifestyle Behaviors": {
    defaultTokens: 1,
    description: "Substances, exercise, sleep, cleanliness, and daily habits",
    researchNote: "Lifestyle differences create friction but are more negotiable than values or emotional patterns. Research shows lifestyle conflicts are 'solvable' — most other categories aren't.",
  },
  "Social & Shared Life": {
    defaultTokens: 1,
    description: "Hobbies, social energy, how you spend time, and whether you want a true adventure partner",
    researchNote: "Shared activities bond couples and create positive memories, but they predict relationship enjoyment more than relationship survival.",
  },
};

// v3: attachment penalty increased from 0.05 to 0.10
export const ATTACHMENT_PENALTY = { anxiousAvoidantPenalty: 0.10 };

export const CATEGORY_WEIGHTS: Record<string, number> = {
  "Relationship Psychology": 0.32,
  "Values & Life Goals":     0.25,
  "Lifestyle Compatibility": 0.20,
  "Attraction & Preferences": 0.13,
  "Life Logistics":          0.10,
};

export const ONBOARDING_INTRO = {
  title: "Welcome to Parallel",
  subtitle: "We're going to ask you some thoughtful questions to help us understand who you are and what you're looking for.",
  estimatedTime: "15–18 minutes",
};

export const HOBBY_CATEGORIES: Record<string, string[]> = {
  "Active & Outdoor": [
    "Hiking & backpacking","Running & jogging","Walking & nature walks","Cycling",
    "Swimming","Scuba diving & snorkeling","Rock climbing","Skiing & snowboarding",
    "Surfing","Kayaking & paddleboarding","Camping","Yoga","Pilates",
    "Going to the gym","Weightlifting","CrossFit","Martial arts","Golf",
    "Tennis","Pickleball","Basketball","Soccer","Volleyball","Softball & baseball",
    "Boating & sailing","Jet skiing","Fishing","Hunting","Skateboarding",
    "Archery","Disc golf","Horseback riding","Motorcycle riding",
    "Off-roading & overlanding","Van life & road trips",
  ],
  "Social & Nightlife": [
    "Going out to bars & nightlife","Going to concerts & live music","Dancing",
    "Theater & improv","Karaoke","Attending musicals & opera",
    "Trivia & game nights","Festival going","Casino nights & poker",
    "Sports betting & gambling","Spending time with friends",
  ],
  "Travel & Adventure": [
    "Traveling & exploring new places","Theme parks & experiences",
    "Birdwatching","Wildlife & nature conservation","Farm life & homesteading",
  ],
  "Creative & Intellectual": [
    "Photography","Videography & filmmaking","Painting & drawing",
    "Pottery & ceramics","Woodworking","Sewing & fashion design",
    "Jewelry making","Graphic design","Writing & journaling",
    "Knitting & crocheting","Sculpting","Interior design & decorating",
    "Tattooing & body art","Comic book & illustration",
    "Candle & soap making","Scrapbooking & memory keeping",
    "Playing an instrument","Singing & choir","DJing & music production",
    "Reading","Podcasts","Philosophy & big ideas","History",
    "Learning languages","Chess & strategy games","Puzzles & brain games",
    "Astronomy & stargazing","Psychology & self-development",
    "Science & technology","Documentaries","Political science & current events",
    "Streaming & content creation",
  ],
  "Food & Drink": [
    "Cooking & grilling","Baking","Trying new restaurants",
    "Wine tasting","Craft beer & home brewing","Cocktail making",
    "Coffee culture","Farmers markets & local food","Meal prepping & nutrition",
    "Wine & whiskey collecting",
  ],
  "Homebody & Cozy": [
    "Video gaming","Board games & tabletop RPGs","Anime & manga",
    "Dungeons & Dragons","Collecting (cards, figures, memorabilia)",
    "Napping & rest","Watching TV & movies","True crime",
    "Self-care & wellness routines","Spa days & massages",
    "Fashion & style","Shopping","Home improvement & DIY",
    "Gardening & plants","Thrifting & antiquing",
  ],
  "Sports Watching": [
    "Watching sports","Going to live sporting events","Football Sundays",
    "March Madness & brackets","Fantasy football & fantasy leagues",
    "Combat sports (UFC, boxing)","Golf watching","NASCAR & motorsports watching",
    "Fantasy sports","Cars & motorsports",
  ],
  "Community & Wellness": [
    "Volunteering & community service","Spirituality & mindfulness",
    "Meditation & breathwork","Political activism & advocacy",
    "Dog ownership & training","Cat person","Aquariums & fishkeeping",
    "Fostering & animal rescue","Beekeeping",
  ],
};

export const parallelQuestionnaire: Section[] = [

  // ─── SECTION 1: Basic Identity ───────────────────────────────
  { id: 1, title: "Basic Identity", part: 1, questions: [
    {
      id: "1.0",
      text: "Where are you based?",
      subtitle: "We use your location to find compatible people.",
      type: "LOCATION",
      tags: ["Profile Information"],
      weight: 0,
      privacyNote: "Your city is shown on your profile",
      category: "Life Goals",
      optional: true,
    },
    {
      id: "1.1",
      text: "What is your gender?",
      type: "MC",
      options: ["Woman","Man","Non-binary","Genderqueer","Genderfluid","Agender","Transgender woman","Transgender man","Prefer to self-describe"],
      tags: ["Profile Information"],
      weight: 0,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Life Goals",
    },
    {
      id: "1.5",
      text: "How tall are you?",
      type: "HEIGHT",
      tags: ["Compatibility Score","Profile Information"],
      weight: 4,
      helperText: "Height helps us respect height preferences when matching.",
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Intimacy & Connection",
    },
    {
      // v3: weight reduced 3 → 1. Self-reported build is noisy — photos do this work better.
      id: "1.7",
      text: "What would a friend say about your build?",
      type: "MS",
      options: ["Athletic","Curvy","Average / Medium build","Slim","Muscular","Broad / Solid","Full-figured","Plus-size"],
      tags: ["Compatibility Score"],
      weight: 1,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Intimacy & Connection",
    },
    {
      id: "2.2",
      text: "How open are you to relocating for a relationship?",
      type: "MC",
      options: ["Not open to relocating","Open for the right person","Very open to relocating"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Social & Shared Life",
    },
  ]},

  // ─── SECTION 2 (display): Lifestyle ─────────────────────────
  { id: 3, title: "Lifestyle", part: 1, questions: [
    {
      id: "3.1",
      text: "What are your drinking habits?",
      type: "MC",
      options: ["Never drink","Rarely — special occasions only","Socially — a few times a month","Regularly — a few times a week","Frequently"],
      tags: ["Compatibility Score","Profile Information"],
      weight: 3,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Lifestyle Behaviors",
    },
    {
      id: "3.2",
      text: "When you drink, what does that typically look like for you?",
      subtitle: "This helps us understand your social style around drinking.",
      type: "MC",
      options: ["A glass of wine or beer at home","Drinks with dinner or friends","Going out — bars, restaurants, events","Drinking heavily when I do drink"],
      tags: ["Compatibility Score"],
      weight: 2,
      optional: true,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Lifestyle Behaviors",
      showIf: { questionId: "3.1", notValues: ["Never drink"] },
    },
    {
      id: "3.3",
      text: "Do you smoke cigarettes?",
      type: "MC",
      options: ["Never","Socially / occasionally","Regularly","I'm trying to quit"],
      tags: ["Compatibility Score"],
      weight: 3,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Lifestyle Behaviors",
    },
    {
      id: "3.4",
      text: "Do you use marijuana?",
      type: "MC",
      options: ["Never","Occasionally","Regularly","Daily"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Lifestyle Behaviors",
    },
    {
      id: "3.10",
      text: "Do you use recreational drugs beyond cannabis?",
      type: "MC",
      options: ["No — I don't use recreational drugs","Occasionally — a few times a year at most","Sometimes — a few times a month","Regularly"],
      tags: ["Compatibility Score"],
      weight: 3,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Lifestyle Behaviors",
    },
    {
      id: "3.5",
      text: "How often do you exercise?",
      type: "MC",
      options: ["Daily or almost daily","Several times a week","Once or twice a week","A few times a month","Rarely or never"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Lifestyle Behaviors",
    },
    {
      // v3: "Irregular" now scores as wildcard 40 vs anything in algorithm
      id: "3.6",
      text: "What is your typical sleep schedule?",
      type: "MC",
      options: ["Early bird — up before 7am, in bed by 10pm","Standard — up by 8am, in bed around midnight","Night owl — up past midnight, sleep in late","Irregular — it shifts a lot"],
      tags: ["Compatibility Score"],
      weight: 1,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Lifestyle Behaviors",
    },
    {
      id: "3.7",
      text: "What does your ideal weekend look like?",
      subtitle: "Pick up to 3 that genuinely describe you.",
      type: "MS_MAX",
      maxSelections: 3,
      options: ["Active outdoors — hiking, sports, being outside","Going out — bars, restaurants, events, nightlife","Relaxed socializing — dinners at home, small gatherings","Exploring — markets, museums, new neighborhoods","Fully recharging alone — couch, movies, nothing planned","Working on something — side projects, creative work, hustle","Traveling or getting out of town","Family time","It genuinely depends on my mood"],
      tags: ["Compatibility Score"],
      weight: 3,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Social & Shared Life",
    },
    {
      // v3: dealbreaker toggle removed — allergy block lives on 11.6 (preference side)
      id: "3.8",
      text: "Do you have pets?",
      type: "MC",
      options: ["No pets","Dog(s)","Cat(s)","Both dogs and cats","Other pets","Multiple pets of different kinds"],
      tags: ["Compatibility Score"],
      weight: 1,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Lifestyle Behaviors",
    },
    {
      id: "3.9a",
      text: "What is your cleanliness level at home?",
      type: "MC",
      options: ["Very tidy — everything has a place and I keep it that way","Generally clean but not obsessive","Lived-in — comfortable with some clutter","I'll be honest, it gets pretty messy"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Lifestyle Behaviors",
    },
    {
      id: "3.9",
      text: "What are your hobbies and interests?",
      subtitle: "Pick up to 15. Used to find people with a compatible lifestyle.",
      type: "MS_MAX",
      maxSelections: 15,
      tags: ["Compatibility Score"],
      weight: 4,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Social & Shared Life",
    },
  ]},

  // ─── SECTION 3 (display): Career & Finances ─────────────────
  { id: 4, title: "Career & Finances", part: 1, questions: [
    {
      id: "4.1",
      text: "How would you describe your ambition level?",
      type: "MC",
      options: ["Extremely driven — work is central to my identity","Ambitious but balanced","Moderately ambitious — I work to live","I prefer stability over hustle","Still figuring it out"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Financial & Career",
    },
    {
      id: "4.2",
      text: "On a typical weekday evening, what does your time usually look like?",
      type: "MC",
      options: ["Working late — evenings are often part of my day","Winding down at home","Social — dinners, events, seeing people","Working on personal projects or side work","Varies a lot"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Financial & Career",
    },
    {
      id: "4.3",
      text: "How financially stable do you currently feel?",
      type: "MC",
      options: ["Very stable — I feel secure and have savings","Stable — I'm comfortable but not building much","Getting there — I'm working on it","Struggling — finances are a real stressor right now"],
      tags: ["Compatibility Score"],
      weight: 3,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Financial & Career",
    },
    {
      // v3: REMOVED from scoring. Now Profile Information only — displayed on profile.
      // Education removed from algorithm; 12.5 (education importance) removed entirely.
      id: "4.5",
      text: "What is your highest level of education?",
      type: "MC",
      options: ["High school diploma or GED","Some college","Associate degree","Bachelor's degree","Master's degree","Doctoral or professional degree","Trade or vocational certification","Prefer not to say"],
      tags: ["Profile Information"],
      weight: 0,
      privacyNote: "Shown on your profile",
      category: "Financial & Career",
    },
    {
      id: "4.6",
      text: "How would you describe your financial style?",
      subtitle: "Be honest — there's no wrong answer here.",
      type: "MC",
      options: ["Saver — I prioritize building security and rarely splurge","Balanced — I save and spend intentionally","Spender — I enjoy my money and live in the moment","Working on it — I want to be better with money"],
      tags: ["Compatibility Score"],
      weight: 3,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Financial & Career",
    },
    {
      id: "4.7",
      text: "Long-term, where do you picture yourself living?",
      type: "MC",
      options: ["A city — culture, career energy, and proximity to everything","Suburbs — space and community, close to the city when I want it","Rural or a small town — quiet, land, and a slower pace","Wherever makes sense — the right person matters more than the place"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Financial & Career",
    },
  ]},

  // ─── SECTION 4 (display): Family & Social Life ───────────────
  { id: 5, title: "Family & Social Life", part: 1, questions: [
    {
      id: "5.1",
      text: "How close are you with your family?",
      type: "MC",
      options: ["Very close — family is central to my life","Close — we're connected but I have my own independence","Somewhat close — we have a relationship but it's complicated","Not close — I've built my own chosen family","Estranged or no contact"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Values & Beliefs",
    },
    {
      id: "5.2",
      text: "How important is family in your life?",
      type: "MC",
      options: ["Central — family comes first, always","Very important — a major part of how I live","Important but balanced with my independence","Not a primary focus for me right now"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Values & Beliefs",
    },
    {
      id: "5.3",
      text: "How much time alone do you need to feel recharged?",
      type: "MC",
      options: ["A lot — I need significant solo time to feel like myself","Some — a few hours or a day here and there","A little — I mostly recharge through people and connection","Very little — being around others energizes me"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Social & Shared Life",
    },
    {
      id: "5.4",
      text: "How would you describe your social life?",
      type: "MC",
      options: ["Very social — I have a big circle and love being out","Social but selective — I have close friends and meaningful events","Quieter — I have a small circle and prefer depth over breadth","Mostly solo — I'm fairly independent and introverted"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Social & Shared Life",
    },
  ]},

  // ─── SECTION 5 (display): Values & Beliefs ──────────────────
  { id: 6, title: "Values & Beliefs", part: 1, questions: [
    {
      // v3: "Apolitical" now scores 60 vs any view in algorithm (was 20)
      id: "6.1",
      text: "How would you describe your political views?",
      type: "MC",
      options: ["Very liberal","Liberal","Moderate","Conservative","Very conservative","Apolitical — politics isn't a big part of my life"],
      tags: ["Compatibility Score"],
      weight: 3,
      helperText: "This helps us find people you'll genuinely connect with — not to filter by party.",
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Values & Beliefs",
    },
    {
      id: "6.2",
      text: "How would you describe your religious or spiritual beliefs?",
      type: "MC",
      options: ["Actively religious — faith is a major part of my life","Spiritual but not religious","Culturally religious — I identify with a tradition but don't actively practice","Agnostic — I'm uncertain and open","Atheist — I don't believe in a god or higher power","I prefer not to label it"],
      tags: ["Compatibility Score"],
      weight: 3,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Values & Beliefs",
    },
    {
      // v3: scoring changed from binary to ordinal (off-by-1=60, off-by-2=25)
      id: "6.2b",
      text: "How actively do you practice your faith or spirituality?",
      subtitle: "This helps us match you with someone whose relationship with faith feels compatible.",
      type: "MC",
      options: ["Very actively — it's woven into my daily life","Regularly — weekly services, rituals, or practice","Occasionally — holidays, personal moments, or when I need it","Rarely — it's more of a background identity than a practice"],
      tags: ["Compatibility Score"],
      weight: 2,
      optional: true,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Values & Beliefs",
      showIf: { questionId: "6.2", notValues: ["Agnostic — I'm uncertain and open","Atheist — I don't believe in a god or higher power","I prefer not to label it"] },
    },
  ]},

  // ─── SECTION 6 (display): Relationship Psychology ───────────
  { id: 7, title: "Relationship Psychology", part: 1, questions: [
    {
      // v3: combination-aware scoring (secure+secure=100, anxious+avoidant=20, etc.)
      id: "7.1a",
      text: "When someone you're dating takes longer than usual to respond, you usually:",
      type: "MC",
      options: ["Assume they're busy and don't stress about it","Feel uneasy and find myself checking my phone","Feel irritated and start to pull back","Tell myself I don't care, but I'm still thinking about it"],
      tags: ["Compatibility Score"],
      weight: 5,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Attachment & Emotional Health",
    },
    {
      // v3: combination-aware scoring applied
      id: "7.1b",
      text: "When a relationship starts getting emotionally close:",
      type: "MC",
      options: ["It feels natural — I lean into it","It feels exciting but also makes me nervous","It starts feeling like too much and I need space","I want it, then feel the urge to pull away"],
      tags: ["Compatibility Score"],
      weight: 5,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Attachment & Emotional Health",
    },
    {
      id: "7.3",
      text: "When something is bothering you in a relationship, how do you communicate it?",
      subtitle: "Select up to 2 that apply.",
      type: "MS_MAX",
      maxSelections: 2,
      options: ["I say it directly as soon as I feel it","I wait until I've had time to process, then bring it up","I bring it up, but I worry about how they'll react","I tend to drop hints and hope they notice","I write or message first, then talk in person","I struggle to bring it up and often let it go"],
      tags: ["Compatibility Score"],
      weight: 6,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Communication & Conflict",
    },
    {
      id: "7.4",
      text: "How much space does your most significant past relationship still take up in your life or thinking?",
      type: "MC",
      options: ["None — that chapter feels genuinely closed","Some — it comes to mind occasionally but doesn't affect me","A fair amount — I'm still working through parts of it","A lot — I'm honestly not fully over it yet"],
      tags: ["Compatibility Score"],
      weight: 3,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Attachment & Emotional Health",
    },
    {
      id: "13.1",
      text: "How important is physical intimacy in a relationship to you?",
      type: "MC",
      options: ["Central — it's one of the primary ways I feel connected and loved","Important — it matters significantly but isn't the whole picture","Moderately important — I connect more through emotional intimacy","Less important — emotional closeness is what I prioritize"],
      tags: ["Compatibility Score"],
      weight: 4,
      privacyNote: "Used for matching only — never shown on your profile",
      category: "Intimacy & Connection",
    },
    {
      id: "13.2",
      text: "How important is it that your partner has a similar level of physical intimacy needs?",
      type: "MC",
      options: ["Very important — strong alignment here matters to me","Moderately important — some alignment would be good","Somewhat important — I think we'd figure it out","Not a major factor for me"],
      tags: ["Compatibility Score"],
      weight: 3,
      privacyNote: "Used for matching only — never shown on your profile",
      category: "Intimacy & Connection",
    },
    {
      // v3: combination-aware stress matrix (lean-in+pull-back=8, matched avoidants=55, etc.)
      id: "7.6",
      text: "When you're going through a stressful period at work or in life, what does that tend to look like in your relationships?",
      type: "MC",
      options: ["I lean on my partner more — I need closeness when life feels heavy","I pull back and need space to process before I can open up","I try to keep it separate — I don't want to burden the people I love","I lose patience more easily and I know it affects how I show up"],
      tags: ["Compatibility Score"],
      weight: 5,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Attachment & Emotional Health",
    },
    {
      // v3: ordinal scoring (off-by-1=60, off-by-2=25, off-by-3=8)
      id: "7.7",
      text: "After a fight or disagreement with someone you care about, you typically:",
      type: "MC",
      options: ["Want to reconnect quickly — the tension feels worse to me than the fight itself","Give it a day, then come back ready to move on","Need the other person to acknowledge what happened before I can move forward","Hold onto it for a while — I genuinely find it hard to let things go"],
      tags: ["Compatibility Score"],
      weight: 5,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Attachment & Emotional Health",
    },
    {
      id: "7.8",
      text: "When your partner shares something small — a funny thing they saw, a worry, something they're excited about — what's your natural instinct?",
      type: "MC",
      options: ["Stop what I'm doing and fully engage — those moments matter to me","Respond warmly but keep it light — I'm present but don't make it a big moment","Acknowledge it but I'm often still focused on what I was doing","I tend to stay in my own headspace — I'm not naturally great at this"],
      tags: ["Compatibility Score"],
      weight: 5,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Attachment & Emotional Health",
    },
    {
      id: "7.9",
      text: "How do you feel when a partner maintains a close friendship with someone they've previously been attracted to?",
      type: "MC",
      options: ["Comfortable — trust matters more than history","Fine, but I'd appreciate some transparency about the friendship","It depends on the nature of the friendship and how it's handled","I'd find it difficult — I prefer clearer boundaries around this"],
      tags: ["Compatibility Score"],
      weight: 3,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Attachment & Emotional Health",
    },
    {
      // v3: NEW — therapy/self-awareness stance. Ordinal scored w=2.
      id: "7.10",
      text: "How do you feel about therapy or couples counseling as part of a healthy relationship?",
      type: "MC",
      options: ["I'm a strong believer — I think everyone benefits from it","I'm open to it if things get hard","I'd consider it, but it's not something I'd seek proactively","I'm skeptical — I prefer handling things privately","Not for me"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Attachment & Emotional Health",
    },
    {
      // v3: NEW — conflict style / contempt signal. Combination-aware scored w=4.
      id: "7.11",
      text: "When your partner does something that bothers you repeatedly, your instinct is usually to:",
      type: "MC",
      options: ["Bring it up directly, staying curious about where they're coming from","Let the small things go and only raise the bigger patterns","Say something, but I know I can be harsher than I intend","Go quiet and pull away rather than engage","Bring it up, but I sometimes catastrophize or make it personal"],
      tags: ["Compatibility Score"],
      weight: 4,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Communication & Conflict",
    },
  ]},

  // ─── SECTION 7 (display): Relationship Goals ────────────────
  { id: 8, title: "Relationship Goals", part: 1, questions: [
    {
      id: "8.1",
      text: "Do you currently have children?",
      type: "MC",
      options: ["No children","Yes — young children at home (under 12)","Yes — teenagers at home (12–17)","Yes — adult children (18+), still close","Yes — adult children (18+), living independently","Yes — children from multiple stages","Yes — shared custody","Yes — children who live with their other parent","Expecting or newly expecting"],
      tags: ["Compatibility Score"],
      weight: 3,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Life Goals",
    },
    {
      // v3: yes+"open to it"=65 (was 40), no+maybe=25 (was 40) in algorithm
      id: "8.2",
      text: "Do you want children in the future?",
      type: "MC",
      options: ["Definitely yes","Probably yes","Open to it if my partner wants them","Unsure","Probably not","Definitely not","I have young children and would like more","I have young children and I'm done","My children are grown — I'm not looking to have more","My children are grown — open to a partner with young children","I'm open to being a stepparent","I prefer a partner without young children at home"],
      tags: ["Compatibility Score"],
      weight: 8,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Life Goals",
      filterOptionsIf: {
        questionId: "8.1",
        ifValues: ["No children","Expecting or newly expecting"],
        hideOptions: ["I have young children and would like more","I have young children and I'm done","My children are grown — I'm not looking to have more","My children are grown — open to a partner with young children"],
      },
    },
    {
      // v3: mismatch penalty changed 30 → 18 in algorithm
      id: "8.7",
      text: "When it comes to raising children, how would you describe your approach?",
      subtitle: "There's no right answer — this is about alignment, not judgment.",
      type: "MC",
      options: ["Structure and clear expectations — consistency is how children feel secure","Emotional attunement above all — I want my kids to feel deeply understood","A balance — firm on some things, relaxed and flexible on others","Autonomy and experience — I want to raise independent, curious thinkers"],
      tags: ["Compatibility Score"],
      weight: 4,
      optional: true,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Life Goals",
      showIf: {
        questionId: "8.2",
        notValues: ["Probably not","Definitely not","I have young children and I'm done","My children are grown — I'm not looking to have more","I prefer a partner without young children at home"],
      },
    },
    {
      id: "8.3",
      text: "What are your views on marriage?",
      type: "MC",
      options: ["Marriage is the goal","Open to marriage if it feels right","Committed partnership without marriage","Not interested in marriage","Not sure yet"],
      tags: ["Compatibility Score"],
      weight: 4,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Life Goals",
    },
    {
      id: "8.4",
      text: "What relationship pace feels natural to you?",
      type: "MC",
      options: ["Slow and intentional","Moderate — let things develop naturally","Fast if the connection is strong","I go with the flow"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Life Goals",
    },
    {
      id: "8.6",
      text: "What are you looking for right now?",
      type: "MC",
      options: ["A serious long-term relationship","A relationship that could become serious","I'm open, but ultimately looking for something meaningful","I'm still figuring that out"],
      tags: ["Compatibility Score"],
      weight: 5,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Life Goals",
    },
  ]},

  // ─── PART 2 ───────────────────────────────────────────────────

  // ─── SECTION 8 (display): Attraction Preferences ────────────
  { id: 9, title: "Attraction Preferences", part: 2, questions: [
    {
      id: "9.1",
      text: "Which genders are you interested in being matched with?",
      type: "MS",
      options: ["Women","Men","Non-binary people","Transgender women","Transgender men","Gender diverse people","Open to all genders"],
      tags: ["Hard Filter"],
      weight: 0,
      privacyNote: "Used for matching only — this is a hard filter.",
      category: "Life Goals",
    },
    {
      // v3: now wired as actual hard filter in algorithm
      id: "9.1b",
      text: "Which sexual orientations are you open to in a partner?",
      subtitle: "Select all that apply.",
      type: "MS",
      options: ["Straight / Heterosexual","Gay","Lesbian","Bisexual","Pansexual","Demisexual","Asexual","Queer","Questioning","Open to any orientation"],
      tags: ["Hard Filter"],
      weight: 0,
      privacyNote: "Used for matching only — never shown on your profile",
      category: "Life Goals",
    },
    {
      id: "9.2",
      text: "What age range are you open to dating?",
      type: "AGE_RANGE",
      tags: ["Hard Filter"],
      weight: 0,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Life Goals",
    },
    {
      // v3: dealbreaker toggle REMOVED — already a hard filter, toggle was redundant
      id: "9.3",
      text: "What height range are you open to dating?",
      type: "HEIGHT_RANGE",
      tags: ["Compatibility Score"],
      weight: 4,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Intimacy & Connection",
    },
    {
      // v3: dealbreaker toggle REMOVED — already a hard filter
      // v3: missing distance options now mapped in algorithm (country/continent/world)
      id: "9.4",
      text: "How far away are you open to dating someone right now?",
      type: "MC",
      options: ["Within 25 miles","Within 50 miles","Within 100 miles","Anywhere within my state or region","Anywhere within my country","Anywhere in the US & Canada"],
      tags: ["Hard Filter"],
      weight: 0,
      privacyNote: "Used for matching — this is a hard filter.",
      category: "Social & Shared Life",
    },
    {
      id: "10.1",
      text: "What body types are you typically attracted to?",
      type: "MS",
      options: ["Athletic","Curvy","Average / Medium build","Slim","Muscular","Broad / Solid","Full-figured","Plus-size","Open to all body types"],
      tags: ["Compatibility Score"],
      weight: 5,
      privacyNote: "Used for matching only — never shown on your profile",
      category: "Intimacy & Connection",
    },
  ]},

  // ─── SECTION 9 (display): Lifestyle Compatibility ───────────
  { id: 11, title: "Lifestyle Compatibility", part: 2, questions: [
    {
      id: "3.11",
      text: "When it comes to hobbies and daily life, what are you looking for in a partner?",
      subtitle: "There's no right answer — just what's true for you.",
      type: "MC",
      options: ["A true adventure partner — I want someone who actively does life with me","Mostly shared — I want real overlap, but we can have our own things too","A healthy mix — some shared interests, plenty of independence","Independent is great — I love having my own world and theirs"],
      tags: ["Compatibility Score","Dealbreaker Eligible"],
      weight: 4,
      privacyNote: "Used for matching only — not shown on your profile",
      hasDealbreaker: true,
      dealbreakerValues: ["A true adventure partner — I want someone who actively does life with me"],
      category: "Social & Shared Life",
    },
    {
      id: "11.1",
      text: "What drinking habits are you comfortable with in a partner?",
      type: "MC",
      options: ["Must not drink","Prefer non-drinker","Occasional drinking is fine","Regular drinking is fine","No preference"],
      tags: ["Compatibility Score","Dealbreaker Eligible"],
      weight: 4,
      privacyNote: "Used for matching — you can mark this as a dealbreaker",
      hasDealbreaker: true,
      dealbreakerValues: ["Must not drink"],
      category: "Lifestyle Behaviors",
    },
    {
      id: "11.1b",
      text: "When it comes to drinking, what are you looking for in a partner?",
      type: "MC",
      options: ["I want someone who drinks with me — it's part of how I connect and socialize","I don't need them to drink — I'm happy either way"],
      tags: ["Compatibility Score","Dealbreaker Eligible"],
      weight: 2,
      optional: true,
      privacyNote: "Used for matching — you can mark this as a dealbreaker",
      hasDealbreaker: true,
      dealbreakerValues: ["I want someone who drinks with me — it's part of how I connect and socialize"],
      category: "Lifestyle Behaviors",
      showIf: { questionId: "3.1", notValues: ["Never drink"] },
    },
    {
      id: "11.2",
      text: "What smoking habits are you comfortable with in a partner?",
      type: "MC",
      options: ["Must not smoke","Prefer non-smoker","Occasional smoking is okay","No preference"],
      tags: ["Compatibility Score","Dealbreaker Eligible"],
      weight: 3,
      privacyNote: "Used for matching — you can mark this as a dealbreaker",
      hasDealbreaker: true,
      dealbreakerValues: ["Must not smoke"],
      category: "Lifestyle Behaviors",
    },
    {
      id: "11.3",
      text: "Are you okay with a partner who uses marijuana?",
      type: "MC",
      options: ["No — I prefer they don't use at all","Occasionally is fine","Regularly is fine","No preference"],
      tags: ["Compatibility Score","Dealbreaker Eligible"],
      weight: 2,
      privacyNote: "Used for matching — you can mark this as a dealbreaker",
      hasDealbreaker: true,
      dealbreakerValues: ["No — I prefer they don't use at all"],
      category: "Lifestyle Behaviors",
    },
    {
      id: "11.4",
      text: "How active of a lifestyle are you looking for in a partner?",
      type: "MC",
      options: ["Very active","Moderately active","Somewhat active","Not very active","No preference"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Lifestyle Behaviors",
    },
    {
      // v3: dealbreaker toggle kept on preference question (correct side)
      id: "11.6",
      text: "How would you feel about a partner who has pets?",
      type: "MC",
      options: ["I love pets — any pet is fine","Dogs are fine but I'm not a cat person","Cats are fine but I'm not a dog person","Small pets only (no dogs or cats)","I prefer no pets","I cannot be around pets due to allergies"],
      tags: ["Compatibility Score","Dealbreaker Eligible"],
      weight: 1,
      privacyNote: "Used for matching — you can mark this as a dealbreaker",
      hasDealbreaker: true,
      dealbreakerValues: ["I cannot be around pets due to allergies","I prefer no pets"],
      category: "Lifestyle Behaviors",
    },
    {
      id: "11.7",
      text: "How do you feel about a partner who uses recreational drugs beyond cannabis?",
      type: "MC",
      options: ["Not okay with it — this is important to me","Prefer they don't, but occasional or past use is fine","No preference"],
      tags: ["Compatibility Score","Dealbreaker Eligible"],
      weight: 3,
      privacyNote: "Used for matching — you can mark this as a dealbreaker",
      hasDealbreaker: true,
      dealbreakerValues: ["Not okay with it — this is important to me"],
      category: "Lifestyle Behaviors",
    },
    {
      id: "11.8",
      text: "When it comes to recreational drugs, what are you looking for in a partner?",
      subtitle: "Since you use, this helps us find someone who fits your lifestyle.",
      type: "MC",
      options: ["I want someone who participates with me — it's part of how I experience life","I don't mind either way — they don't need to join me"],
      tags: ["Compatibility Score","Dealbreaker Eligible"],
      weight: 2,
      optional: true,
      privacyNote: "Used for matching — you can mark this as a dealbreaker",
      hasDealbreaker: true,
      dealbreakerValues: ["I want someone who participates with me — it's part of how I experience life"],
      category: "Lifestyle Behaviors",
      showIf: { questionId: "3.10", notValues: ["No — I don't use recreational drugs"] },
    },
    {
      // v3: NEW — domestic responsibility expectations. Ordinal scored w=3.
      id: "11.9",
      text: "In a serious relationship, how do you expect household responsibilities to be divided?",
      type: "MC",
      options: ["Shared equally — roughly 50/50","Whoever has more bandwidth at the time","I'd carry more — I have high standards and I'm okay with that","I'd expect my partner to carry more — I contribute in other ways","Whoever cares more about it handles it — I'm easy-going about this"],
      tags: ["Compatibility Score"],
      weight: 3,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Lifestyle Behaviors",
    },
  ]},

  // ─── SECTION 10 (display): Partner Values ───────────────────
  { id: 12, title: "Partner Values", part: 2, questions: [
    {
      id: "12.1",
      text: "What political views are you most compatible with in a partner?",
      subtitle: "Select all that you'd genuinely be compatible with.",
      type: "MS",
      options: ["Very liberal","Liberal","Moderate","Conservative","Very conservative","Apolitical","No preference"],
      tags: ["Hard Filter","Dealbreaker Eligible"],
      weight: 0,
      privacyNote: "Used for matching — this is a hard filter.",
      hasDealbreaker: true,
      category: "Values & Beliefs",
    },
    {
      id: "12.2",
      text: "What religious or spiritual beliefs are you most compatible with in a partner?",
      type: "MC",
      options: ["Similar beliefs to mine","Open to different beliefs","Prefer secular / non-religious","No preference"],
      tags: ["Compatibility Score","Dealbreaker Eligible"],
      weight: 4,
      privacyNote: "Used for matching — you can mark this as a dealbreaker",
      hasDealbreaker: true,
      dealbreakerValues: ["Similar beliefs to mine","Prefer secular / non-religious"],
      category: "Values & Beliefs",
    },
    {
      // v3: scoring changed from binary to ordinal (off-by-1=60, off-by-2=25)
      id: "12.2b",
      text: "How important is it that your partner participates in your faith or spiritual practice?",
      type: "MC",
      options: ["Very important — I want someone who practices alongside me","Somewhat important — I want them to respect and engage with it, even if they don't practice","Not important — I'm fine if they have a different or no practice"],
      tags: ["Compatibility Score"],
      weight: 2,
      optional: true,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Values & Beliefs",
      showIf: { questionId: "6.2b", hasValue: true },
    },
    {
      id: "12.4",
      text: "How important is it that your partner has similar views on marriage?",
      type: "MC",
      options: ["Very important","Moderately important","Slightly important","Not very important"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Life Goals",
    },
    {
      // v3: 12.5 (education importance) REMOVED — education no longer scored
      // Jumping from 12.4 → 12.6 intentionally; 12.5 ID retired
      id: "12.6",
      text: "How important is similar ambition level in a partner?",
      type: "MC",
      options: ["Very important","Moderately important","Slightly important","Not important"],
      tags: ["Compatibility Score"],
      weight: 2,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Values & Beliefs",
    },
    {
      id: "12.7",
      text: "How important is it that your partner shares your approach to parenting?",
      type: "MC",
      options: ["Very important — this is a genuine priority for me","Moderately important — I'd want to understand their approach","Somewhat important — I think we could navigate differences","Not very important — I trust we'd figure it out together"],
      tags: ["Compatibility Score"],
      weight: 3,
      optional: true,
      privacyNote: "Used for matching only — not shown on your profile",
      category: "Life Goals",
      showIf: {
        questionId: "8.2",
        notValues: ["Probably not","Definitely not","I have young children and I'm done","My children are grown — I'm not looking to have more","I prefer a partner without young children at home"],
      },
    },
  ]},
];
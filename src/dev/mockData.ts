// Mock fixtures for the DevGallery. These power both the fetch interceptor
// and the rendered screens so previews look populated without a backend.
import type { Match, User } from "../types";

export const MOCK_USER_ID = "dev-user-00000000-0000-0000-0000-000000000001";

export const MOCK_PHOTOS = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&q=80",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=800&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&q=80",
];

export const MOCK_MALE_PHOTOS = [
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
];

function makeUser(overrides: Partial<User>): User {
  return {
    id: "u-1",
    name: "Alex",
    age: 29,
    bio: "Curious, kind, and looking for someone to share long walks and longer conversations with.",
    photoUrl: MOCK_PHOTOS[0],
    photos: MOCK_PHOTOS,
    location: "Brooklyn, NY",
    pronouns: "she/her",
    education: "NYU",
    career: "Product Designer",
    drinking: "Socially",
    smoking: "No",
    pets: "Dog",
    religion: "Spiritual",
    politics: "Liberal",
    hobbies: ["Hiking", "Cooking", "Reading", "Live music", "Yoga", "Travel"],
    relationshipIntention: "Long-term",
    isVerified: true,
    answers: {},
    preferences: {},
    ...overrides,
  } as User;
}

export const MOCK_MATCH: Match = {
  user: makeUser({
    id: "match-1",
    name: "Sara",
    age: 28,
    bio: "Architect by day, potter by weekend. Big fan of dim sum, slow mornings, and trail runs.",
  }),
  compatibilityScore: 87,
  distanceMiles: 4,
  sharedAnswers: 32,
  totalQuestions: 55,
  matchDetails: {
    breakdown: {
      "Attachment & Emotional Health": 92,
      "Communication & Conflict": 88,
      "Life Goals": 85,
      "Values & Beliefs": 80,
      "Financial & Career": 78,
      "Connection Style": 90,
      "Lifestyle Behaviors": 86,
      "Social & Shared Life": 84,
    },
    whyYouMatched: [
      "Both want kids in the next 5 years",
      "Both prefer direct communication during conflict",
      "Both value financial transparency in a partnership",
      "Both rate emotional safety as a top priority",
    ],
    potentialDifferences: [
      "You travel more often than they do",
      "Different views on social media use",
    ],
    sharedHobbies: ["Hiking", "Cooking", "Reading", "Live music"],
    dealbreakers: { passed: true, passedCount: 5, totalCount: 5 },
  },
};

export const MOCK_MATCHES: Match[] = [
  MOCK_MATCH,
  {
    user: makeUser({
      id: "match-2",
      name: "Jordan",
      age: 31,
      bio: "Writer, runner, dad-joke enthusiast.",
      photoUrl: MOCK_MALE_PHOTOS[0],
      photos: MOCK_MALE_PHOTOS,
      pronouns: "he/him",
      career: "Journalist",
    }),
    compatibilityScore: 81,
    distanceMiles: 7,
    sharedAnswers: 28,
    totalQuestions: 55,
    matchDetails: {
      breakdown: {
        "Attachment & Emotional Health": 80,
        "Communication & Conflict": 84,
        "Life Goals": 78,
        "Values & Beliefs": 82,
        "Financial & Career": 75,
        "Connection Style": 80,
        "Lifestyle Behaviors": 82,
        "Social & Shared Life": 79,
      },
      whyYouMatched: ["Both prioritize family time", "Both want a calm home"],
      potentialDifferences: ["Different sleep schedules"],
      sharedHobbies: ["Running", "Movies"],
    },
  },
  {
    user: makeUser({
      id: "match-3",
      name: "Maya",
      age: 27,
      bio: "Therapist, cyclist, ramen-truck regular.",
      photoUrl: MOCK_PHOTOS[1],
    }),
    compatibilityScore: 76,
    distanceMiles: 12,
    sharedAnswers: 24,
    totalQuestions: 55,
    matchDetails: { sharedHobbies: ["Cycling", "Cooking"] },
  },
];

export const MOCK_INBOX = [
  {
    matchId: "match-1",
    matchName: "Sara",
    matchPhoto: MOCK_PHOTOS[0],
    lastMessage: "Saturday works! Where should we meet?",
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    unread: true,
    compatibilityScore: 87,
    mutualMatch: true,
    hasMessages: true,
  },
  {
    matchId: "match-3",
    matchName: "Maya",
    matchPhoto: MOCK_PHOTOS[1],
    lastMessage: "Haha that's such a good point — I never thought of it that way 😄",
    timestamp: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
    unread: true,
    compatibilityScore: 92,
    mutualMatch: true,
    hasMessages: true,
  },
  {
    matchId: "match-4",
    matchName: "Jordan",
    matchPhoto: MOCK_MALE_PHOTOS[0],
    lastMessage: "You: Sounds good, talk soon!",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    unread: false,
    compatibilityScore: 81,
    mutualMatch: true,
    hasMessages: true,
  },
  {
    matchId: "match-5",
    matchName: "Priya",
    matchPhoto: MOCK_PHOTOS[2],
    lastMessage: "Would love to hear more about your trip to Lisbon!",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    unread: false,
    compatibilityScore: 84,
    mutualMatch: true,
    hasMessages: true,
  },
  {
    matchId: "match-6",
    matchName: "Daniel",
    matchPhoto: MOCK_MALE_PHOTOS[1],
    lastMessage: "You: Ha, fair! What about Sunday brunch instead?",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    unread: false,
    compatibilityScore: 78,
    mutualMatch: true,
    hasMessages: true,
  },
  {
    matchId: "match-2",
    matchName: "Eli",
    matchPhoto: MOCK_MALE_PHOTOS[0],
    lastMessage: "You matched! Say hello 👋",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    unread: false,
    compatibilityScore: 81,
    mutualMatch: true,
    hasMessages: false,
  },
];

export const MOCK_PROFILE = {
  id: MOCK_USER_ID,
  name: "Riley",
  email: "dev@example.com",
  date_of_birth: "1995-04-12",
  has_completed_onboarding: true,
  hasActivated: true,
  is_verified: true,
  emailConfirmed: true,
  photos: MOCK_PHOTOS,
  bio: "Designer who likes climbing, sourdough, and weekend road trips.",
  career: "Product Designer @ Studio",
  education: "RISD",
  instagram: "riley.codes",
  pronouns: "they/them",
  answers: {
    q_age: { value: 30 },
    q_height: { value: { feet: 5, inches: 9 } },
    q_location: { value: { city: "Brooklyn", country: "USA", locationDisplay: "Brooklyn, NY" } },
  },
};

export const MOCK_MESSAGES = [
  { id: "m1", senderId: "match-1", text: "Hey! Loved your profile.", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), read: true },
  { id: "m2", senderId: MOCK_USER_ID, text: "Thanks! Yours too — that pottery shot is great.", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), read: true },
  { id: "m3", senderId: "match-1", text: "Want to grab coffee this weekend?", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), read: true },
  { id: "m4", senderId: "match-1", text: "Saturday works! Where should we meet?", timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(), read: false },
];

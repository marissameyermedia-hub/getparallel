export interface Question {
  id: string;
  text: string;
  category: string;
  options: string[];
}

export interface UserAnswers {
  [questionId: string]: string;
}

export interface PreferenceAnswers {
  [questionId: string]: string;
}

export interface User {
  id: string;
  name: string;
  age: number;
  height?: string; // e.g., "5'10\"" or "178 cm"
  bio: string;
  photoUrl: string; // Main photo for backwards compatibility
  photos?: string[]; // Additional photos (4 more for a total of 5)
  location?: string;
  instagram?: string; // Optional Instagram handle
  pronouns?: string;
  education?: string;
  career?: string;
  drinking?: string;
  smoking?: string;
  pets?: string;
  religion?: string;
  politics?: string;
  /**
   * The user's hobby selections (Q3.9). MatchProfileView splits these into
   * "you both enjoy" (intersected with self.hobbies) vs "also into".
   * Surfaced by the matches edge function from user_answers.
   */
  hobbies?: string[];
  relationshipIntention?: string;
  isVerified?: boolean; // Verified via Persona
  answers: UserAnswers;
  preferences: PreferenceAnswers;
  attachmentStyle?: {
    style: 'secure' | 'anxious' | 'avoidant' | 'fearful';
    desiredFeeling?: 'chosen' | 'calm' | 'free' | 'understood';
    visible: boolean;
  };
}

// 8-category breakdown keys — kept in display order
export const COMPATIBILITY_CATEGORIES = [
  'Attachment & Emotional Health',
  'Communication & Conflict',
  'Life Goals',
  'Values & Beliefs',
  'Financial & Career',
  'Connection Style',
  'Lifestyle Behaviors',
  'Social & Shared Life',
] as const;

export type CompatibilityCategory = typeof COMPATIBILITY_CATEGORIES[number];

export interface Match {
  user: User;
  compatibilityScore: number;
  distanceMiles?: number;
  sharedAnswers?: number;
  totalQuestions?: number;
  matchDetails?: {
    breakdown?: Partial<Record<CompatibilityCategory, number>>;
    whyYouMatched?: string[]; // 3-5 strongest compatibility reasons
    potentialDifferences?: string[]; // 1-3 lighter differences
    sharedHobbies?: string[]; // Hobbies both users selected — populated by backend
    // Legacy fields for backwards compatibility (safe to remove later)
    categoryScores?: Record<string, number>;
    coreAlignment?: {
      highlights: string[];
      count: number;
    };
    lifestyleCompatibility?: {
      highlights: string[];
      count: number;
    };
    financialAlignment?: {
      highlights: string[];
      count: number;
    };
    naturalDifferences?: {
      items: string[];
      reassurance: string;
    };
    dealbreakers?: {
      passed: boolean;
      passedCount: number;
      totalCount: number;
    };
  };
}
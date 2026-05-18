/**
 * PARALLEL MATCHING ALGORITHM — SERVER-SIDE REFERENCE ONLY
 * This file is NOT imported or used by the frontend.
 * Matching runs server-side in the Supabase edge function.
 * This file exists as a reference implementation only.
 * DO NOT import this into any frontend component.
 */

import { User } from '../types';

import { parallelQuestionnaire, CATEGORY_WEIGHTS, ATTACHMENT_PENALTY } from '../data/parallelQuestionnaire_updated';

export interface UserProfile {
  id: string;
  gender?: string;
  age?: number;
  height?: number; // in inches
  location?: { lat: number; lng: number; city?: string };
  answers: Record<string, any>;
  dealbreakers?: string[]; // Array of question IDs marked as dealbreakers
}

export interface CompatibilityResult {
  compatible: boolean;
  score: number;
  breakdown: {
    "Relationship Psychology": number;
    "Values & Life Goals": number;
    "Lifestyle Compatibility": number;
    "Attraction & Preferences": number;
    "Life Logistics": number;
  };
  blockingReason?: string;
  attachmentPenaltyApplied?: boolean;
}

/**
 * Extract numeric height from height answer (could be object with feet/inches)
 */
function extractHeight(heightAnswer: any): number | null {
  if (typeof heightAnswer === 'number') return heightAnswer;
  if (typeof heightAnswer === 'object' && heightAnswer !== null) {
    if ('feet' in heightAnswer && 'inches' in heightAnswer) {
      return heightAnswer.feet * 12 + heightAnswer.inches;
    }
    if ('value' in heightAnswer) {
      return extractHeight(heightAnswer.value);
    }
  }
  return null;
}

/**
 * Extract age range from answer
 */
function extractAgeRange(rangeAnswer: any): { min: number; max: number } | null {
  if (typeof rangeAnswer === 'object' && rangeAnswer !== null) {
    if ('min' in rangeAnswer && 'max' in rangeAnswer) {
      return { min: rangeAnswer.min, max: rangeAnswer.max };
    }
  }
  return null;
}

/**
 * Extract height range from answer
 */
function extractHeightRange(rangeAnswer: any): { min: number; max: number } | null {
  if (typeof rangeAnswer === 'object' && rangeAnswer !== null) {
    if ('min' in rangeAnswer && 'max' in rangeAnswer) {
      return { min: rangeAnswer.min, max: rangeAnswer.max };
    }
    if ('value' in rangeAnswer && Array.isArray(rangeAnswer.value)) {
      return { min: rangeAnswer.value[0], max: rangeAnswer.value[1] };
    }
  }
  if (Array.isArray(rangeAnswer) && rangeAnswer.length === 2) {
    return { min: rangeAnswer[0], max: rangeAnswer[1] };
  }
  return null;
}

/**
 * Calculate distance between two coordinates in miles
 */
function calculateDistance(
  loc1: { lat: number; lng: number },
  loc2: { lat: number; lng: number }
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
  const dLng = (loc2.lng - loc1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert distance preference string to miles
 */
function parseDistancePreference(pref: string): number {
  if (pref.includes('25')) return 25;
  if (pref.includes('50')) return 50;
  if (pref.includes('100')) return 100;
  if (pref.includes('state') || pref.includes('region')) return 300;
  if (pref.includes('country')) return 3000;
  if (pref.includes('continent')) return 7000;
  if (pref.includes('world') || pref.includes('US & Canada')) return 25000;
  return 50; // default
}

/**
 * STEP 1: Check Hard Filters
 * These filters must pass bidirectionally before any matching
 */
function checkHardFilters(user1: UserProfile, user2: UserProfile): { passed: boolean; reason?: string } {
  // Gender preference (9.1) - bidirectional
  const user1GenderPref = user1.answers['9.1'];
  const user2Gender = user1.answers['1.1'];
  const user2GenderPref = user2.answers['9.1'];
  const user1Gender = user2.answers['1.1'];

  if (user1GenderPref && Array.isArray(user1GenderPref)) {
    const acceptsAllGenders = user1GenderPref.includes('Open to all genders');
    if (!acceptsAllGenders) {
      const genderMap: Record<string, string[]> = {
        'Woman': ['Women'],
        'Man': ['Men'],
        'Non-binary': ['Non-binary people'],
        'Transgender woman': ['Transgender women', 'Women'],
        'Transgender man': ['Transgender men', 'Men'],
      };
      const acceptedCategories = genderMap[user2Gender] || [];
      const matches = acceptedCategories.some(cat => user1GenderPref.includes(cat));
      if (!matches) {
        return { passed: false, reason: 'Gender preference not met' };
      }
    }
  }

  // Check reverse gender preference
  if (user2GenderPref && Array.isArray(user2GenderPref)) {
    const acceptsAllGenders = user2GenderPref.includes('Open to all genders');
    if (!acceptsAllGenders) {
      const genderMap: Record<string, string[]> = {
        'Woman': ['Women'],
        'Man': ['Men'],
        'Non-binary': ['Non-binary people'],
        'Transgender woman': ['Transgender women', 'Women'],
        'Transgender man': ['Transgender men', 'Men'],
      };
      const acceptedCategories = genderMap[user1Gender] || [];
      const matches = acceptedCategories.some(cat => user2GenderPref.includes(cat));
      if (!matches) {
        return { passed: false, reason: 'Gender preference not met (reverse)' };
      }
    }
  }

  // Age range (9.2) - bidirectional
  const user1AgeRange = extractAgeRange(user1.answers['9.2']);
  const user2Age = user2.age || user2.answers['1.4'];
  if (user1AgeRange && user2Age) {
    if (user2Age < user1AgeRange.min || user2Age > user1AgeRange.max) {
      return { passed: false, reason: 'Outside age range preference' };
    }
  }

  const user2AgeRange = extractAgeRange(user2.answers['9.2']);
  const user1Age = user1.age || user1.answers['1.4'];
  if (user2AgeRange && user1Age) {
    if (user1Age < user2AgeRange.min || user1Age > user2AgeRange.max) {
      return { passed: false, reason: 'Outside age range preference (reverse)' };
    }
  }

  // Height range (9.3) - bidirectional
  const user1HeightRange = extractHeightRange(user1.answers['9.3']);
  const user2Height = extractHeight(user2.answers['1.5']) || user2.height;
  if (user1HeightRange && user2Height) {
    if (user2Height < user1HeightRange.min || user2Height > user1HeightRange.max) {
      return { passed: false, reason: 'Outside height range preference' };
    }
  }

  const user2HeightRange = extractHeightRange(user2.answers['9.3']);
  const user1Height = extractHeight(user1.answers['1.5']) || user1.height;
  if (user2HeightRange && user1Height) {
    if (user1Height < user2HeightRange.min || user1Height > user2HeightRange.max) {
      return { passed: false, reason: 'Outside height range preference (reverse)' };
    }
  }

  // Location distance (9.4) - bidirectional
  if (user1.location && user2.location) {
    const distance = calculateDistance(user1.location, user2.location);
    
    const user1DistancePref = user1.answers['9.4'];
    if (user1DistancePref) {
      const maxDistance = parseDistancePreference(user1DistancePref);
      if (distance > maxDistance) {
        return { passed: false, reason: 'Outside distance preference' };
      }
    }

    const user2DistancePref = user2.answers['9.4'];
    if (user2DistancePref) {
      const maxDistance = parseDistancePreference(user2DistancePref);
      if (distance > maxDistance) {
        return { passed: false, reason: 'Outside distance preference (reverse)' };
      }
    }
  }

  return { passed: true };
}

/**
 * STEP 2: Check User Dealbreakers
 * If any dealbreaker is not met, the match is blocked
 */
function checkDealbreakers(user1: UserProfile, user2: UserProfile): { passed: boolean; reason?: string } {
  // Check user1's dealbreakers against user2's answers
  if (user1.dealbreakers && user1.dealbreakers.length > 0) {
    for (const questionId of user1.dealbreakers) {
      const user1Answer = user1.answers[questionId];
      const user2Answer = user2.answers[questionId];

      // Skip if either answer is missing
      if (!user1Answer || !user2Answer) continue;

      // For multi-select questions, check if there's any overlap
      if (Array.isArray(user1Answer)) {
        if (Array.isArray(user2Answer)) {
          const hasOverlap = user1Answer.some(val => user2Answer.includes(val));
          if (!hasOverlap) {
            return { passed: false, reason: `Dealbreaker on question ${questionId}` };
          }
        }
      } else {
        // For single-select, they must match exactly
        if (user1Answer !== user2Answer) {
          // Special handling for certain questions that allow flexibility
          const flexibleQuestions = ['11.1', '11.2', '11.3']; // Partner preference questions
          if (!flexibleQuestions.includes(questionId)) {
            return { passed: false, reason: `Dealbreaker on question ${questionId}` };
          }
        }
      }
    }
  }

  // Check user2's dealbreakers against user1's answers
  if (user2.dealbreakers && user2.dealbreakers.length > 0) {
    for (const questionId of user2.dealbreakers) {
      const user2Answer = user2.answers[questionId];
      const user1Answer = user1.answers[questionId];

      if (!user2Answer || !user1Answer) continue;

      if (Array.isArray(user2Answer)) {
        if (Array.isArray(user1Answer)) {
          const hasOverlap = user2Answer.some(val => user1Answer.includes(val));
          if (!hasOverlap) {
            return { passed: false, reason: `Dealbreaker on question ${questionId} (reverse)` };
          }
        }
      } else {
        if (user2Answer !== user1Answer) {
          const flexibleQuestions = ['11.1', '11.2', '11.3'];
          if (!flexibleQuestions.includes(questionId)) {
            return { passed: false, reason: `Dealbreaker on question ${questionId} (reverse)` };
          }
        }
      }
    }
  }

  return { passed: true };
}

/**
 * STEP 3: Calculate Compatibility Score
 * Uses weighted scoring by category as specified in documentation
 */
function calculateCompatibilityScore(user1: UserProfile, user2: UserProfile): {
  score: number;
  breakdown: Record<string, number>;
} {
  const categoryScores: Record<string, { score: number; weight: number }> = {
    "Relationship Psychology": { score: 0, weight: 0 },
    "Values & Life Goals": { score: 0, weight: 0 },
    "Lifestyle Compatibility": { score: 0, weight: 0 },
    "Attraction & Preferences": { score: 0, weight: 0 },
    "Life Logistics": { score: 0, weight: 0 },
  };

  // Process each question in the questionnaire
  parallelQuestionnaire.forEach(section => {
    section.questions.forEach(question => {
      // Only score questions with "Compatibility Score" tag and weight > 0
      if (!question.tags.includes("Compatibility Score") || question.weight === 0) {
        return;
      }

      const user1Answer = user1.answers[question.id];
      const user2Answer = user2.answers[question.id];

      // Skip if either answer is missing
      if (user1Answer === undefined || user2Answer === undefined) {
        return;
      }

      const category = question.category;
      const questionWeight = question.weight;

      // Calculate question score based on answer type
      let questionScore = 0;

      if (Array.isArray(user1Answer) && Array.isArray(user2Answer)) {
        // Multi-select: score based on overlap
        const overlap = user1Answer.filter(val => user2Answer.includes(val));
        const union = [...new Set([...user1Answer, ...user2Answer])];
        questionScore = union.length > 0 ? (overlap.length / union.length) * 100 : 0;
      } else if (user1Answer === user2Answer) {
        // Perfect match
        questionScore = 100;
      } else {
        // Different answers - give partial credit based on question type
        questionScore = calculatePartialCredit(question.id, user1Answer, user2Answer);
      }

      // Add weighted score to category
      categoryScores[category].score += questionScore * questionWeight;
      categoryScores[category].weight += questionWeight;
    });
  });

  // Calculate final score using category weights
  let finalScore = 0;
  const breakdown: Record<string, number> = {};

  Object.keys(categoryScores).forEach(category => {
    const { score, weight } = categoryScores[category];
    const categoryAverage = weight > 0 ? score / weight : 0;
    breakdown[category] = Math.round(categoryAverage);
    
    const categoryWeight = CATEGORY_WEIGHTS[category as keyof typeof CATEGORY_WEIGHTS];
    finalScore += categoryAverage * categoryWeight;
  });

  return {
    score: Math.round(finalScore),
    breakdown,
  };
}

/**
 * Calculate partial credit for non-matching answers
 */
function calculatePartialCredit(questionId: string, answer1: any, answer2: any): number {
  // Attachment style (7.1) - Secure is compatible with everyone
  if (questionId === '7.1') {
    if (answer1.includes('Secure') || answer2.includes('Secure')) {
      return 70; // Secure attachment is generally compatible
    }
    return 30;
  }

  // Political views (6.1, 12.1) - Adjacent views get partial credit
  if (questionId === '6.1' || questionId === '12.1') {
    const politicalScale = ['Very liberal', 'Liberal', 'Moderate', 'Conservative', 'Very conservative', 'Apolitical'];
    const idx1 = politicalScale.indexOf(answer1);
    const idx2 = politicalScale.indexOf(answer2);
    if (idx1 !== -1 && idx2 !== -1) {
      const distance = Math.abs(idx1 - idx2);
      if (distance === 1) return 50; // Adjacent views
      if (distance === 2) return 25; // Two steps apart
    }
    return 0;
  }

  // Sleep schedule (3.5) - Adjacent schedules get partial credit
  if (questionId === '3.5') {
    const sleepScale = ['Strong morning person', 'Slight morning person', 'Balanced', 'Slight night owl', 'Strong night owl'];
    const idx1 = sleepScale.indexOf(answer1);
    const idx2 = sleepScale.indexOf(answer2);
    if (idx1 !== -1 && idx2 !== -1) {
      const distance = Math.abs(idx1 - idx2);
      if (distance === 1) return 60;
      if (distance === 2) return 30;
    }
    return 0;
  }

  // Children (8.2) - Some flexibility
  if (questionId === '8.2') {
    const yesAnswers = ['Definitely yes', 'Probably yes'];
    const noAnswers = ['Definitely not', 'Probably not'];
    const maybeAnswers = ['Maybe — if my partner strongly wants them', 'Unsure'];
    
    const bothYes = yesAnswers.includes(answer1) && yesAnswers.includes(answer2);
    const bothNo = noAnswers.includes(answer1) && noAnswers.includes(answer2);
    const oneMaybe = maybeAnswers.includes(answer1) || maybeAnswers.includes(answer2);
    
    if (bothYes || bothNo) return 70; // Same direction
    if (oneMaybe) return 40; // One is flexible
    return 10; // Opposing views
  }

  // Default: no partial credit for mismatched answers
  return 0;
}

/**
 * STEP 4: Apply Attachment Style Penalty
 * If Anxious + Avoidant pairing, subtract 5%
 */
function applyAttachmentPenalty(user1: UserProfile, user2: UserProfile, score: number): {
  finalScore: number;
  penaltyApplied: boolean;
} {
  const user1Attachment = user1.answers['7.1'];
  const user2Attachment = user2.answers['7.1'];

  if (!user1Attachment || !user2Attachment) {
    return { finalScore: score, penaltyApplied: false };
  }

  const isAnxious = (answer: string) => answer.includes('Anxious');
  const isAvoidant = (answer: string) => answer.includes('Avoidant') && !answer.includes('Fearful');

  const anxiousAvoidantPair =
    (isAnxious(user1Attachment) && isAvoidant(user2Attachment)) ||
    (isAvoidant(user1Attachment) && isAnxious(user2Attachment));

  if (anxiousAvoidantPair) {
    const penalty = score * ATTACHMENT_PENALTY.anxiousAvoidantPenalty;
    return {
      finalScore: Math.round(score - penalty),
      penaltyApplied: true,
    };
  }

  return { finalScore: score, penaltyApplied: false };
}

/**
 * Main function to calculate compatibility between two users
 */
export function calculateParallelCompatibility(
  user1: UserProfile,
  user2: UserProfile
): CompatibilityResult {
  // Step 1: Check hard filters
  const hardFiltersCheck = checkHardFilters(user1, user2);
  if (!hardFiltersCheck.passed) {
    return {
      compatible: false,
      score: 0,
      breakdown: {
        "Relationship Psychology": 0,
        "Values & Life Goals": 0,
        "Lifestyle Compatibility": 0,
        "Attraction & Preferences": 0,
        "Life Logistics": 0,
      },
      blockingReason: hardFiltersCheck.reason,
    };
  }

  // Step 2: Check dealbreakers
  const dealbreakersCheck = checkDealbreakers(user1, user2);
  if (!dealbreakersCheck.passed) {
    return {
      compatible: false,
      score: 0,
      breakdown: {
        "Relationship Psychology": 0,
        "Values & Life Goals": 0,
        "Lifestyle Compatibility": 0,
        "Attraction & Preferences": 0,
        "Life Logistics": 0,
      },
      blockingReason: dealbreakersCheck.reason,
    };
  }

  // Step 3: Calculate compatibility score
  const { score, breakdown } = calculateCompatibilityScore(user1, user2);

  // Step 4: Apply attachment penalty
  const { finalScore, penaltyApplied } = applyAttachmentPenalty(user1, user2, score);

  return {
    compatible: true,
    score: finalScore,
    breakdown: breakdown as CompatibilityResult['breakdown'],
    attachmentPenaltyApplied: penaltyApplied,
  };
}

/**
 * Find all compatible matches for a user
 */
export function findParallelMatches(
  currentUser: UserProfile,
  allUsers: UserProfile[],
  minScore: number = 40
): Array<{ user: UserProfile; compatibility: CompatibilityResult }> {
  const matches: Array<{ user: UserProfile; compatibility: CompatibilityResult }> = [];

  allUsers.forEach(otherUser => {
    // Don't match with yourself
    if (otherUser.id === currentUser.id) return;

    const compatibility = calculateParallelCompatibility(currentUser, otherUser);

    // Only include if compatible and above minimum score
    if (compatibility.compatible && compatibility.score >= minScore) {
      matches.push({ user: otherUser, compatibility });
    }
  });

  // Sort by compatibility score (highest first)
  return matches.sort((a, b) => b.compatibility.score - a.compatibility.score);
}
// Single source of truth for pass feedback chip definitions.
// The `category` field maps directly to a feedback-processor Category column
// so the backend never needs its own chip-ID → category lookup.
// When chips are added or renamed here, the backend automatically handles them
// because categories (not IDs) are stored in pass_reason_categories.
export const PASS_REASONS = [
  { id: 'not_physically_attracted',        label: 'Not physically attracted',           category: 'attraction_preferences'      },
  { id: 'too_far_away',                     label: 'Too far away',                       category: 'life_logistics'               },
  { id: 'different_kids_family_views',      label: 'Different views on kids or family',  category: 'values_life_goals'            },
  { id: 'different_relationship_timeline',  label: 'Different relationship timeline',    category: 'values_life_goals'            },
  { id: 'different_core_values',            label: 'Different core values or beliefs',   category: 'values_life_goals'            },
  { id: 'emotionally_unavailable',          label: 'Seemed emotionally unavailable',     category: 'attachment_emotional_health'  },
  { id: 'different_emotional_needs',        label: 'Different emotional needs',          category: 'attachment_emotional_health'  },
  { id: 'communication_style_mismatch',     label: 'Different communication style',      category: 'communication_conflict'       },
  { id: 'different_social_energy',          label: 'Different social energy',            category: 'lifestyle_compatibility'      },
  { id: 'different_daily_habits',           label: 'Different daily habits or lifestyle', category: 'lifestyle_compatibility'     },
  { id: 'no_in_person_connection',          label: "We've met in person — no connection", category: 'attraction_preferences'      },
] as const;

export type PassReasonId = typeof PASS_REASONS[number]['id'];
export type PassReasonCategory = typeof PASS_REASONS[number]['category'];

// Map from ID → category for fast lookup in the submission handler.
export const PASS_REASON_CATEGORY_MAP: Record<string, string> = Object.fromEntries(
  PASS_REASONS.map(r => [r.id, r.category])
);

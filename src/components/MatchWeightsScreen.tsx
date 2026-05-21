import { useState, useEffect } from 'react';
import { ChevronLeft, Info } from 'lucide-react';
import { EDGE_FUNCTION_URL, ONBOARDING_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';

interface MatchWeightsScreenProps {
  onComplete: () => void;
  onBack?: () => void;
  isOnboarding?: boolean;
}

const TOTAL_TOKENS = 40;

const CATEGORIES = [
  {
    key: 'attachment_emotional_health',
    label: 'Attachment & Emotional Health',
    defaultTokens: 8,
    researchNote: 'The #1 predictor of relationship quality across 40+ years of research — more predictive than shared values, interests, or attraction.',
  },
  {
    key: 'communication_conflict',
    label: 'Communication & Conflict',
    defaultTokens: 6,
    researchNote: "Gottman's research identified how couples fight — not what they fight about — as the primary predictor of divorce.",
  },
  {
    key: 'values_life_goals',
    label: 'Values & Life Goals',
    defaultTokens: 7,
    researchNote: 'Misalignment on children, marriage, and core values is among the top reasons couples separate — even when everything else aligns.',
  },
  {
    key: 'relationship_psychology',
    label: 'Relationship Psychology',
    defaultTokens: 6,
    researchNote: 'How you think about love, trust, and vulnerability — your internal relationship model — predicts long-term compatibility more reliably than shared interests.',
  },
  {
    key: 'lifestyle_compatibility',
    label: 'Lifestyle Compatibility',
    defaultTokens: 5,
    researchNote: 'Daily-life fit — how social you are, how you spend free time, activity levels — shapes whether a relationship feels easy or exhausting day to day.',
  },
  {
    key: 'attraction_preferences',
    label: 'Attraction',
    defaultTokens: 4,
    researchNote: 'Physical and intimate compatibility matters — but attraction is highly subjective. Mismatches here are less predictive of failure than psychological or values gaps.',
  },
  {
    key: 'life_logistics',
    label: 'Life Logistics',
    defaultTokens: 2,
    researchNote: 'Distance, finances, and practical life factors matter — but they tend to be more negotiable than values or emotional patterns.',
  },
  {
    key: 'intimacy_connection',
    label: 'Connection Style',
    defaultTokens: 2,
    researchNote: 'How you connect emotionally and physically. Alignment helps — but couples adapt here more successfully than in psychological or values dimensions.',
  },
];

export function MatchWeightsScreen({ onComplete, onBack, isOnboarding = false }: MatchWeightsScreenProps) {
  const [tokens, setTokens] = useState<Record<string, number>>(
    Object.fromEntries(CATEGORIES.map(c => [c.key, c.defaultTokens]))
  );
  const [activeHelper, setActiveHelper] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const usedTokens = Object.values(tokens).reduce((a, b) => a + b, 0);
  const remaining = TOTAL_TOKENS - usedTokens;

  useEffect(() => {
    const load = async () => {
      const accessToken = await getAccessToken();
      if (!accessToken) { setIsLoading(false); return; }
      try {
        const res = await fetch(`${ONBOARDING_FUNCTION_URL}/user/category-weights`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'apikey': publicAnonKey },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.weights) {
            const weights = data.weights as Record<string, number>;
            const storedTotal = Object.values(weights).reduce((a, b) => a + b, 0);
            if (storedTotal > 0 && storedTotal !== TOTAL_TOKENS) {
              const scale = TOTAL_TOKENS / storedTotal;
              const scaled: Record<string, number> = Object.fromEntries(
                Object.entries(weights).map(([k, v]) => [k, Math.max(1, Math.round(v * scale))])
              );
              const scaledTotal = Object.values(scaled).reduce((a, b) => a + b, 0);
              const drift = TOTAL_TOKENS - scaledTotal;
              if (drift !== 0) {
                const [largestKey] = Object.entries(scaled).sort((a, b) => b[1] - a[1])[0];
                scaled[largestKey] = scaled[largestKey] + drift;
              }
              setTokens(scaled);
            } else {
              setTokens(weights);
            }
          }
        }
      } catch {}
      setIsLoading(false);
    };
    load();
  }, []);

  const adjust = (key: string, delta: number) => {
    const current = tokens[key];
    const next = current + delta;
    if (next < 1) return;
    if (delta > 0 && remaining <= 0) return;
    setTokens(prev => ({ ...prev, [key]: next }));
  };

  const handleSave = async () => {
    if (remaining !== 0) return;
    setIsSaving(true);
    const accessToken = await getAccessToken();
    if (accessToken) {
      try {
        await fetch(`${ONBOARDING_FUNCTION_URL}/user/category-weights`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': publicAnonKey,
          },
          body: JSON.stringify(tokens),
        });
      } catch {}
    }
    setIsSaving(false);
    onComplete();
  };

  if (isLoading) {
    return (
      <div className="h-full bg-parallel-cream flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-parallel-void border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full bg-parallel-cream flex flex-col">
      {/* Header */}
      <div className="pt-4 px-6 pb-2 flex-shrink-0 flex items-center justify-between">
        {onBack ? (
          <button onClick={onBack} aria-label="Go back" className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        ) : <div className="w-8" />}
        <div />
      </div>

      <div className="flex-1 px-6 pb-6 overflow-y-auto">
        {/* Title */}
        <div className="mb-6 mt-4">
          <h1 className="text-2xl font-bold mb-2">What matters most to you?</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Distribute 40 tokens across these categories to tell us what to weight most when finding your matches. You can always change this later.
          </p>
        </div>

        {/* Research note */}
        <div className="mb-4 bg-gray-50 rounded-2xl px-4 py-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            These weights are based on relationship longevity research. Adjust them if your priorities differ.
          </p>
        </div>

        {/* Feedback adapts weights — shown after onboarding */}
        {!isOnboarding && (
          <div className="mb-6 bg-gray-50 rounded-2xl px-4 py-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              <span className="font-medium text-gray-700">These adapt over time.</span> When you pass and say why, we shift what we look for — prioritizing dimensions where you've seen consistent misalignment.
            </p>
          </div>
        )}

        {/* Token counter */}
        <div className={`mb-6 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl ${remaining === 0 ? 'bg-parallel-purple text-parallel-cream' : 'bg-gray-100 text-gray-600'} transition-colors`}>
          <span className="text-sm font-medium">
            {remaining === 0 ? `✓ All ${TOTAL_TOKENS} tokens allocated` : `${remaining} token${remaining !== 1 ? 's' : ''} remaining`}
          </span>
        </div>

        {/* Category rows */}
        <div className="space-y-3">
          {CATEGORIES.map(cat => (
            <div key={cat.key} className="border-2 border-gray-100 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900 leading-tight">{cat.label}</span>
                  <button
                    onClick={() => setActiveHelper(activeHelper === cat.key ? null : cat.key)}
                    className="flex-shrink-0 text-gray-500 hover:text-gray-600 transition-colors"
                  >
                    <Info size={14} />
                  </button>
                </div>
                {/* Token controls */}
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <button
                    onClick={() => adjust(cat.key, -1)}
                    disabled={tokens[cat.key] <= 1}
                    className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 font-medium hover:border-parallel-void transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-bold text-lg">{tokens[cat.key]}</span>
                  <button
                    onClick={() => adjust(cat.key, 1)}
                    disabled={remaining <= 0}
                    className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 font-medium hover:border-parallel-void transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
              </div>
              {/* Proportional token bar — fills relative to TOTAL_TOKENS */}
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-parallel-void rounded-full transition-all"
                  style={{ width: `${(tokens[cat.key] / TOTAL_TOKENS) * 100}%` }}
                />
              </div>
              {/* Research note inline */}
              {activeHelper === cat.key && (
                <p className="mt-3 text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-3">
                  {cat.researchNote}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="flex-shrink-0 bg-parallel-cream border-t border-gray-100 py-3 px-4">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleSave}
            disabled={remaining !== 0 || isSaving}
            className="w-full bg-parallel-purple text-parallel-cream py-4 rounded-full font-semibold text-base hover:bg-parallel-purple/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : isOnboarding ? 'Set my preferences →' : 'Save preferences'}
          </button>
          {isOnboarding && (
            <button onClick={async () => {
              // Save default weights before skipping so the backend has them explicitly
              const accessToken = await getAccessToken();
              if (accessToken) {
                try {
                  await fetch(`${ONBOARDING_FUNCTION_URL}/user/category-weights`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': publicAnonKey },
                    body: JSON.stringify(tokens),
                  });
                } catch {}
              }
              onComplete();
            }} className="w-full text-center text-sm text-gray-500 mt-3 hover:text-gray-600 transition-colors">
              Skip — use defaults
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
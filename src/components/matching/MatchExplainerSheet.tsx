import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { MATCHES_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { getAccessToken } from '../../utils/auth';
import type { Match } from '../../types';

interface Props {
  match: Match;
  onClose: () => void;
}

// Normalise any breakdown key format to a display-friendly label.
// Handles both legacy 8-category keys ("Values & Beliefs") and
// the 5-category snake_case keys ("values_life_goals").
function toDisplayLabel(key: string): string {
  const map: Record<string, string> = {
    values_life_goals:           'Values & Life Goals',
    relationship_psychology:     'Relationship Psychology',
    lifestyle_compatibility:     'Lifestyle Compatibility',
    attraction_preferences:      'Attraction & Preferences',
    life_logistics:              'Life Logistics',
    attachment_emotional_health: 'Attachment & Emotional Health',
    communication_conflict:      'Communication & Conflict',
    intimacy_connection:         'Connection Style',
  };
  return map[key] ?? key;
}

export function MatchExplainerSheet({ match, onClose }: Props) {
  const [headline, setHeadline] = useState<string | null>(null);
  const [headlineLoading, setHeadlineLoading] = useState(true);

  const { user, compatibilityScore, matchDetails } = match;
  const breakdown = (matchDetails?.breakdown ?? {}) as Record<string, number>;
  const whyYouMatched = matchDetails?.whyYouMatched ?? [];
  const potentialDifferences = matchDetails?.potentialDifferences ?? [];
  const sharedHobbies = matchDetails?.sharedHobbies ?? [];

  // Sorted breakdown entries for the bar chart — skip zero/missing
  const breakdownEntries = Object.entries(breakdown)
    .filter(([, v]) => typeof v === 'number' && (v as number) > 0)
    .sort(([, a], [, b]) => (b as number) - (a as number));

  // Score ring math (r=30, circumference≈188.4)
  const CIRC = 188.4;
  const dashOffset = CIRC * (1 - compatibilityScore / 100);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token || cancelled) { setHeadlineLoading(false); return; }
        const res = await fetch(
          `${MATCHES_FUNCTION_URL}/explainer?matchId=${encodeURIComponent(user.id)}`,
          { headers: { Authorization: `Bearer ${token}`, apikey: publicAnonKey }, signal: controller.signal }
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.headline) setHeadline(data.headline);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        /* other failures degrade silently */
      }
      if (!cancelled) setHeadlineLoading(false);
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [user.id]);

  return (
    <>
      <div
        className="fixed inset-0 bg-parallel-void/45 z-[75]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 left-0 right-0 bg-parallel-cream rounded-t-3xl z-[80] max-h-[88%] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="explainer-sheet-title"
      >
        {/* Handle */}
        <div className="w-9 h-1 bg-[#E8E4DE] rounded-full mx-auto mt-2.5 flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-0 flex-shrink-0">
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[11px] font-bold text-[#7B5EA7] tracking-wide">
                P<span className="font-black">//</span>
              </span>
              <span className="text-[11px] font-semibold text-[#7B5EA7] uppercase tracking-wide">
                Why you match
              </span>
            </div>
            <h3 id="explainer-sheet-title" className="text-xl font-bold text-[#0D0D0F] leading-tight">
              You &amp; {user.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-[#E8E4DE] flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0"
          >
            <X size={14} className="text-[#8A8690]" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 pt-5 pb-8 space-y-5">

          {/* Score ring + headline */}
          <div className="flex items-center gap-4">
            {/* Ring */}
            <div className="relative w-[72px] h-[72px] flex-shrink-0">
              <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="36" cy="36" r="30" fill="none" stroke="#E8E4DE" strokeWidth="6" />
                <circle
                  cx="36" cy="36" r="30"
                  fill="none"
                  stroke="#7B5EA7"
                  strokeWidth="6"
                  strokeDasharray={CIRC}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[18px] font-extrabold text-[#0D0D0F] leading-none">{compatibilityScore}</span>
                <span className="text-[9px] text-[#8A8690] mt-0.5">match</span>
              </div>
            </div>

            {/* Headline */}
            <div className="flex-1 min-w-0">
              {headlineLoading ? (
                <div className="space-y-2">
                  <div className="h-3.5 bg-[#E8E4DE] rounded-full animate-pulse w-4/5" />
                  <div className="h-3.5 bg-[#E8E4DE] rounded-full animate-pulse w-3/5" />
                </div>
              ) : headline ? (
                <>
                  <p className="text-sm font-semibold text-[#0D0D0F] leading-snug">{headline}</p>
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[9px] font-semibold text-[#A98FD0] bg-[#F0EBF8] rounded px-1.5 py-0.5">
                    ✦ Written by Parallel AI
                  </span>
                </>
              ) : (
                <p className="text-sm text-[#8A8690] leading-snug">
                  Strong compatibility across multiple areas.
                </p>
              )}
            </div>
          </div>

          {/* Breakdown bars */}
          {breakdownEntries.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#8A8690] mb-3">Score breakdown</p>
              <div className="space-y-2.5">
                {breakdownEntries.map(([key, score]) => (
                  <div key={key}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs text-[#0D0D0F]">{toDisplayLabel(key)}</span>
                      <span className="text-xs font-bold text-[#0D0D0F]">{score}</span>
                    </div>
                    <div className="h-1.5 bg-[#E8E4DE] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#7B5EA7]"
                        style={{ width: `${score}%`, opacity: score >= 80 ? 1 : score >= 60 ? 0.7 : 0.45 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Why you matched */}
          {whyYouMatched.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#8A8690] mb-3">Why you matched</p>
              <div className="space-y-2.5">
                {whyYouMatched.map((reason, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-4 h-4 rounded-full bg-[#F0EBF8] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[8px] text-[#7B5EA7] font-bold">✦</span>
                    </div>
                    <p className="text-sm text-[#0D0D0F] leading-snug">{reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shared hobbies */}
          {sharedHobbies.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#8A8690] mb-3">Things you have in common</p>
              <div className="flex flex-wrap gap-2">
                {sharedHobbies.map((h, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full bg-white border border-[#E8E4DE] text-xs text-[#0D0D0F]">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Things to talk about */}
          {potentialDifferences.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#8A8690] mb-3">Things to talk about</p>
              <div className="space-y-2">
                {potentialDifferences.map((diff, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#8A8690] flex-shrink-0 mt-1.5" />
                    <p className="text-xs text-[#8A8690] leading-relaxed">{diff}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

import { useState } from 'react';
import { X } from 'lucide-react';
import { MATCHES_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { getAccessToken } from '../../utils/auth';

const FADE_REASONS = [
  { id: 'values_felt_off',              label: "Values didn't align" },
  { id: 'lifestyle_mismatch',           label: 'Lifestyle mismatch' },
  { id: 'not_physical_type',            label: 'Not the right physical fit' },
  { id: 'too_far_away',                 label: 'Too far away' },
  { id: 'attachment_style_concern',     label: 'Different emotional style' },
  { id: 'communication_style_felt_off', label: 'Communication felt off' },
  { id: 'life_stage_mismatch',          label: 'Different life stage' },
  { id: 'just_not_feeling_it',          label: 'Just not feeling it' },
];

const FADE_ADJUST = [
  { id: 'more_similar_values',  label: 'More similar values' },
  { id: 'closer_location',      label: 'Closer location' },
  { id: 'different_lifestyle',  label: 'Different lifestyle' },
  { id: 'stronger_physical',    label: 'Stronger physical attraction' },
  { id: 'different_life_stage', label: 'Different life stage' },
];

interface Props {
  matchId: string;
  triggerType: 'unmatch' | 'conversation_death_14d';
  onClose: () => void;
}

export function RecoverySignalSheet({ matchId, triggerType, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [selectedAdjust, setSelectedAdjust] = useState<string[]>([]);

  const toggleReason = (id: string) =>
    setSelectedReasons(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });

  const toggleAdjust = (id: string) =>
    setSelectedAdjust(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const chipClass = (selected: boolean) =>
    `px-3 py-1.5 rounded-full border transition-all text-sm ${
      selected
        ? 'bg-parallel-void text-parallel-cream border-parallel-void'
        : 'bg-parallel-cream text-gray-700 border-gray-300 hover:border-gray-400'
    }`;

  const handleSubmit = async () => {
    onClose();
    const token = await getAccessToken();
    if (!token) return;
    fetch(`${MATCHES_FUNCTION_URL}/recovery-signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': publicAnonKey,
      },
      body: JSON.stringify({
        matchedUserId: matchId,
        triggerType,
        reasons: selectedReasons,
        wouldAdjust: selectedAdjust,
      }),
    }).catch(err => console.error('Recovery signal failed:', err));
  };

  const subtitle =
    triggerType === 'unmatch'
      ? 'This helps us improve your future matches.'
      : 'Optional — helps us show you better matches.';

  return (
    <>
      <div
        className="fixed inset-0 bg-parallel-void/40 z-[75]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 left-0 right-0 bg-parallel-cream rounded-t-3xl z-[80] max-h-[80vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-sheet-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h3 id="recovery-sheet-title" className="text-base font-semibold">
              {step === 1 ? "What didn't work?" : 'What would you adjust?'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {step === 1 && (
            <div className="flex flex-wrap gap-2">
              {FADE_REASONS.map(r => (
                <button
                  key={r.id}
                  onClick={() => toggleReason(r.id)}
                  aria-pressed={selectedReasons.includes(r.id)}
                  className={chipClass(selectedReasons.includes(r.id))}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="flex flex-wrap gap-2">
              {FADE_ADJUST.map(a => (
                <button
                  key={a.id}
                  onClick={() => toggleAdjust(a.id)}
                  aria-pressed={selectedAdjust.includes(a.id)}
                  className={chipClass(selectedAdjust.includes(a.id))}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex-shrink-0 pb-8 flex gap-2">
          {step === 1 ? (
            <>
              <button
                onClick={() => setStep(2)}
                className="flex-1 px-4 py-3 rounded-full bg-parallel-void text-parallel-cream font-medium hover:bg-parallel-void/90 transition-all text-sm"
              >
                Next
              </button>
              <button
                onClick={onClose}
                className="px-4 py-3 rounded-full text-gray-500 hover:bg-gray-100 transition-all text-sm"
              >
                Skip
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-3 rounded-full bg-parallel-void text-parallel-cream font-medium hover:bg-parallel-void/90 transition-all text-sm"
              >
                Done
              </button>
              <button
                onClick={() => setStep(1)}
                className="px-4 py-3 rounded-full text-gray-500 hover:bg-gray-100 transition-all text-sm"
              >
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useModalA11y } from '../utils/useModalA11y';

interface PassFeedbackBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (passReasons: string[], wouldAdjust: string[]) => void;
  onNavigateToQuestionnaire?: () => void;
}

const PASS_REASONS = [
  { id: 'values_felt_off',             label: "Values didn't align",          category: 'values_life_goals' },
  { id: 'lifestyle_mismatch',          label: 'Lifestyle mismatch',           category: 'lifestyle_compatibility' },
  { id: 'not_physical_type',           label: 'Not the right physical fit',   category: 'attraction_preferences' },
  { id: 'too_far_away',                label: 'Too far away',                 category: 'life_logistics' },
  { id: 'attachment_style_concern',    label: 'Different emotional style',    category: 'attachment_emotional_health' },
  { id: 'communication_style_felt_off',label: 'Communication felt off',       category: 'communication_conflict' },
  { id: 'life_stage_mismatch',         label: 'Different life stage',         category: 'life_logistics' },
  { id: 'just_not_feeling_it',         label: 'Just not feeling it',          category: null },
];

const WOULD_ADJUST = [
  { id: 'more_similar_values',       label: 'More similar values' },
  { id: 'closer_location',           label: 'Closer location' },
  { id: 'different_lifestyle',       label: 'Different lifestyle' },
  { id: 'stronger_physical',         label: 'Stronger physical attraction' },
  { id: 'different_life_stage',      label: 'Different life stage' },
];

export function PassFeedbackBottomSheet({ isOpen, onClose, onSubmit }: PassFeedbackBottomSheetProps) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [selectedAdjust, setSelectedAdjust] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedReasons([]);
      setSelectedAdjust([]);
    }
  }, [isOpen]);

  useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  const toggle = (id: string, list: string[], setter: (v: string[]) => void) =>
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const handleSubmit = () => onSubmit(selectedReasons, selectedAdjust);

  const chipClass = (selected: boolean) =>
    `px-4 py-2 rounded-full border-2 transition-all text-sm ${
      selected
        ? 'bg-parallel-void text-parallel-cream border-parallel-void'
        : 'bg-parallel-cream text-gray-700 border-gray-300 hover:border-gray-400'
    }`;

  return (
    <>
      <div
        className="fixed inset-0 bg-parallel-void/40 z-[65]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="fixed bottom-0 left-0 right-0 bg-parallel-cream rounded-t-3xl z-[70] max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-feedback-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1">
            <h3 id="pass-feedback-title" className="text-lg font-semibold">Why are you passing?</h3>
            <p className="text-sm text-gray-500 mt-0.5">Select all that apply</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-6">
          {/* Pass reasons */}
          <div className="flex flex-wrap gap-2">
            {PASS_REASONS.map(r => (
              <button
                key={r.id}
                onClick={() => toggle(r.id, selectedReasons, setSelectedReasons)}
                aria-pressed={selectedReasons.includes(r.id)}
                className={chipClass(selectedReasons.includes(r.id))}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Would adjust */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">What would you change about future matches?</p>
            <div className="flex flex-wrap gap-2">
              {WOULD_ADJUST.map(a => (
                <button
                  key={a.id}
                  onClick={() => toggle(a.id, selectedAdjust, setSelectedAdjust)}
                  aria-pressed={selectedAdjust.includes(a.id)}
                  className={chipClass(selectedAdjust.includes(a.id))}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex-shrink-0 pb-8">
          <button
            onClick={handleSubmit}
            className="w-full px-6 py-3 rounded-full bg-parallel-void text-parallel-cream font-medium hover:bg-parallel-void/90 transition-all mb-2"
          >
            Pass on this match
          </button>
          <button onClick={onClose} className="w-full text-gray-500 px-6 py-3 rounded-full hover:bg-gray-100 transition-all text-sm">
            Skip
          </button>
        </div>
      </div>
    </>
  );
}

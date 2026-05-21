import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useModalA11y } from '../utils/useModalA11y';
import { PASS_REASONS } from '../data/passFeedbackReasons';

interface PassFeedbackBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (passReasons: string[], wouldAdjust: string[]) => void;
  onNavigateToQuestionnaire?: () => void;
}


export function PassFeedbackBottomSheet({ isOpen, onClose, onSubmit }: PassFeedbackBottomSheetProps) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) setSelectedReasons([]);
  }, [isOpen]);

  useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  const toggle = (id: string, list: string[], setter: (v: string[]) => void) =>
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const handleSubmit = () => onSubmit(selectedReasons, []);

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

        <div className="flex-1 overflow-y-auto p-4 min-h-0">
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
        </div>

        <div className="p-4 border-t border-gray-200 flex-shrink-0 pb-8">
          <p className="text-xs text-center text-gray-400 mb-3 leading-snug">
            Every answer teaches us more about what you're looking for — the more you share, the better your matches get.
          </p>
          <button
            onClick={handleSubmit}
            className="w-full px-6 py-3 rounded-full bg-parallel-void text-parallel-cream font-medium hover:bg-parallel-void/90 transition-all"
          >
            Pass on this match
          </button>
        </div>
      </div>
    </>
  );
}

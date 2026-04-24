import { X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface PassFeedbackBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (passReasons: string[], wouldAdjust: string[]) => void;
  onNavigateToQuestionnaire?: () => void;
}

const PASS_REASONS = [
  { id: 'not_physical_type', label: 'Not my physical type' },
  { id: 'too_far_away', label: 'Too far away' },
  { id: 'different_life_stage', label: 'Different life stage' },
  { id: 'career_lifestyle_mismatch', label: 'Career or lifestyle mismatch' },
  { id: 'values_felt_off', label: 'Values felt off' },
  { id: 'not_feeling_it', label: 'Just not feeling it' },
  { id: 'age_range', label: 'Outside my age range' },
  { id: 'different_goals', label: 'Not looking for the same thing' },
  { id: 'location', label: "Location doesn't work for me" },
  { id: 'religion_mismatch', label: 'Different religious beliefs' },
  { id: 'politics_mismatch', label: 'Different political views' },
];

export function PassFeedbackBottomSheet({ isOpen, onClose, onSubmit, onNavigateToQuestionnaire }: PassFeedbackBottomSheetProps) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) setSelectedReasons([]);
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleReason = (id: string) =>
    setSelectedReasons(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);

  const handleSubmit = () => onSubmit(selectedReasons, []);
  const ageRangeSelected = selectedReasons.includes('age_range');

  return (
    <>
      {/* Backdrop — z-[65] so it sits above bottom nav (z-[60]) but below sheet (z-[70]) */}
      <div className="fixed inset-0 bg-black/40 z-[65]" onClick={onClose} />

      {/* Sheet — z-[70] so it's always above bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[70] max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Why did you pass?</h3>
            <p className="text-sm text-gray-500 mt-0.5">Select all that apply</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable reasons */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="flex flex-wrap gap-2">
            {PASS_REASONS.map(reason => (
              <button
                key={reason.id}
                onClick={() => toggleReason(reason.id)}
                className={`px-4 py-2 rounded-full border-2 transition-all text-sm ${
                  selectedReasons.includes(reason.id)
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                {reason.label}
              </button>
            ))}
          </div>

          {/* Questionnaire nudge */}
          {ageRangeSelected && onNavigateToQuestionnaire && (
            <button onClick={onNavigateToQuestionnaire} className="mt-4 w-full text-left p-4 bg-black text-white rounded-2xl">
              <p className="text-sm font-semibold">Update your age preferences</p>
              <p className="text-sm text-gray-300 mt-0.5">Adjust the age range in your questionnaire →</p>
            </button>
          )}
          {!ageRangeSelected && onNavigateToQuestionnaire && (
            <button onClick={onNavigateToQuestionnaire} className="mt-6 w-full text-left p-4 bg-gray-50 rounded-2xl border-2 border-gray-100 hover:border-gray-300 transition-colors">
              <p className="text-sm font-medium text-gray-900">Want to refine what you're looking for?</p>
              <p className="text-sm text-gray-500 mt-0.5">Update your questionnaire →</p>
            </button>
          )}
        </div>

        {/* Actions — fixed to bottom of sheet, above bottom nav */}
        <div className="p-4 border-t border-gray-200 flex-shrink-0 pb-8">
          <button
            onClick={handleSubmit}
            disabled={selectedReasons.length === 0}
            className={`w-full px-6 py-3 rounded-full transition-all font-medium mb-2 ${
              selectedReasons.length > 0
                ? 'bg-black text-white hover:bg-gray-800'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {selectedReasons.length > 0 ? `Submit (${selectedReasons.length} selected)` : 'Select a reason to submit'}
          </button>
          <button onClick={onClose} className="w-full text-gray-500 px-6 py-3 rounded-full hover:bg-gray-100 transition-all text-sm">
            Skip
          </button>
        </div>
      </div>
    </>
  );
}
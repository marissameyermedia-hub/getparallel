import { X } from 'lucide-react';
import { useState } from 'react';
import { useModalA11y } from '../utils/useModalA11y';

interface NPSBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (score: number, reason: string) => void;
}

export function NPSBottomSheet({ isOpen, onClose, onSubmit }: NPSBottomSheetProps) {
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Hook handles Escape-to-close, body-scroll-lock, focus restore.
  // Safe to call on every render — the effect inside is guarded by `isOpen`.
  useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (selectedScore === null) return;

    setIsSubmitting(true);
    try {
      await onSubmit(selectedScore, reason);
      // Reset form
      setSelectedScore(null);
      setReason('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    setSelectedScore(null);
    setReason('');
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-parallel-void/40 z-40"
        onClick={handleSkip}
        aria-hidden="true"
      />

      {/* Bottom Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-parallel-cream rounded-t-3xl z-50 max-h-[85vh] overflow-hidden animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nps-title"
      >
        <div className="flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex-1">
              <h3 id="nps-title" className="text-lg font-semibold">Quick question</h3>
              <p className="text-sm text-gray-600 mt-0.5">Your feedback helps us improve.</p>
            </div>
            <button
              onClick={handleSkip}
              aria-label="Close"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* NPS Question */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                How likely are you to recommend Parallel to a friend?
              </h4>

              {/* 0-10 Scale */}
              <div className="space-y-2">
                <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label="Likelihood, 0 not likely to 10 very likely">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                    <button
                      key={score}
                      onClick={() => setSelectedScore(score)}
                      role="radio"
                      aria-checked={selectedScore === score}
                      aria-label={`${score}`}
                      className={`aspect-square rounded-lg border-2 transition-all text-sm font-medium ${
                        selectedScore === score
                          ? 'bg-parallel-purple text-parallel-cream border-parallel-void'
                          : 'bg-parallel-cream text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Not likely</span>
                  <span>Very likely</span>
                </div>
              </div>
            </div>

            {/* Optional Reason */}
            <div>
              <label htmlFor="nps-reason" className="text-sm font-medium text-gray-900 mb-2 block">
                What's the main reason? (optional)
              </label>
              <textarea
                id="nps-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Your feedback helps us improve..."
                rows={3}
                className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors resize-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-gray-200 space-y-2">
            <button
              onClick={handleSubmit}
              disabled={selectedScore === null || isSubmitting}
              className={`w-full px-6 py-3 rounded-full transition-all font-medium ${
                selectedScore !== null && !isSubmitting
                  ? 'bg-parallel-purple text-parallel-cream hover:bg-parallel-purple/90'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
            <button
              onClick={handleSkip}
              disabled={isSubmitting}
              className="w-full text-gray-600 px-6 py-3 rounded-full hover:bg-gray-100 transition-all disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

import { useState } from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '../../utils/useModalA11y';

interface PostDateSafetyCheckProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  matchName: string;
  onSubmit: (feedback: SafetyFeedback) => void;
}

export interface SafetyFeedback {
  matchId: string;
  feltSafe: boolean;
  boundariesRespected: boolean;
  anythingMisleading: boolean;
  concernDetails?: string;
}

export function PostDateSafetyCheck({ 
  isOpen, 
  onClose, 
  matchId,
  matchName,
  onSubmit 
}: PostDateSafetyCheckProps) {
  const [feltSafe, setFeltSafe] = useState<boolean | null>(null);
  const [boundariesRespected, setBoundariesRespected] = useState<boolean | null>(null);
  const [anythingMisleading, setAnythingMisleading] = useState<boolean | null>(null);
  const [concernDetails, setConcernDetails] = useState('');
  const [showConcernField, setShowConcernField] = useState(false);

  // Wire Escape-to-close + body-scroll-lock + focus restore.
  useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (feltSafe === null || boundariesRespected === null || anythingMisleading === null) {
      return;
    }

    onSubmit({
      matchId,
      feltSafe,
      boundariesRespected,
      anythingMisleading,
      concernDetails: concernDetails.trim() || undefined
    });

    // Reset and close
    setFeltSafe(null);
    setBoundariesRespected(null);
    setAnythingMisleading(null);
    setConcernDetails('');
    setShowConcernField(false);
    onClose();
  };

  const hasAnyConcerns = feltSafe === false || boundariesRespected === false || anythingMisleading === true;

  return (
    <div
      className="fixed inset-0 bg-parallel-void/60 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-date-safety-title"
    >
      <div className="bg-parallel-cream rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-parallel-cream border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 id="post-date-safety-title" className="text-xl font-semibold">Post-Date Safety Check</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Your date with: <span className="font-medium text-parallel-void">{matchName}</span>
            </p>
            <p className="text-sm text-gray-600">
              This feedback is completely confidential and helps us maintain a safe community. Your answers will contribute to an internal safety score.
            </p>
          </div>

          {/* Question 1: Felt Safe */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-900">
              Did you feel safe during your date?
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setFeltSafe(true);
                  if (boundariesRespected !== false && anythingMisleading !== true) {
                    setShowConcernField(false);
                  }
                }}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                  feltSafe === true
                    ? 'border-parallel-void bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => {
                  setFeltSafe(false);
                  setShowConcernField(true);
                }}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                  feltSafe === false
                    ? 'border-parallel-void bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                No
              </button>
            </div>
          </div>

          {/* Question 2: Boundaries Respected */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-900">
              Were your boundaries respected?
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setBoundariesRespected(true);
                  if (feltSafe !== false && anythingMisleading !== true) {
                    setShowConcernField(false);
                  }
                }}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                  boundariesRespected === true
                    ? 'border-parallel-void bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => {
                  setBoundariesRespected(false);
                  setShowConcernField(true);
                }}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                  boundariesRespected === false
                    ? 'border-parallel-void bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                No
              </button>
            </div>
          </div>

          {/* Question 3: Misleading Information */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-900">
              Was anything significantly misleading about their profile?
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setAnythingMisleading(false);
                  if (feltSafe !== false && boundariesRespected !== false) {
                    setShowConcernField(false);
                  }
                }}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                  anythingMisleading === false
                    ? 'border-parallel-void bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                No
              </button>
              <button
                onClick={() => {
                  setAnythingMisleading(true);
                  setShowConcernField(true);
                }}
                className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                  anythingMisleading === true
                    ? 'border-parallel-void bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                Yes
              </button>
            </div>
          </div>

          {/* Additional Details (shown if any concerns) */}
          {showConcernField && hasAnyConcerns && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-900">
                Please provide additional details (optional)
              </label>
              <textarea
                value={concernDetails}
                onChange={(e) => setConcernDetails(e.target.value)}
                placeholder="Share any concerns or specific details that would help us understand what happened..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-parallel-purple resize-none text-sm"
              />
            </div>
          )}

          {/* Warning for safety concerns */}
          {hasAnyConcerns && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800 font-medium mb-1">
                Your feedback will trigger a review
              </p>
              <p className="text-sm text-amber-700">
                Our Trust & Safety team will review this case to ensure community safety. If you need to make a formal report, you can do so from the user's profile or message thread.
              </p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={feltSafe === null || boundariesRespected === null || anythingMisleading === null}
            className="w-full py-3 bg-parallel-purple text-parallel-cream rounded-lg font-medium hover:bg-parallel-purple/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Submit Feedback
          </button>

          <p className="text-xs text-gray-500 text-center">
            This feedback is confidential and helps us protect the community
          </p>
        </div>
      </div>
    </div>
  );
}

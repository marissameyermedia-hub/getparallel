import { X, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useModalA11y } from '../utils/useModalA11y';

interface DateReviewScreenProps {
  isOpen: boolean;
  onClose: () => void;
  matchName: string;
  matchId: string;
  onSubmit: (review: DateReview) => void;
}

export interface DateReview {
  matchId: string;
  wouldGoAgain: boolean | null;
  chemistryRating: number | null;
  conversationRating: number | null;
  respectfulnessRating: number | null;
  reasons: string[];
  workedWell: string[];
  wouldChangeFuture: string[];
  isSafetyIssue: boolean;
}

const NEGATIVE_REASONS = [
  { id: 'no_chemistry',          label: 'No chemistry',                       dimension: 'attraction_style' },
  { id: 'conversation_didnt_flow', label: "Conversation didn't flow",         dimension: 'communication_style' },
  { id: 'communication_mismatch', label: 'Communication style mismatch',      dimension: 'communication_style' },
  { id: 'values_clear',          label: 'Different values became clear',      dimension: 'values_worldview' },
  { id: 'lifestyle_clear',       label: 'Lifestyle mismatch became clear',    dimension: 'lifestyle_social' },
  { id: 'timeline_mismatch',     label: 'Timeline or intent mismatch',        dimension: 'relationship_intent' },
  { id: 'kids_mismatch',         label: 'Kids or family mismatch',            dimension: 'kids_family_plan' },
  { id: 'distance_logistics',    label: 'Distance or logistics too hard',     dimension: 'distance_location' },
  { id: 'career_ambition',       label: 'Career ambition mismatch',           dimension: 'career_ambition' },
  { id: 'money_habits',          label: 'Money habits mismatch',              dimension: 'money_finance' },
  { id: 'cleanliness_home',      label: 'Cleanliness or home style mismatch', dimension: 'lifestyle_social' },
  { id: 'misrepresented',        label: 'Misrepresented photos or info',      dimension: 'profile_quality' },
  { id: 'felt_unsafe',           label: 'Felt unsafe or inappropriate',       dimension: 'safety', isSafety: true },
];

const POSITIVE_SIGNALS = [
  { id: 'chemistry_strong',      label: 'Chemistry was strong' },
  { id: 'conversation_natural',  label: 'Conversation flowed naturally' },
  { id: 'values_aligned',        label: 'Values aligned in person' },
  { id: 'lifestyle_matched',     label: 'Lifestyle felt compatible' },
  { id: 'timing_right',          label: 'Timing felt right' },
];

const WOULD_CHANGE_FUTURE = [
  { id: 'more_similar_values',   label: 'More similar values' },
  { id: 'closer_location',       label: 'Closer location' },
  { id: 'different_lifestyle',   label: 'Different lifestyle' },
  { id: 'stronger_physical',     label: 'Stronger physical attraction' },
  { id: 'different_life_stage',  label: 'Different life stage' },
];

export function DateReviewScreen({ isOpen, onClose, matchName, matchId, onSubmit }: DateReviewScreenProps) {
  const [wouldGoAgain, setWouldGoAgain] = useState<boolean | null>(null);
  const [chemistryRating, setChemistryRating] = useState<number | null>(null);
  const [conversationRating, setConversationRating] = useState<number | null>(null);
  const [respectfulnessRating, setRespectfulnessRating] = useState<number | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [selectedWorkedWell, setSelectedWorkedWell] = useState<string[]>([]);
  const [selectedWouldChange, setSelectedWouldChange] = useState<string[]>([]);
  const [showSafetyWarning, setShowSafetyWarning] = useState(false);

  useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  const toggleNegative = (reasonId: string) => {
    const reason = NEGATIVE_REASONS.find(r => r.id === reasonId);
    if (reason?.isSafety) {
      if (!selectedReasons.includes(reasonId)) {
        setShowSafetyWarning(true);
        setSelectedReasons([...selectedReasons, reasonId]);
      } else {
        setSelectedReasons(selectedReasons.filter(id => id !== reasonId));
        setShowSafetyWarning(false);
      }
    } else {
      setSelectedReasons(prev =>
        prev.includes(reasonId) ? prev.filter(id => id !== reasonId) : [...prev, reasonId]
      );
    }
  };

  const toggleWorkedWell = (id: string) =>
    setSelectedWorkedWell(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleWouldChange = (id: string) =>
    setSelectedWouldChange(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSubmit = () => {
    onSubmit({
      matchId,
      wouldGoAgain,
      chemistryRating,
      conversationRating,
      respectfulnessRating,
      reasons: selectedReasons,
      workedWell: selectedWorkedWell,
      wouldChangeFuture: selectedWouldChange,
      isSafetyIssue: selectedReasons.includes('felt_unsafe'),
    });
    setWouldGoAgain(null);
    setChemistryRating(null);
    setConversationRating(null);
    setRespectfulnessRating(null);
    setSelectedReasons([]);
    setSelectedWorkedWell([]);
    setSelectedWouldChange([]);
    setShowSafetyWarning(false);
    onClose();
  };

  const canSubmit =
    wouldGoAgain !== null &&
    chemistryRating !== null &&
    conversationRating !== null &&
    respectfulnessRating !== null;

  const chipClass = (selected: boolean, safety = false) =>
    `px-4 py-2 rounded-full border-2 transition-all text-sm ${
      selected
        ? safety
          ? 'bg-red-600 text-parallel-cream border-red-600'
          : 'bg-parallel-purple text-parallel-cream border-parallel-void'
        : 'bg-parallel-cream text-gray-700 border-gray-300 hover:border-gray-400'
    }`;

  const RatingStars = ({
    rating,
    onChange,
    label,
    idPrefix,
  }: {
    rating: number | null;
    onChange: (val: number) => void;
    label: string;
    idPrefix: string;
  }) => (
    <div className="space-y-2">
      <span id={`${idPrefix}-label`} className="text-sm font-medium text-gray-900 block">{label}</span>
      <div className="flex gap-2" role="radiogroup" aria-labelledby={`${idPrefix}-label`}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} of 5`}
            className={`w-12 h-12 rounded-full border-2 transition-all ${
              rating !== null && value <= rating
                ? 'bg-parallel-purple text-parallel-cream border-parallel-void'
                : 'bg-parallel-cream text-gray-500 border-gray-300 hover:border-gray-400'
            }`}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-parallel-void/50 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="date-review-title"
    >
      <div className="bg-parallel-cream rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 id="date-review-title" className="text-xl font-medium">How was your date?</h2>
            <p className="text-sm text-gray-600 mt-1">with {matchName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Would you go out again? */}
          <div className="space-y-2">
            <span id="would-go-again-label" className="text-sm font-medium text-gray-900 block">Would you go out again?</span>
            <div className="flex gap-3" role="radiogroup" aria-labelledby="would-go-again-label">
              <button
                onClick={() => setWouldGoAgain(true)}
                role="radio"
                aria-checked={wouldGoAgain === true}
                className={`flex-1 px-6 py-3 rounded-full border-2 transition-all ${
                  wouldGoAgain === true
                    ? 'bg-parallel-purple text-parallel-cream border-parallel-void'
                    : 'bg-parallel-cream text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => setWouldGoAgain(false)}
                role="radio"
                aria-checked={wouldGoAgain === false}
                className={`flex-1 px-6 py-3 rounded-full border-2 transition-all ${
                  wouldGoAgain === false
                    ? 'bg-parallel-purple text-parallel-cream border-parallel-void'
                    : 'bg-parallel-cream text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                No
              </button>
            </div>
          </div>

          <RatingStars rating={chemistryRating}      onChange={setChemistryRating}      label="Chemistry rating"      idPrefix="chemistry" />
          <RatingStars rating={conversationRating}   onChange={setConversationRating}   label="Conversation rating"   idPrefix="conversation" />
          <RatingStars rating={respectfulnessRating} onChange={setRespectfulnessRating} label="Respectfulness rating" idPrefix="respectfulness" />

          {/* Positive signals — shown when going again */}
          {wouldGoAgain === true && (
            <div className="space-y-3 pt-4 border-t border-gray-200">
              <span className="text-sm font-medium text-gray-900 block">What made this match work? <span className="text-gray-500 font-normal">(Optional)</span></span>
              <div className="flex flex-wrap gap-2">
                {POSITIVE_SIGNALS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => toggleWorkedWell(s.id)}
                    aria-pressed={selectedWorkedWell.includes(s.id)}
                    className={chipClass(selectedWorkedWell.includes(s.id))}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Negative reasons — shown when not going again */}
          {wouldGoAgain === false && (
            <div className="space-y-3 pt-4 border-t border-gray-200">
              <span className="text-sm font-medium text-gray-900 block">What went wrong? <span className="text-gray-500 font-normal">(Optional)</span></span>
              <div className="flex flex-wrap gap-2">
                {NEGATIVE_REASONS.map(r => (
                  <button
                    key={r.id}
                    onClick={() => toggleNegative(r.id)}
                    aria-pressed={selectedReasons.includes(r.id)}
                    className={chipClass(selectedReasons.includes(r.id), r.isSafety)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {showSafetyWarning && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mt-4" role="alert">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-red-900 mb-1">Safety Concern Reported</p>
                      <p className="text-sm text-red-800">Your report will be immediately reviewed by our safety team. This user may be suspended pending investigation.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Would change future — shown after an answer is given */}
          {wouldGoAgain !== null && (
            <div className="space-y-3 pt-4 border-t border-gray-200">
              <span className="text-sm font-medium text-gray-900 block">What would you change about future matches? <span className="text-gray-500 font-normal">(Optional)</span></span>
              <div className="flex flex-wrap gap-2">
                {WOULD_CHANGE_FUTURE.map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggleWouldChange(c.id)}
                    aria-pressed={selectedWouldChange.includes(c.id)}
                    className={chipClass(selectedWouldChange.includes(c.id))}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Privacy Notice */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-600 text-center">
              Your feedback is private and will never be shown to {matchName}. It only helps improve your future matches.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full px-6 py-3 rounded-full transition-all ${
              canSubmit
                ? 'bg-parallel-purple text-parallel-cream hover:bg-parallel-purple/90'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            Submit Review
          </button>
        </div>
      </div>
    </div>
  );
}

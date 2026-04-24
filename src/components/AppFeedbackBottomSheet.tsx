import { X, Star } from 'lucide-react';
import { useState } from 'react';

interface AppFeedbackBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedbackType: string, rating: number | null, message: string) => void;
}

const FEEDBACK_TYPES = [
  { value: 'bug_report', label: 'Bug report' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'match_quality', label: 'Match quality' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'payment', label: 'Payment' },
  { value: 'general', label: 'General' },
];

export function AppFeedbackBottomSheet({ isOpen, onClose, onSubmit }: AppFeedbackBottomSheetProps) {
  const [feedbackType, setFeedbackType] = useState<string>('general');
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!message.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(feedbackType, rating, message);
      // Reset form
      setFeedbackType('general');
      setRating(null);
      setMessage('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFeedbackType('general');
    setRating(null);
    setMessage('');
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 z-40"
        onClick={handleClose}
      />

      {/* Bottom Sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[85vh] overflow-hidden animate-slide-up">
        <div className="flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex-1">
              <h3 className="text-lg font-semibold">Send Feedback</h3>
              <p className="text-sm text-gray-600 mt-0.5">Help us improve Parallel</p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Feedback Type Dropdown */}
            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">
                What's this about?
              </label>
              <select
                value={feedbackType}
                onChange={(e) => setFeedbackType(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-black focus:outline-none transition-colors"
              >
                {FEEDBACK_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Optional Star Rating */}
            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">
                Rate your experience (optional)
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(rating === star ? null : star)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        rating && star <= rating
                          ? 'fill-black stroke-black'
                          : 'fill-none stroke-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Message Text Area */}
            <div>
              <label className="text-sm font-medium text-gray-900 mb-2 block">
                Your feedback
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what's on your mind..."
                rows={6}
                className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-black focus:outline-none transition-colors resize-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-gray-200 space-y-2">
            <button
              onClick={handleSubmit}
              disabled={!message.trim() || isSubmitting}
              className={`w-full px-6 py-3 rounded-full transition-all font-medium ${
                message.trim() && !isSubmitting
                  ? 'bg-black text-white hover:bg-gray-800'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? 'Sending...' : 'Send Feedback'}
            </button>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="w-full text-gray-600 px-6 py-3 rounded-full hover:bg-gray-100 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

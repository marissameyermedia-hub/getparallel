import { useState } from 'react';
import { X, AlertTriangle, Upload, Check } from 'lucide-react';

interface ReportFlowProps {
  isOpen: boolean;
  onClose: () => void;
  reportedUserId: string;
  reportedUserName: string;
  context: 'profile' | 'chat' | 'post-date';
  onSubmit: (report: ReportData) => void;
}

export interface ReportData {
  reportedUserId: string;
  category: string;
  description: string;
  screenshots: File[];
  feelsUnsafe: boolean;
  context: 'profile' | 'chat' | 'post-date';
}

const REPORT_CATEGORIES = {
  profile: [
    'Inappropriate photos or content',
    'Fake profile or impersonation',
    'Scam or solicitation',
    'Underage user',
    'Other'
  ],
  chat: [
    'Harassment or bullying',
    'Sexual or inappropriate messages',
    'Threatening language',
    'Spam or solicitation',
    'Other'
  ],
  'post-date': [
    'Disrespectful behavior',
    'Boundary violations',
    'Pressured or coerced behavior',
    'Felt physically unsafe',
    'Misleading profile information',
    'Other'
  ]
};

export function ReportFlow({ 
  isOpen, 
  onClose, 
  reportedUserId, 
  reportedUserName,
  context,
  onSubmit 
}: ReportFlowProps) {
  const [step, setStep] = useState<'category' | 'details' | 'confirmation'>('category');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [feelsUnsafe, setFeelsUnsafe] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).slice(0, 3); // Max 3 files
      setScreenshots(files);
    }
  };

  const handleSubmit = () => {
    onSubmit({
      reportedUserId,
      category,
      description,
      screenshots,
      feelsUnsafe,
      context
    });
    setStep('confirmation');
  };

  const handleClose = () => {
    setStep('category');
    setCategory('');
    setDescription('');
    setScreenshots([]);
    setFeelsUnsafe(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {step === 'confirmation' ? 'Report Submitted' : 'Report User'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1: Category Selection */}
        {step === 'category' && (
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Reporting: <span className="font-medium text-black">{reportedUserName}</span>
              </p>
              <p className="text-sm text-gray-600">
                Your report is confidential and will be reviewed by our Trust & Safety team within 24-48 hours.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-900">
                What happened?
              </label>
              {REPORT_CATEGORIES[context].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                    category === cat
                      ? 'border-black bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-sm">{cat}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep('details')}
              disabled={!category}
              className="w-full py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Details and Evidence */}
        {step === 'details' && (
          <div className="p-6 space-y-6">
            <button
              onClick={() => setStep('category')}
              className="text-sm text-gray-600 hover:text-black"
            >
              ← Back
            </button>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">Selected issue:</p>
              <p className="text-sm text-gray-600">{category}</p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-900">
                Please describe what happened
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide as much detail as possible. Include dates, times, and specific behaviors if relevant."
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black resize-none text-sm"
              />
              <p className="text-xs text-gray-500">
                {description.length}/1000 characters
              </p>
            </div>

            {/* Screenshot Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-900">
                Screenshots (optional, up to 3)
              </label>
              <label className="block w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Upload className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600">
                  Click to upload images
                </p>
              </label>
              {screenshots.length > 0 && (
                <div className="space-y-2">
                  {screenshots.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4" />
                      {file.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Safety Indicator */}
            <div className="border-2 border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className={`w-5 h-5 mt-0.5 ${feelsUnsafe ? 'text-red-600' : 'text-gray-400'}`} />
                <div className="flex-1 space-y-2">
                  <label className="block text-sm font-medium text-gray-900">
                    Do you feel physically unsafe?
                  </label>
                  <p className="text-xs text-gray-600">
                    Reports marked as unsafe are automatically flagged as high priority for immediate review.
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setFeelsUnsafe(true)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        feelsUnsafe
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Yes, I feel unsafe
                    </button>
                    <button
                      onClick={() => setFeelsUnsafe(false)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        !feelsUnsafe
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {feelsUnsafe && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 font-medium mb-2">
                  If you are in immediate danger:
                </p>
                <p className="text-sm text-red-700">
                  Please contact local emergency services immediately. Parallel does not replace emergency response.
                </p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!description.trim() || description.length > 1000}
              className="w-full py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Submit Report
            </button>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 'confirmation' && (
          <div className="p-6 space-y-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-green-600" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Report Submitted</h3>
              <p className="text-sm text-gray-600">
                Thank you for helping keep Parallel safe. Your report has been received and will be reviewed by our Trust & Safety team.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-left">
              <p className="text-sm font-medium text-gray-900">What happens next?</p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Our team will review your report within 24-48 hours</li>
                <li>We'll investigate using conversation history and evidence</li>
                <li>Appropriate action will be taken if violations are confirmed</li>
                <li>All reports are confidential</li>
              </ul>
            </div>

            {feelsUnsafe && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                <p className="text-sm text-red-800 font-medium mb-1">
                  High Priority Review
                </p>
                <p className="text-sm text-red-700">
                  Your report has been flagged as high priority due to safety concerns and will be reviewed immediately.
                </p>
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

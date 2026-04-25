import { useState } from 'react';
import { 
  ArrowLeft, 
  AlertTriangle, 
  MessageSquare, 
  FileText,
  Clock,
  User,
  Shield
} from 'lucide-react';
import { SafetyCase } from './AdminDashboard';

interface AdminCaseDetailProps {
  case: SafetyCase;
  onBack: () => void;
  onUpdateCase: (updatedCase: SafetyCase) => void;
  accessToken: string | null;
}

const TIER_DESCRIPTIONS = {
  1: {
    title: 'Tier 1: Minor Conduct Issues',
    description: 'Rudeness, misleading profile details, minor policy violations',
    actions: ['Monitoring', 'Warning', 'Profile review required']
  },
  2: {
    title: 'Tier 2: Boundary Violations',
    description: 'Harassment, sexual pressure, repeated inappropriate behavior',
    actions: ['Temporary suspension', 'Mandatory response required', 'Account review']
  },
  3: {
    title: 'Tier 3: Severe Safety Concerns',
    description: 'Threats, stalking, coercion, violence, or criminal behavior',
    actions: ['Immediate suspension', 'Permanent removal', 'Senior review escalation']
  }
};

const MOCK_CHAT_HISTORY = [
  { sender: 'accused', message: 'Hey! Thanks for matching with me 😊', timestamp: '2:15 PM' },
  { sender: 'reporter', message: 'Hi! How are you?', timestamp: '2:18 PM' },
  { sender: 'accused', message: 'Better now that I\'m talking to you', timestamp: '2:20 PM' },
  { sender: 'accused', message: 'You\'re really beautiful', timestamp: '2:21 PM' },
  { sender: 'reporter', message: 'Thank you! So tell me about yourself', timestamp: '2:25 PM' },
];

const MOCK_PRIOR_REPORTS = [
  {
    id: '1',
    date: '2026-02-15',
    category: 'Harassment',
    resolution: 'Warning issued',
    severity: 'Tier 1'
  },
  {
    id: '2',
    date: '2026-01-28',
    category: 'Inappropriate messages',
    resolution: 'Dismissed - insufficient evidence',
    severity: 'Tier 2'
  }
];

export function AdminCaseDetail({ 
  case: caseData, 
  onBack, 
  onUpdateCase,
  accessToken 
}: AdminCaseDetailProps) {
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [internalNotes, setInternalNotes] = useState('');
  const [responseToUser, setResponseToUser] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleTakeAction = () => {
    if (!selectedAction) return;

    // Update case based on action
    let updatedCase = { ...caseData };
    
    switch (selectedAction) {
      case 'warning':
        updatedCase.status = 'resolved';
        break;
      case 'temp-suspend':
        updatedCase.status = 'under-review';
        break;
      case 'request-response':
        updatedCase.status = 'under-review';
        break;
      case 'permanent-ban':
        updatedCase.status = 'resolved';
        break;
      case 'dismiss':
        updatedCase.status = 'resolved';
        break;
      case 'escalate':
        updatedCase.status = 'escalated';
        updatedCase.priority = 'critical';
        break;
    }

    onUpdateCase(updatedCase);
    setShowConfirmation(true);
  };

  if (showConfirmation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Action Taken</h2>
          <p className="text-sm text-gray-600 mb-6">
            Case {caseData.caseNumber} has been updated. The appropriate notifications have been sent.
          </p>
          <button
            onClick={onBack}
            className="w-full py-3 bg-black text-primary rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold font-mono">{caseData.caseNumber}</h1>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  caseData.priority === 'critical' ? 'bg-red-100 text-red-800' :
                  caseData.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                  caseData.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {caseData.priority.toUpperCase()} PRIORITY
                </span>
                {caseData.feelsUnsafe && (
                  <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    USER FEELS UNSAFE
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">
                Submitted {new Date(caseData.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Report Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4">Report Details</h2>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Category</p>
                  <p className="text-sm text-gray-900">{caseData.category}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Context</p>
                  <p className="text-sm text-gray-900 capitalize">{caseData.context}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Reporter's Statement</p>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="text-sm text-gray-900">{caseData.description}</p>
                  </div>
                </div>

                {caseData.screenshots.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Evidence Submitted</p>
                    <div className="flex gap-2">
                      {caseData.screenshots.map((_, idx) => (
                        <div key={idx} className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center">
                          <FileText className="w-6 h-6 text-gray-400" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Chat History */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Chat History
              </h2>
              <div className="space-y-3">
                {MOCK_CHAT_HISTORY.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.sender === 'accused' ? 'flex-row' : 'flex-row-reverse'}`}>
                    <div className={`flex-1 ${msg.sender === 'accused' ? 'text-left' : 'text-right'}`}>
                      <div className={`inline-block px-4 py-2 rounded-lg ${
                        msg.sender === 'accused' 
                          ? 'bg-gray-100 text-gray-900' 
                          : 'bg-black text-primary'
                      }`}>
                        <p className="text-sm">{msg.message}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{msg.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Prior Reports */}
            {caseData.priorReports > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Prior Reports ({caseData.priorReports})
                </h2>
                <div className="space-y-3">
                  {MOCK_PRIOR_REPORTS.map((report) => (
                    <div key={report.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{report.category}</p>
                          <p className="text-xs text-gray-600">{new Date(report.date).toLocaleDateString()}</p>
                        </div>
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {report.severity}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        Resolution: {report.resolution}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Actions & Info */}
          <div className="space-y-6">
            {/* User Info Cards */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Accused User
              </h3>
              <div className="flex items-center gap-3 mb-3">
                <img
                  src={caseData.accusedPhoto}
                  alt={caseData.accusedName}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{caseData.accusedName}</p>
                  <p className="text-xs text-gray-600">ID: {caseData.accusedId}</p>
                </div>
              </div>
              <div className="space-y-2 pt-3 border-t border-gray-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Trust Score</span>
                  <span className={`font-medium ${
                    caseData.trustScore >= 70 ? 'text-green-600' :
                    caseData.trustScore >= 50 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {caseData.trustScore}/100
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Prior Reports</span>
                  <span className="font-medium">{caseData.priorReports}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Matches</span>
                  <span className="font-medium">47</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold mb-3">Reporter</h3>
              <p className="text-sm text-gray-900">{caseData.reporterName}</p>
              <p className="text-xs text-gray-600">ID: {caseData.reporterId}</p>
            </div>

            {/* Suggested Severity Tier */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Suggested Tier {caseData.suggestedTier}
              </h3>
              <p className="text-xs font-medium text-gray-900 mb-1">
                {TIER_DESCRIPTIONS[caseData.suggestedTier].title}
              </p>
              <p className="text-xs text-gray-700 mb-3">
                {TIER_DESCRIPTIONS[caseData.suggestedTier].description}
              </p>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-900">Recommended actions:</p>
                {TIER_DESCRIPTIONS[caseData.suggestedTier].actions.map((action, idx) => (
                  <p key={idx} className="text-xs text-gray-700">• {action}</p>
                ))}
              </div>
            </div>

            {/* Moderation Actions */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold mb-3">Take Action</h3>
              <div className="space-y-2">
                {[
                  { value: 'warning', label: 'Issue Warning', color: 'border-gray-300' },
                  { value: 'temp-suspend', label: 'Temporary Suspension', color: 'border-orange-300' },
                  { value: 'request-response', label: 'Request Written Response', color: 'border-blue-300' },
                  { value: 'permanent-ban', label: 'Permanent Ban', color: 'border-red-500' },
                  { value: 'dismiss', label: 'Dismiss Report', color: 'border-gray-300' },
                  { value: 'escalate', label: 'Escalate to Senior Review', color: 'border-purple-300' },
                ].map((action) => (
                  <button
                    key={action.value}
                    onClick={() => setSelectedAction(action.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                      selectedAction === action.value
                        ? 'border-black bg-gray-50'
                        : `${action.color} hover:border-gray-400`
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Internal Notes */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold mb-3">Internal Notes</h3>
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Document your reasoning and findings..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black resize-none text-sm"
              />
            </div>

            {/* Response to User (if applicable) */}
            {selectedAction && ['warning', 'temp-suspend', 'request-response'].includes(selectedAction) && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold mb-3">Message to User</h3>
                <textarea
                  value={responseToUser}
                  onChange={(e) => setResponseToUser(e.target.value)}
                  placeholder="This message will be sent to the accused user..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black resize-none text-sm"
                />
              </div>
            )}

            {/* Submit Action */}
            <button
              onClick={handleTakeAction}
              disabled={!selectedAction || !internalNotes.trim()}
              className="w-full py-3 bg-black text-primary rounded-lg font-medium hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Submit Action
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  AlertTriangle,
  MessageSquare,
  FileText,
  Clock,
  User,
  Shield,
} from 'lucide-react';
import { SafetyCase } from './AdminDashboard';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

const ADMIN_API_URL = `https://${projectId}.supabase.co/functions/v1/admin-api`;

interface AdminCaseDetailProps {
  case: SafetyCase;
  onBack: () => void;
  onUpdateCase: (updatedCase: SafetyCase) => void;
  accessToken: string | null;
}

interface CaseDetail {
  chatHistory: Array<{ id: string; sender: 'reporter' | 'accused'; text: string; created_at: string }>;
  priorCaseHistory: Array<{ id: string; case_number: string; category: string; status: string; date: string }>;
  matchCount: number;
}

const TIER_DESCRIPTIONS = {
  1: {
    title: 'Tier 1: Minor Conduct Issues',
    description: 'Rudeness, misleading profile details, minor policy violations',
    actions: ['Monitoring', 'Warning', 'Profile review required'],
  },
  2: {
    title: 'Tier 2: Boundary Violations',
    description: 'Harassment, sexual pressure, repeated inappropriate behavior',
    actions: ['Temporary suspension', 'Mandatory response required', 'Account review'],
  },
  3: {
    title: 'Tier 3: Severe Safety Concerns',
    description: 'Threats, stalking, coercion, violence, or criminal behavior',
    actions: ['Immediate suspension', 'Permanent removal', 'Senior review escalation'],
  },
};

export function AdminCaseDetail({
  case: caseData,
  onBack,
  onUpdateCase,
  accessToken,
}: AdminCaseDetailProps) {
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [internalNotes, setInternalNotes] = useState('');
  const [responseToUser, setResponseToUser] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${ADMIN_API_URL}/safety/cases/${caseData.id}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': publicAnonKey,
      },
    })
      .then(r => r.json())
      .then(d => {
        setDetail({
          chatHistory:      d.chat_history       ?? [],
          priorCaseHistory: d.prior_case_history ?? [],
          matchCount:       d.case?.match_count  ?? 0,
        });
      })
      .catch(err => console.error('[AdminCaseDetail] failed to load detail:', err));
  }, [caseData.id, accessToken]);

  const handleTakeAction = async () => {
    if (!selectedAction || !internalNotes.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`${ADMIN_API_URL}/safety/cases/${caseData.id}/action`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': publicAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action:          selectedAction,
          internal_notes:  internalNotes,
          message_to_user: responseToUser || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `HTTP ${res.status}`);
      }

      const updatedCase = { ...caseData };
      switch (selectedAction) {
        case 'warning':          updatedCase.status = 'resolved';     break;
        case 'temp-suspend':     updatedCase.status = 'under-review'; break;
        case 'request-response': updatedCase.status = 'under-review'; break;
        case 'permanent-ban':    updatedCase.status = 'resolved';     break;
        case 'dismiss':          updatedCase.status = 'resolved';     break;
        case 'escalate':
          updatedCase.status   = 'escalated';
          updatedCase.priority = 'critical';
          break;
      }
      onUpdateCase(updatedCase);
      setShowConfirmation(true);
    } catch (e: any) {
      setSubmitError(e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showConfirmation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-parallel-cream rounded-lg border border-gray-200 p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Action Taken</h2>
          <p className="text-sm text-gray-600 mb-6">
            Case {caseData.caseNumber} has been updated and the action has been logged.
          </p>
          <button
            onClick={onBack}
            className="w-full py-3 bg-parallel-purple text-parallel-cream rounded-lg font-medium hover:bg-parallel-purple/90 transition-colors"
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
      <div className="bg-parallel-cream border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={onBack}
              aria-label="Back to dashboard"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-xl font-bold font-mono">{caseData.caseNumber}</h1>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  caseData.priority === 'critical' ? 'bg-red-100 text-red-800' :
                  caseData.priority === 'high'     ? 'bg-orange-100 text-orange-800' :
                  caseData.priority === 'medium'   ? 'bg-yellow-100 text-yellow-800' :
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
          {/* Main Content — Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Report Details */}
            <div className="bg-parallel-cream rounded-lg border border-gray-200 p-6">
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
                    <p className="text-sm text-gray-900">{caseData.description || '(no statement provided)'}</p>
                  </div>
                </div>
                {caseData.screenshots.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Evidence Submitted</p>
                    <div className="flex gap-2">
                      {caseData.screenshots.map((_, idx) => (
                        <div key={idx} className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center">
                          <FileText className="w-6 h-6 text-gray-500" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Chat History */}
            <div className="bg-parallel-cream rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Chat History
              </h2>
              {!detail ? (
                <div className="space-y-3 animate-pulse">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? '' : 'justify-end'}`}>
                      <div className="h-10 w-48 bg-gray-100 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : detail.chatHistory.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No messages between these users</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {detail.chatHistory.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.sender === 'accused' ? 'flex-row' : 'flex-row-reverse'}`}>
                      <div className={`flex-1 ${msg.sender === 'accused' ? 'text-left' : 'text-right'}`}>
                        <div className={`inline-block px-4 py-2 rounded-lg max-w-xs ${
                          msg.sender === 'accused'
                            ? 'bg-gray-100 text-gray-900'
                            : 'bg-parallel-purple text-parallel-cream'
                        }`}>
                          <p className="text-sm">{msg.text}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Prior Reports */}
            {(detail?.priorCaseHistory.length ?? 0) > 0 && (
              <div className="bg-parallel-cream rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Prior Reports ({detail!.priorCaseHistory.length})
                </h2>
                <div className="space-y-3">
                  {detail!.priorCaseHistory.map((report) => (
                    <div key={report.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{report.category}</p>
                          <p className="text-xs text-gray-600">{new Date(report.date).toLocaleDateString()}</p>
                        </div>
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium capitalize">
                          {report.status.replace('-', ' ')}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-gray-500">{report.case_number}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column — Actions & Info */}
          <div className="space-y-6">
            {/* Accused User */}
            <div className="bg-parallel-cream rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Accused User
              </h3>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-parallel-purple/15 flex items-center justify-center flex-shrink-0">
                  <span className="text-parallel-purple font-semibold text-lg">
                    {caseData.accusedName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{caseData.accusedName}</p>
                  <p className="text-xs text-gray-600 font-mono truncate">{caseData.accusedId}</p>
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
                  <span className="font-medium">{detail ? detail.matchCount : '—'}</span>
                </div>
              </div>
            </div>

            {/* Reporter */}
            <div className="bg-parallel-cream rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold mb-3">Reporter</h3>
              <p className="text-sm text-gray-900">{caseData.reporterName}</p>
              <p className="text-xs text-gray-600 font-mono">{caseData.reporterId}</p>
            </div>

            {/* Suggested Tier */}
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
            <div className="bg-parallel-cream rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold mb-3">Take Action</h3>
              <div className="space-y-2">
                {[
                  { value: 'warning',          label: 'Issue Warning',             color: 'border-gray-300' },
                  { value: 'temp-suspend',     label: 'Temporary Suspension',      color: 'border-orange-300' },
                  { value: 'request-response', label: 'Request Written Response',  color: 'border-blue-300' },
                  { value: 'permanent-ban',    label: 'Permanent Ban',             color: 'border-red-500' },
                  { value: 'dismiss',          label: 'Dismiss Report',            color: 'border-gray-300' },
                  { value: 'escalate',         label: 'Escalate to Senior Review', color: 'border-purple-300' },
                ].map((action) => (
                  <button
                    key={action.value}
                    onClick={() => setSelectedAction(action.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                      selectedAction === action.value
                        ? 'border-parallel-void bg-gray-50'
                        : `${action.color} hover:border-gray-400`
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Internal Notes */}
            <div className="bg-parallel-cream rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold mb-3">Internal Notes</h3>
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Document your reasoning and findings..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-parallel-purple resize-none text-sm"
              />
            </div>

            {/* Message to User (optional, shown for relevant actions) */}
            {selectedAction && ['warning', 'temp-suspend', 'request-response'].includes(selectedAction) && (
              <div className="bg-parallel-cream rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold mb-3">Message to User</h3>
                <textarea
                  value={responseToUser}
                  onChange={(e) => setResponseToUser(e.target.value)}
                  placeholder="This message will be sent to the accused user..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-parallel-purple resize-none text-sm"
                />
              </div>
            )}

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <button
              onClick={handleTakeAction}
              disabled={!selectedAction || !internalNotes.trim() || isSubmitting}
              className="w-full py-3 bg-parallel-purple text-parallel-cream rounded-lg font-medium hover:bg-parallel-purple/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Submitting…' : 'Submit Action'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

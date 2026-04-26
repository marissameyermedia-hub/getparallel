import { useState, useEffect } from 'react';
import { User, FileText, ShieldCheck, CreditCard, Bell, Lock, HelpCircle, FileText as FileTextAlt, LogOut, ChevronRight, Pause, Trash2, Eye, BarChart2, Heart, ExternalLink } from 'lucide-react';
import { MatchWeightsScreen } from './MatchWeightsScreen';
import { EDGE_FUNCTION_URL, ONBOARDING_FUNCTION_URL, MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

interface AccountPageProps {
  onClose?: () => void;
  onNavigate?: (page: string) => void;
  onLogOut: () => void;
  hasActivated: boolean;
  userName?: string;
  hasVerified?: boolean;
  userAnswers?: Record<string, any>;
  totalQuestions?: number;
}

// Exit feedback reasons — used for pause, cancel, and delete
const EXIT_REASONS = [
  'I found someone on Parallel 🎉',
  'I found someone elsewhere',
  'Taking a break from dating',
  'The app wasn\'t right for me',
  'Too expensive',
  'Not enough matches in my area',
  'Other',
];

interface ExitFeedbackSheetProps {
  action: 'pause' | 'cancel' | 'delete';
  onConfirm: (foundMatch: boolean, reason: string) => void;
  onDismiss: () => void;
}

function ExitFeedbackSheet({ action, onConfirm, onDismiss }: ExitFeedbackSheetProps) {
  const [foundMatch, setFoundMatch] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string>('');

  const actionLabel = action === 'pause' ? 'Pause Profile'
    : action === 'cancel' ? 'Cancel Subscription'
    : 'Delete Account';

  const canConfirm = foundMatch !== null && reason !== '';

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end justify-center">
      <div className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-10 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Before you go</h2>
          <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 text-sm">
            Cancel
          </button>
        </div>

        {/* Did you find a match? — first and most important question */}
        <div className="mb-6">
          <p className="font-medium mb-3">Did you find a match on Parallel? 🎉</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setFoundMatch(true);
                setReason('I found someone on Parallel 🎉');
              }}
              className={`py-3 px-4 rounded-2xl border-2 text-sm font-medium transition-all ${
                foundMatch === true ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              Yes! 🎉
            </button>
            <button
              onClick={() => {
                setFoundMatch(false);
                if (reason === 'I found someone on Parallel 🎉') setReason('');
              }}
              className={`py-3 px-4 rounded-2xl border-2 text-sm font-medium transition-all ${
                foundMatch === false ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              Not yet
            </button>
          </div>
        </div>

        {/* Celebration if they found a match */}
        {foundMatch === true && (
          <div className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-200 text-center">
            <p className="text-lg font-semibold mb-1">That's amazing! 🎉</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              You're exactly why we built Parallel. Would you be open to sharing your story with us? It helps us improve the app for everyone.
            </p>
            <button
              onClick={() => setReason('I found someone on Parallel 🎉')}
              className="mt-3 text-xs text-black underline"
            >
              I'd love to share my story →
            </button>
          </div>
        )}

        {/* Reason selector — shown if they didn't find a match, or as secondary */}
        {foundMatch === false && (
          <div className="mb-6">
            <p className="font-medium mb-3">What's the main reason?</p>
            <div className="space-y-2">
              {EXIT_REASONS.filter(r => r !== 'I found someone on Parallel 🎉').map(r => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`w-full py-3 px-4 rounded-xl border-2 text-left text-sm transition-all ${
                    reason === r ? 'border-black bg-black/5 font-medium' : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirm action button */}
        <button
          onClick={() => canConfirm && onConfirm(foundMatch!, reason)}
          disabled={!canConfirm}
          className={`w-full py-4 rounded-full font-medium text-base transition-all ${
            action === 'delete'
              ? 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-40'
              : 'bg-black text-white hover:bg-gray-800 disabled:opacity-40'
          } disabled:cursor-not-allowed`}
        >
          {actionLabel}
        </button>

        <p className="text-center text-xs text-gray-400 mt-3">
          {action === 'pause' && 'Your subscription continues. Profile hidden temporarily.'}
          {action === 'cancel' && 'Access continues until the end of your billing period.'}
          {action === 'delete' && 'This is permanent and cannot be undone.'}
        </p>
      </div>
    </div>
  );
}

// Format a plan string from backend data — handles common shapes without being brittle
function formatPlanLabel(plan: string | undefined | null): string {
  if (!plan) return 'Parallel';
  const p = String(plan).toLowerCase();
  if (p.includes('annual') || p.includes('year')) return 'Parallel Annual';
  if (p.includes('month')) return 'Parallel Monthly';
  return 'Parallel';
}

// Format a date string if valid, otherwise return null
function formatBillingDate(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AccountPage({
  onClose,
  onNavigate,
  onLogOut,
  hasActivated,
  userName,
  hasVerified,
  userAnswers = {},
  totalQuestions = 55,
}: AccountPageProps) {
  const [exitFeedbackAction, setExitFeedbackAction] = useState<'pause' | 'cancel' | 'delete' | null>(null);
  const [showMatchWeights, setShowMatchWeights] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [storyText, setStoryText] = useState('');
  const [storyHowLong, setStoryHowLong] = useState('');
  const [storySubmitting, setStorySubmitting] = useState(false);
  const [storySubmitted, setStorySubmitted] = useState(false);
  // feedbackModal: null = closed, 'bug' = send feedback, 'feature' = feature request
  const [feedbackModal, setFeedbackModal] = useState<'bug' | 'feature' | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Subscription detail — gracefully hydrated if backend exposes it, hidden if not
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [isFoundingMember, setIsFoundingMember] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const answeredCount = Object.keys(userAnswers).filter(k => {
    const v = userAnswers[k];
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  }).length;

  const completionPct = Math.min(100, Math.round((answeredCount / totalQuestions) * 100));
  const isComplete = completionPct >= 100;

  // Fetch subscription + pause state on mount. Runs for ALL users (not just activated)
  // because isPaused must work for free users too.
  useEffect(() => {
    const token = localStorage.getItem('parallel_access_token');
    if (!token) return;
    fetch(`${ONBOARDING_FUNCTION_URL}/user/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': publicAnonKey,
      },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const plan = data.subscriptionPlan ?? data.subscription_plan ?? data.plan ?? null;
        const renewal = data.currentPeriodEnd ?? data.current_period_end ?? data.renewalDate ?? data.renewal_date ?? null;
        const founding = Boolean(data.isFoundingMember ?? data.is_founding_member ?? false);
        const paused = Boolean(data.isPaused ?? data.is_paused ?? false);
        if (plan) setSubscriptionPlan(plan);
        if (renewal) setRenewalDate(renewal);
        if (founding) setIsFoundingMember(true);
        setIsPaused(paused);
      })
      .catch(() => { /* network failure — keep defaults, don't trigger blank-screen overlay */ });
  }, []);

  const handleExitFeedbackConfirm = async (foundMatch: boolean, reason: string) => {
    const token = localStorage.getItem('parallel_access_token');
    const action = exitFeedbackAction;
    setExitFeedbackAction(null);

    // Save feedback to backend
    if (token) {
      try {
        await fetch(`${MISC_FUNCTION_URL}/exit-feedback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': publicAnonKey,
          },
          body: JSON.stringify({
            action_type: action,
            found_match: foundMatch,
            reason,
          }),
        });
      } catch (err) {
        console.error('Failed to save exit feedback:', err);
      }
    }

    // Proceed with the actual action
    if (action === 'pause') onNavigate?.('pause-profile');
    if (action === 'cancel') {
      // Signal PauseProfileView to open the cancel modal immediately on mount.
      // PauseProfileView is where the cancel logic actually lives — routing there, not to payment-details.
      try { sessionStorage.setItem('parallel_auto_open_cancel', '1'); } catch {}
      onNavigate?.('pause-profile');
    }
    if (action === 'delete') onNavigate?.('delete-account');
  };

  // ── Match Weights screen ─────────────────────────────────────
  if (showMatchWeights) {
    return (
      <MatchWeightsScreen
        isOnboarding={false}
        onComplete={() => setShowMatchWeights(false)}
        onBack={() => setShowMatchWeights(false)}
      />
    );
  }

  // Derived display strings for Membership card
  const membershipLine = hasActivated ? formatPlanLabel(subscriptionPlan) : 'Not yet subscribed';
  const renewalLine = hasActivated && renewalDate ? `Renews ${formatBillingDate(renewalDate)}` : null;

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Exit Feedback Sheet */}
      {exitFeedbackAction && (
        <ExitFeedbackSheet
          action={exitFeedbackAction}
          onConfirm={handleExitFeedbackConfirm}
          onDismiss={() => setExitFeedbackAction(null)}
        />
      )}

      <div className="flex-1 px-6 py-8 pb-8">
        <div className="max-w-2xl mx-auto">

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="mb-2">Account</h1>
            <p className="text-gray-600">
              {userName ? `Hi, ${userName.split(' ')[0]}` : 'Manage your profile and settings'}
            </p>
          </div>

          {/* Upgrade nudge for free users */}
          {!hasActivated && (
            <div className="bg-black text-white rounded-3xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <span className="text-2xl">🔓</span>
                <div className="flex-1">
                  <h2 className="text-white mb-1">You haven't subscribed yet</h2>
                  <p className="text-gray-300 text-sm mb-4 leading-relaxed">
                    Subscribe to see your full matches, unlock messaging, and connect with compatible people.
                  </p>
                  <button
                    onClick={() => onNavigate?.('pricing')}
                    className="w-full bg-white text-black py-3 rounded-full font-medium hover:bg-gray-100 transition-colors text-sm"
                  >
                    See plans — from $6.58/mo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Verification prominence — elevated when not verified */}
          {hasActivated && !hasVerified && (
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-3xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-white mb-1">Get verified ✓</h2>
                  <p className="text-blue-100 text-sm mb-4 leading-relaxed">
                    Add a blue checkmark to your profile. Takes about 2 minutes and builds trust with matches.
                  </p>
                  <button
                    onClick={() => onNavigate?.('verification')}
                    className="w-full bg-white text-blue-700 py-3 rounded-full font-medium hover:bg-blue-50 transition-colors text-sm"
                  >
                    Verify my identity
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Questionnaire completion card — whole card is tappable, no redundant Continue → */}
          <button className="w-full text-left bg-white border-2 border-gray-200 rounded-3xl p-5 mb-4 hover:border-gray-300 transition-colors" onClick={() => onNavigate?.('questionnaire')}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={18} className="text-gray-600" />
              <p className="font-medium text-sm">My Matching Questionnaire</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-black rounded-full transition-all"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">
                {isComplete ? '✓ Complete' : `${answeredCount} of ${totalQuestions}`}
              </span>
            </div>
            {!isComplete && (
              <p className="text-xs text-gray-400 mt-2">
                Answering more questions improves your match quality.
              </p>
            )}
          </button>

          {/* Match Preferences */}
          <button
            onClick={() => setShowMatchWeights(true)}
            className="w-full bg-gray-50 border-2 border-gray-200 rounded-3xl p-5 mb-6 hover:border-gray-300 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <BarChart2 size={20} className="text-gray-600" />
              <div className="flex-1">
                <p className="font-medium text-sm">Compatibility Priorities</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Customize what matters most in your matches
                </p>
              </div>
              <ChevronRight size={20} className="text-gray-400" />
            </div>
          </button>

          {/* Profile buttons */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Edit Profile */}
            <button
              onClick={() => onNavigate?.('my-profile')}
              className="bg-black text-white rounded-2xl p-4 hover:bg-gray-800 transition-colors text-left"
            >
              <User size={20} className="text-white mb-2" />
              <p className="text-sm font-medium text-white">Edit Profile</p>
              <p className="text-xs text-gray-400">Photos, bio, details</p>
            </button>

            {/* Preview Profile — directly on account page */}
            <button
              onClick={() => onNavigate?.('preview-profile')}
              className="bg-gray-100 rounded-2xl p-4 hover:bg-gray-200 transition-colors text-left"
            >
              <Eye size={20} className="text-gray-700 mb-2" />
              <p className="text-sm font-medium text-gray-800">Preview Profile</p>
              <p className="text-xs text-gray-500">See how you appear</p>
            </button>
          </div>

          {/* Account Info */}
          <div className="bg-white border-2 border-gray-200 rounded-3xl p-6 mb-6">
            <h3 className="mb-4 text-sm font-medium text-gray-500">Account Info</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                <User size={20} className="text-gray-600" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Name</p>
                  <p>{userName || '—'}</p>
                </div>
              </div>

              {/* Membership — now shows plan type, renewal date, and founding badge when available */}
              <div className="flex items-start gap-3 pb-4 border-b border-gray-200">
                <CreditCard size={20} className="text-gray-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Membership</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p>{membershipLine}</p>
                    {isFoundingMember && (
                      <span className="text-xs font-medium text-black bg-black/5 border border-black/10 px-2 py-0.5 rounded-full">
                        Founding member
                      </span>
                    )}
                  </div>
                  {renewalLine && (
                    <p className="text-xs text-gray-500 mt-0.5">{renewalLine}</p>
                  )}
                </div>
                {!hasActivated && (
                  <button onClick={() => onNavigate?.('pricing')} className="text-sm font-medium text-black underline mt-0.5">
                    Upgrade
                  </button>
                )}
              </div>

              <button onClick={() => onNavigate?.('payment-details')} className="w-full flex items-center gap-3 pb-4 border-b border-gray-200">
                <CreditCard size={20} className="text-gray-600" />
                <div className="flex-1 text-left">
                  <p className="text-sm text-gray-600">Payment Method</p>
                  <p className="text-sm">Manage billing</p>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
              <button onClick={() => onNavigate?.('notifications')} className="w-full flex items-center gap-3 pb-4 border-b border-gray-200">
                <Bell size={20} className="text-gray-600" />
                <div className="flex-1 text-left">
                  <p className="text-sm text-gray-600">Notifications</p>
                  <p className="text-sm">Get notified of new matches and messages</p>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* Verification — lower-weight version, shown only when already verified
              (the big unverified prompt lives above the fold now) */}
          {hasVerified && (
            <div className="bg-white border-2 border-gray-200 rounded-3xl p-6 mb-6">
              <h3 className="mb-4 text-sm font-medium text-gray-500">Verification Status</h3>
              <div className="flex items-center gap-3">
                <ShieldCheck size={20} className="text-blue-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Identity Verified ✓</p>
                  <p className="text-sm text-gray-500">
                    Your blue checkmark is live on your profile
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Support & Legal */}
          <div className="bg-white border-2 border-gray-200 rounded-3xl p-6 mb-6">
            <h3 className="mb-4 text-sm font-medium text-gray-500">Support & Legal</h3>
            <div className="space-y-1">
              <button onClick={() => onNavigate?.('help-support')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <HelpCircle size={20} className="text-gray-600" /><span className="flex-1 text-left">Help & Support</span><ChevronRight size={16} className="text-gray-400" />
              </button>
              <button onClick={() => onNavigate?.('privacy-safety')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <Lock size={20} className="text-gray-600" /><span className="flex-1 text-left">Privacy & Safety</span><ChevronRight size={16} className="text-gray-400" />
              </button>
              <button onClick={() => onNavigate?.('community-guidelines')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileTextAlt size={20} className="text-gray-600" /><span className="flex-1 text-left">Community Guidelines</span><ChevronRight size={16} className="text-gray-400" />
              </button>
              <button onClick={() => onNavigate?.('terms-service')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileTextAlt size={20} className="text-gray-600" /><span className="flex-1 text-left">Terms of Service</span><ChevronRight size={16} className="text-gray-400" />
              </button>
              <button onClick={() => onNavigate?.('privacy-policy')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileTextAlt size={20} className="text-gray-600" /><span className="flex-1 text-left">Privacy Policy</span><ChevronRight size={16} className="text-gray-400" />
              </button>
              <button onClick={() => onNavigate?.('refund-policy')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileTextAlt size={20} className="text-gray-600" /><span className="flex-1 text-left">Refund Policy</span><ChevronRight size={16} className="text-gray-400" />
              </button>
              <button onClick={() => onNavigate?.('consumer-health-data-policy')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileTextAlt size={20} className="text-gray-600" /><span className="flex-1 text-left">Consumer Health Data Policy (WA)</span><ChevronRight size={16} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* Feedback */}
          <div className="bg-white border-2 border-gray-200 rounded-3xl p-6 mb-6">
            <h3 className="mb-4 text-sm font-medium text-gray-500">Feedback</h3>
            <div className="space-y-1">
              <button onClick={() => setShowStoryModal(true)} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <Heart size={20} className="text-gray-600" />
                <div className="flex-1 text-left">
                  <p className="text-sm">Share your story</p>
                  <p className="text-xs text-gray-400 mt-0.5">Tell us how Parallel worked for you</p>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
              <button onClick={() => setFeedbackModal('bug')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileText size={20} className="text-gray-600" />
                <div className="flex-1 text-left">
                  <p className="text-sm">Send feedback</p>
                  <p className="text-xs text-gray-400 mt-0.5">Report a bug or share a thought</p>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
              <button onClick={() => setFeedbackModal('feature')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileText size={20} className="text-gray-600" />
                <div className="flex-1 text-left">
                  <p className="text-sm">Feature request</p>
                  <p className="text-xs text-gray-400 mt-0.5">Tell us what you'd like to see</p>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* Account Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-500 px-2 mb-2">Account Actions</h3>

            {/* Pause — label and description update based on current isPaused state */}
            <button
              onClick={() => setExitFeedbackAction('pause')}
              className="w-full p-4 rounded-2xl border-2 border-gray-200 hover:border-black transition-colors flex items-start gap-3"
            >
              <Pause size={20} className="text-gray-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-left">
                <p className="font-medium text-sm">{isPaused ? 'Resume My Profile' : 'Pause My Profile'}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isPaused
                    ? 'Your profile is currently hidden. Tap to make it visible again.'
                    : 'Hides your profile and pauses your subscription. Your questionnaire and matches are saved. Resume anytime.'}
                </p>
              </div>
            </button>

            {/* Cancel subscription — only shown for active subscribers */}
            {hasActivated && (
              <button
                onClick={() => setExitFeedbackAction('cancel')}
                className="w-full p-4 rounded-2xl border-2 border-gray-200 hover:border-black transition-colors flex items-start gap-3"
              >
                <CreditCard size={20} className="text-gray-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <p className="font-medium text-sm">Cancel Subscription</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Access continues until end of billing period
                  </p>
                </div>
              </button>
            )}

            <button
              onClick={onLogOut}
              className="w-full p-4 rounded-2xl border-2 border-gray-200 hover:border-black transition-colors flex items-center gap-3"
            >
              <LogOut size={20} className="text-gray-600" />
              <span className="flex-1 text-left text-sm font-medium">Log Out</span>
            </button>

            {/* Delete — with exit feedback, reassurance text */}
            <button
              onClick={() => setExitFeedbackAction('delete')}
              className="w-full p-4 rounded-2xl border-2 border-red-200 hover:border-red-500 transition-colors flex items-start gap-3 text-red-600"
            >
              <Trash2 size={20} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-left">
                <p className="font-medium text-sm">Delete Account</p>
                <p className="text-xs text-red-400 mt-0.5">
                  Permanently removes your profile and all data
                </p>
              </div>
            </button>

            {/* Reassurance line for older users anxious about being trapped */}
            <p className="text-center text-xs text-gray-400 pt-1">
              Need to leave? You can always delete your account above — we make it easy.
            </p>
          </div>

        </div>
      </div>

      {/* Share Story Modal */}
      {showStoryModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4 sm:items-center">
          <div className="bg-white rounded-3xl p-6 pb-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
            {!storySubmitted ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-semibold">Share your story</h2>
                  <button
                    onClick={() => { setShowStoryModal(false); setStoryText(''); setStoryHowLong(''); setStorySubmitted(false); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700 text-lg"
                    aria-label="Close"
                  >✕</button>
                </div>
                <p className="text-sm text-gray-500 mb-5">We'd love to hear how things went. Stories may appear on our website (anonymously unless you say otherwise).</p>
                <div className="mb-4">
                  <label className="text-xs font-medium text-gray-500 block mb-1.5">Your story</label>
                  <textarea
                    value={storyText}
                    onChange={e => setStoryText(e.target.value)}
                    placeholder="We matched on Parallel and..."
                    rows={5}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-black transition-colors"
                    style={{ fontSize: '16px' }}
                  />
                  {/* Positive framing: show minimum before they type, affirm once they pass it, nothing in between */}
                  <p className="text-xs text-gray-400 mt-1">
                    {storyText.length === 0
                      ? 'At least 10 characters — a couple of sentences is perfect.'
                      : storyText.length >= 10
                        ? '✓ Ready to submit'
                        : `\u00A0`}
                  </p>
                </div>
                <div className="mb-6">
                  <label className="text-xs font-medium text-gray-500 block mb-1.5">How long have you been together? (optional)</label>
                  <input
                    type="text"
                    value={storyHowLong}
                    onChange={e => setStoryHowLong(e.target.value)}
                    placeholder="e.g. 6 months, 1 year..."
                    className="w-full border-2 border-gray-200 rounded-full px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <div className="space-y-3">
                  <button
                    onClick={async () => {
                      if (storyText.trim().length < 10 || storySubmitting) return;
                      setStorySubmitting(true);
                      const token = localStorage.getItem('parallel_access_token');
                      if (token) {
                        try {
                          await fetch(`${MISC_FUNCTION_URL}/success/submit`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
                            body: JSON.stringify({ storyText: storyText.trim(), howLongTogether: storyHowLong.trim() || null }),
                          });
                        } catch (err) { console.error('Story submit failed:', err); }
                      }
                      setStorySubmitting(false);
                      setStorySubmitted(true);
                    }}
                    disabled={storyText.trim().length < 10 || storySubmitting}
                    className="w-full py-4 bg-black text-white rounded-full font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
                  >
                    {storySubmitting ? 'Submitting…' : 'Submit story'}
                  </button>
                  <button onClick={() => setShowStoryModal(false)} className="w-full py-4 border-2 border-gray-200 rounded-full text-sm font-medium hover:border-gray-400 transition-colors">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center py-4">
                  <div className="w-14 h-14 bg-black rounded-full flex items-center justify-center mx-auto mb-4">
                    <Heart size={24} className="text-white" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2">Thank you ❤️</h2>
                  <p className="text-sm text-gray-500 leading-relaxed">Your story means a lot. We'll review it and may feature it on our site.</p>
                </div>
                <button onClick={() => { setShowStoryModal(false); setStorySubmitted(false); setStoryText(''); setStoryHowLong(''); }} className="w-full mt-6 py-4 bg-black text-white rounded-full font-medium text-sm hover:bg-gray-800 transition-colors">
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Feedback / Feature Request Modal */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4 sm:items-center">
          <div className="bg-white rounded-3xl p-6 pb-10 sm:pb-6 w-full max-w-md">
            {!feedbackSubmitted ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">
                    {feedbackModal === 'feature' ? 'Feature request' : 'Send feedback'}
                  </h2>
                  <button
                    onClick={() => { setFeedbackModal(null); setFeedbackMessage(''); setFeedbackSubmitted(false); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700 text-lg"
                    aria-label="Close"
                  >✕</button>
                </div>
                <p className="text-sm text-gray-500 mb-5">
                  {feedbackModal === 'feature'
                    ? "Tell us what you'd like to see added or improved."
                    : 'Report a bug or share a thought. We read every message.'}
                </p>
                <textarea
                  value={feedbackMessage}
                  onChange={e => setFeedbackMessage(e.target.value)}
                  placeholder={feedbackModal === 'feature' ? "I'd love it if Parallel could..." : "I noticed that..."}
                  rows={5}
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-black transition-colors mb-5"
                  style={{ fontSize: '16px' }}
                />
                <button
                  onClick={async () => {
                    if (feedbackMessage.trim().length < 5 || feedbackSubmitting) return;
                    setFeedbackSubmitting(true);
                    const token = localStorage.getItem('parallel_access_token');
                    if (token) {
                      try {
                        await fetch(`${MISC_FUNCTION_URL}/user/feedback`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
                          body: JSON.stringify({
                            feedbackType: feedbackModal === 'feature' ? 'feature' : 'bug',
                            message: feedbackMessage.trim(),
                          }),
                        });
                      } catch (err) { console.error('Feedback submit failed:', err); }
                    }
                    setFeedbackSubmitting(false);
                    setFeedbackSubmitted(true);
                  }}
                  disabled={feedbackMessage.trim().length < 5 || feedbackSubmitting}
                  className="w-full py-4 bg-black text-white rounded-full font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
                >
                  {feedbackSubmitting ? 'Sending…' : 'Send'}
                </button>
                <button
                  onClick={() => { setFeedbackModal(null); setFeedbackMessage(''); }}
                  className="w-full mt-3 py-3 border-2 border-gray-200 rounded-full text-sm font-medium hover:border-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="text-center py-4">
                  <div className="w-14 h-14 bg-black rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText size={24} className="text-white" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2">Thanks!</h2>
                  <p className="text-sm text-gray-500 leading-relaxed">We got your message and will read it carefully.</p>
                </div>
                <button
                  onClick={() => { setFeedbackModal(null); setFeedbackSubmitted(false); setFeedbackMessage(''); }}
                  className="w-full mt-6 py-4 bg-black text-white rounded-full font-medium text-sm hover:bg-gray-800 transition-colors"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
import { useState, useEffect } from 'react';
import { User, FileText, ShieldCheck, CreditCard, Bell, Lock, HelpCircle, FileText as FileTextAlt, LogOut, ChevronRight, Pause, Trash2, Eye, BarChart2, Heart, ExternalLink, Settings2, Sliders, Users } from 'lucide-react';
import { MatchWeightsScreen } from './MatchWeightsScreen';
import { EDGE_FUNCTION_URL, ONBOARDING_FUNCTION_URL, MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';
import { parallelQuestionnaire, Question } from '../data/parallelQuestionnaire_updated';
import { useModalA11y } from '../utils/useModalA11y';

// ── Conditional question visibility ────────────────────────────────
// A question with a `showIf` clause is only "visible" (countable toward
// completion) when its parent answer matches the showIf criteria. This
// must match the logic used by OnboardingFlow.tsx, QuestionnaireListView.tsx,
// and MatchesView.tsx so completion percentage is consistent everywhere.
function isQuestionVisible(question: Question, answers: Record<string, any>): boolean {
  if (!question.showIf) return true;
  const { questionId, notValues, hasValue } = question.showIf as any;
  const refAnswer = answers[questionId];
  const refValue = refAnswer && typeof refAnswer === 'object' && 'value' in refAnswer
    ? refAnswer.value
    : refAnswer;
  if (hasValue) return refValue != null && refValue !== '';
  if (notValues) {
    if (refValue == null || refValue === '') return false;
    return !notValues.includes(String(refValue));
  }
  return true;
}

function isAnswered(answer: any): boolean {
  if (answer === null || answer === undefined) return false;
  const val = typeof answer === 'object' && 'value' in answer ? answer.value : answer;
  if (val === null || val === undefined) return false;
  if (typeof val === 'string' && val.trim() === '') return false;
  if (Array.isArray(val) && val.length === 0) return false;
  return true;
}

interface AccountPageProps {
  onClose?: () => void;
  onNavigate?: (page: string) => void;
  onLogOut: () => void;
  hasActivated: boolean;
  // True once the backend has returned at least one match (current or reviewed).
  // The subscribe nudge is suppressed until there's something to subscribe for.
  hasMatches?: boolean;
  userName?: string;
  userEmail?: string;
  hasVerified?: boolean;
  userAnswers?: Record<string, any>;
  isAdmin?: boolean;
  /** @deprecated — completion is now computed from `userAnswers` against the
   *  questionnaire's conditional visibility rules. Prop kept for backward
   *  compatibility with old App.tsx versions; ignored. */
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

  // Wire Escape-to-close + body-scroll-lock + focus restore.
  // ExitFeedbackSheet only mounts while the parent has set
  // `exitFeedbackAction` to non-null, so we can hard-code `true` for the
  // open arg.
  useModalA11y(true, onDismiss);

  return (
    <div
      className="fixed inset-0 bg-parallel-void/50 z-[100] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-feedback-title"
    >
      <div className="bg-parallel-cream rounded-t-3xl w-full max-w-md p-6 pb-10 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 id="exit-feedback-title" className="text-lg font-semibold">Before you go</h2>
          <button onClick={onDismiss} className="text-gray-500 hover:text-gray-600 text-sm">
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
                foundMatch === true ? 'border-parallel-purple bg-parallel-purple text-parallel-cream' : 'border-gray-200 hover:border-gray-400'
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
                foundMatch === false ? 'border-parallel-purple bg-parallel-purple text-parallel-cream' : 'border-gray-200 hover:border-gray-400'
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
              className="mt-3 text-xs text-parallel-void underline"
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
                    reason === r ? 'border-parallel-void bg-parallel-void/5 font-medium' : 'border-gray-200 hover:border-gray-400'
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
              ? 'bg-red-600 text-parallel-cream hover:bg-red-700 disabled:opacity-40'
              : 'bg-parallel-purple text-parallel-cream hover:bg-parallel-purple/90 disabled:opacity-40'
          } disabled:cursor-not-allowed`}
        >
          {actionLabel}
        </button>

        <p className="text-center text-xs text-gray-500 mt-3">
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
  hasMatches,
  userName,
  userEmail: initialUserEmail,
  hasVerified,
  userAnswers = {},
  isAdmin = false,
  // totalQuestions intentionally ignored — see prop comment above.
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

  // Email update state
  const [currentEmail, setCurrentEmail] = useState(initialUserEmail || localStorage.getItem('parallel_user_email') || '');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailUpdateStatus, setEmailUpdateStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [emailUpdateError, setEmailUpdateError] = useState('');

  // Subscription detail — gracefully hydrated if backend exposes it, hidden if not
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [isFoundingMember, setIsFoundingMember] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [subscriptionCanceled, setSubscriptionCanceled] = useState(false);

  // ── Modal accessibility hooks ────────────────────────────────────────────
  // Each call wires Escape-to-close, body-scroll-lock, and focus-restore for
  // one of the parent-controlled modals on this page. The reset callbacks
  // mirror what the existing X-button click handlers do, so Escape closes
  // cleanly and resets form state the same way.
  useModalA11y(showStoryModal, () => {
    setShowStoryModal(false);
    setStoryText('');
    setStoryHowLong('');
    setStorySubmitted(false);
  });
  useModalA11y(showEmailModal, () => {
    setShowEmailModal(false);
    setEmailUpdateStatus('idle');
    setEmailUpdateError('');
  });
  useModalA11y(feedbackModal !== null, () => {
    setFeedbackModal(null);
    setFeedbackMessage('');
    setFeedbackSubmitted(false);
  });

  // Compute completion against questions that are actually applicable to this user.
  // Questions hidden by their `showIf` rule (e.g. drinking-style questions for users
  // who answered "Never drink") don't count toward the denominator OR the numerator,
  // so a user who never sees a conditional question still hits 100% by answering
  // every question they were shown.
  const visibleQuestions = parallelQuestionnaire.flatMap(s =>
    s.questions.filter(q => q.type !== 'LOCATION' && isQuestionVisible(q, userAnswers))
  );
  const computedTotal = visibleQuestions.length;
  const answeredCount = visibleQuestions.filter(q => isAnswered(userAnswers[q.id])).length;

  const completionPct = computedTotal > 0
    ? Math.min(100, Math.round((answeredCount / computedTotal) * 100))
    : 0;
  const isComplete = completionPct >= 100 && computedTotal > 0;

  // Fetch subscription + pause state on mount. Runs for ALL users (not just activated)
  // because isPaused must work for free users too.
  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
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
          const cancelAtEnd = Boolean(data.cancelAtPeriodEnd ?? data.cancel_at_period_end ?? false);
          const subStatus = (data.subscriptionStatus ?? data.subscription_status ?? '').toLowerCase();
          const canceled = cancelAtEnd || subStatus === 'cancelled' || subStatus === 'canceled';
          if (plan) setSubscriptionPlan(plan);
          if (renewal) setRenewalDate(renewal);
          if (founding) setIsFoundingMember(true);
          setIsPaused(paused);
          if (canceled) setSubscriptionCanceled(true);
        })
        .catch(() => { /* network failure — keep defaults, don't trigger blank-screen overlay */ });
    })();
  }, []);

  const handleEmailUpdate = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setEmailUpdateError('Please enter a valid email address.');
      return;
    }
    if (trimmed === currentEmail.toLowerCase()) {
      setEmailUpdateError('That\'s already your current email.');
      return;
    }
    setEmailUpdateStatus('saving');
    setEmailUpdateError('');
    const token = await getAccessToken();
    if (!token) {
      setEmailUpdateStatus('error');
      setEmailUpdateError('Session expired — please sign in again.');
      return;
    }
    try {
      const res = await fetch(`${MISC_FUNCTION_URL}/account/update-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEmailUpdateStatus('error');
        setEmailUpdateError(data.error || 'Could not update email. Please try again.');
        return;
      }
      // Update local state and localStorage so UI reflects immediately
      setCurrentEmail(trimmed);
      localStorage.setItem('parallel_user_email', trimmed);
      setEmailUpdateStatus('success');
      setNewEmail('');
      setTimeout(() => {
        setShowEmailModal(false);
        setEmailUpdateStatus('idle');
      }, 1800);
    } catch {
      setEmailUpdateStatus('error');
      setEmailUpdateError('Network error. Please check your connection and try again.');
    }
  };

  const handleExitFeedbackConfirm = async (foundMatch: boolean, reason: string) => {
    const token = await getAccessToken();
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
    if (action === 'cancel') onNavigate?.('cancel-subscription');
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
    <div className="min-h-screen bg-parallel-cream flex flex-col">

      {/* Exit Feedback Sheet */}
      {exitFeedbackAction && (
        <ExitFeedbackSheet
          action={exitFeedbackAction}
          onConfirm={handleExitFeedbackConfirm}
          onDismiss={() => setExitFeedbackAction(null)}
        />
      )}

      <div className="flex-1 px-6 py-8 pb-nav">
        <div className="max-w-2xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-1">
              {userName ? `Hi, ${userName.split(' ')[0]}.` : 'Hi there.'}
            </h1>
            <p className="text-gray-500 text-sm">Profile &amp; settings</p>
          </div>

          {/* Upgrade nudge — only when the user has matches to unlock.
              No matches yet → nothing to subscribe for, so stay quiet. */}
          {!hasActivated && hasMatches === true && (
            <div className="bg-parallel-purple text-parallel-cream rounded-3xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <span className="text-2xl">🔓</span>
                <div className="flex-1">
                  <h2 className="text-parallel-cream mb-1">You haven't subscribed yet</h2>
                  <p className="text-gray-300 text-sm mb-4 leading-relaxed">
                    Subscribe to see your full matches, unlock messaging, and connect with compatible people.
                  </p>
                  <button
                    onClick={() => onNavigate?.('pricing')}
                    className="w-full bg-parallel-cream text-parallel-void py-3 rounded-full font-medium hover:bg-gray-100 transition-colors text-sm"
                  >
                    See plans — from $6.58/mo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* "Get verified" card removed — identity verification is now
              surfaced via the matchmaking checklist on the home page. */}

          {/* Questionnaire completion card — whole card is tappable, no redundant Continue → */}
          <button className="w-full text-left bg-parallel-cream border-2 border-gray-200 rounded-3xl p-5 mb-4 hover:border-gray-300 transition-colors" onClick={() => onNavigate?.('questionnaire')}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={18} className="text-gray-600" />
              <p className="font-medium text-sm">My Matching Questionnaire</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-parallel-void rounded-full transition-all"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">
                {isComplete ? '✓ Complete' : `${answeredCount} of ${computedTotal}`}
              </span>
            </div>
            {!isComplete && (
              <p className="text-xs text-gray-500 mt-2">
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
              <ChevronRight size={20} className="text-gray-500" />
            </div>
          </button>

          {/* Feedback adapts matching — shown only once subscribed */}
          {hasActivated && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <Sliders size={16} className="text-gray-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-800 mb-1">Your preferences adapt over time</p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    When you pass and say why, we shift what we look for in your next matches —
                    prioritizing dimensions where you've seen consistent misalignment.
                    You can always review and reset priorities above.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Profile buttons */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Edit Profile */}
            <button
              onClick={() => onNavigate?.('my-profile')}
              className="bg-parallel-purple text-parallel-cream rounded-2xl p-4 hover:bg-parallel-purple/90 transition-colors text-left"
            >
              <User size={20} className="text-parallel-cream mb-2" />
              <p className="text-sm font-medium text-parallel-cream">Edit Profile</p>
              <p className="text-xs text-parallel-cream/60">Photos, bio, details</p>
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
          <div className="bg-parallel-cream border-2 border-gray-200 rounded-3xl p-6 mb-6">
            <h3 className="mb-4 text-sm font-medium text-gray-500">Account Info</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                <User size={20} className="text-gray-600" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Name</p>
                  <p>{userName || '—'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                <User size={20} className="text-gray-600" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="text-sm break-all">{currentEmail || '—'}</p>
                </div>
                <button
                  onClick={() => { setNewEmail(''); setEmailUpdateStatus('idle'); setEmailUpdateError(''); setShowEmailModal(true); }}
                  className="text-sm font-medium text-parallel-void underline flex-shrink-0"
                >
                  Edit
                </button>
              </div>

              {/* Membership — now shows plan type, renewal date, and founding badge when available */}
              <div className="flex items-start gap-3 pb-4 border-b border-gray-200">
                <CreditCard size={20} className="text-gray-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Membership</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p>{membershipLine}</p>
                    {isFoundingMember && (
                      <span className="text-xs font-medium text-parallel-void bg-parallel-void/5 border border-parallel-void/10 px-2 py-0.5 rounded-full">
                        Founding member
                      </span>
                    )}
                  </div>
                  {renewalLine && (
                    <p className="text-xs text-gray-500 mt-0.5">{renewalLine}</p>
                  )}
                </div>
                {!hasActivated && (
                  <button onClick={() => onNavigate?.('pricing')} className="text-sm font-medium text-parallel-void underline mt-0.5">
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
                <ChevronRight size={16} className="text-gray-500" />
              </button>
              <button onClick={() => onNavigate?.('notifications')} className="w-full flex items-center gap-3 pb-4 border-b border-gray-200">
                <Bell size={20} className="text-gray-600" />
                <div className="flex-1 text-left">
                  <p className="text-sm text-gray-600">Notifications</p>
                  <p className="text-sm">Get notified of new matches and messages</p>
                </div>
                <ChevronRight size={16} className="text-gray-500" />
              </button>
            </div>
          </div>

          {/* Verification — lower-weight version, shown only when already verified
              (the big unverified prompt lives above the fold now) */}
          {hasVerified && (
            <div className="bg-parallel-cream border-2 border-gray-200 rounded-3xl p-6 mb-6">
              <h3 className="mb-4 text-sm font-medium text-gray-500">Verification Status</h3>
              <div className="flex items-center gap-3">
                <ShieldCheck size={20} className="text-parallel-purple" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Identity Verified ✓</p>
                  <p className="text-sm text-gray-500">
                    Your verified badge is live on your profile
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Feedback — right after Verification */}
          <div className="bg-parallel-cream border-2 border-gray-200 rounded-3xl p-6 mb-6">
            <h3 className="mb-4 text-sm font-medium text-gray-500">Feedback</h3>
            <div className="space-y-1">
              <button onClick={() => setShowStoryModal(true)} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <Heart size={20} className="text-gray-600" />
                <div className="flex-1 text-left">
                  <p className="text-sm">Share your story</p>
                  <p className="text-xs text-gray-500 mt-0.5">Tell us how Parallel worked for you</p>
                </div>
                <ChevronRight size={16} className="text-gray-500" />
              </button>
              <button onClick={() => setFeedbackModal('bug')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileText size={20} className="text-gray-600" />
                <div className="flex-1 text-left">
                  <p className="text-sm">Send feedback</p>
                  <p className="text-xs text-gray-500 mt-0.5">Report a bug or share a thought</p>
                </div>
                <ChevronRight size={16} className="text-gray-500" />
              </button>
              <button onClick={() => setFeedbackModal('feature')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileText size={20} className="text-gray-600" />
                <div className="flex-1 text-left">
                  <p className="text-sm">Feature request</p>
                  <p className="text-xs text-gray-500 mt-0.5">Tell us what you'd like to see</p>
                </div>
                <ChevronRight size={16} className="text-gray-500" />
              </button>
            </div>
          </div>

          {/* Admin Panel — only visible to admins */}
          {isAdmin && (
            <div className="bg-parallel-cream border-2 border-gray-200 rounded-3xl p-4 mb-6">
              <button
                onClick={() => onNavigate?.('admin')}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Settings2 size={20} className="text-[#7B5EA7]" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">Admin Panel</p>
                  <p className="text-xs text-gray-500">City launch & trust/safety</p>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            </div>
          )}

          {/* Affiliate Program */}
          <div className="bg-parallel-cream border-2 border-gray-200 rounded-3xl p-4 mb-6">
            <button
              onClick={() => onNavigate?.('affiliate-portal')}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Users size={20} className="text-[#7B5EA7]" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">Affiliate Program</p>
                <p className="text-xs text-gray-500">Earn commission for every member you refer</p>
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          </div>

          {/* Support & Legal */}
          <div className="bg-parallel-cream border-2 border-gray-200 rounded-3xl p-6 mb-6">
            <h3 className="mb-4 text-sm font-medium text-gray-500">Support & Legal</h3>
            <div className="space-y-1">
              <button onClick={() => onNavigate?.('help-support')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <HelpCircle size={20} className="text-gray-600" /><span className="flex-1 text-left">Help & Support</span><ChevronRight size={16} className="text-gray-500" />
              </button>
              <button onClick={() => onNavigate?.('privacy-safety')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <Lock size={20} className="text-gray-600" /><span className="flex-1 text-left">Privacy & Safety</span><ChevronRight size={16} className="text-gray-500" />
              </button>
              <button onClick={() => onNavigate?.('community-guidelines')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileTextAlt size={20} className="text-gray-600" /><span className="flex-1 text-left">Community Guidelines</span><ChevronRight size={16} className="text-gray-500" />
              </button>
              <button onClick={() => onNavigate?.('terms-service')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileTextAlt size={20} className="text-gray-600" /><span className="flex-1 text-left">Terms of Service</span><ChevronRight size={16} className="text-gray-500" />
              </button>
              <button onClick={() => onNavigate?.('privacy-policy')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileTextAlt size={20} className="text-gray-600" /><span className="flex-1 text-left">Privacy Policy</span><ChevronRight size={16} className="text-gray-500" />
              </button>
              <button onClick={() => onNavigate?.('refund-policy')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileTextAlt size={20} className="text-gray-600" /><span className="flex-1 text-left">Refund Policy</span><ChevronRight size={16} className="text-gray-500" />
              </button>
              <button onClick={() => onNavigate?.('consumer-health-data-policy')} className="w-full p-3 rounded-xl hover:bg-gray-50 flex items-center gap-3 transition-colors">
                <FileTextAlt size={20} className="text-gray-600" /><span className="flex-1 text-left">Consumer Health Data Policy (WA)</span><ChevronRight size={16} className="text-gray-500" />
              </button>
            </div>
          </div>

          {/* Account Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-500 px-2 mb-2">Account Actions</h3>

            {/* Pause — only for active subscribers */}
            {hasActivated && (
            <button
              onClick={() => setExitFeedbackAction('pause')}
              className="w-full p-4 rounded-2xl border-2 border-gray-200 hover:border-parallel-void transition-colors flex items-start gap-3"
            >
              <Pause size={20} className="text-gray-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-left">
                <p className="font-medium text-sm">{isPaused ? 'Resume My Profile' : 'Pause My Profile'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isPaused
                    ? 'Your profile is currently hidden. Tap to make it visible again.'
                    : 'Hides your profile and pauses your subscription. Your questionnaire and matches are saved. Resume anytime.'}
                </p>
              </div>
            </button>
            )}

            {/* Cancel subscription — only shown for active, non-canceled subscribers */}
            {hasActivated && !subscriptionCanceled && (
              <button
                onClick={() => setExitFeedbackAction('cancel')}
                className="w-full p-4 rounded-2xl border-2 border-gray-200 hover:border-parallel-void transition-colors flex items-start gap-3"
              >
                <CreditCard size={20} className="text-gray-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <p className="font-medium text-sm">Cancel Subscription</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Access continues until end of billing period
                  </p>
                </div>
              </button>
            )}

            {/* Canceled state — subscription is canceled but still in grace period */}
            {hasActivated && subscriptionCanceled && (
              <div className="w-full p-4 rounded-2xl border-2 border-gray-100 flex items-start gap-3">
                <CreditCard size={20} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <p className="font-medium text-sm text-gray-500">Subscription canceled</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {renewalDate
                      ? `Access continues until ${formatBillingDate(renewalDate)}`
                      : 'Access continues until end of billing period'}
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={onLogOut}
              className="w-full p-4 rounded-2xl border-2 border-gray-200 hover:border-parallel-void transition-colors flex items-center gap-3"
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
            <p className="text-center text-xs text-gray-500 pt-1">
              Need to leave? You can always delete your account above — we make it easy.
            </p>
          </div>

        </div>
      </div>

      {/* Share Story Modal */}
      {showStoryModal && (
        <div
          className="fixed inset-0 bg-parallel-void/50 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-story-title"
        >
          <div className="bg-parallel-cream rounded-3xl p-6 pb-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
            {!storySubmitted ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h2 id="share-story-title" className="text-lg font-semibold">Share your story</h2>
                  <button
                    onClick={() => { setShowStoryModal(false); setStoryText(''); setStoryHowLong(''); setStorySubmitted(false); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700 text-lg"
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
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-parallel-purple transition-colors"
                    style={{ fontSize: '16px' }}
                  />
                  {/* Positive framing: show minimum before they type, affirm once they pass it, nothing in between */}
                  <p className="text-xs text-gray-500 mt-1">
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
                    className="w-full border-2 border-gray-200 rounded-full px-4 py-3 text-sm focus:outline-none focus:border-parallel-purple transition-colors"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <div className="space-y-3">
                  <button
                    onClick={async () => {
                      if (storyText.trim().length < 10 || storySubmitting) return;
                      setStorySubmitting(true);
                      const token = await getAccessToken();
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
                    className="w-full py-4 bg-parallel-purple text-parallel-cream rounded-full font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-parallel-purple/90 transition-colors"
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
                  <div className="w-14 h-14 bg-parallel-void rounded-full flex items-center justify-center mx-auto mb-4">
                    <Heart size={24} className="text-parallel-cream" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2">Thank you ❤️</h2>
                  <p className="text-sm text-gray-500 leading-relaxed">Your story means a lot. We'll review it and may feature it on our site.</p>
                </div>
                <button onClick={() => { setShowStoryModal(false); setStorySubmitted(false); setStoryText(''); setStoryHowLong(''); }} className="w-full mt-6 py-4 bg-parallel-purple text-parallel-cream rounded-full font-medium text-sm hover:bg-parallel-purple/90 transition-colors">
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Email Update Modal */}
      {showEmailModal && (
        <div
          className="fixed inset-0 bg-parallel-void/50 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-update-title"
        >
          <div className="bg-parallel-cream rounded-3xl p-6 pb-10 sm:pb-6 w-full max-w-md">
            {emailUpdateStatus === 'success' ? (
              <div className="text-center py-4">
                <p className="text-2xl mb-2">✓</p>
                <p className="font-semibold text-lg mb-1">Email updated</p>
                <p className="text-sm text-gray-500">
                  A confirmation link has been sent to your new address. Click it to complete the change.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 id="email-update-title" className="text-lg font-semibold">Update email</h2>
                  <button
                    onClick={() => { setShowEmailModal(false); setEmailUpdateStatus('idle'); setEmailUpdateError(''); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700 text-lg"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-1">Current email</p>
                <p className="text-sm font-medium mb-5 break-all">{currentEmail || '—'}</p>
                <label htmlFor="new-email-input" className="block text-sm text-gray-600 mb-1.5">New email address</label>
                <input
                  id="new-email-input"
                  type="email"
                  value={newEmail}
                  onChange={e => { setNewEmail(e.target.value); setEmailUpdateError(''); }}
                  placeholder="you@example.com"
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-base outline-none focus:border-parallel-purple transition-colors mb-1"
                  autoFocus
                  aria-invalid={emailUpdateError ? true : undefined}
                  aria-describedby={emailUpdateError ? 'new-email-error' : 'new-email-hint'}
                  onKeyDown={e => { if (e.key === 'Enter') handleEmailUpdate(); }}
                />
                {emailUpdateError && (
                  <p id="new-email-error" role="alert" className="text-xs text-red-600 mb-3">{emailUpdateError}</p>
                )}
                {!emailUpdateError && (
                  <p id="new-email-hint" className="text-xs text-gray-500 mb-4">
                    We'll send a confirmation link to your new address. Your email won't change until you click it.
                  </p>
                )}
                <button
                  onClick={handleEmailUpdate}
                  disabled={emailUpdateStatus === 'saving' || !newEmail.trim()}
                  className="w-full bg-parallel-purple text-parallel-cream py-3.5 rounded-full font-medium disabled:opacity-40 transition-opacity"
                >
                  {emailUpdateStatus === 'saving' ? 'Sending link…' : 'Send confirmation link'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Feedback / Feature Request Modal */}
      {feedbackModal && (
        <div
          className="fixed inset-0 bg-parallel-void/50 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-modal-title"
        >
          <div className="bg-parallel-cream rounded-3xl p-6 pb-10 sm:pb-6 w-full max-w-md">
            {!feedbackSubmitted ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 id="feedback-modal-title" className="text-lg font-semibold">
                    {feedbackModal === 'feature' ? 'Feature request' : 'Send feedback'}
                  </h2>
                  <button
                    onClick={() => { setFeedbackModal(null); setFeedbackMessage(''); setFeedbackSubmitted(false); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700 text-lg"
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
                  className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-parallel-purple transition-colors mb-5"
                  style={{ fontSize: '16px' }}
                />
                <button
                  onClick={async () => {
                    if (feedbackMessage.trim().length < 5 || feedbackSubmitting) return;
                    setFeedbackSubmitting(true);
                    const token = await getAccessToken();
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
                  className="w-full py-4 bg-parallel-purple text-parallel-cream rounded-full font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-parallel-purple/90 transition-colors"
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
                  <div className="w-14 h-14 bg-parallel-void rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText size={24} className="text-parallel-cream" />
                  </div>
                  <h2 className="text-lg font-semibold mb-2">Thanks!</h2>
                  <p className="text-sm text-gray-500 leading-relaxed">We got your message and will read it carefully.</p>
                </div>
                <button
                  onClick={() => { setFeedbackModal(null); setFeedbackSubmitted(false); setFeedbackMessage(''); }}
                  className="w-full mt-6 py-4 bg-parallel-purple text-parallel-cream rounded-full font-medium text-sm hover:bg-parallel-purple/90 transition-colors"
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
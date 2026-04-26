import { Match } from '../types';
import { SwipeableMatchView } from './SwipeableMatchView';
import { toast } from 'sonner';
import { EDGE_FUNCTION_URL, MATCHES_FUNCTION_URL, MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { ParallelIcon } from './ParallelIcon';
import { parallelQuestionnaire } from '../data/parallelQuestionnaire_updated';
import { getAccessToken } from '../utils/auth';

// ── PRE_LAUNCH flag ────────────────────────────────────────────
// Set to true during pre-launch period.
// Flip to false on launch day — no deploy needed if using env var.
const PRE_LAUNCH = import.meta.env.VITE_PRE_LAUNCH !== 'false';

interface MatchesViewProps {
  matches: Match[];
  onRetakeQuestionnaire: () => void;
  onViewQuestionnaire?: () => void;
  onMatchInteraction?: (matchId: string) => void;
  hasActivated?: boolean;
  onActivate?: () => void;
  onNavigateToPayment?: () => void;
  onNavigateToInvite?: () => void;
  userAnswers?: Record<string, any>;
  hasReceivedMatches?: boolean;
  isVerified?: boolean;
  onVerify?: () => void;
  isLoading?: boolean;
  onPass?: (matchId: string) => void;
  onLike?: (matchId: string) => void;
  likedMatchIds?: Set<string>;
  emailConfirmationRequired?: boolean;
}

export function MatchesView({
  matches,
  onRetakeQuestionnaire,
  onViewQuestionnaire,
  onMatchInteraction,
  hasActivated,
  onNavigateToPayment,
  onNavigateToInvite,
  userAnswers,
  hasReceivedMatches = false,
  isVerified = false,
  onVerify,
  isLoading = false,
  onPass,
  onLike,
  likedMatchIds,
  emailConfirmationRequired = false,
}: MatchesViewProps) {
  const [lastPassedMatchId, setLastPassedMatchId] = useState<string | null>(null);
  const [showEmailBanner, setShowEmailBanner] = useState(true);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleResendVerification = async () => {
    const token = await getAccessToken();
    if (!token || resendStatus !== 'idle') return;
    setResendStatus('sending');
    try {
      await fetch(`${MISC_FUNCTION_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
      });
      setResendStatus('sent');
    } catch {
      setResendStatus('idle');
    }
  };

  // Evaluate showIf visibility using the user's actual answers — same logic as OnboardingFlow
  const isQuestionVisible = (question: any, answers: Record<string, any>): boolean => {
    if (!question.showIf) return true;
    const { questionId, notValues, hasValue } = question.showIf;
    const refAnswer = answers[questionId];
    const refValue = refAnswer && typeof refAnswer === 'object' && 'value' in refAnswer ? refAnswer.value : refAnswer;
    if (hasValue) return refValue != null && refValue !== '';
    if (notValues) {
      if (refValue == null || refValue === '') return false;
      return !notValues.includes(String(refValue));
    }
    return true;
  };

  const ua = userAnswers || {};
  const totalQuestions = parallelQuestionnaire.reduce(
    (acc, s) => acc + s.questions.filter(q => q.type !== 'LOCATION' && isQuestionVisible(q, ua)).length, 0
  );
  const answeredQuestionsCount = parallelQuestionnaire.reduce(
    (acc, s) => acc + s.questions.filter(q => {
      if (q.type === 'LOCATION' || !isQuestionVisible(q, ua)) return false;
      const a = ua[q.id];
      if (a === null || a === undefined) return false;
      const val = typeof a === 'object' && 'value' in a ? a.value : a;
      if (val === null || val === undefined) return false;
      if (typeof val === 'string' && val.trim() === '') return false;
      if (Array.isArray(val) && val.length === 0) return false;
      return true;
    }).length, 0
  );
  const isQuestionnaireIncomplete = answeredQuestionsCount < totalQuestions;

  const handleShareInvite = async () => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await fetch(`${MISC_FUNCTION_URL}/referral/my-code`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const referralLink = `https://getparallel.vip?ref=${data.code}`;
        if (navigator.share) {
          await navigator.share({ title: 'Join me on Parallel', url: referralLink });
        } else {
          await navigator.clipboard.writeText(referralLink);
          toast.success('Link copied!', { duration: 2000 });
        }
      }
    } catch (err) {
      console.error('Failed to share:', err);
    }
  };

  // ── PRE_LAUNCH holding state — shown above everything else ────
  if (PRE_LAUNCH) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="flex gap-1 mb-8 justify-center">
            <div className="w-2 h-16 bg-black"></div>
            <div className="w-2 h-16 bg-black"></div>
          </div>
          <h2 className="text-3xl font-bold mb-4">Matching opens May 15th.</h2>
          <p className="text-gray-600 text-lg leading-relaxed mb-6">
            We're building the pool right now. Complete your questionnaire, invite friends, and get ready — the more people who join before launch day, the better everyone's first matches will be.
          </p>
          <div className="space-y-3 mb-8">
            <button
              onClick={onNavigateToInvite || handleShareInvite}
              className="w-full bg-black text-white px-8 py-4 rounded-full hover:bg-gray-800 transition-colors text-base font-medium"
            >
              Invite a friend →
            </button>
            <button
              onClick={onNavigateToPayment}
              className="w-full border-2 border-black text-black px-8 py-4 rounded-full hover:bg-gray-50 transition-colors text-base font-medium"
            >
              Lock in founding pricing →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Incomplete questionnaire state ────────────────────────────
  if (isQuestionnaireIncomplete) {
    return (
      <div className="bg-white pt-20 min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="flex gap-1 mb-8 justify-center">
            <div className="w-2 h-16 bg-black"></div>
            <div className="w-2 h-16 bg-black"></div>
          </div>
          <h2 className="text-3xl font-bold mb-3">Finish your questionnaire to unlock your matches</h2>
          <p className="text-gray-600 text-lg leading-relaxed mb-8">
            Answer every question so we can accurately match you.
          </p>
          <div className="mb-8">
            <div className="text-sm text-gray-500 mb-2">
              {answeredQuestionsCount} of {totalQuestions} questions answered
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-black transition-all"
                style={{ width: `${Math.min((answeredQuestionsCount / totalQuestions) * 100, 100)}%` }}
              />
            </div>
          </div>
          <button
            onClick={onViewQuestionnaire}
            className="w-full bg-black text-white px-8 py-4 rounded-full hover:bg-gray-800 transition-colors text-base font-medium"
          >
            Continue questionnaire →
          </button>
          <button
            onClick={onNavigateToInvite || handleShareInvite}
            className="w-full border-2 border-gray-200 text-gray-700 px-8 py-3 rounded-full hover:border-gray-400 transition-colors text-base mt-3"
          >
            Invite a friend →
          </button>
        </div>
      </div>
    );
  }

  const getThreshold = (matchCount: number) => {
    if (matchCount >= 20) return 70;
    if (matchCount >= 10) return 60;
    if (matchCount >= 5) return 50;
    return 40;
  };

  const threshold = getThreshold(matches.length);
  const validMatches = matches
    .filter(m => m.compatibilityScore >= threshold)
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore);

  const handlePass = (userId: string, _userName: string, _photoUrl: string) => {
    setLastPassedMatchId(userId);
    onPass?.(userId);
  };

  const handleLike = (userId: string) => {
    onLike?.(userId);
  };

  const handleViewProfile = (userId: string) => {
    onMatchInteraction?.(userId);
  };

  const handleUndo = async () => {
    if (!lastPassedMatchId) return;
    const undoId = lastPassedMatchId;
    setLastPassedMatchId(null);
    const token = await getAccessToken();
    if (!token) return;
    try {
      await fetch(`${MATCHES_FUNCTION_URL}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({ matchUserId: undoId, action: 'undo' }),
      });
    } catch (err) {
      console.error('Undo failed:', err);
    }
  };

  return (
    <div className="bg-white">
      {/* Email confirmation banner — non-blocking, dismissible */}
      {emailConfirmationRequired && showEmailBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="max-w-md mx-auto flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-amber-900 font-medium text-sm">Please verify your email</p>
              <p className="text-amber-700 text-xs mt-0.5 leading-relaxed">
                Check your inbox for a link from hello@getparallel.vip to get the best matches.
              </p>
              <button
                onClick={handleResendVerification}
                disabled={resendStatus !== 'idle'}
                className="mt-2 text-xs font-medium text-amber-900 underline disabled:opacity-50"
              >
                {resendStatus === 'sent' ? 'Email sent ✓' : resendStatus === 'sending' ? 'Sending…' : 'Resend verification email'}
              </button>
            </div>
            <button
              onClick={() => setShowEmailBanner(false)}
              className="text-amber-600 hover:text-amber-900 flex-shrink-0 mt-0.5"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {hasActivated && !isVerified && onVerify && (
        <div className="bg-gradient-to-r from-gray-900 to-black border-b border-gray-800 px-4 py-3">
          <div className="max-w-md mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={18} className="text-white" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Get verified to stand out ✓</p>
                <p className="text-gray-400 text-xs">Takes 2 minutes</p>
              </div>
            </div>
            <button
              onClick={onVerify}
              className="bg-white text-black px-4 py-1.5 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              Verify Now
            </button>
          </div>
        </div>
      )}

      {!hasActivated && matches.length > 0 && (
        <div className="max-w-md mx-auto px-4 pt-6 pb-4">
          <div className="relative mb-6">
            <div className="absolute inset-x-3 top-2 bottom-0 bg-gray-100 rounded-3xl border-2 border-gray-200" style={{ zIndex: 0 }} />
            <div className="relative rounded-3xl border-2 border-gray-200 overflow-hidden" style={{ zIndex: 1 }}>
              <div className="relative">
                <img
                  src={matches[0]?.user?.photoUrl || matches[0]?.user?.photos?.[0] || ''}
                  alt="Your match"
                  className="w-full aspect-[3/4] object-cover blur-md scale-105"
                />
                <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center text-center px-6">
                  <div className="bg-white/95 rounded-2xl px-6 py-5 max-w-xs">
                    <p className="text-2xl font-semibold mb-1">{matches.length} match{matches.length !== 1 ? 'es' : ''} waiting</p>
                    <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                      Your top match is {matches[0]?.compatibilityScore}% compatible. Subscribe to see who they are and start messaging.
                    </p>
                    <button
                      onClick={onNavigateToPayment}
                      className="w-full bg-black text-white py-3 rounded-full font-medium hover:bg-gray-800 transition-colors text-[13px]"
                    >
                      See your matches — from $6.58/mo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-5 text-center">
            <p className="font-semibold mb-1">🌱 Help us find better matches for you</p>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Parallel is a new community. Every person you invite makes the pool better for everyone — including you.
            </p>
            <button
              onClick={onNavigateToInvite || handleShareInvite}
              className="w-full border-2 border-black text-black py-3 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors"
            >Invite a friend →</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="max-w-md mx-auto space-y-6">
            {[1, 2].map(i => (
              <div key={i} className="bg-white border-2 border-gray-200 rounded-3xl overflow-hidden animate-pulse">
                <div className="aspect-[3/4] bg-gray-200"></div>
                <div className="p-6 space-y-3">
                  <div className="h-6 bg-gray-200 rounded-full w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded-full w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : matches.length === 0 ? (
          // ── Combined: processing + no matches yet state ────────
          <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
            <div className="flex gap-1 mb-8">
              <div className="w-2 h-16 bg-black"></div>
              <div className="w-2 h-16 bg-black"></div>
            </div>
            <h2 className="text-3xl font-bold mb-3">Your match suggestions are on their way!</h2>
            <p className="text-gray-600 text-lg leading-relaxed mb-8 max-w-md">
              We're finding your most compatible people. You'll get a text when they're ready.
            </p>
            <button
              onClick={onNavigateToInvite || handleShareInvite}
              className="bg-black text-white px-8 py-4 rounded-full hover:bg-gray-800 transition-colors text-base font-medium mb-4"
            >
              Invite a friend →
            </button>
            <p className="text-sm text-gray-400">
              The more people you invite, the better everyone's matches get.
            </p>
          </div>
        ) : validMatches.length === 0 ? (
          // ── All caught up state ────────────────────────────────
          <div className="py-12 max-w-md mx-auto text-center">
            <h2 className="text-2xl mb-3">You're all caught up</h2>
            <p className="text-gray-600 mb-8 text-base leading-relaxed">
              You've reviewed all your current match suggestions. Check back soon — new people are added regularly.
            </p>
            <button
              onClick={onRetakeQuestionnaire}
              className="w-full bg-white border-2 border-black text-black px-8 py-3 rounded-full hover:bg-gray-50 transition-all mb-3"
            >
              Update Preferences
            </button>
            <button
              onClick={onNavigateToInvite || handleShareInvite}
              className="w-full border-2 border-gray-200 text-gray-700 px-8 py-3 rounded-full hover:border-gray-400 transition-colors text-base"
            >
              Invite a friend →
            </button>
          </div>
        ) : (
          <SwipeableMatchView
            matches={validMatches}
            onMatchInteraction={onMatchInteraction}
            hasActivated={hasActivated}
            onUnlock={onNavigateToPayment}
            onPass={handlePass}
            onLike={handleLike}
            onViewProfile={handleViewProfile}
            isVerified={isVerified}
            onVerify={onVerify}
            likedMatchIds={likedMatchIds}
            canUndo={!!lastPassedMatchId}
            onUndo={handleUndo}
          />
        )}
      </div>
    </div>
  );
}
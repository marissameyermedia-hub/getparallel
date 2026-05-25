import { Match } from '../types';
import { SwipeableMatchView } from './SwipeableMatchView';
import { toast } from 'sonner';
import { MATCHES_FUNCTION_URL, MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { useState } from 'react';
import { ParallelWordmark } from './ParallelWordmark';
import { parallelQuestionnaire } from '../data/parallelQuestionnaire_updated';
import { getAccessToken } from '../utils/auth';
import { SetupChecklist } from './SetupChecklist';

// ── PRE_LAUNCH flag ────────────────────────────────────────────
// Defaults to FALSE. Set VITE_PRE_LAUNCH=true in Netlify env vars
// to show the pre-launch holding state. Remove or set to false on
// launch day — no code deploy needed.
// NOTE: PricingPage.tsx uses the same pattern — always keep them in sync.
const PRE_LAUNCH = import.meta.env.VITE_PRE_LAUNCH === 'true';

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
  // True once the backend has ever returned at least one match for this user.
  // Distinguishes "never had matches" (show waiting state) from "reviewed all
  // matches" (show all-caught-up state) when matches.length === 0.
  hasReceivedMatches?: boolean;
  isVerified?: boolean;
  onVerify?: () => void;
  isLoading?: boolean;
  onPass?: (matchId: string) => void;
  onLike?: (matchId: string) => void;
  likedMatchIds?: Set<string>;
  // Used by the SetupChecklist card at the top of Home.
  accessToken?: string | null;
  emailVerified?: boolean;
  onOpenNotifications?: () => void;
  onOpenFeedback?: () => void;
  feedbackInsights?: Array<{ type: string; message: string }>;
  onDismissInsight?: () => void;
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
  accessToken = null,
  emailVerified = true,
  onOpenNotifications,
  onOpenFeedback,
  feedbackInsights = [],
  onDismissInsight,
}: MatchesViewProps) {
  const [lastPassedMatchId, setLastPassedMatchId] = useState<string | null>(null);

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

  // Sort matches by compatibility score descending. The state machine uses
  // matches.length (not a filtered subset) so that "N matches waiting" counts
  // and state transitions are always consistent with what the backend returned.
  const sortedMatches = [...matches].sort((a, b) => b.compatibilityScore - a.compatibilityScore);

  // True once the backend has returned at least one match (current or reviewed).
  // Passed to SetupChecklist to gate subscribe/verify rows — no point showing
  // those CTAs before there's anything to unlock.
  const hasMatches = matches.length > 0 || hasReceivedMatches;

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

  const socialAndFeedback = (
    <div className="space-y-3 mt-3">

      {/* Social — purple tint */}
      <div className="bg-parallel-purple/10 border border-parallel-purple/25 rounded-2xl p-4 text-center">
        <p className="text-sm text-parallel-purple/80 mb-3 leading-relaxed">
          Follow us on social for live updates on your city.
        </p>
        <div className="flex items-center justify-center gap-8">

          {/* Instagram */}
          <a
            href="https://instagram.com/parallel_vip"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Parallel on Instagram"
            className="flex flex-col items-center gap-1 text-parallel-purple/60 hover:text-parallel-purple transition-colors"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            <span className="text-[10px] font-medium">@parallel_vip</span>
          </a>

          {/* TikTok */}
          <a
            href="https://tiktok.com/@parallel_vip"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Parallel on TikTok"
            className="flex flex-col items-center gap-1 text-parallel-purple/60 hover:text-parallel-purple transition-colors"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.78a4.85 4.85 0 0 1-1.01-.09z"/>
            </svg>
            <span className="text-[10px] font-medium">@parallel_vip</span>
          </a>

        </div>
      </div>

      {/* Feedback — light gray */}
      <div className="bg-gray-100 rounded-2xl p-4 text-center">
        <p className="text-sm text-gray-500 mb-3 leading-relaxed">
          Have a thought? We read everything.
        </p>
        <button
          onClick={onOpenFeedback}
          className="w-full border border-gray-300 text-gray-600 py-2.5 rounded-full text-sm font-medium hover:border-gray-400 hover:text-gray-800 transition-colors"
        >
          Give feedback or request a feature
        </button>
      </div>

    </div>
  );

  // ── PRE_LAUNCH holding state — shown above everything else ────
  if (PRE_LAUNCH) {
    return (
      <div className="bg-parallel-cream min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="mb-8 flex justify-center">
            <ParallelWordmark sizeClassName="text-4xl" />
          </div>
          <h2 className="text-3xl font-bold mb-4">We're building your city now.</h2>
          <p className="text-gray-600 text-lg leading-relaxed mb-6">
            Matching opens when enough people in your area are ready. Invite friends
            to speed up how quickly we can open your city.
          </p>
          <div className="space-y-3 mb-4">
            <button
              onClick={onNavigateToInvite || handleShareInvite}
              className="w-full bg-parallel-purple text-parallel-cream px-8 py-4 rounded-full hover:bg-parallel-purple/90 transition-colors text-base font-medium"
            >
              Invite a friend →
            </button>
            <button
              onClick={onNavigateToPayment}
              className="w-full border-2 border-parallel-void text-parallel-void px-8 py-4 rounded-full hover:bg-gray-50 transition-colors text-base font-medium"
            >
              Lock in founding pricing →
            </button>
          </div>
          {socialAndFeedback}
        </div>
      </div>
    );
  }

  // ── Incomplete questionnaire state ────────────────────────────
  if (isQuestionnaireIncomplete) {
    return (
      <div className="bg-parallel-cream pt-20 min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="mb-8 flex justify-center">
            <ParallelWordmark sizeClassName="text-4xl" />
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
                className="h-full bg-parallel-void transition-all"
                style={{ width: `${Math.min((answeredQuestionsCount / totalQuestions) * 100, 100)}%` }}
              />
            </div>
          </div>
          <button
            onClick={onViewQuestionnaire}
            className="w-full bg-parallel-purple text-parallel-cream px-8 py-4 rounded-full hover:bg-parallel-purple/90 transition-colors text-base font-medium"
          >
            Continue questionnaire →
          </button>
          <button
            onClick={onNavigateToInvite || handleShareInvite}
            className="w-full border-2 border-gray-200 text-gray-700 px-8 py-3 rounded-full hover:border-gray-400 transition-colors text-base mt-3"
          >
            Invite a friend →
          </button>
          <p className="text-sm text-gray-500 mt-4">
            The more people you invite, the more people they invite, the better everyone's matches get.
          </p>
          {socialAndFeedback}
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────
  //
  // State machine — exactly one branch fires:
  //
  //   isLoading                              → loading skeleton
  //   matches.length > 0  && !hasActivated  → paywall: blurred matches + subscribe CTA
  //   matches.length > 0  &&  hasActivated  → match cards (SwipeableMatchView)
  //   matches.length === 0 && !hasReceivedMatches → waiting: "on their way"
  //   matches.length === 0 &&  hasReceivedMatches → all caught up
  //
  // hasReceivedMatches distinguishes a brand-new user (no matches ever) from one
  // who has reviewed everything (all matches passed/liked). Both have
  // matches.length === 0 in the prop, but the right message is different.

  return (
    <div className="bg-parallel-cream">
      {/* Matchmaking checklist — manages its own visibility, sits above all states */}
      <SetupChecklist
        accessToken={accessToken}
        emailVerified={emailVerified}
        identityVerified={isVerified}
        hasActivated={hasActivated}
        hasMatches={hasMatches}
        onOpenNotifications={onOpenNotifications}
        onOpenSubscribe={onNavigateToPayment}
      />

      {feedbackInsights.length > 0 && (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="flex-1 text-sm text-amber-800">{feedbackInsights[0].message}</p>
          <button
            onClick={onDismissInsight}
            aria-label="Dismiss"
            className="flex-shrink-0 p-1 -mr-1 text-amber-400 hover:text-amber-600 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* ── Loading skeleton ───────────────────────────────── */}
        {isLoading ? (
          <div className="max-w-md mx-auto space-y-6">
            {[1, 2].map(i => (
              <div key={i} className="bg-parallel-cream border-2 border-gray-200 rounded-3xl overflow-hidden animate-pulse">
                <div className="aspect-[3/4] bg-gray-200" />
                <div className="p-6 space-y-3">
                  <div className="h-6 bg-gray-200 rounded-full w-3/4" />
                  <div className="h-4 bg-gray-200 rounded-full w-1/2" />
                </div>
              </div>
            ))}
          </div>

        /* ── Has matches ──────────────────────────────────────── */
        ) : matches.length > 0 ? (

          !hasActivated ? (
            // Unsubscribed + has matches → blurred paywall preview.
            // Shows real match count and top compatibility score.
            <div className="max-w-md mx-auto px-4 pt-2 pb-nav">
              <div className="relative mb-6">
                <div
                  className="absolute inset-x-3 top-2 bottom-0 bg-gray-100 rounded-3xl border-2 border-gray-200"
                  style={{ zIndex: 0 }}
                />
                <div
                  className="relative rounded-3xl border-2 border-gray-200 overflow-hidden"
                  style={{ zIndex: 1 }}
                >
                  <div className="relative">
                    <img
                      src={sortedMatches[0]?.user?.photoUrl || sortedMatches[0]?.user?.photos?.[0] || ''}
                      alt="Your match"
                      className="w-full aspect-[3/4] object-cover blur-md scale-105"
                    />
                    <div className="absolute inset-0 bg-parallel-void/30 flex flex-col items-center justify-center text-center px-6">
                      <div className="bg-parallel-cream/95 rounded-2xl px-6 py-5 max-w-xs">
                        <p className="text-2xl font-semibold mb-1">
                          {matches.length} match{matches.length !== 1 ? 'es' : ''} waiting
                        </p>
                        <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                          Your top match is {sortedMatches[0]?.compatibilityScore}% compatible.
                        </p>
                        <button
                          onClick={onNavigateToPayment}
                          className="w-full bg-parallel-purple text-parallel-cream py-3 rounded-full font-medium hover:bg-parallel-purple/90 transition-colors text-[13px]"
                        >
                          See your matches →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-parallel-purple/10 border border-parallel-purple/20 rounded-2xl p-4 text-center">
                <p className="text-sm text-parallel-purple font-medium mb-1">Know someone who's a catch?</p>
                <p className="text-xs text-parallel-purple/70 mb-3 leading-relaxed">
                  Invite them to join. The more people you invite, the more people they invite — and the better your matches get.
                </p>
                <button
                  onClick={onNavigateToInvite || handleShareInvite}
                  className="w-full bg-parallel-purple text-parallel-cream py-2.5 rounded-full text-sm font-medium hover:bg-parallel-purple/90 transition-colors"
                >
                  Send invite
                </button>
              </div>
              {socialAndFeedback}
            </div>

          ) : !isVerified ? (
            // Subscribed but not ID-verified → blurred gate with verify CTA.
            <div className="max-w-md mx-auto px-4 pt-2 pb-nav">
              <div className="relative mb-6">
                <div
                  className="absolute inset-x-3 top-2 bottom-0 bg-gray-100 rounded-3xl border-2 border-gray-200"
                  style={{ zIndex: 0 }}
                />
                <div
                  className="relative rounded-3xl border-2 border-gray-200 overflow-hidden"
                  style={{ zIndex: 1 }}
                >
                  <div className="relative">
                    <img
                      src={sortedMatches[0]?.user?.photoUrl || sortedMatches[0]?.user?.photos?.[0] || ''}
                      alt="Your match"
                      className="w-full aspect-[3/4] object-cover blur-md scale-105"
                    />
                    <div className="absolute inset-0 bg-parallel-void/30 flex flex-col items-center justify-center text-center px-6">
                      <div className="bg-parallel-cream/95 rounded-2xl px-6 py-5 max-w-xs">
                        <p className="text-2xl font-semibold mb-1">
                          {matches.length} match{matches.length !== 1 ? 'es' : ''} waiting
                        </p>
                        <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                          Verify your identity to unlock your matches. It takes about 2 minutes.
                        </p>
                        <button
                          onClick={onVerify}
                          className="w-full py-3 rounded-full font-medium text-white text-[13px] transition-colors"
                          style={{ backgroundColor: '#1D9BF0' }}
                        >
                          Get verified →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {socialAndFeedback}
            </div>

          ) : (
            // Subscribed + verified → real swipe cards + small invite footer.
            <>
              <SwipeableMatchView
                matches={sortedMatches}
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
              <div className="max-w-md mx-auto px-4 pb-nav">
                <div className="bg-parallel-purple/10 border border-parallel-purple/20 rounded-2xl p-4 text-center">
                  <p className="text-sm text-parallel-purple font-medium mb-1">Know someone who's a catch?</p>
                  <p className="text-xs text-parallel-purple/70 mb-3 leading-relaxed">
                    Invite them to join. The more people you invite, the more people they invite — and the better your matches get.
                  </p>
                  <button
                    onClick={onNavigateToInvite || handleShareInvite}
                    className="w-full bg-parallel-purple text-parallel-cream py-2.5 rounded-full text-sm font-medium hover:bg-parallel-purple/90 transition-colors"
                  >
                    Send invite
                  </button>
                </div>
                {socialAndFeedback}
              </div>
            </>
          )

        /* ── No matches — waiting (never had any) ─────────────── */
        ) : !hasReceivedMatches ? (

          // Single "waiting" state regardless of subscription. We don't nudge to
          // subscribe here because there's nothing to unlock yet — the CTA appears
          // on the blurred paywall only once real matches exist (matches.length > 0).
          <div className="max-w-md mx-auto px-4 pt-4 pb-nav">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="mb-6">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto ring-4 ring-parallel-purple/20"
                  style={{ background: '#0D0D0F' }}
                  aria-hidden="true"
                >
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '.02em' }}>
                    P<span style={{ color: '#A98FD0' }}>//</span>
                  </span>
                </div>
              </div>
              <h2 className="text-3xl font-bold mb-2">We're building your city's matching pool now.</h2>
              <p className="text-parallel-purple font-medium mb-5">We'll notify you when it's ready.</p>
              <div className="w-full max-w-xs mb-6">
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #7B5EA7, #A98FD0)',
                      animation: 'matchingProgress 2.4s ease-in-out infinite',
                    }}
                  />
                </div>
                <style>{`
                  @keyframes matchingProgress {
                    0%   { width: 0%;  margin-left: 0%; }
                    50%  { width: 60%; margin-left: 20%; }
                    100% { width: 0%;  margin-left: 100%; }
                  }
                `}</style>
              </div>
            </div>

            <div className="bg-parallel-purple/10 border border-parallel-purple/20 rounded-2xl p-4 text-center">
              <p className="text-sm text-parallel-purple font-medium mb-1">Know someone who's a catch?</p>
              <p className="text-xs text-parallel-purple/70 mb-3 leading-relaxed">
                Invite them to join. The more people you invite, the more people they invite — and the better your matches get.
              </p>
              <button
                onClick={onNavigateToInvite || handleShareInvite}
                className="w-full bg-parallel-purple text-parallel-cream py-2.5 rounded-full text-sm font-medium hover:bg-parallel-purple/90 transition-colors"
              >
                Send invite
              </button>
            </div>
            {socialAndFeedback}
          </div>

        /* ── No matches — all caught up ───────────────────────── */
        ) : (
          // matches.length === 0 && hasReceivedMatches — the user has reviewed all
          // their current matches (liked or passed every one). New matches arrive as
          // new users join and the matching algorithm runs.
          <div className="max-w-md mx-auto px-4 pt-12 pb-nav flex flex-col items-center text-center">
            <div className="text-3xl mb-4" aria-hidden="true">✓</div>
            <h2 className="text-2xl font-bold mb-3">You're all caught up</h2>
            <p className="text-gray-600 mb-8 text-base leading-relaxed">
              You've reviewed all your current matches. New people join regularly — check back soon.
            </p>

            {/* Invite — primary CTA in this state */}
            <div className="w-full bg-parallel-purple/10 border border-parallel-purple/20 rounded-2xl p-6 mb-4 text-center">
              <p className="text-parallel-purple font-semibold mb-1">Know someone who's a catch?</p>
              <p className="text-sm text-parallel-purple/70 mb-4 leading-relaxed">
                Invite them to join. The more people you invite, the more people they invite — and the better your matches get.
              </p>
              <button
                onClick={onNavigateToInvite || handleShareInvite}
                className="w-full bg-parallel-purple text-parallel-cream py-3.5 rounded-full font-medium hover:bg-parallel-purple/90 transition-colors"
              >
                Send invite
              </button>
            </div>

            <button
              onClick={onRetakeQuestionnaire}
              className="w-full border border-gray-200 text-gray-700 px-8 py-3 rounded-full hover:border-gray-400 transition-colors text-sm"
            >
              Adjust preferences →
            </button>
            {socialAndFeedback}
          </div>
        )}

      </div>
    </div>
  );
}

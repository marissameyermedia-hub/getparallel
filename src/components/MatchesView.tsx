import { Match } from '../types';
import { SwipeableMatchView } from './SwipeableMatchView';
import { toast } from 'sonner';
import { EDGE_FUNCTION_URL, MATCHES_FUNCTION_URL, MISC_FUNCTION_URL } from '../utils/supabase/client';
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

// Stock photos used behind the locked-preview blur for unactivated users.
// These are royalty-free Unsplash portraits — never real seed photos. The
// images are heavily blurred at render time, so identifiable detail is
// obscured; they exist mainly to give a sense that real people are behind
// the wall and to mirror the geometry of the real swipe view.
const LOCKED_PREVIEW_PHOTOS = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=800&q=80',
];

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
  // Used by the SetupChecklist card at the top of Home.
  accessToken?: string | null;
  emailVerified?: boolean;
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
      <div className="bg-parallel-cream min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="mb-8 flex justify-center">
            <ParallelWordmark sizeClassName="text-4xl" />
          </div>
          <h2 className="text-3xl font-bold mb-4">You're in the pool. Matching opens soon.</h2>
          <p className="text-gray-600 text-lg leading-relaxed mb-6">
            We're building the matching pool right now. Invite friends — the bigger the pool, the better the matches.
          </p>
          <div className="space-y-3 mb-8">
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
    <div className="bg-parallel-cream">
      {/* Unified onboarding checklist: replaces the old standalone yellow
          email banner, the black "Verify your identity" bar, and the
          auto-firing PWA install prompt. One card, ranked by priority,
          dismissible, only on Home. */}
      <SetupChecklist
        accessToken={accessToken}
        emailVerified={emailVerified}
        identityVerified={isVerified}
        hasActivated={hasActivated}
        onOpenSubscribe={onNavigateToPayment}
        onOpenInstallPrompt={() => {
          try { window.dispatchEvent(new CustomEvent('parallel:open-install-prompt')); } catch { /* noop */ }
        }}
      />

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
                <div className="absolute inset-0 bg-parallel-void/30 flex flex-col items-center justify-center text-center px-6">
                  <div className="bg-parallel-cream/95 rounded-2xl px-6 py-5 max-w-xs">
                    <p className="text-2xl font-semibold mb-1">{matches.length} match{matches.length !== 1 ? 'es' : ''} waiting</p>
                    <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                      Your top match is {matches[0]?.compatibilityScore}% compatible.
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
          <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-5 text-center">
            <p className="font-semibold mb-1">Help us find better matches for you.</p>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Parallel is a new community. Every person you invite makes the pool better for everyone — including you.
            </p>
            <button
              onClick={onNavigateToInvite || handleShareInvite}
              className="w-full border-2 border-parallel-void text-parallel-void py-3 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors"
            >Invite a friend →</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="max-w-md mx-auto space-y-6">
            {[1, 2].map(i => (
              <div key={i} className="bg-parallel-cream border-2 border-gray-200 rounded-3xl overflow-hidden animate-pulse">
                <div className="aspect-[3/4] bg-gray-200"></div>
                <div className="p-6 space-y-3">
                  <div className="h-6 bg-gray-200 rounded-full w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded-full w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : matches.length === 0 ? (
          // ── Locked / waiting state ─────────────────────────────────
          // Two sub-states based on whether the user has paid:
          //   1. !hasActivated — show a blurred swipe-card preview behind a
          //      paywall card. This is the user's first taste of the swipe
          //      view UI, deliberately obscured to drive payment conversion.
          //      Tapping anywhere on the card stack opens pricing.
          //   2.  hasActivated && matches.length === 0 — they've paid but
          //      backend hasn't generated matches yet. Rare (the seed-match
          //      trigger is synchronous on Finish Profile) but possible if
          //      the user paid before completing onboarding. Keep the
          //      "matches on their way" copy from before.
          !hasActivated ? (
            <div className="max-w-md mx-auto px-4 pt-4 pb-8">
              {/* Blurred 3-card stack — mirrors SwipeableMatchView geometry
                  (max-w-md, rounded-3xl, inset-x-3 top-2 stacked-card pattern)
                  so when the user pays it transitions seamlessly to the real
                  view. The mock photos are royalty-free Unsplash portraits;
                  we never use real seed photos for marketing. The blur is
                  heavy enough to obscure faces while still giving a sense
                  that real people are behind the wall. */}
              <div className="relative mb-4" style={{ minHeight: '60vh' }}>
                {/* Card behind (deepest, smallest) */}
                <div
                  className="absolute inset-x-6 top-4 bottom-0 bg-gray-100 rounded-3xl border-2 border-gray-200"
                  style={{ zIndex: 0 }}
                  aria-hidden="true"
                />
                {/* Middle card */}
                <div
                  className="absolute inset-x-3 top-2 bottom-0 bg-gray-100 rounded-3xl border-2 border-gray-200 overflow-hidden"
                  style={{ zIndex: 1 }}
                  aria-hidden="true"
                >
                  <img
                    src={LOCKED_PREVIEW_PHOTOS[1]}
                    alt=""
                    className="w-full h-full object-cover blur-2xl scale-110 opacity-80"
                  />
                </div>
                {/* Top card — most visible (still blurred) */}
                <div
                  className="relative rounded-3xl border-2 border-gray-200 overflow-hidden bg-gray-100"
                  style={{ zIndex: 2, aspectRatio: '3/4' }}
                  aria-hidden="true"
                >
                  <img
                    src={LOCKED_PREVIEW_PHOTOS[0]}
                    alt=""
                    className="w-full h-full object-cover blur-2xl scale-110"
                  />
                  {/* Paywall overlay card — honest copy, no fake data */}
                  <div className="absolute inset-0 bg-parallel-void/40 flex flex-col items-center justify-center px-6">
                    <div className="bg-parallel-cream rounded-2xl px-6 py-6 max-w-xs w-full text-center shadow-2xl">
                      <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
                        Matching in progress
                      </p>
                      <h3 className="text-2xl font-bold mb-2 leading-tight">
                        Your matches are coming soon
                      </h3>
                      <p className="text-sm text-gray-600 mb-5 leading-relaxed">
                        The more people in the pool, the better your matches will be.
                      </p>
                      <button
                        onClick={onNavigateToPayment}
                        className="w-full bg-parallel-purple text-parallel-cream py-3 rounded-full font-semibold hover:bg-parallel-purple/90 transition-colors text-sm mb-3"
                      >
                        Get notified when ready →
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Referral growth callout — speed up your own matches by growing the pool */}
              <div
                className="rounded-2xl p-5 text-center mt-4"
                style={{ background: 'linear-gradient(135deg, #EEEDFE 0%, #F5F2EE 100%)' }}
              >
                <p className="font-semibold mb-1 text-sm" style={{ color: '#534AB7' }}>
                  // Speed up your matches
                </p>
                <p className="text-sm mb-4 leading-relaxed" style={{ color: '#3C3489' }}>
                  Every person you invite grows the pool. The bigger the pool, the faster your matches appear — and the better they get.
                </p>
                <button
                  onClick={onNavigateToInvite || handleShareInvite}
                  className="w-full py-2.5 rounded-full text-sm font-medium transition-colors"
                  style={{ background: '#7B5EA7', color: '#FFFFFF' }}
                >
                  Invite a friend →
                </button>
              </div>
            </div>
          ) : (
            // hasActivated && matches.length === 0 — paid, waiting on backend.
            // SetupChecklist shown here too — user may still have identity
            // verification pending even after paying.
            <div className="pb-8">
              <SetupChecklist
                accessToken={accessToken}
                emailVerified={emailVerified}
                identityVerified={isVerified}
                hasActivated={hasActivated}
                onOpenSubscribe={onNavigateToPayment}
                onOpenInstallPrompt={() => {
                  try { window.dispatchEvent(new CustomEvent('parallel:open-install-prompt')); } catch { /* noop */ }
                }}
              />
              <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
                <div className="mb-6">
                  {/* P// circle mark — locked brand mark */}
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                    style={{ background: '#0D0D0F' }}
                    aria-hidden="true"
                  >
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '.02em' }}>
                      P<span style={{ color: '#A98FD0' }}>//</span>
                    </span>
                  </div>
                </div>
                <h2 className="text-3xl font-bold mb-4">Your matches are on their way.</h2>
                <div className="w-full max-w-xs mb-6">
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-parallel-void rounded-full"
                      style={{ animation: 'matchingProgress 2.4s ease-in-out infinite' }}
                    />
                  </div>
                  <style>{`
                    @keyframes matchingProgress {
                      0%   { width: 0%;   margin-left: 0%; }
                      50%  { width: 60%;  margin-left: 20%; }
                      100% { width: 0%;   margin-left: 100%; }
                    }
                  `}</style>
                </div>
                <p className="text-gray-600 text-lg leading-relaxed mb-4 max-w-md">
                  We're finding your most compatible people. Turn on SMS notifications in Account and we'll text you when they're ready.
                </p>
                {/* Timeout fallback — if matching never runs, user isn't stranded */}
                <p className="text-sm text-gray-400 mb-8">
                  Taking longer than expected?{' '}
                  <a href="mailto:support@getparallel.vip" className="underline text-gray-500 hover:text-parallel-void transition-colors">
                    Contact support →
                  </a>
                </p>
                <button
                  onClick={onNavigateToInvite || handleShareInvite}
                  className="bg-parallel-purple text-parallel-cream px-8 py-4 rounded-full hover:bg-parallel-purple/90 transition-colors text-base font-medium mb-3"
                >
                  Invite a friend →
                </button>
                <p className="text-sm text-gray-500">
                  The more people you invite, the more people they invite, the better everyone's matches get.
                </p>
              </div>
            </div>
          )
        ) : validMatches.length === 0 ? (
          // ── All caught up state ────────────────────────────────
          // Primary CTA is "wait" not "change preferences" — that framing
          // implies the user did something wrong. Threshold transparency
          // note explains why matches may be fewer than expected.
          <div className="py-12 max-w-md mx-auto text-center px-4">
            <div className="text-3xl mb-4" aria-hidden="true">✓</div>
            <h2 className="text-2xl font-bold mb-3">You're all caught up</h2>
            <p className="text-gray-600 mb-4 text-base leading-relaxed">
              You've reviewed all your current matches. New people join regularly — check back soon.
            </p>
            {/* Threshold transparency — some matches may have been filtered below the
                compatibility threshold without the user knowing. Surface this so they
                understand why the screen is empty, and what they can do about it. */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 mb-8 text-sm text-gray-600 leading-relaxed text-left">
              Some matches may not have appeared because their compatibility score was below the current threshold for your pool size. Adjusting your preferences can help surface more people.
            </div>
            <button
              onClick={onNavigateToInvite || handleShareInvite}
              className="w-full bg-parallel-purple text-parallel-cream px-8 py-4 rounded-full hover:bg-parallel-purple/90 transition-colors text-base font-medium mb-3"
            >
              Wait for new matches
            </button>
            <button
              onClick={onRetakeQuestionnaire}
              className="w-full border-2 border-gray-200 text-gray-700 px-8 py-3 rounded-full hover:border-gray-400 transition-colors text-base mb-3"
            >
              Adjust preferences →
            </button>
            <button
              onClick={onNavigateToInvite || handleShareInvite}
              className="w-full border-2 border-gray-200 text-gray-700 px-8 py-3 rounded-full hover:border-gray-400 transition-colors text-base"
            >
              Invite a friend →
            </button>
            <p className="text-sm text-gray-500 mt-4">
              The more people you invite, the more people they invite, the better everyone's matches get.
            </p>
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

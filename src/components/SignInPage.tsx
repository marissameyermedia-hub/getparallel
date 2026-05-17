import { useState } from 'react';
import { ParallelWordmark } from './ParallelWordmark';
import { Mail, Lock, ArrowRight, X, Check, ShieldCheck, MapPin, Heart } from 'lucide-react';
import { AppFooter } from './AppFooter';
import { supabase } from '../utils/supabase/client';
import { useModalA11y } from '../utils/useModalA11y';

interface SignInPageProps {
  onSignIn: (accessToken: string, userId: string) => void;
  onCreateAccount: () => void;
  onShowExplainer: () => void;
  onNavigate?: (view: string) => void;
}

export function SignInPage({ onSignIn, onCreateAccount, onShowExplainer, onNavigate }: SignInPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Sign-in modal state
  const [showSignIn, setShowSignIn] = useState(false);

  // Forgot password (inside sign-in modal)
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('invalid login credentials') || msg.includes('invalid credentials') || msg.includes('email not confirmed')) {
          setError('Incorrect email or password. Please try again.');
        } else if (msg.includes('rate') || msg.includes('too many')) {
          setError('Too many attempts — please wait a few minutes and try again.');
        } else if (msg.includes('network') || msg.includes('fetch')) {
          setError('Network error. Please check your connection and try again.');
        } else {
          setError('Incorrect email or password. Please try again.');
        }
        setIsLoading(false);
        return;
      }
      localStorage.setItem('parallel_access_token', data.session.access_token);
      localStorage.setItem('parallel_user_id', data.user.id);
      localStorage.setItem('parallel_user_email', email);
      onSignIn(data.session.access_token, data.user.id);
    } catch (err: any) {
      setError('Something went wrong. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordClick = () => {
    setResetEmail(email);
    setShowForgotPassword(true);
    setResetSuccess(false);
    setResetError('');
    setError('');
  };

  const handleSendResetLink = async () => {
    if (!resetEmail) {
      setResetError('Please enter your email address');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: 'https://getparallel.vip',
      });
      if (error) setResetError(error.message || 'Failed to send reset link. Please try again.');
      else setResetSuccess(true);
    } catch (err: any) {
      setResetError(err.message || 'An error occurred. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleBackToSignIn = () => {
    setShowForgotPassword(false);
    setResetSuccess(false);
    setResetEmail('');
    setResetError('');
  };

  const closeSignInModal = () => {
    setShowSignIn(false);
    setShowForgotPassword(false);
    setError('');
    setResetError('');
    setResetSuccess(false);
  };

  // Wire Escape-to-close + body-scroll-lock + focus restore for the sign-in
  // modal. This handles both the welcome-back and forgot-password sub-states,
  // since closeSignInModal resets both.
  useModalA11y(showSignIn, closeSignInModal);

  return (
    <div className="min-h-screen bg-parallel-cream flex flex-col">
      {/* ── Top nav ───────────────────────────────────────────────── */}
      {/* fixed + paddingTop safe-area mirrors Header.tsx — sticky doesn't
          honour env() correctly on iOS PWA, fixed does. */}
      <nav className="fixed top-0 left-0 right-0 w-full border-b border-gray-100 bg-parallel-cream z-30" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Pre-app brand mark — full PARA//EL. wordmark per brand book. */}
          <ParallelWordmark variant="light" sizeClassName="text-base" />
          <button
            onClick={() => setShowSignIn(true)}
            className="text-sm text-gray-600 hover:text-parallel-void transition-colors font-medium"
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* Spacer so fixed nav doesn't overlap content — nav is py-4 (~56px) + safe area */}
      <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 56px)', flexShrink: 0 }} />

      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section className="w-full">
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-16 md:pt-20 md:pb-24">
          {/* Anchor both columns at the top — the card stack on the right is
              taller than the copy on the left, and items-center was pulling the
              headline halfway down the viewport. */}
          <div className="grid md:grid-cols-[1.1fr_1fr] gap-12 md:gap-16 items-start">

            {/* Left: copy. md:pt-4 nudges the headline down just enough so it
                visually sits across from the top edge of the angled cards. */}
            <div className="md:pt-4">
              <p className="text-xs tracking-[0.2em] uppercase text-gray-500 mb-5 font-medium">
                Professional matchmaking
              </p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] mb-6">
                Ready to get matched?
              </h1>
              <p className="text-lg text-gray-600 leading-relaxed mb-8 max-w-lg">
                Parallel is releasing matches city by city — when your city's match pool hits the threshold, everyone gets real matches at once. Complete your profile now so you're ready when your city opens.
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <button
                  onClick={onShowExplainer}
                  className="w-full sm:w-auto bg-parallel-purple text-parallel-cream px-8 py-4 rounded-full hover:bg-parallel-purple/90 transition-all flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md"
                >
                  Get matched
                  <ArrowRight size={18} />
                </button>
                <button
                  onClick={() => setShowSignIn(true)}
                  className="text-gray-600 hover:text-parallel-void transition-colors font-medium text-sm py-4 sm:px-4"
                >
                  Already a member? Sign in
                </button>
              </div>
              {onNavigate && (
                <div className="mt-4">
                  <button
                    onClick={() => onNavigate('waitlist')}
                    className="text-sm text-gray-500 hover:text-parallel-void transition-colors"
                  >
                    We're building your city now.{' '}
                    <span className="font-medium text-parallel-purple">Join the waitlist</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right: two match cards, one M, one F, visually overlapped.
                Reduced max width + tamed translations so the stack stays
                inside the hero section and doesn't dwarf the headline. */}
            <div className="relative py-4 md:py-8">
              <div className="relative max-w-[320px] mx-auto">
                <div className="md:-translate-x-4 md:rotate-[-3deg] transition-transform">
                  <PreviewMatchCard
                    name="Daniel"
                    age={31}
                    height={'6\'1"'}
                    location="Seattle · 3 miles away"
                    score={87}
                    photoUrl="https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=600&q=80&auto=format&fit=crop"
                    verified
                    bio="Software engineer, runner, dog dad to a very good golden named Olive."
                    breakdown={{
                      'Attachment & Emotional Health': 92,
                      'Communication & Conflict': 88,
                      'Life Goals': 90,
                      'Values & Beliefs': 84,
                      'Financial & Career': 86,
                      'Intimacy & Connection': 82,
                      'Lifestyle Behaviors': 85,
                      'Social & Shared Life': 89,
                    }}
                  />
                </div>
                {/* Maya: previously had md:-translate-y-24 which pushed her above
                    the section into the navbar. -translate-y-8 keeps the overlap
                    effect without breaking the layout. */}
                <div className="md:translate-x-6 md:-translate-y-8 md:rotate-[4deg] relative md:absolute md:inset-x-0 md:top-0 mt-6 md:mt-0 transition-transform">
                  <PreviewMatchCard
                    name="Maya"
                    age={28}
                    height={'5\'6"'}
                    location="Seattle · 4 miles away"
                    score={91}
                    photoUrl="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&q=80&auto=format&fit=crop"
                    verified
                    bio="Product designer, weekend hiker, reading my way through every Toni Morrison book."
                    breakdown={{
                      'Attachment & Emotional Health': 95,
                      'Communication & Conflict': 90,
                      'Life Goals': 94,
                      'Values & Beliefs': 91,
                      'Financial & Career': 88,
                      'Intimacy & Connection': 89,
                      'Lifestyle Behaviors': 92,
                      'Social & Shared Life': 87,
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-center text-gray-500 mt-8 md:mt-48 italic">
                Every match comes with a score and a reason why.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────── */}
      <section className="w-full border-t border-gray-100 bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-20 md:py-24">
          <div className="text-center mb-14">
            <p className="text-xs tracking-[0.2em] uppercase text-gray-500 mb-3 font-medium">How it works</p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              We do the work. You meet the right person.
            </h2>
          </div>

          <div className="space-y-10">
            <Step
              number="01"
              title="Answer 68 questions"
              body="Tell us exactly what you want — attraction, lifestyle, values, dealbreakers, the life you're building. About 15 minutes. Saves as you go."
            />
            <Step
              number="02"
              title="We run the numbers"
              body="The algorithm goes to work. We read your answers, run the math, and build your match pool. When your city is ready, we release matches for everyone at once — so your first experience is a good one."
            />
            <Step
              number="03"
              title="You make the call"
              body="You decide who to meet. We're with you the whole way — feedback, tips, and the nudge to get off the app and into the world."
            />
          </div>
        </div>
      </section>

      {/* ── WHY PARALLEL IS DIFFERENT ─────────────────────────────── */}
      <section className="w-full border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-20 md:py-24">
          <div className="text-center mb-14">
            <p className="text-xs tracking-[0.2em] uppercase text-gray-500 mb-3 font-medium">Why Parallel</p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
              Built differently.
            </h2>
            <p className="text-gray-600 leading-relaxed max-w-xl mx-auto">
              Everyone gets matched based on what actually matters. The algorithm does the heavy lifting so you don't have to.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-x-10 gap-y-8 md:gap-y-10">
            <Feature
              title="For people who know what they want"
              body="You're picky. We get it. The more specific you are, the better we match you."
            />
            <Feature
              title="No endless swiping"
              body="The algorithm finds your matches. Just the people who actually fit what you said."
            />
            <Feature
              title="We do the work"
              body="Our job is to find the person. Your job is to show up honest."
            />
            <Feature
              title="Verified members"
              body="Every member is identity-verified before they can match."
            />
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────── */}
      <section className="w-full border-t border-gray-100 bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-24 md:py-32 text-center">
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.15] mb-10 max-w-2xl mx-auto">
            One questionnaire stands between you and the person you've been looking for.
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <button
              onClick={onShowExplainer}
              className="w-full sm:w-auto bg-parallel-purple text-parallel-cream px-10 py-4 rounded-full hover:bg-parallel-purple/90 transition-all flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md"
            >
              Get matched
              <ArrowRight size={18} />
            </button>
            <button
              onClick={() => setShowSignIn(true)}
              className="text-gray-600 hover:text-parallel-void transition-colors font-medium text-sm py-4 sm:px-4"
            >
              Already a member? Sign in
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-6">
            $79/year for founding members
          </p>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      {onNavigate && <AppFooter onNavigate={onNavigate} />}

      {/* ── Sign-in modal ─────────────────────────────────────────── */}
      {showSignIn && (
        <div
          className="fixed inset-0 bg-parallel-void/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={closeSignInModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-in-modal-title"
        >
          <div
            className="bg-parallel-cream rounded-3xl w-full max-w-md shadow-2xl animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <div className="w-10 h-10 rounded-full bg-parallel-void flex items-center justify-center" aria-hidden="true">
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '.02em', userSelect: 'none' }}>
                  P<span style={{ color: '#A98FD0' }}>//</span>
                </span>
              </div>
              <button
                onClick={closeSignInModal}
                className="text-gray-500 hover:text-parallel-void transition-colors"
                aria-label="Close"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="px-6 pb-8 pt-4">
              {!showForgotPassword && (
                <>
                  <h2 id="sign-in-modal-title" className="text-2xl font-semibold tracking-tight mb-1">Welcome back.</h2>
                  <p className="text-gray-600 text-sm mb-6">Sign in to your Parallel account.</p>

                  {error && (
                    <div id="sign-in-error" role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <label htmlFor="email" className="block text-xs mb-1.5 text-gray-700 font-medium">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden="true" />
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full pl-11 pr-4 py-3 rounded-full border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
                          required
                          disabled={isLoading}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? 'sign-in-error' : undefined}
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="password" className="block text-xs mb-1.5 text-gray-700 font-medium">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden="true" />
                        <input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-11 pr-4 py-3 rounded-full border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
                          required
                          disabled={isLoading}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? 'sign-in-error' : undefined}
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-parallel-purple text-parallel-cream py-3.5 rounded-full hover:bg-parallel-purple/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-medium mt-2"
                    >
                      {isLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Signing in...
                        </>
                      ) : 'Sign in'}
                    </button>
                  </form>

                  <div className="text-center mt-4 space-y-2">
                    <button
                      onClick={handleForgotPasswordClick}
                      className="text-gray-500 hover:text-parallel-void transition-colors text-sm block w-full"
                    >
                      Forgot password?
                    </button>
                    <div className="pt-3 border-t border-gray-100">
                      <span className="text-sm text-gray-500">New to Parallel? </span>
                      <button
                        onClick={() => {
                          closeSignInModal();
                          onShowExplainer();
                        }}
                        className="text-parallel-void font-medium hover:underline text-sm"
                      >
                        Create an account
                      </button>
                    </div>
                  </div>
                </>
              )}

              {showForgotPassword && !resetSuccess && (
                <>
                  <h2 id="sign-in-modal-title" className="text-2xl font-semibold tracking-tight mb-1">Reset your password</h2>
                  <p className="text-gray-600 text-sm mb-6">We'll email you a secure reset link.</p>

                  {resetError && (
                    <div id="reset-error" role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl">
                      <p className="text-sm text-red-600">{resetError}</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label htmlFor="resetEmail" className="block text-xs mb-1.5 text-gray-700 font-medium">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden="true" />
                        <input
                          id="resetEmail"
                          type="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full pl-11 pr-4 py-3 rounded-full border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
                          required
                          disabled={resetLoading}
                          aria-invalid={resetError ? true : undefined}
                          aria-describedby={resetError ? 'reset-error' : undefined}
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSendResetLink}
                      disabled={resetLoading}
                      className="w-full bg-parallel-purple text-parallel-cream py-3.5 rounded-full hover:bg-parallel-purple/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-medium mt-2"
                    >
                      {resetLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Sending...
                        </>
                      ) : 'Send reset link'}
                    </button>

                    <button
                      type="button"
                      onClick={handleBackToSignIn}
                      className="w-full text-gray-500 hover:text-parallel-void transition-colors text-sm py-2"
                    >
                      Back to sign in
                    </button>
                  </div>
                </>
              )}

              {showForgotPassword && resetSuccess && (
                <>
                  <div className="w-12 h-12 rounded-full bg-green-50 border-2 border-green-200 mx-auto flex items-center justify-center mb-4">
                    <Check className="w-6 h-6 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight mb-2 text-center">Check your email</h2>
                  <p className="text-gray-600 text-sm mb-6 text-center">
                    We've sent a reset link to <span className="font-medium text-parallel-void">{resetEmail}</span>.
                    If you don't see it, check your spam folder.
                  </p>
                  <button
                    type="button"
                    onClick={handleBackToSignIn}
                    className="w-full bg-parallel-purple text-parallel-cream py-3.5 rounded-full hover:bg-parallel-purple/90 transition-all font-medium"
                  >
                    Back to sign in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helper components — local to this page only
// ─────────────────────────────────────────────────────────────────

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-5 md:gap-8 items-start">
      <span className="text-4xl md:text-5xl font-light text-gray-300 leading-none tabular-nums pt-1">
        {number}
      </span>
      <div>
        <h3 className="text-xl md:text-2xl font-semibold mb-2 tracking-tight">{title}</h3>
        <p className="text-gray-600 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-5 h-5 rounded-full bg-parallel-void flex-shrink-0 mt-1 flex items-center justify-center">
        <Check className="w-3 h-3 text-parallel-cream" strokeWidth={3} />
      </div>
      <div>
        <h3 className="font-semibold mb-1 tracking-tight">{title}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PreviewMatchCard — a visually faithful static replica of MatchCard
// used ONLY on the landing page hero as a "this is what every match
// looks like" preview. Mirrors MatchCard's structure exactly:
//   - aspect-[3/4] photo with verified badge top-left + score pill
//     top-right + name/age/height overlay at bottom
//   - bio + 8-category compatibility breakdown with the SAME colors
//     as MatchCard + MatchProfileView
//   - Pass/Like buttons at the bottom (decorative — no handlers)
//
// NOTE: Not using the real MatchCard component because it requires
// a full Match object with user IDs, photo arrays, matchDetails with
// breakdown nesting, and it has onClick handlers that would navigate.
// This is a static marketing surface — keep it isolated.
// ─────────────────────────────────────────────────────────────────

const CATEGORY_ORDER = [
  'Attachment & Emotional Health',
  'Communication & Conflict',
  'Life Goals',
  'Values & Beliefs',
  'Financial & Career',
  'Intimacy & Connection',
  'Lifestyle Behaviors',
  'Social & Shared Life',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  'Attachment & Emotional Health': 'bg-purple-500',
  'Communication & Conflict': 'bg-indigo-500',
  'Life Goals': 'bg-blue-500',
  'Values & Beliefs': 'bg-cyan-500',
  'Financial & Career': 'bg-amber-500',
  'Intimacy & Connection': 'bg-pink-500',
  'Lifestyle Behaviors': 'bg-green-500',
  'Social & Shared Life': 'bg-orange-400',
};

function getMatchLabel(score: number) {
  if (score >= 90) return 'Exceptional';
  if (score >= 80) return 'Strong Match';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Moderate';
  return 'Some Potential';
}

function PreviewMatchCard({
  name,
  age,
  height,
  location,
  score,
  photoUrl,
  verified = false,
  bio,
  breakdown,
}: {
  name: string;
  age: number;
  height?: string;
  location: string;
  score: number;
  photoUrl: string;
  verified?: boolean;
  bio?: string;
  breakdown: Record<string, number>;
}) {
  return (
    <div className="bg-parallel-cream rounded-2xl border-2 border-gray-200 overflow-hidden shadow-xl">
      {/* Photo zone — aspect-[3/4] */}
      <div className="relative aspect-[3/4] bg-gray-100">
        <img src={photoUrl} alt={name} className="w-full h-full object-cover" />

        {/* Verified badge — top left */}
        {verified && (
          <div className="absolute top-3 left-3 bg-blue-500 rounded-full p-1.5 shadow-lg z-20">
            <ShieldCheck size={16} className="text-parallel-cream" />
          </div>
        )}

        {/* Compatibility badge — top right (two-line: score + label) */}
        <div className="absolute top-3 right-3 bg-parallel-cream rounded-full px-3 py-1.5 shadow-lg border-2 border-gray-200 z-20">
          <div className="text-center">
            <div className="text-base font-bold leading-none">{score}%</div>
            <div className="text-xs text-gray-500 whitespace-nowrap mt-0.5">{getMatchLabel(score)}</div>
          </div>
        </div>

        {/* Name/age/height/location overlay at bottom of photo */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 z-10">
          <p className="text-parallel-cream text-xl font-semibold leading-tight">
            {name}, {age}{height ? ` · ${height}` : ''}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <MapPin size={12} className="text-parallel-cream/70 flex-shrink-0" />
            <p className="text-parallel-cream/80 text-xs">{location}</p>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-5 space-y-4">

        {/* Bio */}
        {bio && <p className="text-sm text-gray-700 leading-relaxed">{bio}</p>}

        {/* 8-category compatibility breakdown */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Compatibility Breakdown
          </h4>
          <div className="space-y-2.5">
            {CATEGORY_ORDER.map((label) => {
              const raw = breakdown[label];
              const hasScore = typeof raw === 'number' && raw > 0;
              const barColor = CATEGORY_COLORS[label] || 'bg-parallel-void';
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${hasScore ? 'text-gray-700' : 'text-gray-500'}`}>{label}</span>
                    {hasScore ? (
                      <span className="text-xs font-medium text-gray-800">{raw}%</span>
                    ) : (
                      <span className="text-[10px] italic text-gray-500">Not enough data yet</span>
                    )}
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    {hasScore && (
                      <div className={`h-full ${barColor} rounded-full`} style={{ width: `${raw}%` }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons — visually identical to MatchCard but decorative (no handlers) */}
        <div className="flex items-center gap-3 pt-1">
          <div className="w-12 h-12 border-2 border-gray-200 rounded-full flex flex-col items-center justify-center gap-0.5 flex-shrink-0" aria-hidden="true">
            <X size={16} className="text-gray-500" />
            <span className="text-[10px] text-gray-500">Pass</span>
          </div>
          <div className="flex-1 h-12 rounded-full bg-parallel-purple text-parallel-cream flex items-center justify-center gap-2 font-medium" aria-hidden="true">
            <Heart size={18} />
            <span className="text-sm">Like</span>
          </div>
        </div>
      </div>
    </div>
  );
}
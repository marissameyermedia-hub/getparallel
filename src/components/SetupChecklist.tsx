import { useState, useEffect } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { EMAIL_FUNCTION_URL, MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

// SetupChecklist
// ------------------------------------------------------------------
// A single "Your matchmaking checklist" card that sits at the top of
// Home and replaces the old stack of nag banners (yellow email banner,
// black identity bar, separate PWA prompt). Replaces all three with
// one consolidated, dismissible card.
//
// Active rows (in priority order):
//   - Profile complete (always checked, decorative)
//   - Verify your email (clickable; resends verification email; on
//     success animates to green ✓ and disappears from the list)
//   - Subscribe to Parallel (clickable; shown when hasActivated===false;
//     navigates to the pricing page via onOpenSubscribe or dispatches
//     the parallel:open-subscribe custom event as a fallback)
//   - Verify your identity (clickable; only shown once subscribed;
//     navigates to the verification flow. Requires an active subscription
//     so we deliberately gate it behind the Subscribe row.)
//   - Turn on SMS alerts (clickable; routes to /account/notifications
//     where the user can opt in. Hides once sms_enabled=true.)
//   - Add to home screen (only appears once user has liked at least
//     one match; tapping it opens the existing PWA install modal)
//
// Behavior:
//   - Card is collapsible. "Hide" collapses to a small pill at the top
//     of Home that says "Setup (N left)". Tap pill to re-expand.
//   - Card hides entirely once all actionable rows are complete.
//     Card never appears if user has nothing left to do.

const COLLAPSED_KEY = 'parallel_setup_collapsed_v1';
const FIRST_LIKE_KEY = 'parallel_first_like_at';
const PWA_DISMISSED_KEY = 'parallel_install_prompt_dismissed_at';
const EMAIL_JUST_VERIFIED_MS = 3000; // how long to show the green ✓ before the row disappears

interface SetupChecklistProps {
  accessToken: string | null;
  emailVerified: boolean;
  identityVerified: boolean;
  onOpenInstallPrompt: () => void;
  // Whether the user has an active subscription.
  // false  → show "Subscribe" row, hide identity-verification row.
  // true   → hide "Subscribe" row, show identity-verification row.
  // undefined → unknown (checklist was rendered before profile loaded);
  //             subscribe row is hidden, identity row shows as before.
  hasActivated?: boolean;
  // Navigates to the pricing / subscribe page when the Subscribe row is tapped.
  // Optional — falls back to dispatching the parallel:open-subscribe custom event.
  onOpenSubscribe?: () => void;
  // Navigates to /account/notifications when SMS row is tapped.
  // Optional — falls back to a no-op if not provided (gracefully degrades).
  onOpenNotifications?: () => void;
  // Navigates to the identity verification flow when that row is tapped.
  // Optional — falls back to dispatching parallel:open-verification.
  onOpenVerification?: () => void;
}

export function SetupChecklist({
  accessToken,
  emailVerified,
  identityVerified,
  onOpenInstallPrompt,
  hasActivated,
  onOpenSubscribe,
  onOpenNotifications,
  onOpenVerification,
}: SetupChecklistProps) {
  // ── state ────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });

  // Email-verify row interaction
  const [emailSending, setEmailSending] = useState(false);
  const [emailJustVerified, setEmailJustVerified] = useState(false);
  const [emailError, setEmailError] = useState<string>('');

  // SMS opt-in status. Fetched from /notifications/preferences on mount
  // and re-fetched on focus so this row clears as soon as the user opts
  // in from the Notifications page and comes back.
  const [smsEnabled, setSmsEnabled] = useState<boolean>(false);
  const [smsLoaded, setSmsLoaded] = useState<boolean>(false);

  const fetchSmsStatus = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${MISC_FUNCTION_URL}/notifications/preferences`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': publicAnonKey,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setSmsEnabled(Boolean(data?.sms_enabled));
      }
    } catch { /* noop — leave smsEnabled at last known value */ }
    finally {
      setSmsLoaded(true);
    }
  };

  useEffect(() => {
    fetchSmsStatus();
    const onFocus = () => fetchSmsStatus();
    window.addEventListener('focus', onFocus);
    // Optional broadcast hook for NotificationsView to fire after a
    // successful opt-in, so the checklist updates without a tab switch.
    window.addEventListener('parallel:sms-status', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('parallel:sms-status', onFocus);
    };
    // accessToken never changes mid-session in practice; gating on it here
    // ensures we don't fire before sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Has the user liked at least one match? Drives whether we show PWA row.
  // We re-read from localStorage on mount and on focus, since likes happen
  // after the checklist mounts.
  const [hasLiked, setHasLiked] = useState<boolean>(() => {
    try { return !!localStorage.getItem(FIRST_LIKE_KEY); } catch { return false; }
  });
  useEffect(() => {
    const recheck = () => {
      try { setHasLiked(!!localStorage.getItem(FIRST_LIKE_KEY)); } catch { /* noop */ }
    };
    window.addEventListener('focus', recheck);
    window.addEventListener('parallel:first-like', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('parallel:first-like', recheck);
    };
  }, []);

  // Has the PWA been installed (or its prompt explicitly dismissed for this snooze)?
  const [pwaDone, setPwaDone] = useState<boolean>(() => {
    try {
      const installed = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as any).standalone === true;
      const dismissedAt = localStorage.getItem(PWA_DISMISSED_KEY);
      return installed || !!dismissedAt;
    } catch { return false; }
  });
  useEffect(() => {
    const recheck = () => {
      try {
        const installed = window.matchMedia('(display-mode: standalone)').matches
          || (window.navigator as any).standalone === true;
        const dismissedAt = localStorage.getItem(PWA_DISMISSED_KEY);
        setPwaDone(installed || !!dismissedAt);
      } catch { /* noop */ }
    };
    window.addEventListener('focus', recheck);
    window.addEventListener('parallel:pwa-status', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('parallel:pwa-status', recheck);
    };
  }, []);

  // ── derived: which actionable rows are still pending? ────────────
  const emailPending = !emailVerified && !emailJustVerified;

  // Subscribe row: only shown when we KNOW the user is not subscribed.
  // undefined means "not yet loaded" — we hide the row to avoid flicker.
  const subscribePending = hasActivated === false;

  // Identity row: only shown when the user IS subscribed (hasActivated===true)
  // and hasn't verified yet. When hasActivated is undefined (loading), we
  // preserve the old behavior and show the row if identityVerified is false.
  const identityPending = !identityVerified;
  const showIdentityRow = hasActivated !== false && identityPending;

  // Only show the SMS row once we've loaded prefs (avoids briefly showing
  // it for users who already opted in). Hides the row once enabled.
  const smsPending = smsLoaded && !smsEnabled;
  const pwaPending = hasLiked && !pwaDone;

  const actionableCount =
    (emailPending ? 1 : 0) +
    (subscribePending ? 1 : 0) +
    (showIdentityRow ? 1 : 0) +
    (smsPending ? 1 : 0) +
    (pwaPending ? 1 : 0);

  // Hide the card entirely when the user has nothing actionable left.
  if (actionableCount === 0 && !emailJustVerified) return null;

  // ── handlers ─────────────────────────────────────────────────────
  const handleToggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* noop */ }
  };

  const handleResendEmail = async () => {
    if (emailSending || !accessToken) return;
    setEmailError('');
    setEmailSending(true);
    try {
      const res = await fetch(`${EMAIL_FUNCTION_URL}/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': publicAnonKey,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEmailError(data?.error || 'Could not send. Try again in a minute.');
      } else if (data.alreadyVerified) {
        // Edge case: backend says we're verified. Trigger the success
        // animation; App will catch up on its next status fetch.
        setEmailJustVerified(true);
        setTimeout(() => setEmailJustVerified(false), EMAIL_JUST_VERIFIED_MS);
      } else {
        // We sent the email but haven't actually verified yet. Show a
        // brief "Sent ✓" pill on the row instead of marking it done —
        // the row only goes green once they actually click the link.
        setEmailError(''); // clear any prior error
      }
    } catch {
      setEmailError('Network error. Try again.');
    } finally {
      setEmailSending(false);
    }
  };

  const handleSubscribeTap = () => {
    if (onOpenSubscribe) {
      onOpenSubscribe();
    } else {
      try { window.dispatchEvent(new CustomEvent('parallel:open-subscribe')); } catch { /* noop */ }
    }
  };

  const handleVerificationTap = () => {
    if (onOpenVerification) {
      onOpenVerification();
    } else {
      try { window.dispatchEvent(new CustomEvent('parallel:open-verification')); } catch { /* noop */ }
    }
  };

  const handleSmsTap = () => {
    if (onOpenNotifications) {
      onOpenNotifications();
    } else {
      // Fallback — broadcast an event the parent can listen for if it
      // hasn't wired the prop. Prevents a dead row.
      try { window.dispatchEvent(new CustomEvent('parallel:open-notifications')); } catch { /* noop */ }
    }
  };

  const handleInstallTap = () => {
    onOpenInstallPrompt();
  };

  // ── collapsed pill ───────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="max-w-md mx-auto px-4 pt-3">
        <button
          type="button"
          onClick={handleToggleCollapse}
          className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors rounded-full px-3 py-1.5"
          aria-expanded="false"
          aria-controls="setup-checklist-card"
        >
          <span aria-hidden="true">☐</span>
          Setup ({actionableCount} left)
        </button>
      </div>
    );
  }

  // ── expanded card ────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto px-4 pt-3" id="setup-checklist-card">
      <div className="bg-parallel-cream border border-gray-200 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-[15px]">Your matchmaking checklist</h2>
          <button
            type="button"
            onClick={handleToggleCollapse}
            className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors px-2 py-1 -mr-1"
            aria-label="Hide checklist"
          >
            Hide
          </button>
        </div>

        {/* Rows */}
        <ul className="divide-y divide-gray-100" role="list">
          {/* Profile complete — always done */}
          <li className="flex items-center gap-3 px-4 py-3">
            <CheckCircle done />
            <span className="flex-1 text-sm text-gray-500 line-through decoration-gray-300">Profile complete</span>
          </li>

          {/* Email verification — actionable */}
          {(emailPending || emailJustVerified) && (
            <li>
              <button
                type="button"
                onClick={handleResendEmail}
                disabled={emailSending || emailJustVerified}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
                aria-label="Verify your email"
              >
                <CheckCircle done={emailJustVerified} />
                <span className="flex-1 min-w-0">
                  <span className={`text-sm block ${emailJustVerified ? 'text-green-700 font-medium' : 'text-gray-900'}`}>
                    {emailJustVerified ? 'Email verified' : 'Verify your email'}
                  </span>
                  {!emailJustVerified && (
                    <span className="text-xs text-gray-500 block mt-0.5 leading-snug">
                      {emailSending
                        ? 'Sending verification email…'
                        : emailError
                          ? <span className="text-red-700">{emailError}</span>
                          : 'Tap to resend the verification link'}
                    </span>
                  )}
                </span>
                {!emailJustVerified && !emailSending && (
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
                )}
                {emailSending && <Spinner />}
              </button>
            </li>
          )}

          {/* Subscribe — shown when hasActivated is explicitly false.
              Must come before identity verification in the list because
              Persona ID verification requires an active subscription. */}
          {subscribePending && (
            <li>
              <button
                type="button"
                onClick={handleSubscribeTap}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                aria-label="Subscribe to Parallel"
              >
                <CheckCircle />
                <span className="flex-1 min-w-0">
                  <span className="text-sm block text-gray-900">Subscribe to Parallel</span>
                  <span className="text-xs text-gray-500 block mt-0.5 leading-snug">
                    Unlock your matches and start messaging
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
              </button>
            </li>
          )}

          {/* Identity verification — only shown once subscribed.
              ID verification via Persona requires an active subscription,
              so we gate this row on hasActivated===true. */}
          {showIdentityRow && (
            <li>
              <button
                type="button"
                onClick={handleVerificationTap}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                aria-label="Verify your identity"
              >
                <CheckCircle />
                <span className="flex-1 min-w-0">
                  <span className="text-sm block text-gray-900">Verify your identity</span>
                  <span className="text-xs text-gray-500 block mt-0.5 leading-snug">
                    Get a blue checkmark on your profile
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
              </button>
            </li>
          )}

          {/* SMS alerts — actionable, hides once sms_enabled=true */}
          {smsPending && (
            <li>
              <button
                type="button"
                onClick={handleSmsTap}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                aria-label="Turn on SMS alerts"
              >
                <CheckCircle />
                <span className="flex-1 min-w-0">
                  <span className="text-sm block text-gray-900">Turn on SMS alerts</span>
                  <span className="text-xs text-gray-500 block mt-0.5 leading-snug">
                    Get a text when you match or get a message
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
              </button>
            </li>
          )}

          {/* PWA install — only after first like */}
          {pwaPending && (
            <li>
              <button
                type="button"
                onClick={handleInstallTap}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                aria-label="Add Parallel to your home screen"
              >
                <CheckCircle />
                <span className="flex-1 min-w-0">
                  <span className="text-sm block text-gray-900">Add to home screen</span>
                  <span className="text-xs text-gray-500 block mt-0.5 leading-snug">
                    Get push notifications when you match
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

// ── small subcomponents ────────────────────────────────────────────

function CheckCircle({ done = false }: { done?: boolean }) {
  if (done) {
    return (
      <span
        className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0"
        aria-hidden="true"
      >
        <Check className="w-3 h-3 text-parallel-cream" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0"
      aria-hidden="true"
    />
  );
}

function Spinner() {
  return (
    <svg
      className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

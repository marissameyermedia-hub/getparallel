import { useState, useEffect } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { EMAIL_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

// SetupChecklist
// ------------------------------------------------------------------
// Five-item progress checklist rendered at the top of Home and Inbox.
//
// Always visible:
//   1. Profile complete       — always ✓
//   2. Verify your email      — ✓ when emailVerified
//   3. Set notifications      — ✓ when user taps Save on the notifications
//                               page (localStorage 'parallel_prefs_saved')
//
// Visible only when hasMatches === true:
//   4. Subscribe              — ✓ when hasActivated === true
//
// Visible only when hasMatches === true AND hasActivated === true:
//   5. Verify your identity   — ✓ when identityVerified
//
// Once checked, rows stay visible with the ✓ — they don't disappear.
// The card hides entirely when every visible item is checked.
// No collapse-to-pill behavior. No SMS or PWA install rows.

const PREFS_SAVED_KEY = 'parallel_prefs_saved';
const EMAIL_JUST_VERIFIED_MS = 3000;

interface SetupChecklistProps {
  accessToken: string | null;
  emailVerified: boolean;
  identityVerified: boolean;
  // undefined = still loading — hide gated rows until known.
  hasActivated?: boolean;
  hasMatches?: boolean;
  // Navigation callbacks. Each falls back to a custom event so the component
  // works even when the parent doesn't wire the prop.
  onOpenNotifications?: () => void;
  onOpenSubscribe?: () => void;
  onOpenVerification?: () => void;
}

export function SetupChecklist({
  accessToken,
  emailVerified,
  identityVerified,
  hasActivated,
  hasMatches,
  onOpenNotifications,
  onOpenSubscribe,
  onOpenVerification,
}: SetupChecklistProps) {
  // ── Email resend state ────────────────────────────────────────────
  const [emailSending, setEmailSending] = useState(false);
  const [emailJustVerified, setEmailJustVerified] = useState(false);
  const [emailError, setEmailError] = useState('');

  // ── Notification prefs saved ──────────────────────────────────────
  // Written by NotificationsView when the user taps "Save preferences".
  // Re-read on focus and on the parallel:prefs-saved broadcast so the
  // checklist updates immediately after returning from that screen.
  const [prefsSaved, setPrefsSaved] = useState<boolean>(() => {
    try { return !!localStorage.getItem(PREFS_SAVED_KEY); } catch { return false; }
  });
  useEffect(() => {
    const recheck = () => {
      try { setPrefsSaved(!!localStorage.getItem(PREFS_SAVED_KEY)); } catch { /* noop */ }
    };
    window.addEventListener('focus', recheck);
    window.addEventListener('parallel:prefs-saved', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('parallel:prefs-saved', recheck);
    };
  }, []);

  // ── Derived visibility and completion ─────────────────────────────
  const item2Done = emailVerified || emailJustVerified;
  const item3Done = prefsSaved;
  const item4Visible = hasMatches === true;
  const item4Done = hasActivated === true;
  const item5Visible = hasMatches === true && hasActivated === true;
  const item5Done = identityVerified;

  const pendingCount =
    (item2Done ? 0 : 1) +
    (item3Done ? 0 : 1) +
    (item4Visible && !item4Done ? 1 : 0) +
    (item5Visible && !item5Done ? 1 : 0);

  // Card hides when everything visible is done. The emailJustVerified guard
  // keeps the card open for 3s after a resend returns alreadyVerified=true
  // so the user sees the green ✓ before it disappears.
  if (pendingCount === 0 && !emailJustVerified) return null;

  // ── Handlers ─────────────────────────────────────────────────────
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
        setEmailJustVerified(true);
        setTimeout(() => setEmailJustVerified(false), EMAIL_JUST_VERIFIED_MS);
      }
      // On plain success (email was re-sent): no state change — the row stays
      // as "Tap to resend" until the user actually clicks the link.
    } catch {
      setEmailError('Network error. Try again.');
    } finally {
      setEmailSending(false);
    }
  };

  const handleNotificationsTap = () => {
    if (onOpenNotifications) {
      onOpenNotifications();
    } else {
      try { window.dispatchEvent(new CustomEvent('parallel:open-notifications')); } catch { /* noop */ }
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

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto px-4 pt-3" id="setup-checklist-card">
      <div className="bg-parallel-cream border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-[15px]">Your setup checklist</h2>
        </div>

        <ul className="divide-y divide-gray-100" role="list">

          {/* 1. Profile complete — always ✓, decorative */}
          <li className="flex items-center gap-3 px-4 py-3">
            <Dot done />
            <span className="flex-1 text-sm text-gray-500 line-through decoration-gray-300">
              Profile complete
            </span>
          </li>

          {/* 2. Verify email */}
          {item2Done ? (
            <li className="flex items-center gap-3 px-4 py-3">
              <Dot done />
              <span className={`flex-1 text-sm ${emailJustVerified ? 'text-green-700 font-medium' : 'text-gray-500 line-through decoration-gray-300'}`}>
                {emailJustVerified ? 'Email verified' : 'Verify your email'}
              </span>
            </li>
          ) : (
            <li>
              <button
                type="button"
                onClick={handleResendEmail}
                disabled={emailSending}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
                aria-label="Verify your email"
              >
                <Dot />
                <span className="flex-1 min-w-0">
                  <span className="text-sm block text-gray-900">Verify your email</span>
                  <span className="text-xs block mt-0.5 leading-snug">
                    {emailSending
                      ? <span className="text-gray-500">Sending verification email…</span>
                      : emailError
                        ? <span className="text-red-700">{emailError}</span>
                        : <span className="text-gray-500">Tap to resend the verification link</span>}
                  </span>
                </span>
                {!emailSending
                  ? <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden="true" />
                  : <Spinner />}
              </button>
            </li>
          )}

          {/* 3. Set notification preferences */}
          {item3Done ? (
            <li className="flex items-center gap-3 px-4 py-3">
              <Dot done />
              <span className="flex-1 text-sm text-gray-500 line-through decoration-gray-300">
                Set notification preferences
              </span>
            </li>
          ) : (
            <li>
              <button
                type="button"
                onClick={handleNotificationsTap}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                aria-label="Set notification preferences"
              >
                <Dot />
                <span className="flex-1 min-w-0">
                  <span className="text-sm block text-gray-900">Set notification preferences</span>
                  <span className="text-xs text-gray-500 block mt-0.5 leading-snug">
                    Choose how to hear about new matches
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden="true" />
              </button>
            </li>
          )}

          {/* 4. Subscribe — only visible when there are matches */}
          {item4Visible && (
            item4Done ? (
              <li className="flex items-center gap-3 px-4 py-3">
                <Dot done />
                <span className="flex-1 text-sm text-gray-500 line-through decoration-gray-300">
                  Subscribe to see your matches
                </span>
              </li>
            ) : (
              <li>
                <button
                  type="button"
                  onClick={handleSubscribeTap}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  aria-label="Subscribe to Parallel"
                >
                  <Dot />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm block text-gray-900">Subscribe to see your matches</span>
                    <span className="text-xs text-gray-500 block mt-0.5 leading-snug">
                      Unlock your matches and start messaging
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden="true" />
                </button>
              </li>
            )
          )}

          {/* 5. Verify identity — only visible when subscribed + has matches */}
          {item5Visible && (
            item5Done ? (
              <li className="flex items-center gap-3 px-4 py-3">
                <Dot done />
                <span className="flex-1 text-sm text-gray-500 line-through decoration-gray-300">
                  Verify your identity
                </span>
              </li>
            ) : (
              <li>
                <button
                  type="button"
                  onClick={handleVerificationTap}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  aria-label="Verify your identity"
                >
                  <Dot />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm block text-gray-900">Verify your identity</span>
                    <span className="text-xs text-gray-500 block mt-0.5 leading-snug">
                      Get a blue checkmark on your profile
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden="true" />
                </button>
              </li>
            )
          )}

        </ul>
      </div>
    </div>
  );
}

// ── Small subcomponents ────────────────────────────────────────────

function Dot({ done = false }: { done?: boolean }) {
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
      className="w-4 h-4 text-gray-500 animate-spin flex-shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

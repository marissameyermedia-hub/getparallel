import { useState, useEffect } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { EMAIL_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

// SetupChecklist
// ------------------------------------------------------------------
// A single "Your matchmaking checklist" card that sits at the top of
// Home and replaces the old stack of nag banners (yellow email banner,
// black identity bar, separate PWA prompt). Replaces all three with
// one consolidated, dismissible card.
//
// Active rows:
//   - Profile complete (always checked, decorative)
//   - Verify your email (clickable; resends verification email; on
//     success animates to green ✓ and disappears from the list)
//   - Add to home screen (only appears once user has liked at least
//     one match; tapping it opens the existing PWA install modal)
//
// Coming-soon rows (greyed, non-clickable, shown for transparency):
//   - Verify your identity   [Coming soon]
//   - Turn on SMS alerts     [Coming soon]
//
// Behavior:
//   - Card is collapsible. "Hide" collapses to a small pill at the top
//     of Home that says "Setup (N left)". Tap pill to re-expand.
//   - Card hides entirely once email is verified AND PWA is dismissed
//     or installed (the only two actionable items during beta).
//   - Card never appears if user has nothing to do.

const COLLAPSED_KEY = 'parallel_setup_collapsed_v1';
const FIRST_LIKE_KEY = 'parallel_first_like_at';
const PWA_DISMISSED_KEY = 'parallel_install_prompt_dismissed_at';
const EMAIL_JUST_VERIFIED_MS = 3000; // how long to show the green ✓ before the row disappears

interface SetupChecklistProps {
  accessToken: string | null;
  emailVerified: boolean;
  identityVerified: boolean;
  onOpenInstallPrompt: () => void;
}

export function SetupChecklist({
  accessToken,
  emailVerified,
  identityVerified: _identityVerified, // currently unused (identity is coming-soon)
  onOpenInstallPrompt,
}: SetupChecklistProps) {
  // ── state ────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });

  // Email-verify row interaction
  const [emailSending, setEmailSending] = useState(false);
  const [emailJustVerified, setEmailJustVerified] = useState(false);
  const [emailError, setEmailError] = useState<string>('');

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
  const pwaPending = hasLiked && !pwaDone;
  const actionableCount = (emailPending ? 1 : 0) + (pwaPending ? 1 : 0);

  // Hide the card entirely when the user has nothing actionable left.
  // Coming-soon rows don't count — they aren't tasks the user can do.
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
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
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

          {/* Identity — coming soon */}
          <li className="flex items-center gap-3 px-4 py-3 opacity-60">
            <CheckCircle />
            <span className="flex-1 text-sm text-gray-700">Verify your identity</span>
            <ComingSoonTag />
          </li>

          {/* SMS alerts — coming soon */}
          <li className="flex items-center gap-3 px-4 py-3 opacity-60">
            <CheckCircle />
            <span className="flex-1 text-sm text-gray-700">Turn on SMS alerts</span>
            <ComingSoonTag />
          </li>

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
        <Check className="w-3 h-3 text-white" strokeWidth={3} />
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

function ComingSoonTag() {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
      Coming soon
    </span>
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

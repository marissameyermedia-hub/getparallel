import { useState, useEffect } from 'react';
import { Mail, X, Loader2, Check } from 'lucide-react';
import { EMAIL_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

// EmailVerificationBanner
// ------------------------------------------------------------------
// Soft, persistent banner that sits above all in-app views when the
// signed-in user has not yet verified their email. Non-blocking: the
// user can use the app normally; this just nudges them to confirm so
// match-notification emails will reach them.
//
// Behavior:
// - Hidden when accessToken is null or emailVerified is true.
// - Dismissable for the current session via sessionStorage so it
//   doesn't nag inside a single visit, but returns on next app open.
// - "Resend" button calls the new email function (POST /email/resend),
//   shows a spinner, and flips to a "Sent ✓" state for ~6s.
//
// The banner is intentionally a thin yellow strip — large enough to
// notice, small enough to ignore.

const SESSION_DISMISS_KEY = 'parallel_email_banner_dismissed';

interface EmailVerificationBannerProps {
  accessToken: string | null;
  emailVerified: boolean;
  onVerifiedFromExternalEvent?: () => void;
}

export function EmailVerificationBanner({
  accessToken,
  emailVerified,
}: EmailVerificationBannerProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [error, setError] = useState<string>('');

  // Auto-clear the "Sent ✓" pill after 6s
  useEffect(() => {
    if (!sentAt) return;
    const t = setTimeout(() => setSentAt(null), 6000);
    return () => clearTimeout(t);
  }, [sentAt]);

  // Don't render if the gate isn't active
  if (!accessToken || emailVerified || dismissed) return null;

  const handleResend = async () => {
    if (sending) return;
    setError('');
    setSending(true);
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
        setError(data?.error || 'Could not send. Try again in a minute.');
      } else if (data.alreadyVerified) {
        // Backend says we're already verified — App will catch up on next status fetch.
        setSentAt(Date.now());
      } else {
        setSentAt(Date.now());
      }
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-50 border-b border-amber-200"
    >
      <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <Mail className="w-4 h-4 text-amber-700 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-amber-900 leading-snug">
            <span className="font-medium">Verify your email</span>
            <span className="text-amber-800"> to receive match alerts.</span>
            {error && (
              <span className="block text-xs text-red-700 mt-0.5">{error}</span>
            )}
          </p>
        </div>
        {sentAt ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 flex-shrink-0">
            <Check className="w-3 h-3" aria-hidden="true" />
            Sent
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={sending}
            className="text-sm font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700 disabled:opacity-50 disabled:cursor-wait flex-shrink-0 inline-flex items-center gap-1.5"
          >
            {sending && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
            {sending ? 'Sending…' : 'Resend'}
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss for this session"
          className="text-amber-700 hover:text-amber-900 flex-shrink-0 p-0.5 -m-0.5"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

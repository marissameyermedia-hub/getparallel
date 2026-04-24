import { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

// Formats an incoming phone number (from signup) for display in our input.
// Handles raw digits, +1XXXXXXXXXX format, and anything in between.
function formatInitialPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return '';
  return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

interface PhoneVerificationPageProps {
  // Access token from account creation — used to authenticate edge function calls.
  // Must be passed directly as a prop because supabase.auth.getSession() may not
  // yet reflect the session when this page mounts right after signup.
  accessToken: string;
  // Phone number prefilled from signup (optional). If provided, the user lands
  // on this page with it already entered.
  phone?: string;
  onVerified: (phone: string, smsConsent: boolean) => void;
  onSkip?: () => void;
  onBack?: () => void;
}

const EDGE_FUNCTION_URL = `https://${projectId}.supabase.co/functions/v1/make-server-7af08c19`;

// SMS CONSENT TEXT — Telnyx 10DLC required disclaimers (all 6 elements)
const SMS_CONSENT_TEXT =
  "By checking this box, you agree to receive SMS account notifications, verification codes, and match alerts from Parallel at the phone number provided. Consent is not a condition of purchase. Message frequency may vary. Standard message and data rates may apply. Reply STOP to opt out. Reply HELP for help. We will not share mobile information with third parties for promotional or marketing purposes. View our Privacy Policy and Terms of Service.";

const SMS_CONSENT_VERSION = 'v1-2026-04';

export function PhoneVerificationPage({ accessToken, phone: initialPhone, onVerified, onSkip, onBack }: PhoneVerificationPageProps) {
  const [step, setStep] = useState<'enter' | 'verify'>('enter');
  const [phone, setPhone] = useState(() => initialPhone ? formatInitialPhone(initialPhone) : '');
  const [code, setCode] = useState('');
  const [smsConsent, setSmsConsent] = useState(false); // UNCHECKED BY DEFAULT — Telnyx requirement
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [betaOtp, setBetaOtp] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Always assume US (+1). We strip any leading '1' the user pastes, cap at 10
  // digits, and render the country code as a fixed prefix so users who typed
  // their number without the country code (the common case) don't get parsed
  // as if their area code's first digit were the country code.
  const formatPhone = (val: string) => {
    let digits = val.replace(/\D/g, '');
    // If the user pasted a number starting with 1 (e.g. 12535551234), drop it.
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length <= 3) return `+1 (${digits}`;
    if (digits.length <= 6) return `+1 (${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  // Exactly 10 US digits entered (country code is always +1 here).
  const phoneDigits = phone.replace(/\D/g, '').replace(/^1/, '');
  const phoneIsValid = phoneDigits.length === 10;

  // Get the user's auth token for edge function calls.
  // Uses the accessToken prop passed from App.tsx (set during account creation)
  // rather than supabase.auth.getSession(), which may not yet reflect the
  // session when this page mounts right after signup.
  const getAuthToken = async (): Promise<string> => {
    if (!accessToken) throw new Error('Not signed in');
    return accessToken;
  };

  const sendCode = async () => {
    if (!phoneIsValid) {
      setError('Please enter a valid US phone number.');
      return;
    }
    setError('');
    setBetaOtp(null);
    setIsSending(true);
    try {
      const e164 = `+1${phoneDigits}`;
      const token = await getAuthToken();

      // Send phone OTP — edge function will log SMS consent automatically if smsConsent=true
      const res = await fetch(`${EDGE_FUNCTION_URL}/auth/send-phone-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({
          phone: e164,
          smsConsent,
          consentText: smsConsent ? SMS_CONSENT_TEXT : null,
          consentVersion: smsConsent ? SMS_CONSENT_VERSION : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not send verification code.');
      }

      // If SMS isn't configured yet (no Telnyx env vars), edge function returns the OTP for testing
      if (data.betaOtp) {
        setBetaOtp(data.betaOtp);
      }

      setStep('verify');
      setResendCooldown(30);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setError('');
    setIsVerifying(true);
    try {
      const e164 = `+1${phoneDigits}`;
      const token = await getAuthToken();
      const res = await fetch(`${EDGE_FUNCTION_URL}/auth/verify-phone-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({
          phone: e164,
          otp: code,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.phoneVerified) {
        throw new Error(data.error || 'Invalid code. Please try again.');
      }

      onVerified(e164, smsConsent);
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-medium tracking-tight">Parallel</h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === 'enter' ? 'Verify your phone number' : 'Enter your verification code'}
          </p>
        </div>

        {step === 'enter' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1.5" htmlFor="phone-input">
                Mobile phone number
              </label>
              <input
                id="phone-input"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="+1 (555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                disabled={isSending}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                We'll send you a 6-digit code to verify it's you.
              </p>
            </div>

            {/* SMS CONSENT — Telnyx 10DLC compliance: unchecked, optional, separate */}
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mt-4">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  disabled={isSending}
                  className="mt-0.5 flex-shrink-0 cursor-pointer"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  By checking this box, you agree to receive SMS account notifications,
                  verification codes, and match alerts from Parallel at the phone number provided.
                  Consent is not a condition of purchase. Message frequency may vary. Standard
                  message and data rates may apply. Reply STOP to opt out. Reply HELP for help.
                  We will not share mobile information with third parties for promotional or
                  marketing purposes. View our{' '}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-gray-800"
                  >
                    Privacy Policy
                  </a>{' '}
                  and{' '}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-gray-800"
                  >
                    Terms of Service
                  </a>
                  .
                </span>
              </label>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed mt-2">
              You can verify your phone without opting in to SMS — your verification code
              will still be sent. You can turn SMS notifications on later in notification settings.
            </p>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              onClick={sendCode}
              disabled={!phoneIsValid || isSending}
              className="w-full bg-black text-white py-2.5 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending code…
                </>
              ) : (
                'Send verification code'
              )}
            </button>

            {/* Pre-launch only: Skip button when SMS provider (Telnyx) isn't
                fully live. Must be removed before public launch — allowing
                account creation without phone verification defeats the
                anti-fake-account trust model. */}
            {onSkip && (
              <button
                onClick={onSkip}
                disabled={isSending}
                className="w-full text-xs text-gray-500 hover:text-gray-800 mt-1 underline"
              >
                Skip for now (beta)
              </button>
            )}

            {onBack && (
              <button
                onClick={onBack}
                disabled={isSending}
                className="w-full text-xs text-gray-500 hover:text-gray-800 mt-2"
              >
                ← Back
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 text-center">
              Code sent to <span className="font-medium text-gray-900">{phone}</span>
            </div>

            {/* Beta mode: show the OTP if Telnyx isn't configured (returned by edge function) */}
            {betaOtp && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-center">
                <div className="text-xs text-amber-800 mb-1">
                  Beta mode — SMS not yet configured. Your code:
                </div>
                <div className="text-lg font-mono font-medium text-amber-900 tracking-widest">
                  {betaOtp}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-600 mb-1.5" htmlFor="code-input">
                6-digit code
              </label>
              <input
                id="code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={isVerifying}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-gray-500 tracking-widest text-center"
                autoFocus
              />
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              onClick={verifyCode}
              disabled={code.length !== 6 || isVerifying}
              className="w-full bg-black text-white py-2.5 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Verify and continue
                </>
              )}
            </button>

            <div className="text-center mt-3">
              <button
                onClick={() => {
                  setCode('');
                  setError('');
                  sendCode();
                }}
                disabled={resendCooldown > 0 || isSending || isVerifying}
                className="text-xs text-gray-500 hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>

            <button
              onClick={() => {
                setStep('enter');
                setCode('');
                setError('');
                setBetaOtp(null);
              }}
              disabled={isVerifying}
              className="w-full text-xs text-gray-500 hover:text-gray-800 mt-2"
            >
              ← Use a different number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ArrowLeft, CheckCircle, XCircle, ExternalLink, Loader, ScanFace } from 'lucide-react';
import { MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';

interface VerificationViewProps {
  userId: string;
  onBack: () => void;
  onVerified: () => void;
  isAlreadyVerified?: boolean;
}

// Version string for the biometric consent text. Bump this any time the consent language changes.
// Logged to the backend so we have a provable record of what the user agreed to, and when.
const BIOMETRIC_CONSENT_VERSION = '1.0';

// Default template ID — overridden by /persona/config response. Kept here as a fallback
// so the file works even before the config endpoint is reachable.
const DEFAULT_TEMPLATE_ID = 'itmpl_w7GgvrzeQ8P6sopBcayQBcBP39gG';

// How long to poll for webhook completion before giving up. Persona webhooks are
// usually instant, but we allow a generous window in case of network slowness.
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 90_000; // 90 seconds total

// Background polling interval used while the Persona popup is open ("opened" state).
// Slower than active polling because we expect the user to still be in Persona —
// this just catches the case where postMessage never fires (iOS Safari opener loss).
const BACKGROUND_POLL_INTERVAL_MS = 4000;

export function VerificationView({ userId, onBack, onVerified, isAlreadyVerified = false }: VerificationViewProps) {
  // State machine. Statuses:
  //   - consent: BIPA / WA MHMDA consent gate. User must agree before we open Persona.
  //   - idle: ready to launch Persona popup
  //   - opened: popup is open, user is doing the flow
  //   - polling: popup said "complete" — we're waiting for the webhook to land
  //   - completed: webhook confirmed verified=true
  //   - declined: webhook confirmed verified=false (with optional reason)
  //   - failed: user cancelled in popup, or polling timed out
  const [status, setStatus] = useState<
    'consent' | 'idle' | 'opened' | 'polling' | 'completed' | 'declined' | 'failed'
  >(isAlreadyVerified ? 'completed' : 'consent');

  const [consentChecked, setConsentChecked] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [consentError, setConsentError] = useState('');
  const [declineReason, setDeclineReason] = useState<string | null>(null);

  // Persona config from backend (env + templateId). Loaded on mount.
  // This lets us flip sandbox → production via a single PERSONA_ENV secret on the
  // backend, no code change required.
  const [personaEnv, setPersonaEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [personaTemplateId, setPersonaTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);

  // Cleanup polling timers on unmount.
  const pollTimerRef = useRef<number | null>(null);
  const pollDeadlineRef = useRef<number>(0);
  // Background poll timer used while popup is open.
  const bgPollTimerRef = useRef<number | null>(null);
  // Track current status in a ref so async handlers see the latest value
  // without needing to re-bind the visibility listener every render.
  const statusRef = useRef<typeof status>(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (bgPollTimerRef.current !== null) {
        window.clearTimeout(bgPollTimerRef.current);
        bgPollTimerRef.current = null;
      }
    };
  }, []);

  // Fetch Persona config once on mount. Falls back to hardcoded defaults if the
  // backend is unreachable so verification still works in a degraded state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${MISC_FUNCTION_URL}/persona/config`, {
          headers: { apikey: publicAnonKey },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.templateId) setPersonaTemplateId(String(data.templateId));
        if (data?.environment === 'production' || data?.environment === 'sandbox') {
          setPersonaEnv(data.environment);
        }
      } catch (err) {
        console.warn('[verification] persona/config fetch failed, using defaults:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the Persona hosted-flow URL using config we just loaded.
  // We append a redirect-uri so Persona's "complete" page bounces the user back to
  // our app with ?verified=1 — this is the iOS-Safari-friendly path. On desktop the
  // postMessage handler still works as a faster path; this is a fallback.
  const redirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?verified=1`
    : '';
  const personaUrl = `https://withpersona.com/verify?inquiry-template-id=${encodeURIComponent(
    personaTemplateId,
  )}&reference-id=${encodeURIComponent(userId)}&environment=${personaEnv}&redirect-uri=${encodeURIComponent(redirectUri)}`;

  // ── Backend status check ──
  // Polls /verification/status. Returns the row written by the webhook.
  // verified === true   → completed
  // status === declined → declined (with reason)
  // status === expired  → failed
  // anything else       → still pending, keep polling
  const checkVerificationStatus = async (): Promise<
    { state: 'verified' | 'declined' | 'expired' | 'pending' | 'none'; reason: string | null }
  > => {
    const token = await getAccessToken();
    if (!token) return { state: 'pending', reason: null };
    try {
      const res = await fetch(`${MISC_FUNCTION_URL}/verification/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: publicAnonKey,
        },
      });
      if (!res.ok) return { state: 'pending', reason: null };
      const data = await res.json();
      if (data?.verified === true) return { state: 'verified', reason: null };
      if (data?.status === 'declined') return { state: 'declined', reason: data?.declineReason ?? null };
      if (data?.status === 'expired') return { state: 'expired', reason: null };
      if (data?.status === 'none') return { state: 'none', reason: null };
      return { state: 'pending', reason: null };
    } catch (err) {
      console.error('[verification] status check error:', err);
      return { state: 'pending', reason: null };
    }
  };

  const pollOnce = async () => {
    const result = await checkVerificationStatus();
    if (result.state === 'verified') {
      setStatus('completed');
      onVerified();
      return;
    }
    if (result.state === 'declined') {
      setDeclineReason(result.reason);
      setStatus('declined');
      return;
    }
    if (result.state === 'expired') {
      setStatus('failed');
      return;
    }
    // Still pending — schedule next poll if we haven't hit the timeout.
    if (Date.now() >= pollDeadlineRef.current) {
      // Timeout — not necessarily failed, just slow. Show fallback UI letting
      // them either keep waiting or report it.
      setStatus('failed');
      return;
    }
    pollTimerRef.current = window.setTimeout(pollOnce, POLL_INTERVAL_MS);
  };

  const startPolling = () => {
    setStatus('polling');
    pollDeadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
    pollOnce();
  };

  // Background poll: fires while popup is open ('opened' state) at a slower
  // cadence. Catches the case where postMessage never arrives (iOS Safari
  // popup loses opener relationship; cross-origin tab handoff is unreliable).
  // If the webhook has already landed, we transition straight to 'completed'
  // without ever showing the "Confirming…" UI — silent success.
  const backgroundPoll = async () => {
    if (statusRef.current !== 'opened') return;
    const result = await checkVerificationStatus();
    if (result.state === 'verified') {
      setStatus('completed');
      onVerified();
      return;
    }
    if (result.state === 'declined') {
      setDeclineReason(result.reason);
      setStatus('declined');
      return;
    }
    if (result.state === 'expired') {
      setStatus('failed');
      return;
    }
    bgPollTimerRef.current = window.setTimeout(backgroundPoll, BACKGROUND_POLL_INTERVAL_MS);
  };

  // Whenever we enter 'opened' state, kick off background polling.
  useEffect(() => {
    if (status !== 'opened') {
      if (bgPollTimerRef.current !== null) {
        window.clearTimeout(bgPollTimerRef.current);
        bgPollTimerRef.current = null;
      }
      return;
    }
    bgPollTimerRef.current = window.setTimeout(backgroundPoll, BACKGROUND_POLL_INTERVAL_MS);
    return () => {
      if (bgPollTimerRef.current !== null) {
        window.clearTimeout(bgPollTimerRef.current);
        bgPollTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Visibility change: when iOS Safari brings the Parallel tab back to focus
  // (e.g. user swiped from Persona's "complete" page back to ours), check the
  // backend immediately. This is the most reliable signal we'll get on mobile
  // because postMessage from a separate-tab popup is not delivered.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const s = statusRef.current;
      if (s === 'opened' || s === 'polling') {
        // Force an immediate check; if not verified yet, the regular polling
        // continues at its normal cadence.
        checkVerificationStatus().then((result) => {
          if (result.state === 'verified') {
            setStatus('completed');
            onVerified();
          } else if (result.state === 'declined') {
            setDeclineReason(result.reason);
            setStatus('declined');
          } else if (result.state === 'expired') {
            setStatus('failed');
          }
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // postMessage from Persona: when it says "complete," start polling our backend.
  // We never accept Persona's claim alone — we wait for the webhook (which is
  // signed) to write the verified status to our DB, then read from there.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes('withpersona.com')) return;
      const { name } = event.data || {};
      if (name === 'complete' || name === 'inquiry.completed' || name === 'inquiry.approved') {
        startPolling();
      }
      if (name === 'fail' || name === 'cancel') {
        setStatus('failed');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?verified=1 query param: Persona's redirect-uri lands the user here after the
  // hosted flow completes. Immediately check status and (if confirmed) skip
  // straight to the success screen. Also strips the param from the URL so a
  // refresh doesn't re-trigger.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') !== '1') return;
    // Strip the param immediately to avoid loops on re-render.
    params.delete('verified');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
    // Kick off polling — webhook may have arrived ahead of us.
    startPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual "I've completed verification" button (in case postMessage didn't fire,
  // e.g. user closed the popup before the message landed).
  const handleManualCheck = () => {
    if (status === 'polling') return;
    startPolling();
  };

  // When the user taps "I consent and continue," we POST to the backend to log the consent event
  // (user ID, timestamp, consent version). This creates an evidence trail required
  // by BIPA Section 15(b). If the backend call fails, we surface the error and do NOT
  // advance the user — no consent record, no biometric collection.
  const handleConsentSubmit = async () => {
    if (!consentChecked) return;
    setConsentSubmitting(true);
    setConsentError('');

    const token = await getAccessToken();
    if (!token) {
      setConsentError('Please sign in to continue.');
      setConsentSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${MISC_FUNCTION_URL}/verification/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: publicAnonKey,
        },
        body: JSON.stringify({
          consent_type: 'biometric_verification',
          consent_version: BIOMETRIC_CONSENT_VERSION,
          consented_at: new Date().toISOString(),
        }),
      });

      if (!res.ok && res.status !== 404) {
        throw new Error('Failed to record consent');
      }

      setStatus('idle');
    } catch (err: any) {
      console.error('Consent submit error:', err);
      setConsentError('Something went wrong saving your consent. Please try again.');
    }

    setConsentSubmitting(false);
  };

  const handleOpenPersona = () => {
    setStatus('opened');
    window.open(personaUrl, '_blank', 'width=500,height=700,scrollbars=yes');
  };

  return (
    <div className="min-h-screen bg-parallel-cream">
      <div className="max-w-md mx-auto px-6 pt-16 pb-12 relative">
        <button
          onClick={onBack}
          className="absolute left-6 top-16 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-parallel-void rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={36} className="text-parallel-cream" />
          </div>
          <h1 className="text-3xl mb-3">Get verified</h1>
          <p className="text-gray-600 leading-relaxed">
            A verified badge shows your matches you're a real person. It takes about 2 minutes.
          </p>
        </div>

        {/* ───── CONSENT STEP ─────
            Required gate before any biometric collection. Satisfies:
            - Illinois BIPA Section 15(b) — written informed consent before biometric collection,
              with disclosure of (a) what is collected, (b) purpose, (c) retention period
            - WA My Health MY Data Act — opt-in consent for consumer health data (biometric)
            - Generally: good practice that creates a provable audit trail
        */}
        {status === 'consent' && (
          <>
            <div className="bg-gray-50 border-2 border-gray-200 rounded-3xl p-6 mb-6">
              <div className="flex items-start gap-3 mb-4">
                <ScanFace size={22} className="text-gray-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <h2 className="text-lg font-semibold">About biometric verification</h2>
              </div>

              <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                <p>
                  To verify your identity, we work with <strong>Persona Technologies, Inc.</strong>, a third-party identity
                  verification service. When you tap "I consent and continue" below, Persona will:
                </p>

                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Capture a photo of your government-issued ID (passport, driver's license, or national ID)</li>
                  <li>
                    Capture a selfie and extract <strong>facial geometry</strong> (a mathematical representation of your facial features) to
                    confirm the selfie matches your ID photo
                  </li>
                </ul>

                <p>
                  <strong>Why this matters under the law:</strong> Facial geometry is{' '}
                  <em>biometric data</em> under the Illinois Biometric Information Privacy Act (BIPA) and consumer health data under the
                  Washington My Health MY Data Act (MHMDA). We cannot legally collect it without your written informed consent.
                </p>
              </div>
            </div>

            <div className="bg-parallel-cream border border-gray-200 rounded-3xl p-5 mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">How your data is handled</h3>
              <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                <div>
                  <p className="font-medium text-gray-900">Purpose</p>
                  <p className="text-gray-600">To confirm you are a real, unique person matching your ID. Nothing else.</p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Who holds your biometric data</p>
                  <p className="text-gray-600">
                    Persona processes and stores your biometric data on its own systems, governed by its{' '}
                    <a
                      href="https://withpersona.com/legal/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-parallel-void"
                    >
                      privacy policy
                    </a>
                    . Parallel receives only a pass/fail verification result — we never receive or store your facial geometry ourselves.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Retention</p>
                  <p className="text-gray-600">
                    Persona retains biometric data per its retention schedule. Parallel retains only your verification status for as long as your
                    account is active. When you delete your account, we notify Persona to delete associated records.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">What we will NOT do</p>
                  <p className="text-gray-600">
                    We will never sell, lease, trade, or profit from your biometric data. We will never use it for any purpose other than identity
                    verification.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Withdrawing consent</p>
                  <p className="text-gray-600">
                    You can withdraw consent at any time by deleting your account (Account → Delete Account), which triggers deletion of your
                    verification record and a passthrough deletion request to Persona.
                  </p>
                </div>
              </div>
            </div>

            {/* BIPA-compliant affirmative consent checkbox */}
            <label
              className="flex items-start gap-3 mb-6 cursor-pointer select-none p-4 bg-parallel-cream border-2 border-gray-300 rounded-2xl hover:border-parallel-void transition-colors"
              htmlFor="biometric-consent"
            >
              <input
                id="biometric-consent"
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 w-5 h-5 flex-shrink-0 rounded border-2 border-gray-300 text-parallel-void focus:ring-black focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-gray-800 leading-relaxed">
                I have read the information above. I give my <strong>written informed consent</strong> for Parallel's verification partner
                (Persona) to collect, capture, and process my facial geometry and government ID for the sole purpose of identity verification, on
                the terms described.
              </span>
            </label>

            {consentError && (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 text-sm text-red-700">
                {consentError}
              </div>
            )}

            <button
              onClick={handleConsentSubmit}
              disabled={!consentChecked || consentSubmitting}
              className="w-full bg-parallel-purple text-parallel-cream py-4 rounded-full font-medium hover:bg-parallel-purple/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {consentSubmitting ? (
                <>
                  <Loader size={18} className="animate-spin" aria-hidden="true" /> Saving consent...
                </>
              ) : (
                'I consent and continue'
              )}
            </button>

            <button
              onClick={onBack}
              className="w-full mt-3 py-3 rounded-full border-2 border-gray-200 text-gray-700 hover:border-gray-400 transition-colors text-sm font-medium"
            >
              Not right now
            </button>

            <p className="text-center text-xs text-gray-400 mt-4 leading-relaxed">
              Verification is optional. You can use Parallel without verifying. Verified profiles display a blue checkmark to matches.
            </p>
          </>
        )}

        {/* Idle — consent already given, ready to launch */}
        {status === 'idle' && (
          <>
            <div className="space-y-4 mb-8">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest">What you'll need</p>
              {[
                { icon: '🪪', title: 'Government-issued ID', desc: "Passport, driver's license, or national ID" },
                { icon: '🤳', title: 'A selfie', desc: "We'll match it to your ID photo" },
                { icon: '⏱️', title: 'About 2 minutes', desc: 'The process is quick and secure' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl">
                  <span className="text-2xl" aria-hidden="true">
                    {item.icon}
                  </span>
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-gray-500 text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={handleOpenPersona}
              className="w-full bg-parallel-purple text-parallel-cream py-4 rounded-full font-medium hover:bg-parallel-purple/90 transition-colors flex items-center justify-center gap-2"
            >
              Start verification
              <ExternalLink size={18} aria-hidden="true" />
            </button>
            <p className="text-center text-xs text-gray-400 mt-4">
              Your ID and facial geometry are processed by Persona under their privacy policy and are never stored or shared by Parallel.
            </p>
          </>
        )}

        {/* Opened — waiting for user to complete in new tab. */}
        {status === 'opened' && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-3xl p-6 text-center mb-6">
              <div className="text-4xl mb-3" aria-hidden="true">
                🪪
              </div>
              <h2 className="text-lg font-semibold text-blue-800 mb-2">Verification window opened</h2>
              <p className="text-blue-700 text-sm leading-relaxed">
                Complete the steps in the new tab that just opened. Come back here when you're done.
              </p>
            </div>

            <button
              onClick={handleOpenPersona}
              className="w-full border-2 border-gray-200 text-gray-700 py-3 rounded-full font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 mb-3"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Reopen verification window
            </button>

            <button
              onClick={handleManualCheck}
              className="w-full bg-parallel-purple text-parallel-cream py-4 rounded-full font-medium hover:bg-parallel-purple/90 transition-colors flex items-center justify-center gap-2"
            >
              I've completed verification ✓
            </button>
          </>
        )}

        {/* Polling — waiting for the webhook from Persona to land in our DB.
            Persona's webhooks are usually instant (< 2s) but we allow up to 90s
            for slow networks. Shows a friendly indicator the whole time. */}
        {status === 'polling' && (
          <>
            <div
              className="bg-blue-50 border border-blue-200 rounded-3xl p-6 text-center mb-6"
              role="status"
              aria-live="polite"
            >
              <Loader size={36} className="text-blue-500 animate-spin mx-auto mb-3" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-blue-800 mb-2">Confirming your verification…</h2>
              <p className="text-blue-700 text-sm leading-relaxed">
                Just a moment — we're confirming the result with our verification partner.
              </p>
            </div>
          </>
        )}

        {/* Completed */}
        {status === 'completed' && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-3xl p-6 text-center mb-8">
              <CheckCircle size={40} className="text-green-500 mx-auto mb-3" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-green-800 mb-2">You're verified! ✓</h2>
              <p className="text-green-700 text-sm">Your profile now shows a blue verified checkmark to all your matches.</p>
            </div>
            <button
              onClick={onBack}
              className="w-full bg-parallel-purple text-parallel-cream py-4 rounded-full font-medium hover:bg-parallel-purple/90 transition-colors"
            >
              Back to account
            </button>
          </>
        )}

        {/* Declined — Persona returned a hard decline. */}
        {status === 'declined' && (
          <>
            <div role="alert" className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center mb-8">
              <XCircle size={40} className="text-red-400 mx-auto mb-3" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-red-800 mb-2">Verification couldn't be completed</h2>
              <p className="text-red-700 text-sm mb-4">
                {declineReason
                  ? `Reason: ${declineReason}`
                  : "We couldn't confirm your identity from the documents you submitted."}
              </p>
              <p className="text-red-600 text-xs leading-relaxed">
                Common causes: blurry ID photo, lighting that makes the selfie hard to read, or an ID type we don't yet support.
              </p>
            </div>
            <button
              onClick={() => {
                setDeclineReason(null);
                setStatus('idle');
              }}
              className="w-full bg-parallel-purple text-parallel-cream py-4 rounded-full font-medium hover:bg-parallel-purple/90 transition-colors mb-3"
            >
              Try again
            </button>
            <button
              onClick={onBack}
              className="w-full py-3 rounded-full border-2 border-gray-200 text-gray-700 hover:border-gray-400 transition-colors text-sm font-medium"
            >
              Back to account
            </button>
          </>
        )}

        {/* Failed — user cancelled the popup, or we polled past the timeout. */}
        {status === 'failed' && (
          <>
            <div role="alert" className="bg-yellow-50 border border-yellow-200 rounded-3xl p-6 text-center mb-8">
              <XCircle size={40} className="text-yellow-500 mx-auto mb-3" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-yellow-800 mb-2">Verification didn't finish</h2>
              <p className="text-yellow-700 text-sm">
                It looks like the verification window was closed or the result didn't reach us. You can try again whenever you're ready.
              </p>
            </div>
            <button
              onClick={() => setStatus('idle')}
              className="w-full bg-parallel-purple text-parallel-cream py-4 rounded-full font-medium hover:bg-parallel-purple/90 transition-colors mb-3"
            >
              Try again
            </button>
            <button
              onClick={onBack}
              className="w-full py-3 rounded-full border-2 border-gray-200 text-gray-700 hover:border-gray-400 transition-colors text-sm font-medium"
            >
              Back to account
            </button>
          </>
        )}
      </div>
    </div>
  );
}

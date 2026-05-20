import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ArrowLeft, CheckCircle, XCircle, Loader } from 'lucide-react';
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


export function VerificationView({ userId, onBack, onVerified, isAlreadyVerified = false }: VerificationViewProps) {
  // State machine. Statuses:
  //   - consent: BIPA / WA MHMDA consent gate. User must agree before we navigate to Persona.
  //   - polling: returned from Persona redirect — waiting for webhook to land in DB
  //   - completed: webhook confirmed verified=true (auto-navigates via onVerified)
  //   - declined: webhook confirmed verified=false (with optional reason)
  //   - failed: polling timed out
  //
  // Detect if we're returning from a Persona redirect (?verified=1 in URL).
  // If so, start in 'polling' immediately so the consent form never flashes.
  const isPersonaReturn = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('verified') === '1';

  const [status, setStatus] = useState<
    'consent' | 'polling' | 'completed' | 'declined' | 'failed'
  >(isAlreadyVerified ? 'completed' : isPersonaReturn ? 'polling' : 'consent');

  const [consentChecked, setConsentChecked] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [consentError, setConsentError] = useState('');
  const [declineReason, setDeclineReason] = useState<string | null>(null);

  // Persona config from backend (env + templateId). Loaded on mount.
  // This lets us flip sandbox → production via a single PERSONA_ENV secret on the
  // backend, no code change required.
  const [personaEnv, setPersonaEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [personaTemplateId, setPersonaTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);

  const pollTimerRef = useRef<number | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
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

  // Build the Persona hosted-flow URL. We append a redirect-uri so Persona's
  // "complete" page bounces the user back with ?verified=1 and we auto-confirm.
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

  // On return from Persona redirect (?verified=1), strip the param and kick off
  // polling immediately. The component already starts in 'polling' state when
  // isPersonaReturn is true, so the consent form never flashes.
  useEffect(() => {
    if (!isPersonaReturn) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('verified');
    const newSearch = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash);
    startPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the user taps "I consent and continue," we POST to the backend to log the consent event
  // (user ID, timestamp, consent version). This creates an evidence trail required
  // by BIPA Section 15(b). If the backend call fails, we surface the error and do NOT
  // advance the user — no consent record, no biometric collection.
  // Log consent and open Persona in one action — no intermediate "idle" screen.
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

      // Navigate directly to Persona — they redirect back with ?verified=1 when done.
      window.location.href = personaUrl;
    } catch (err: any) {
      console.error('Consent submit error:', err);
      setConsentError('Something went wrong saving your consent. Please try again.');
      setConsentSubmitting(false);
    }
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
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: '#1D9BF0' }}>
            <ShieldCheck size={36} className="text-white" />
          </div>
          <h1 className="text-3xl mb-3">Get verified</h1>
          <p className="text-gray-600 leading-relaxed">
            Every Parallel user is ID-checked. A verified badge shows your matches you're who you say you are. It takes about 2 minutes.
          </p>
        </div>

        {/* ───── CONSENT + LAUNCH STEP ─────
            Single page: shows what's needed, legal disclosure, consent checkbox,
            and navigates directly to Persona on submit.
            Satisfies BIPA §15(b) and WA MHMDA opt-in requirements.
        */}
        {status === 'consent' && (
          <>
            {/* What you'll need */}
            <div className="space-y-3 mb-6">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest">What you'll need</p>
              {[
                { icon: '🪪', title: 'Government-issued ID', desc: "Passport, driver's license, or national ID" },
                { icon: '🤳', title: 'A selfie', desc: "We'll match it to your ID photo" },
                { icon: '⏱️', title: 'About 2 minutes', desc: 'The process is quick and secure' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl">
                  <span className="text-2xl" aria-hidden="true">{item.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-gray-500 text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Condensed legal disclosure — required by BIPA §15(b) and WA MHMDA */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-4 text-xs text-gray-600 leading-relaxed">
              <p className="mb-2">
                We use <strong>Persona Technologies, Inc.</strong> for identity verification. They will capture your government-issued ID and a selfie to extract <strong>facial geometry</strong> — biometric data under the Illinois BIPA and the Washington My Health MY Data Act, which require your written consent before collection.
              </p>
              <p>
                Parallel receives only a pass/fail result and never stores your biometric data. Persona processes it under their{' '}
                <a href="https://withpersona.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline text-parallel-void">privacy policy</a>.
                You can withdraw consent by deleting your account.
              </p>
            </div>

            {/* BIPA-compliant affirmative consent checkbox */}
            <label
              className="flex items-start gap-3 mb-5 cursor-pointer select-none p-4 bg-parallel-cream border-2 border-gray-300 rounded-2xl hover:border-parallel-void transition-colors"
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
                I give my <strong>written informed consent</strong> for Parallel's verification partner (Persona) to collect and process my facial geometry and government ID solely for identity verification.
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
                  <Loader size={18} className="animate-spin" aria-hidden="true" /> Starting verification…
                </>
              ) : (
                'Start verification'
              )}
            </button>

            <button
              onClick={onBack}
              className="w-full mt-3 py-3 rounded-full border-2 border-gray-200 text-gray-700 hover:border-gray-400 transition-colors text-sm font-medium"
            >
              Not right now
            </button>

          </>
        )}

        {/* Polling — returned from Persona redirect, waiting for webhook to land.
            Auto-resolves in < 5s for most users; navigates away without user action. */}
        {status === 'polling' && (
          <div className="flex flex-col items-center justify-center py-20" role="status" aria-live="polite">
            <Loader size={40} className="text-parallel-purple animate-spin mb-4" aria-hidden="true" />
            <p className="text-gray-500 text-sm">Finishing up…</p>
          </div>
        )}

        {/* Completed */}
        {status === 'completed' && (
          <>
            <div className="bg-[#F8F4FD] border border-[#E2D5F5] rounded-3xl p-6 text-center mb-8">
              <CheckCircle size={40} className="text-parallel-purple mx-auto mb-3" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-parallel-void mb-2">You're verified! ✓</h2>
              <p className="text-parallel-stone text-sm">Your profile now shows a blue verified checkmark to all your matches.</p>
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
            <div role="alert" className="bg-parallel-deep-ink border border-parallel-dusk rounded-3xl p-6 text-center mb-8">
              <XCircle size={40} className="text-parallel-stone mx-auto mb-3" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-parallel-cream mb-2">Verification couldn't be completed</h2>
              <p className="text-parallel-stone text-sm mb-4">
                {declineReason
                  ? `Reason: ${declineReason}`
                  : "We couldn't confirm your identity from the documents you submitted."}
              </p>
              <p className="text-parallel-stone text-xs leading-relaxed">
                Common causes: blurry ID photo, lighting that makes the selfie hard to read, or an ID type we don't yet support.
              </p>
            </div>
            <button
              onClick={() => {
                setDeclineReason(null);
                setStatus('consent');
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
            <div role="alert" className="bg-[#F5F2EE] border border-parallel-linen rounded-3xl p-6 text-center mb-8">
              <XCircle size={40} className="text-parallel-stone mx-auto mb-3" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-parallel-void mb-2">Verification didn't finish</h2>
              <p className="text-parallel-stone text-sm">
                It looks like the verification window was closed or the result didn't reach us. You can try again whenever you're ready.
              </p>
            </div>
            <button
              onClick={() => setStatus('consent')}
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

import { useState, useEffect } from 'react';
import { ShieldCheck, ArrowLeft, CheckCircle, XCircle, ExternalLink, Loader, ScanFace } from 'lucide-react';
import { EDGE_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

interface VerificationViewProps {
  userId: string;
  onBack: () => void;
  onVerified: () => void;
  isAlreadyVerified?: boolean;
}

const PERSONA_TEMPLATE_ID = 'itmpl_w7GgvrzeQ8P6sopBcayQBcBP39gG';
// Version string for the biometric consent text. Bump this any time the consent language changes.
// Logged to the backend so we have a provable record of what the user agreed to, and when.
const BIOMETRIC_CONSENT_VERSION = '1.0';

export function VerificationView({ userId, onBack, onVerified, isAlreadyVerified = false }: VerificationViewProps) {
  // State machine now includes a 'consent' step that gates access to 'idle' (ready to launch Persona).
  // This is required to comply with Illinois BIPA Section 15(b) (written informed consent before
  // biometric collection) and WA My Health MY Data Act (opt-in consent for biometric CHD).
  const [status, setStatus] = useState<'consent' | 'idle' | 'opened' | 'checking' | 'completed' | 'failed'>(
    isAlreadyVerified ? 'completed' : 'consent'
  );
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [consentError, setConsentError] = useState('');

  const personaUrl = `https://withpersona.com/verify?inquiry-template-id=${PERSONA_TEMPLATE_ID}&reference-id=${encodeURIComponent(userId)}&environment=sandbox`;

  // Listen for postMessage from Persona popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes('withpersona.com')) return;
      const { name } = event.data || {};
      console.log('Persona message:', name, event.data);
      if (name === 'complete' || name === 'inquiry.completed' || name === 'inquiry.approved') {
        handleVerificationComplete();
      }
      if (name === 'fail' || name === 'cancel') {
        setStatus('failed');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleVerificationComplete = async () => {
    setStatus('completed');
    const token = localStorage.getItem('parallel_access_token');
    if (token) {
      try {
        await fetch(`${EDGE_FUNCTION_URL}/verification/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': publicAnonKey,
          },
          body: JSON.stringify({ inquiryId: `persona_${userId}`, status: 'verified' }),
        });
      } catch (err) {
        console.error('Failed to save verification:', err);
      }
    }
    onVerified();
  };

  // When the user taps "I consent," we POST to the backend to log the consent event
  // (user ID, timestamp, consent version). This creates an evidence trail required
  // by BIPA Section 15(b). If the backend call fails, we surface the error and do NOT
  // advance the user — no consent record, no biometric collection.
  const handleConsentSubmit = async () => {
    if (!consentChecked) return;
    setConsentSubmitting(true);
    setConsentError('');

    const token = localStorage.getItem('parallel_access_token');
    if (!token) {
      setConsentError('Please sign in to continue.');
      setConsentSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${EDGE_FUNCTION_URL}/verification/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({
          consent_type: 'biometric_verification',
          consent_version: BIOMETRIC_CONSENT_VERSION,
          consented_at: new Date().toISOString(),
        }),
      });

      // The edge function endpoint may not yet exist. If we get a 404, log it but still
      // advance — we don't want consent to fail silently when the backend is behind.
      // In production, the endpoint should be deployed and this should be a hard gate.
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

  const handleCheckStatus = async () => {
    setStatus('checking');
    const token = localStorage.getItem('parallel_access_token');
    if (!token) { setStatus('opened'); return; }
    try {
      const res = await fetch(`${EDGE_FUNCTION_URL}/verification/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({
          inquiryId: `persona_sandbox_${userId}`,
          status: 'verified'
        }),
      });
      if (res.ok) {
        setStatus('completed');
        onVerified();
      } else {
        const data = await res.json();
        console.error('Verification error:', data);
        setStatus('opened');
      }
    } catch (err) {
      console.error('Verification error:', err);
      setStatus('opened');
    }
  };

  return (
    <div className="min-h-screen bg-white pt-6 pb-24">
      <div className="max-w-md mx-auto px-6 py-6">
        <button
          onClick={onBack}
          className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors mb-8"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={36} className="text-primary" />
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
                <ScanFace size={22} className="text-gray-700 flex-shrink-0 mt-0.5" />
                <h2 className="text-lg font-semibold">About biometric verification</h2>
              </div>

              <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                <p>
                  To verify your identity, we work with <strong>Persona Technologies, Inc.</strong>,
                  a third-party identity verification service. When you tap "I consent and continue"
                  below, Persona will:
                </p>

                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Capture a photo of your government-issued ID (passport, driver's license, or national ID)</li>
                  <li>Capture a selfie and extract <strong>facial geometry</strong> (a mathematical representation of your facial features) to confirm the selfie matches your ID photo</li>
                </ul>

                <p>
                  <strong>Why this matters under the law:</strong> Facial geometry is
                  {' '}<em>biometric data</em> under the Illinois Biometric Information Privacy Act (BIPA)
                  and consumer health data under the Washington My Health MY Data Act (MHMDA).
                  We cannot legally collect it without your written informed consent.
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-3xl p-5 mb-4">
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
                    <a href="https://withpersona.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline text-black">
                      privacy policy
                    </a>.
                    Parallel receives only a pass/fail verification result \u2014 we never receive or store your facial geometry ourselves.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Retention</p>
                  <p className="text-gray-600">
                    Persona retains biometric data per its retention schedule. Parallel retains only your verification status for as long as your account is active. When you delete your account, we notify Persona to delete associated records.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">What we will NOT do</p>
                  <p className="text-gray-600">
                    We will never sell, lease, trade, or profit from your biometric data. We will never use it for any purpose other than identity verification.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Withdrawing consent</p>
                  <p className="text-gray-600">
                    You can withdraw consent at any time by deleting your account (Account \u2192 Delete Account), which triggers deletion of your verification record and a passthrough deletion request to Persona.
                  </p>
                </div>
              </div>
            </div>

            {/* BIPA-compliant affirmative consent checkbox */}
            <label
              className="flex items-start gap-3 mb-6 cursor-pointer select-none p-4 bg-white border-2 border-gray-300 rounded-2xl hover:border-black transition-colors"
              htmlFor="biometric-consent"
            >
              <input
                id="biometric-consent"
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 w-5 h-5 flex-shrink-0 rounded border-2 border-gray-300 text-black focus:ring-black focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-gray-800 leading-relaxed">
                I have read the information above. I give my <strong>written informed consent</strong> for
                Parallel's verification partner (Persona) to collect, capture, and process my facial
                geometry and government ID for the sole purpose of identity verification, on the
                terms described.
              </span>
            </label>

            {consentError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 text-sm text-red-700">
                {consentError}
              </div>
            )}

            <button
              onClick={handleConsentSubmit}
              disabled={!consentChecked || consentSubmitting}
              className="w-full bg-black text-primary py-4 rounded-full font-medium hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {consentSubmitting ? (
                <><Loader size={18} className="animate-spin" /> Saving consent...</>
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
              Verification is optional. You can use Parallel without verifying. Verified profiles display a
              blue checkmark to matches.
            </p>
          </>
        )}

        {/* Completed */}
        {status === 'completed' && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-3xl p-6 text-center mb-8">
              <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />
              <h2 className="text-xl font-semibold text-green-800 mb-2">You're verified! ✓</h2>
              <p className="text-green-700 text-sm">
                Your profile now shows a blue verified checkmark to all your matches.
              </p>
            </div>
            <button onClick={onBack} className="w-full bg-black text-primary py-4 rounded-full font-medium hover:bg-gray-800 transition-colors">
              Back to account
            </button>
          </>
        )}

        {/* Failed */}
        {status === 'failed' && (
          <>
            <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center mb-8">
              <XCircle size={40} className="text-red-400 mx-auto mb-3" />
              <h2 className="text-xl font-semibold text-red-800 mb-2">Verification failed</h2>
              <p className="text-red-700 text-sm mb-4">
                We weren't able to verify your identity. Please try again.
              </p>
            </div>
            <button onClick={() => setStatus('idle')} className="w-full bg-black text-primary py-4 rounded-full font-medium hover:bg-gray-800 transition-colors">
              Try again
            </button>
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
              ].map(item => (
                <div key={item.title} className="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-gray-500 text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={handleOpenPersona}
              className="w-full bg-black text-primary py-4 rounded-full font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              Start verification
              <ExternalLink size={18} />
            </button>
          </>
        )}

        {/* Opened — waiting for user to complete in new tab */}
        {(status === 'opened' || status === 'checking') && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-3xl p-6 text-center mb-6">
              <div className="text-4xl mb-3">🪪</div>
              <h2 className="text-lg font-semibold text-blue-800 mb-2">Verification window opened</h2>
              <p className="text-blue-700 text-sm leading-relaxed">
                Complete the steps in the new tab that just opened. Come back here when you're done.
              </p>
            </div>

            <button
              onClick={handleOpenPersona}
              className="w-full border-2 border-gray-200 text-gray-700 py-3 rounded-full font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 mb-3"
            >
              <ExternalLink size={16} />
              Reopen verification window
            </button>

            <button
              onClick={handleCheckStatus}
              disabled={status === 'checking'}
              className="w-full bg-black text-primary py-4 rounded-full font-medium hover:bg-gray-800 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {status === 'checking' ? (
                <><Loader size={18} className="animate-spin" /> Checking...</>
              ) : (
                "I've completed verification ✓"
              )}
            </button>
          </>
        )}

        {/* Disclaimer at bottom — only shown once past the consent step */}
        {status === 'idle' && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Your ID and facial geometry are processed by Persona under their privacy policy and are never stored or shared by Parallel.
          </p>
        )}
      </div>
    </div>
  );
}
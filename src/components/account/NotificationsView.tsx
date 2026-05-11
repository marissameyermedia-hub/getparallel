import { useState, useEffect } from 'react';
import { ChevronLeft, Loader2, X } from 'lucide-react';
import { supabase, MISC_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { useModalA11y } from '../../utils/useModalA11y';
import { requestPushPermission, optOutOfPush } from '../../utils/onesignal';
import { detectDevice, InstallInstructions, DeviceType } from '../InstallInstructions';

const SMS_CONSENT_TEXT =
  "By tapping 'Enable SMS', you agree to receive SMS account notifications, verification codes, and match alerts from Parallel at the phone number provided. Consent is not a condition of purchase. Message frequency may vary. Standard message and data rates may apply. Reply STOP to opt out. Reply HELP for help. We will not share mobile information with third parties for promotional or marketing purposes. View our Privacy Policy and Terms of Service.";
const SMS_CONSENT_VERSION = 'v1-2026-04';

interface NotificationsViewProps {
  userId: string;
  onBack: () => void;
}

export function NotificationsView({ userId, onBack }: NotificationsViewProps) {
  // email + push are staged and committed together on Save.
  // SMS is immediate because consent must be explicit and atomic (TCPA).
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSmsLoading, setIsSmsLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [pushDeniedMessage, setPushDeniedMessage] = useState('');
  const [pushRegistering, setPushRegistering] = useState(false);
  const [device, setDevice] = useState<DeviceType>('ios-safari');

  const [showSmsConsent, setShowSmsConsent] = useState(false);
  const [showSmsOff, setShowSmsOff] = useState(false);
  const [showEmailOff, setShowEmailOff] = useState(false);
  const [showInstallSheet, setShowInstallSheet] = useState(false);

  // Each modal guards its own body-scroll-lock + Escape handler.
  // InstallSheet is a sub-component that manages its own useModalA11y internally.
  useModalA11y(showSmsConsent, () => { if (!isSmsLoading) setShowSmsConsent(false); });
  useModalA11y(showSmsOff, () => { if (!isSmsLoading) setShowSmsOff(false); });
  useModalA11y(showEmailOff, () => setShowEmailOff(false));

  const getToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not signed in');
    return session.access_token;
  };

  useEffect(() => {
    setDevice(detectDevice());
    const load = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${MISC_FUNCTION_URL}/notifications/preferences`, {
          headers: { 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
        });
        if (res.ok) {
          const data = await res.json();
          setEmailEnabled(data.email_enabled ?? true);
          setPushEnabled(data.push_enabled ?? false);
          setSmsEnabled(data.sms_enabled ?? false);
          setPhoneNumber(data.phone_number || null);
        }
      } catch { /* noop */ }
      finally { setIsLoading(false); }
    };
    load();
  }, [userId]);

  // ── Push ──────────────────────────────────────────────────────────

  const handlePushToggle = async (on: boolean) => {
    setPushDeniedMessage('');
    if (!on) {
      setPushEnabled(false);
      return;
    }
    // Require installation first — push on iOS PWA won't work from a browser tab.
    const installed =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (!installed) {
      setShowInstallSheet(true);
      return; // toggle stays OFF until they install + come back
    }
    if (typeof Notification === 'undefined') {
      setPushDeniedMessage('Push notifications are not supported in this browser.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setPushEnabled(true);
      // Register with OneSignal in the background to get a player ID for targeting.
      // Non-blocking — the staged push_enabled preference is committed on Save.
      setPushRegistering(true);
      requestPushPermission()
        .then(async (playerId) => {
          if (!playerId) return;
          const token = await getToken().catch(() => null);
          if (!token) return;
          await fetch(`${MISC_FUNCTION_URL}/notifications/preferences`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
            body: JSON.stringify({ onesignal_player_id: playerId }),
          });
        })
        .catch(() => {})
        .finally(() => setPushRegistering(false));
    } else if (permission === 'denied') {
      setPushDeniedMessage('Notifications are blocked at the browser level. Update your device settings to enable.');
    }
    // 'default' means the user dismissed without deciding — toggle stays OFF, no message.
  };

  // ── Email ─────────────────────────────────────────────────────────

  const handleEmailToggle = (on: boolean) => {
    if (!on) {
      setShowEmailOff(true); // confirmation before turning off
    } else {
      setEmailEnabled(true);
    }
  };

  // ── SMS ───────────────────────────────────────────────────────────

  const handleSmsToggle = (on: boolean) => {
    if (on) {
      setShowSmsConsent(true);
    } else {
      setShowSmsOff(true);
    }
  };

  const confirmSmsOptIn = async () => {
    if (!phoneNumber) {
      setError('No phone number on file. Add one in account settings first.');
      setShowSmsConsent(false);
      return;
    }
    setIsSmsLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${MISC_FUNCTION_URL}/sms/log-consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
        body: JSON.stringify({
          consentType: 'sms_consent',
          phoneNumber,
          consentText: SMS_CONSENT_TEXT,
          consentVersion: SMS_CONSENT_VERSION,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not enable SMS');
      }
      setSmsEnabled(true);
      setShowSmsConsent(false);
      try { window.dispatchEvent(new CustomEvent('parallel:sms-status')); } catch { /* noop */ }
    } catch (err: any) {
      setError(err.message || 'Could not enable SMS');
    } finally {
      setIsSmsLoading(false);
    }
  };

  const confirmSmsOptOut = async () => {
    setIsSmsLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${MISC_FUNCTION_URL}/sms/log-consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
        body: JSON.stringify({
          consentType: 'sms_opt_out',
          phoneNumber,
          consentText: 'User opted out of SMS notifications via account settings.',
          consentVersion: SMS_CONSENT_VERSION,
        }),
      });
      if (!res.ok) throw new Error('Could not disable SMS');
      setSmsEnabled(false);
      setShowSmsOff(false);
      try { window.dispatchEvent(new CustomEvent('parallel:sms-status')); } catch { /* noop */ }
    } catch (err: any) {
      setError(err.message || 'Could not disable SMS');
    } finally {
      setIsSmsLoading(false);
    }
  };

  // ── Save (email + push staged together) ───────────────────────────

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setSaveSuccess(false);
    try {
      const token = await getToken();
      if (!pushEnabled) {
        optOutOfPush().catch(() => {}); // fire-and-forget
      }
      const res = await fetch(`${MISC_FUNCTION_URL}/notifications/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
        body: JSON.stringify({ email_enabled: emailEnabled, push_enabled: pushEnabled }),
      });
      if (!res.ok) throw new Error('Could not save preferences');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setError(err.message || 'Could not save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-parallel-cream flex items-center justify-center" role="status" aria-label="Loading">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parallel-cream">
      <div className="max-w-md mx-auto px-4 py-6">
        <button
          onClick={onBack}
          aria-label="Back to account settings"
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          Back
        </button>

        <h1 className="text-2xl font-medium tracking-tight mb-1">Notifications</h1>
        <p className="text-sm text-gray-500 mb-8">Choose how you'd like to hear from Parallel.</p>

        {error && (
          <div role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}

        {/* Three channel rows */}
        <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden mb-6">

          {/* SMS */}
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex-1 pr-4">
              <div className="text-sm font-medium text-gray-900" id="sms-label">SMS</div>
              <div className="text-xs text-gray-500 mt-0.5" id="sms-sublabel">
                {!phoneNumber
                  ? 'Add a verified phone number in account settings'
                  : smsEnabled
                    ? `Texts sent to ${formatPhone(phoneNumber)}`
                    : `Will text ${formatPhone(phoneNumber)}`}
              </div>
            </div>
            <Switch
              checked={smsEnabled}
              onChange={handleSmsToggle}
              disabled={isSmsLoading || !phoneNumber}
              ariaLabelledBy="sms-label"
              ariaDescribedBy="sms-sublabel"
            />
          </div>

          {/* Push */}
          <div className="flex items-start justify-between px-4 py-4">
            <div className="flex-1 pr-4">
              <div className="text-sm font-medium text-gray-900" id="push-label">Push notifications</div>
              <div className="text-xs mt-0.5 leading-snug" id="push-sublabel">
                {pushDeniedMessage
                  ? <span className="text-amber-700">{pushDeniedMessage}</span>
                  : <span className="text-gray-500">{pushEnabled ? 'Enabled' : 'Requires the app to be installed'}</span>}
              </div>
            </div>
            <Switch
              checked={pushEnabled}
              onChange={handlePushToggle}
              disabled={pushRegistering}
              ariaLabelledBy="push-label"
              ariaDescribedBy="push-sublabel"
            />
          </div>

          {/* Email */}
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex-1 pr-4">
              <div className="text-sm font-medium text-gray-900" id="email-label">Email</div>
              <div className="text-xs text-gray-500 mt-0.5" id="email-sublabel">
                Match alerts and account updates
              </div>
            </div>
            <Switch
              checked={emailEnabled}
              onChange={handleEmailToggle}
              ariaLabelledBy="email-label"
              ariaDescribedBy="email-sublabel"
            />
          </div>
        </div>

        {/* Save button — commits email + push together */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-parallel-void text-parallel-cream py-3.5 rounded-full font-medium hover:bg-parallel-void/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Saving…</>
          ) : saveSuccess ? (
            'Saved ✓'
          ) : (
            'Save preferences'
          )}
        </button>
      </div>

      {/* Install instructions sheet — shown when push is toggled ON but app is not installed */}
      {showInstallSheet && (
        <InstallSheet device={device} onClose={() => setShowInstallSheet(false)} />
      )}

      {/* SMS consent modal */}
      {showSmsConsent && (
        <Modal onClose={() => !isSmsLoading && setShowSmsConsent(false)} labelledBy="sms-consent-title">
          <h2 id="sms-consent-title" className="text-lg font-medium mb-2">Enable SMS notifications</h2>
          <p className="text-sm text-gray-600 mb-4">
            Texts will be sent to {phoneNumber ? formatPhone(phoneNumber) : 'your phone number'}.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mb-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              By tapping "Enable SMS" below, you agree to receive SMS account
              notifications, verification codes, and match alerts from Parallel at
              the phone number provided. Consent is not a condition of purchase.
              Message frequency may vary. Standard message and data rates may apply.
              Reply STOP to opt out. Reply HELP for help. We will not share mobile
              information with third parties for promotional or marketing purposes.
              View our{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-gray-800">Privacy Policy</a>
              {' '}and{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline text-gray-800">Terms of Service</a>.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSmsConsent(false)}
              disabled={isSmsLoading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={confirmSmsOptIn}
              disabled={isSmsLoading}
              className="flex-1 px-4 py-2 bg-parallel-purple text-parallel-cream rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isSmsLoading ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Saving…</> : 'Enable SMS'}
            </button>
          </div>
        </Modal>
      )}

      {/* SMS opt-out confirmation */}
      {showSmsOff && (
        <Modal onClose={() => !isSmsLoading && setShowSmsOff(false)} labelledBy="sms-off-title">
          <h2 id="sms-off-title" className="text-lg font-medium mb-2">Turn off SMS?</h2>
          <p className="text-sm text-gray-600 mb-4">
            You won't receive text messages from Parallel. You can turn this back on anytime.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSmsOff(false)}
              disabled={isSmsLoading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              Keep on
            </button>
            <button
              onClick={confirmSmsOptOut}
              disabled={isSmsLoading}
              className="flex-1 px-4 py-2 bg-parallel-purple text-parallel-cream rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isSmsLoading ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Saving…</> : 'Turn off SMS'}
            </button>
          </div>
        </Modal>
      )}

      {/* Email turn-off confirmation */}
      {showEmailOff && (
        <Modal onClose={() => setShowEmailOff(false)} labelledBy="email-off-title">
          <h2 id="email-off-title" className="text-lg font-medium mb-2">Turn off email?</h2>
          <p className="text-sm text-gray-600 mb-4">
            You won't hear from us about new matches unless you have SMS or push enabled. Continue?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowEmailOff(false)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => { setEmailEnabled(false); setShowEmailOff(false); }}
              className="flex-1 px-4 py-2 bg-parallel-purple text-parallel-cream rounded-md text-sm font-medium hover:opacity-90"
            >
              Turn off email
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function InstallSheet({ device, onClose }: { device: DeviceType; onClose: () => void }) {
  // useModalA11y here (always true when mounted) so the parent doesn't need to track it.
  useModalA11y(true, onClose);
  return (
    <>
      <div className="fixed inset-0 bg-parallel-void/40 z-40" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed bottom-0 left-0 right-0 bg-parallel-cream rounded-t-3xl z-50 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-sheet-title"
      >
        <div className="relative max-w-md mx-auto px-6 pt-6 pb-10">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="inline-block bg-parallel-purple text-parallel-cream text-xs font-semibold px-3 py-1 rounded-full mb-4">
            STEP 1 OF 2
          </div>
          <h2 id="install-sheet-title" className="text-xl font-semibold mb-2">
            Add Parallel to your home screen first
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-6">
            Push notifications require the app to be installed. Once added, come back here and turn on Push.
          </p>
          <InstallInstructions device={device} />
          <button
            onClick={onClose}
            className="w-full text-gray-500 text-sm hover:text-gray-700 py-2 transition-colors"
          >
            I'll do this later
          </button>
        </div>
      </div>
    </>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
  ariaLabelledBy,
  ariaDescribedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
        checked ? 'bg-parallel-void' : 'bg-gray-200'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-parallel-cream transition-transform mt-0.5 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Modal({
  children,
  onClose,
  labelledBy,
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy?: string;
}) {
  return (
    <div
      className="fixed inset-0 bg-parallel-void/40 flex items-center justify-center z-50 px-4 py-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="bg-parallel-cream rounded-lg p-6 w-full max-w-sm shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length !== 11) return e164;
  return `+${digits[0]} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
}

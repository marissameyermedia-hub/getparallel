import { useState, useEffect } from 'react';
import { Loader2, ChevronLeft, Info } from 'lucide-react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { supabase } from '../../utils/supabase/client';

interface NotificationsViewProps {
  userId: string;
  onBack: () => void;
}

interface NotificationPrefs {
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  match_alerts: boolean;
  message_alerts: boolean;
  date_reminders: boolean;
}

const EDGE_FUNCTION_URL = `https://${projectId}.supabase.co/functions/v1/make-server-7af08c19`;

const SMS_CONSENT_TEXT =
  "By tapping 'Enable SMS', you agree to receive SMS account notifications, verification codes, and match alerts from Parallel at the phone number provided. Consent is not a condition of purchase. Message frequency may vary. Standard message and data rates may apply. Reply STOP to opt out. Reply HELP for help. We will not share mobile information with third parties for promotional or marketing purposes. View our Privacy Policy and Terms of Service.";

const SMS_CONSENT_VERSION = 'v1-2026-04';

export function NotificationsView({ userId, onBack }: NotificationsViewProps) {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    email_enabled: true,
    sms_enabled: false,
    push_enabled: true,
    match_alerts: true,
    message_alerts: true,
    date_reminders: true,
  });
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSmsConsentModal, setShowSmsConsentModal] = useState(false);
  const [showSmsOffConfirm, setShowSmsOffConfirm] = useState(false);
  const [error, setError] = useState('');

  // Get auth token for edge function calls
  const getAuthToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not signed in');
    return session.access_token;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(`${EDGE_FUNCTION_URL}/notifications/preferences`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': publicAnonKey,
          },
        });
        const data = await res.json();
        if (res.ok) {
          setPrefs({
            email_enabled: data.email_enabled ?? true,
            push_enabled: data.push_enabled ?? true,
            sms_enabled: data.sms_enabled ?? false,
            match_alerts: data.new_matches ?? true,
            message_alerts: data.messages ?? true,
            date_reminders: data.date_reminders ?? true,
          });
          setPhoneNumber(data.phone_number || null);
        }
      } catch (err) {
        console.error('Could not load notification prefs:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [userId]);

  // Save non-SMS preference changes (email, push, match alerts, etc)
  const savePref = async (newPrefs: NotificationPrefs) => {
    setIsSaving(true);
    setError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${EDGE_FUNCTION_URL}/notifications/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({
          email_enabled: newPrefs.email_enabled,
          push_enabled: newPrefs.push_enabled,
          // Don't send sms_enabled=true here — must go through /sms/log-consent for audit
          // Allow sms_enabled=false to flow through (for non-confirmation opt-out paths)
          sms_enabled: newPrefs.sms_enabled === false ? false : undefined,
          match_alerts: newPrefs.match_alerts,
          message_alerts: newPrefs.message_alerts,
          date_reminders: newPrefs.date_reminders,
        }),
      });
      if (!res.ok) throw new Error('Could not save preferences');
      setPrefs(newPrefs);
    } catch (err: any) {
      setError(err.message || 'Could not save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  // SMS toggle handler — opens consent modal on ON, confirm on OFF
  const handleSmsToggle = (newValue: boolean) => {
    if (newValue) {
      setShowSmsConsentModal(true);
    } else {
      setShowSmsOffConfirm(true);
    }
  };

  const confirmSmsOptIn = async () => {
    if (!phoneNumber) {
      setError('No phone number on file. Add one in account settings first.');
      setShowSmsConsentModal(false);
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const token = await getAuthToken();
      // Log consent to consent_log AND flip sms_enabled on (edge function does both atomically)
      const res = await fetch(`${EDGE_FUNCTION_URL}/sms/log-consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
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
      setPrefs({ ...prefs, sms_enabled: true });
      setShowSmsConsentModal(false);
    } catch (err: any) {
      setError(err.message || 'Could not enable SMS notifications');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmSmsOptOut = async () => {
    setIsSaving(true);
    setError('');
    try {
      const token = await getAuthToken();
      // Log opt-out event to consent_log AND flip sms_enabled off
      const res = await fetch(`${EDGE_FUNCTION_URL}/sms/log-consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({
          consentType: 'sms_opt_out',
          phoneNumber,
          consentText: 'User opted out of SMS notifications via account settings.',
          consentVersion: SMS_CONSENT_VERSION,
        }),
      });
      if (!res.ok) throw new Error('Could not disable SMS');
      setPrefs({ ...prefs, sms_enabled: false });
      setShowSmsOffConfirm(false);
    } catch (err: any) {
      setError(err.message || 'Could not disable SMS notifications');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-4 py-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <h1 className="text-2xl font-medium tracking-tight mb-1">Notifications</h1>
        <p className="text-sm text-gray-500 mb-8">
          Choose how you'd like to hear from Parallel.
        </p>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <div className="mb-8">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Channels
          </div>

          <Toggle
            label="Email"
            sublabel="New matches, messages, and account updates"
            value={prefs.email_enabled}
            onChange={(v) => savePref({ ...prefs, email_enabled: v })}
            disabled={isSaving}
          />

          <Toggle
            label="Push notifications"
            sublabel="In-app and device notifications"
            value={prefs.push_enabled}
            onChange={(v) => savePref({ ...prefs, push_enabled: v })}
            disabled={isSaving}
          />

          {/* SMS Toggle — Telnyx 10DLC compliant */}
          <div className="border-t border-gray-100">
            <div className="flex items-start justify-between py-4">
              <div className="flex-1 pr-4">
                <div className="text-sm text-gray-900">SMS / text messages</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {phoneNumber
                    ? `Sent to ${formatPhoneDisplay(phoneNumber)}`
                    : 'Add a verified phone number in account settings to enable'}
                </div>
                {prefs.sms_enabled && (
                  <div className="text-xs text-gray-400 mt-1.5 flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>You can also reply STOP to any message to opt out instantly.</span>
                  </div>
                )}
              </div>
              <SwitchControl
                checked={prefs.sms_enabled}
                onChange={handleSmsToggle}
                disabled={isSaving || !phoneNumber}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
            Notify me about
          </div>
          <Toggle
            label="New matches"
            value={prefs.match_alerts}
            onChange={(v) => savePref({ ...prefs, match_alerts: v })}
            disabled={isSaving}
          />
          <Toggle
            label="New messages"
            value={prefs.message_alerts}
            onChange={(v) => savePref({ ...prefs, message_alerts: v })}
            disabled={isSaving}
          />
          <Toggle
            label="Date reminders"
            value={prefs.date_reminders}
            onChange={(v) => savePref({ ...prefs, date_reminders: v })}
            disabled={isSaving}
          />
        </div>
      </div>

      {/* SMS CONSENT MODAL */}
      {showSmsConsentModal && (
        <Modal onClose={() => !isSaving && setShowSmsConsentModal(false)}>
          <h2 className="text-lg font-medium mb-2">Enable SMS notifications</h2>
          <p className="text-sm text-gray-600 mb-4">
            Texts will be sent to {phoneNumber && formatPhoneDisplay(phoneNumber)}.
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
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowSmsConsentModal(false)}
              disabled={isSaving}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={confirmSmsOptIn}
              disabled={isSaving}
              className="flex-1 px-4 py-2 bg-black text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Enable SMS'
              )}
            </button>
          </div>
        </Modal>
      )}

      {/* SMS OPT-OUT CONFIRMATION MODAL */}
      {showSmsOffConfirm && (
        <Modal onClose={() => !isSaving && setShowSmsOffConfirm(false)}>
          <h2 className="text-lg font-medium mb-2">Turn off SMS notifications?</h2>
          <p className="text-sm text-gray-600 mb-4">
            You won't receive text messages from Parallel. You can turn this back
            on anytime, or you can keep it off and we'll only contact you by email
            and push notifications.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setShowSmsOffConfirm(false)}
              disabled={isSaving}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              Keep on
            </button>
            <button
              onClick={confirmSmsOptOut}
              disabled={isSaving}
              className="flex-1 px-4 py-2 bg-black text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Turn off SMS'
              )}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Toggle({
  label,
  sublabel,
  value,
  onChange,
  disabled,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-t border-gray-100 first:border-t-0">
      <div className="flex-1 pr-4">
        <div className="text-sm text-gray-900">{label}</div>
        {sublabel && <div className="text-xs text-gray-500 mt-0.5">{sublabel}</div>}
      </div>
      <SwitchControl checked={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function SwitchControl({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
        checked ? 'bg-black' : 'bg-gray-200'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform mt-0.5 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function formatPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length !== 11) return e164;
  return `+${digits[0]} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
}
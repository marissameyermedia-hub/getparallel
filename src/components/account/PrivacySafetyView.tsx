import { Shield, Eye, Lock, UserX, ChevronLeft, Download, Flag } from 'lucide-react';
import { useState, useEffect } from 'react';
import { EDGE_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { toast } from 'sonner';

interface PrivacySafetyViewProps {
  onBack: () => void;
}

function getAuthHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey': publicAnonKey,
  };
}

export function PrivacySafetyView({ onBack }: PrivacySafetyViewProps) {
  const [hideFromContacts, setHideFromContacts] = useState(false);
  const [readReceipts, setReadReceipts] = useState(true);
  const [onlineStatus, setOnlineStatus] = useState(true);
  const [blockedCount, setBlockedCount] = useState<number>(0);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('parallel_access_token');
    if (!token) return;
    const headers = getAuthHeaders(token);
    fetch(`${EDGE_FUNCTION_URL}/user/profile`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.privacySettings) {
          const s = data.privacySettings;
          if (typeof s.hideFromContacts === 'boolean') setHideFromContacts(s.hideFromContacts);
          if (typeof s.readReceipts === 'boolean') setReadReceipts(s.readReceipts);
          if (typeof s.onlineStatus === 'boolean') setOnlineStatus(s.onlineStatus);
        }
      })
      .catch(err => console.error('Failed to fetch privacy settings:', err));
    fetch(`${EDGE_FUNCTION_URL}/safety/blocked`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (typeof data?.count === 'number') setBlockedCount(data.count); })
      .catch(err => console.error('Failed to fetch blocked count:', err));
  }, []);

  const savePrivacySettings = async (settings: { hideFromContacts: boolean; readReceipts: boolean; onlineStatus: boolean }) => {
    const token = localStorage.getItem('parallel_access_token');
    if (!token) return;
    try {
      await fetch(`${EDGE_FUNCTION_URL}/user/profile`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ privacySettings: settings }),
      });
    } catch (err) {
      console.error('Failed to save privacy settings:', err);
    }
  };

  const toggleHideFromContacts = () => { const next = !hideFromContacts; setHideFromContacts(next); savePrivacySettings({ hideFromContacts: next, readReceipts, onlineStatus }); };
  const toggleOnlineStatus = () => { const next = !onlineStatus; setOnlineStatus(next); savePrivacySettings({ hideFromContacts, readReceipts, onlineStatus: next }); };
  const toggleReadReceipts = () => { const next = !readReceipts; setReadReceipts(next); savePrivacySettings({ hideFromContacts, readReceipts: next, onlineStatus }); };

  const handleDownloadData = async () => {
    const token = localStorage.getItem('parallel_access_token');
    if (!token) {
      toast.error('Please sign in to download your data');
      return;
    }

    setIsExporting(true);
    try {
      const res = await fetch(`${EDGE_FUNCTION_URL}/account/export`, {
        headers: getAuthHeaders(token),
      });

      if (!res.ok) {
        throw new Error('Failed to export data');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'parallel-data-export.json';
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Data exported successfully');
    } catch (err) {
      console.error('Failed to export data:', err);
      toast.error('Failed to export data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white pt-6 pb-36 px-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="mb-6 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Go back">
          <ChevronLeft size={28} />
        </button>
        <h1 className="mb-3">Privacy & Safety</h1>
        <p className="text-gray-600 mb-8">Control who can see your profile and how you interact</p>

        <div className="bg-black text-white rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <Shield className="w-6 h-6 text-white flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-white mb-2">Our Safety Commitment</h3>
              <p className="text-gray-300 text-sm leading-relaxed">We take user safety seriously and actively moderate behavior that violates our Community Guidelines. Every profile is reviewed, and we provide tools to report and block users who make you feel uncomfortable.</p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="mb-4">Privacy Settings</h3>
          <div className="space-y-3">
            {[
              { label: 'Hide from phone contacts', sub: "Don't show your profile to people in your contacts", value: hideFromContacts, toggle: toggleHideFromContacts },
              { label: 'Show online status', sub: "Let matches see when you're active", value: onlineStatus, toggle: toggleOnlineStatus },
              { label: 'Read receipts', sub: "Show when you've read messages", value: readReceipts, toggle: toggleReadReceipts },
            ].map(({ label, sub, value, toggle }) => (
              <div key={label} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-3 flex-1">
                  <Eye className="w-5 h-5 text-gray-600" />
                  <div>
                    <div className="font-medium">{label}</div>
                    <div className="text-sm text-gray-600">{sub}</div>
                  </div>
                </div>
                <button onClick={toggle} className={`relative w-12 h-6 rounded-full transition-colors ${value ? 'bg-black' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${value ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Safety Tools — read-only display, not buttons */}
        <div className="mb-6">
          <h3 className="mb-4">Safety Tools</h3>
          <div className="space-y-3">

            {/* Blocked Users — informational row only; honest copy, no promise of a list UI that doesn't exist yet */}
            <div className="p-4 rounded-2xl border-2 border-gray-200 flex items-start gap-3">
              <UserX className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-sm">Blocked users</div>
                <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {blockedCount === 0
                    ? "You haven't blocked anyone. To block someone, tap the three dots on their profile or in chat."
                    : <>
                        You've blocked {blockedCount} {blockedCount === 1 ? 'person' : 'people'}. To unblock someone,{' '}
                        <a href="mailto:support@getparallel.vip?subject=Unblock%20request" className="text-black underline font-medium">
                          email support
                        </a>
                        {' '}with their name.
                      </>
                  }
                </div>
              </div>
            </div>

            {/* How to report — informational, not a button */}
            <div className="p-4 rounded-2xl border-2 border-gray-200">
              <div className="flex items-start gap-3">
                <Flag className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-sm mb-1">How to report a user</div>
                  <div className="text-xs text-gray-600 leading-relaxed mb-2">
                    Tap the three dots on any profile or in your message thread to open the report form. Choose a reason and describe what happened — our safety team reviews every report as quickly as possible.
                  </div>
                  <div className="text-xs text-gray-600 leading-relaxed">
                    For urgent safety concerns that aren't tied to a specific user,{' '}
                    <a
                      href="mailto:legal@getparallel.vip?subject=Safety%20concern"
                      className="text-black underline font-medium"
                    >
                      email legal@getparallel.vip
                    </a>.
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-gray-600" />
            <h3>Safety Resources</h3>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed mb-5">
            If you or someone you know is in danger or needs support, these resources are here 24/7.
          </p>
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="font-medium text-sm mb-0.5">National Domestic Violence Hotline</p>
              <p className="text-xs text-gray-500 mb-2">Call or text 24/7 — confidential support for abuse of any kind</p>
              <div className="flex gap-3 flex-wrap">
                <a href="tel:18007997233" className="text-sm font-medium underline">1-800-799-7233</a>
                <span className="text-gray-300">·</span>
                <a href="sms:88788" className="text-sm font-medium underline">Text START to 88788</a>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="font-medium text-sm mb-0.5">RAINN Sexual Assault Hotline</p>
              <p className="text-xs text-gray-500 mb-2">Confidential support from trained staff after sexual violence</p>
              <div className="flex gap-3 flex-wrap">
                <a href="tel:18006564673" className="text-sm font-medium underline">1-800-656-4673</a>
                <span className="text-gray-300">·</span>
                <a href="https://hotline.rainn.org" target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline">Online chat</a>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="font-medium text-sm mb-0.5">Crisis Text Line</p>
              <p className="text-xs text-gray-500 mb-2">Free, 24/7 crisis counseling via text message</p>
              <a href="sms:741741" className="text-sm font-medium underline">Text HOME to 741741</a>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="font-medium text-sm mb-0.5">988 Suicide &amp; Crisis Lifeline</p>
              <p className="text-xs text-gray-500 mb-2">Free, confidential emotional support 24/7</p>
              <div className="flex gap-3 flex-wrap">
                <a href="tel:988" className="text-sm font-medium underline">Call or text 988</a>
                <span className="text-gray-300">·</span>
                <a href="https://988lifeline.org/chat" target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline">Chat online</a>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <p className="font-medium text-sm mb-0.5">Stalking Prevention &amp; Awareness</p>
              <p className="text-xs text-gray-500 mb-2">Resources for stalking, harassment, and online safety</p>
              <a href="https://www.stalkingawareness.org" target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline">stalkingawareness.org</a>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-5 leading-relaxed">
            To report a concern within Parallel, use the Report button on any profile or message. Our safety team reviews all reports as quickly as possible. Email legal@getparallel.vip for urgent safety issues.
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Download className="w-6 h-6 text-gray-600" />
            <h3>Download Your Data</h3>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed mb-5">
            Download a copy of your data for your records.
          </p>
          <button
            className="w-full p-4 rounded-2xl border-2 border-gray-200 hover:border-black transition-colors flex items-center gap-3"
            onClick={handleDownloadData}
            disabled={isExporting}
          >
            <Download className="w-5 h-5 text-gray-600" />
            <span className="flex-1 text-left">Download Data</span>
            {isExporting && <span className="text-sm text-gray-500">Exporting...</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
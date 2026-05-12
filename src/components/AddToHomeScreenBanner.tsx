import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

interface Props {
  accessToken: string;
}

const DISMISSED_KEY = 'parallel_aths_dismissed';

function shouldShowBanner(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  // iOS only — Android PWAs share storage with Chrome so the cookie bridge works there.
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
  const isStandalone =
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const dismissed = localStorage.getItem(DISMISSED_KEY) === '1';
  return isIOS && !isStandalone && !dismissed;
}

export function AddToHomeScreenBanner({ accessToken }: Props) {
  const [visible, setVisible] = useState(shouldShowBanner);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!visible) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  const handleAdd = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`${MISC_FUNCTION_URL}/auth/pwa-token/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: publicAnonKey,
        },
      });
      if (res.ok) {
        const { token } = await res.json();
        // Embed the install token in the URL. iOS saves the current URL as the
        // PWA's start_url, so the token travels to the first PWA launch for free.
        const newUrl = `${window.location.origin}${window.location.pathname}?pwa_token=${token}`;
        window.history.replaceState({}, '', newUrl);
      }
    } catch (err) {
      console.warn('[pwa-banner] token generation failed:', err);
    }
    setIsGenerating(false);
    setShowInstructions(true);
  };

  if (showInstructions) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
        <div className="w-full max-w-sm bg-white rounded-t-3xl px-6 pt-6 pb-10">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-lg">Add Parallel to your home screen</h3>
            <button
              onClick={() => {
                window.history.replaceState({}, '', window.location.pathname);
                setShowInstructions(false);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <ol className="space-y-5">
            {[
              { icon: '⬆️', text: 'Tap the Share button at the bottom of Safari' },
              { icon: '📲', text: "Scroll down and tap 'Add to Home Screen'" },
              { icon: '✅', text: "Tap 'Add' in the top right" },
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-2xl w-9 text-center flex-shrink-0">{step.icon}</span>
                <span className="text-sm text-gray-700 leading-relaxed pt-1">{step.text}</span>
              </li>
            ))}
          </ol>

          <p className="text-xs text-gray-400 mt-6 text-center leading-relaxed">
            You'll stay signed in automatically once it's added.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 left-0 right-0 z-40 px-4 pointer-events-none">
      <div className="max-w-sm mx-auto bg-parallel-void text-parallel-cream rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl pointer-events-auto">
        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
          <Plus size={18} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">Add to Home Screen</p>
          <p className="text-xs text-white/50 leading-tight mt-0.5">Stay signed in, faster access</p>
        </div>
        <button
          onClick={handleAdd}
          disabled={isGenerating}
          className="flex-shrink-0 bg-parallel-cream text-parallel-void text-sm font-semibold px-3 py-1.5 rounded-full disabled:opacity-40 transition-opacity"
        >
          {isGenerating ? '…' : 'Add'}
        </button>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 -mr-1"
          aria-label="Dismiss"
        >
          <X size={14} className="text-white/30" />
        </button>
      </div>
    </div>
  );
}

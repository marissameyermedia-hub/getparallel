import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';

interface Props {
  accessToken: string;
  hasBottomActionBar?: boolean;
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

export function AddToHomeScreenBanner({ accessToken, hasBottomActionBar = false }: Props) {
  const [visible, setVisible] = useState(shouldShowBanner);
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
    // Open the shared InstallPromptBanner (same design as the checklist flow)
    // and dismiss this floating pill so they don't stack.
    try { window.dispatchEvent(new CustomEvent('parallel:open-install-prompt')); } catch { /* noop */ }
    handleDismiss();
  };

  return (
    <div
      className="fixed left-0 right-0 z-[55] px-4 pointer-events-none"
      style={{ bottom: `calc(${hasBottomActionBar ? '9rem' : '5rem'} + env(safe-area-inset-bottom, 0px))` }}
    >
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

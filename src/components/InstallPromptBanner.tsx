import { useState, useEffect } from 'react';
import { Share, X, MoreVertical, Plus } from 'lucide-react';
import { useModalA11y } from '../utils/useModalA11y';

interface InstallPromptBannerProps {
  hasCompletedOnboarding: boolean;
}

declare global {
  interface Window {
    deferredInstallPrompt?: any;
  }
}

type DeviceType = 'ios-safari' | 'ios-chrome' | 'ios-firefox' | 'android-chrome' | 'android-firefox' | 'desktop-chrome' | 'desktop-other';

function detectDevice(): DeviceType {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isChrome = /CriOS|Chrome/.test(ua) && !/Chromium/.test(ua);
  const isFirefox = /FxiOS|Firefox/.test(ua);
  const isSafari = /Safari/.test(ua) && !isChrome && !isFirefox;

  if (isIOS) {
    if (isChrome) return 'ios-chrome';
    if (isFirefox) return 'ios-firefox';
    return 'ios-safari'; // default iOS
  }
  if (isAndroid) {
    if (isFirefox) return 'android-firefox';
    return 'android-chrome'; // default Android
  }
  if (isChrome) return 'desktop-chrome';
  return 'desktop-other';
}

function InstallInstructions({ device }: { device: DeviceType }) {
  const stepStyle = "flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-100";
  const numStyle = "w-6 h-6 bg-black text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0 mt-0.5";

  if (device === 'ios-safari') {
    return (
      <div className="space-y-2 mb-6">
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">1</div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Tap the <Share className="inline w-4 h-4 mx-0.5 align-middle" aria-hidden="true" /> <strong>Share</strong> button at the bottom of your Safari browser
          </p>
        </div>
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">2</div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Scroll down and tap <strong>"Add to Home Screen"</strong> <Plus className="inline w-4 h-4 mx-0.5 align-middle" aria-hidden="true" />
          </p>
        </div>
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">3</div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Tap <strong>"Add"</strong> in the top right corner
          </p>
        </div>
      </div>
    );
  }

  if (device === 'ios-chrome') {
    return (
      <div className="space-y-2 mb-6">
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 mb-3">
          <p className="text-sm text-amber-800">For the best experience on iPhone, open this page in <strong>Safari</strong> first.</p>
        </div>
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">1</div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Tap the <Share className="inline w-4 h-4 mx-0.5 align-middle" aria-hidden="true" /> <strong>Share</strong> button at the bottom of Chrome
          </p>
        </div>
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">2</div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Tap <strong>"Add to Home Screen"</strong>
          </p>
        </div>
      </div>
    );
  }

  if (device === 'ios-firefox') {
    return (
      <div className="space-y-2 mb-6">
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 mb-3">
          <p className="text-sm text-amber-800">For the best experience on iPhone, open this page in <strong>Safari</strong> instead.</p>
        </div>
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">1</div>
          <p className="text-sm text-gray-700">Open <strong>getparallel.vip</strong> in Safari</p>
        </div>
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">2</div>
          <p className="text-sm text-gray-700">Tap <Share className="inline w-4 h-4 mx-0.5 align-middle" aria-hidden="true" /> Share, then <strong>"Add to Home Screen"</strong></p>
        </div>
      </div>
    );
  }

  if (device === 'android-chrome') {
    return (
      <div className="space-y-2 mb-6">
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">1</div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Tap the <MoreVertical className="inline w-4 h-4 mx-0.5 align-middle" aria-hidden="true" /> <strong>menu</strong> (three dots) in the top right of Chrome
          </p>
        </div>
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">2</div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>
          </p>
        </div>
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">3</div>
          <p className="text-sm text-gray-700 leading-relaxed">
            Tap <strong>"Add"</strong> to confirm
          </p>
        </div>
      </div>
    );
  }

  if (device === 'android-firefox') {
    return (
      <div className="space-y-2 mb-6">
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">1</div>
          <p className="text-sm text-gray-700">Tap the <MoreVertical className="inline w-4 h-4 mx-0.5 align-middle" aria-hidden="true" /> <strong>menu</strong> in Firefox</p>
        </div>
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">2</div>
          <p className="text-sm text-gray-700">Tap <strong>"Install"</strong> or <strong>"Add to Home Screen"</strong></p>
        </div>
      </div>
    );
  }

  if (device === 'desktop-chrome') {
    return (
      <div className="space-y-2 mb-6">
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">1</div>
          <p className="text-sm text-gray-700">Look for the <strong>install icon</strong> (⊕) in the right side of the Chrome address bar</p>
        </div>
        <div className={stepStyle}>
          <div className={numStyle} aria-hidden="true">2</div>
          <p className="text-sm text-gray-700">Click it and select <strong>"Install"</strong></p>
        </div>
      </div>
    );
  }

  // desktop-other fallback
  return (
    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 mb-6">
      <p className="text-sm text-gray-700 leading-relaxed">
        For the best experience, open <strong>getparallel.vip</strong> in Chrome or Safari on your phone and add it to your home screen.
      </p>
    </div>
  );
}

export function InstallPromptBanner({ hasCompletedOnboarding }: InstallPromptBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [device, setDevice] = useState<DeviceType>('desktop-other');
  const [canShowNativePrompt, setCanShowNativePrompt] = useState(false);

  useEffect(() => {
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    const isDismissed = localStorage.getItem('parallel_install_prompt_dismissed') === 'true';
    const detected = detectDevice();
    setDevice(detected);
    setCanShowNativePrompt(!!window.deferredInstallPrompt);

    if (hasCompletedOnboarding && !isInstalled && !isDismissed) {
      const timer = setTimeout(() => setIsVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedOnboarding]);

  const handleDismiss = () => {
    localStorage.setItem('parallel_install_prompt_dismissed', 'true');
    setIsVisible(false);
  };

  // Hook handles Escape-to-close, body-scroll-lock, focus restore.
  useModalA11y(isVisible, handleDismiss);

  const handleNativeInstall = async () => {
    if (!window.deferredInstallPrompt) return;
    try {
      await window.deferredInstallPrompt.prompt();
      const { outcome } = await window.deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem('parallel_install_prompt_dismissed', 'true');
        setIsVisible(false);
      }
      window.deferredInstallPrompt = null;
    } catch (err) {
      console.error('Error showing install prompt:', err);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={handleDismiss}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-prompt-title"
      >
        <div className="relative max-w-md mx-auto">
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-10"
            aria-label="Close"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="px-6 pt-6 pb-8">
            <div className="inline-block bg-black text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
              BETTER EXPERIENCE
            </div>
            <h2 id="install-prompt-title" className="text-2xl font-semibold text-black mb-2">
              Add Parallel to your home screen
            </h2>
            <p className="text-gray-600 text-base leading-relaxed mb-6">
              Get instant notifications when you match. No App Store needed.
            </p>

            <InstallInstructions device={device} />

            {/* Native install button for Android Chrome */}
            {canShowNativePrompt && (device === 'android-chrome') && (
              <button
                onClick={handleNativeInstall}
                className="w-full bg-black text-white px-6 py-4 rounded-full hover:bg-gray-800 transition-all font-medium text-base mb-3"
              >
                Add to Home Screen
              </button>
            )}

            <button
              onClick={handleDismiss}
              className="w-full text-gray-500 text-sm hover:text-gray-700 transition-colors py-2"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

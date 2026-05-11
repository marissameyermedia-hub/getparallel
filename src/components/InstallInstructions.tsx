import { Share, MoreVertical, Plus } from 'lucide-react';

export type DeviceType =
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-firefox'
  | 'android-chrome'
  | 'android-firefox'
  | 'desktop-chrome'
  | 'desktop-other';

export function detectDevice(): DeviceType {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isChrome = /CriOS|Chrome/.test(ua) && !/Chromium/.test(ua);
  const isFirefox = /FxiOS|Firefox/.test(ua);

  if (isIOS) {
    if (isChrome) return 'ios-chrome';
    if (isFirefox) return 'ios-firefox';
    return 'ios-safari';
  }
  if (isAndroid) {
    if (isFirefox) return 'android-firefox';
    return 'android-chrome';
  }
  if (isChrome) return 'desktop-chrome';
  return 'desktop-other';
}

export function InstallInstructions({ device }: { device: DeviceType }) {
  const stepStyle = "flex items-start gap-3 p-3 bg-parallel-cream rounded-xl border border-gray-100";
  const numStyle = "w-6 h-6 bg-parallel-purple text-parallel-cream text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0 mt-0.5";

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

  return (
    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 mb-6">
      <p className="text-sm text-gray-700 leading-relaxed">
        For the best experience, open <strong>getparallel.vip</strong> in Chrome or Safari on your phone and add it to your home screen.
      </p>
    </div>
  );
}

/**
 * EnablePushBanner
 *
 * Slim banner that appears on Home (matches view) when the user is
 * authenticated, the PWA is installed, and iOS push permission is in the
 * 'default' state — meaning the user has either never been asked, or iOS
 * reset their permission after a PWA reinstall.
 *
 * One tap on "Enable" triggers the iOS permission dialog (which is the only
 * way to register web push on iOS — Apple requires a user gesture). On Allow,
 * the player ID is registered with the backend and the banner disappears.
 *
 * Without this banner, users who reinstall the PWA (or new users who never
 * went into Account → Notifications) wouldn't see the iOS prompt and would
 * silently miss all push notifications. The only way to recover was to dig
 * into Account → Notifications → toggle off → toggle on. This banner makes
 * that recovery a one-tap operation right on the home screen.
 *
 * Snoozed for 7 days when dismissed.
 */
import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { requestPushPermission, getPushPermissionState } from '../utils/onesignal';

interface EnablePushBannerProps {
  accessToken: string | null;
}

const SNOOZE_KEY = 'parallel_push_prompt_dismissed_at';
const SNOOZE_DAYS = 7;
const SNOOZE_MS = SNOOZE_DAYS * 24 * 60 * 60 * 1000;

function isPwaInstalled(): boolean {
  // iOS PWAs run in standalone display mode after Add to Home Screen.
  // navigator.standalone is the iOS-specific flag; matchMedia covers other browsers.
  if (typeof window === 'undefined') return false;
  if ((window.navigator as any).standalone === true) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

export function EnablePushBanner({ accessToken }: EnablePushBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    const checkShouldShow = async () => {
      // 1. Must be installed as a PWA. Browser tabs don't support web push reliably on iOS,
      //    and showing this prompt to non-installed users would be confusing.
      if (!isPwaInstalled()) return;

      // 2. Must have iOS permission in 'default' state — never asked, or reset.
      //    'granted' = already working, 'denied' = user blocked at OS level (we can't recover from this).
      const permState = await getPushPermissionState();
      if (permState !== 'default') return;

      // 3. Honor the snooze period if user previously dismissed.
      const dismissedAt = localStorage.getItem(SNOOZE_KEY);
      const isStillSnoozed = dismissedAt
        ? Date.now() - parseInt(dismissedAt, 10) < SNOOZE_MS
        : false;
      if (isStillSnoozed) return;

      // 4. Check the user's preference — if they explicitly turned push off in Account,
      //    don't nag them. (Default for new users is push_enabled=true so they'll see it.)
      try {
        const prefsRes = await fetch(`${MISC_FUNCTION_URL}/notifications/preferences`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'apikey': publicAnonKey },
        });
        if (prefsRes.ok) {
          const prefs = await prefsRes.json();
          if (prefs?.push_enabled === false) return;
        }
      } catch {
        // If prefs fetch fails, assume push is wanted (new users default to on).
      }

      // Slight delay so the banner doesn't flash in immediately on page load.
      // Gives the home view a moment to settle visually first.
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    };

    checkShouldShow();
  }, [accessToken]);

  const handleEnable = async () => {
    if (isEnabling) return;
    setIsEnabling(true);

    try {
      // This call triggers the iOS "Would Like to Send You Notifications" dialog.
      // On Allow, we get back the OneSignal player ID. On Deny, we get null.
      const playerId = await requestPushPermission();

      if (playerId && accessToken) {
        // Save the player ID + flip push_enabled=true in case it was set to false somewhere.
        await fetch(`${MISC_FUNCTION_URL}/notifications/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': publicAnonKey,
          },
          body: JSON.stringify({ push_enabled: true, onesignal_player_id: playerId }),
        });
      }

      // Whether they tapped Allow or Deny, hide the banner — we asked, we move on.
      // If they denied, snooze for 7 days before asking again.
      if (!playerId) {
        localStorage.setItem(SNOOZE_KEY, String(Date.now()));
      }
      setIsVisible(false);
    } catch (err) {
      console.error('[EnablePushBanner] error enabling push:', err);
      setIsVisible(false);
    } finally {
      setIsEnabling(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed top-16 left-3 right-3 z-30 bg-parallel-purple text-parallel-cream rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3"
      role="region"
      aria-label="Notification setup"
    >
      <Bell className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
      <p className="flex-1 text-sm leading-snug">
        Turn on push notifications for new matches and messages
      </p>
      <button
        onClick={handleEnable}
        disabled={isEnabling}
        className="bg-parallel-cream text-parallel-void text-sm font-semibold px-3 py-1.5 rounded-full disabled:opacity-50 flex-shrink-0"
        aria-label="Enable push notifications"
      >
        {isEnabling ? '...' : 'Enable'}
      </button>
      <button
        onClick={handleDismiss}
        className="p-1 -mr-1 flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

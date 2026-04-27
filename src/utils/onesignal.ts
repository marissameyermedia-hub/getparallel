/**
 * OneSignal Web Push utility
 *
 * Wraps the OneSignal Web SDK (loaded via CDN in index.html).
 * All calls are safe to make before the SDK is ready — they queue
 * automatically via window.OneSignalDeferred.
 *
 * App ID: ac575970-18c4-4f71-9ff9-aa323baef90f
 */

const ONESIGNAL_APP_ID = 'ac575970-18c4-4f71-9ff9-aa323baef90f';

// Extend window so TypeScript doesn't complain about OneSignal globals
declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: any) => void>;
    OneSignal?: any;
  }
}

/** Queue a function to run once OneSignal is ready. */
function withOneSignal(fn: (os: any) => void | Promise<void>) {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(fn);
}

/**
 * Initialize OneSignal. Call once on app load (main.tsx).
 * We disable the built-in notify button — Parallel uses its own UI.
 */
export function initOneSignal() {
  withOneSignal(async (OneSignal) => {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      safari_web_id: 'web.onesignal.auto.4787ada6-f101-40da-894e-0a68fad84e0f',
      // Never show the default floating bell widget
      notifyButton: { enable: false },
      // Don't auto-prompt — we do it ourselves via the Notifications toggle
      promptOptions: { autoPrompt: false },
    });
  });
}

/**
 * Request push permission and return the player ID on success, or null.
 * Shows the browser's native permission prompt.
 */
export async function requestPushPermission(): Promise<string | null> {
  return new Promise((resolve) => {
    withOneSignal(async (OneSignal) => {
      try {
        await OneSignal.Notifications.requestPermission();
        const granted = OneSignal.Notifications.permission;
        if (!granted) { resolve(null); return; }
        // Give the SDK a moment to register the subscription
        await new Promise(r => setTimeout(r, 1000));
        const playerId = await OneSignal.User.PushSubscription.id;
        resolve(playerId ?? null);
      } catch (err) {
        console.error('[OneSignal] requestPushPermission error:', err);
        resolve(null);
      }
    });
  });
}

/**
 * Opt the current device out of push. Does not revoke browser permission
 * (that requires user action in browser settings) but disables delivery.
 */
export async function optOutOfPush(): Promise<void> {
  return new Promise((resolve) => {
    withOneSignal(async (OneSignal) => {
      try {
        await OneSignal.User.PushSubscription.optOut();
      } catch (err) {
        console.error('[OneSignal] optOutOfPush error:', err);
      }
      resolve();
    });
  });
}

/**
 * Re-opt in after a previous opt-out (without re-prompting the browser).
 */
export async function optInToPush(): Promise<string | null> {
  return new Promise((resolve) => {
    withOneSignal(async (OneSignal) => {
      try {
        await OneSignal.User.PushSubscription.optIn();
        await new Promise(r => setTimeout(r, 800));
        const playerId = await OneSignal.User.PushSubscription.id;
        resolve(playerId ?? null);
      } catch (err) {
        console.error('[OneSignal] optInToPush error:', err);
        resolve(null);
      }
    });
  });
}

/**
 * Get the current device's OneSignal player/subscription ID.
 * Returns null if not subscribed.
 */
export async function getPlayerId(): Promise<string | null> {
  return new Promise((resolve) => {
    withOneSignal(async (OneSignal) => {
      try {
        const id = await OneSignal.User.PushSubscription.id;
        resolve(id ?? null);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Check current browser notification permission state.
 * Returns 'granted' | 'denied' | 'default'
 */
export async function getPushPermissionState(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

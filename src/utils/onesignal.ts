/**
 * OneSignal Web Push utility
 *
 * Wraps the OneSignal Web SDK (loaded via CDN in main.tsx).
 * Uses window.OneSignal directly if already initialized, falls back
 * to the deferred queue if not. This is required for the PWA (home screen
 * app) where the SDK may initialize before our code runs.
 *
 * App ID: ac575970-18c4-4f71-9ff9-aa323baef90f
 */

const ONESIGNAL_APP_ID = 'ac575970-18c4-4f71-9ff9-aa323baef90f';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: any) => void>;
    OneSignal?: any;
  }
}

/** Get the OneSignal instance — directly if ready, queued if not. */
function getOneSignal(): Promise<any> {
  return new Promise((resolve) => {
    // Check if SDK is already initialized and ready to use.
    // After init() completes, OneSignal.init is removed but Notifications exists.
    // We check for Notifications OR User (both present post-init) to detect readiness.
    if (
      window.OneSignal &&
      (window.OneSignal.Notifications || window.OneSignal.User)
    ) {
      resolve(window.OneSignal);
      return;
    }
    // Not ready yet — queue it. This runs when the SDK finishes init.
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push((os: any) => resolve(os));
  });
}

/** Wrap a OneSignal call with a hard timeout so it can never hang forever. */
async function withTimeout<T>(promise: Promise<T>, ms = 8000, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function initOneSignal() {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal: any) => {
    try {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        safari_web_id: 'web.onesignal.auto.4787ada6-f101-40da-894e-0a68fad84e0f',
        notifyButton: { enable: false },
        promptOptions: { autoPrompt: false },
      });
    } catch (err) {
      console.error('[OneSignal] init error:', err);
    }
  });
}

export async function requestPushPermission(): Promise<string | null> {
  try {
    const OneSignal = await withTimeout(getOneSignal(), 8000, null);
    if (!OneSignal) return null;

    await OneSignal.Notifications.requestPermission();
    const granted = OneSignal.Notifications.permission;
    if (!granted) return null;

    // Give the SDK a moment to register the subscription
    await new Promise(r => setTimeout(r, 1500));
    const playerId = OneSignal.User?.PushSubscription?.id ?? null;
    return playerId;
  } catch (err) {
    console.error('[OneSignal] requestPushPermission error:', err);
    return null;
  }
}

export async function optOutOfPush(): Promise<void> {
  try {
    const OneSignal = await withTimeout(getOneSignal(), 5000, null);
    if (!OneSignal) return;
    await withTimeout(
      OneSignal.User?.PushSubscription?.optOut() ?? Promise.resolve(),
      4000,
      undefined
    );
  } catch (err) {
    console.error('[OneSignal] optOutOfPush error:', err);
  }
}

export async function optInToPush(): Promise<string | null> {
  try {
    const OneSignal = await withTimeout(getOneSignal(), 8000, null);
    if (!OneSignal) return null;

    await withTimeout(
      OneSignal.User?.PushSubscription?.optIn() ?? Promise.resolve(),
      4000,
      undefined
    );
    await new Promise(r => setTimeout(r, 1000));
    return OneSignal.User?.PushSubscription?.id ?? null;
  } catch (err) {
    console.error('[OneSignal] optInToPush error:', err);
    return null;
  }
}

export async function getPlayerId(): Promise<string | null> {
  try {
    const OneSignal = await withTimeout(getOneSignal(), 5000, null);
    if (!OneSignal) return null;
    return OneSignal.User?.PushSubscription?.id ?? null;
  } catch {
    return null;
  }
}

export async function getPushPermissionState(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

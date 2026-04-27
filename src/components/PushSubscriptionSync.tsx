/**
 * PushSubscriptionSync — silent background component
 *
 * Mounts once when the user is authenticated, and runs the push subscription
 * auto-heal. Detects and fixes the iOS PWA failure mode where the OneSignal
 * subscription gets silently invalidated (after PWA reinstall, manifest change,
 * or iOS service worker eviction) and the user stops receiving notifications
 * without realizing it.
 *
 * Without this: real users who install the PWA, then later iOS rotates their
 * push token, would have to manually toggle notifications off/on in Account
 * to fix it. Most never would — they'd just stop receiving messages.
 *
 * This component:
 *   - Renders nothing
 *   - Only runs once per app session
 *   - Never shows a permission prompt
 *   - Only acts if browser permission is already granted
 *   - Waits a few seconds after mount to let OneSignal SDK fully initialize
 */
import { useEffect, useRef } from 'react';
import { syncPushSubscription } from '../utils/syncPushSubscription';

interface Props {
  accessToken: string | null;
}

export function PushSubscriptionSync({ accessToken }: Props) {
  const hasRun = useRef(false);

  useEffect(() => {
    if (!accessToken) return;
    if (hasRun.current) return;
    hasRun.current = true;

    // Wait 4 seconds after mount before running. OneSignal's SDK loads async
    // and we want to give it time to initialize and re-establish its
    // subscription state with Apple's push servers before we read it.
    const timer = setTimeout(() => {
      syncPushSubscription(accessToken).then((result) => {
        if (result.status === 'updated') {
          console.log('[push-sync] auto-healed subscription:', result.details);
        }
      }).catch((err) => {
        console.error('[push-sync] unexpected error:', err);
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [accessToken]);

  return null;
}

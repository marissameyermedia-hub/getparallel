/**
 * Push subscription auto-heal
 *
 * Called silently on every authenticated app load. Detects and fixes the
 * common iOS PWA failure mode where the OneSignal subscription gets silently
 * invalidated (after a PWA reinstall, after iOS evicts the service worker,
 * after a manifest change, etc) and the user stops receiving push notifications
 * without any visible signal.
 *
 * Without this: users have to manually toggle notifications off/on in Account
 * to fix it — and most won't realize anything's wrong until they miss matches.
 *
 * This function NEVER prompts the user. It only acts if push permission was
 * already granted. The flow:
 *   1. Read OneSignal's current player ID from the SDK
 *   2. Compare to what's stored in our DB
 *   3. If mismatch (or DB has ID but SDK has none) → silently re-register
 *      and PUT the new ID to /notifications/preferences
 *
 * If the user has notifications turned off in our app, this is a no-op.
 */
import { MISC_FUNCTION_URL } from './supabase/client';
import { publicAnonKey } from './supabase/info';
import { getPlayerId, requestPushPermission } from './onesignal';

interface SyncResult {
  status: 'no_permission' | 'no_change' | 'updated' | 'cleared' | 'error' | 'disabled';
  details?: string;
}

/**
 * Reconcile the OneSignal subscription with what's stored in our DB.
 * Safe to call on every app load — no-op if everything is already in sync.
 */
export async function syncPushSubscription(accessToken: string): Promise<SyncResult> {
  try {
    // Bail out early if the user has never granted notification permission.
    // We never want to show a prompt as a side effect of this background sync.
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return { status: 'no_permission' };
    }

    // Pull the user's current notification preferences from the server.
    // If they've turned push off in Account, leave everything alone.
    const prefsRes = await fetch(`${MISC_FUNCTION_URL}/notifications/preferences`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'apikey': publicAnonKey },
    });

    if (!prefsRes.ok) {
      return { status: 'error', details: `prefs fetch ${prefsRes.status}` };
    }

    const prefs = await prefsRes.json();
    const dbPlayerId: string | null = prefs?.onesignal_player_id ?? null;
    const pushEnabledInApp: boolean = prefs?.push_enabled === true;

    // If the user has turned push off, don't try to heal — that's their choice.
    if (!pushEnabledInApp) {
      return { status: 'disabled' };
    }

    // Read OneSignal's current view of the world.
    let sdkPlayerId = await getPlayerId();

    // CASE 1: SDK has no player ID, but browser permission IS granted.
    // This means the OneSignal subscription was invalidated. Re-register.
    if (!sdkPlayerId) {
      console.log('[push-sync] SDK has no player ID despite granted permission — re-registering');
      sdkPlayerId = await requestPushPermission();
    }

    // CASE 2: SDK has a player ID, and it matches what's in our DB. All good.
    if (sdkPlayerId && sdkPlayerId === dbPlayerId) {
      return { status: 'no_change' };
    }

    // CASE 3: SDK has a player ID that DOESN'T match the DB.
    // Could be: PWA was reinstalled, OneSignal rotated the ID, or we never saved it.
    // Update the DB.
    if (sdkPlayerId && sdkPlayerId !== dbPlayerId) {
      const updateRes = await fetch(`${MISC_FUNCTION_URL}/notifications/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({ onesignal_player_id: sdkPlayerId }),
      });

      if (!updateRes.ok) {
        return { status: 'error', details: `update failed ${updateRes.status}` };
      }

      console.log('[push-sync] Updated player ID:', sdkPlayerId.slice(0, 8) + '...');
      return { status: 'updated', details: sdkPlayerId };
    }

    // CASE 4: We tried to re-register but still got nothing back.
    // Clear the stale ID in the DB so we don't keep firing pushes into a black hole.
    if (!sdkPlayerId && dbPlayerId) {
      await fetch(`${MISC_FUNCTION_URL}/notifications/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': publicAnonKey,
        },
        body: JSON.stringify({ onesignal_player_id: null }),
      });

      console.warn('[push-sync] Could not recover subscription — cleared stale player ID');
      return { status: 'cleared' };
    }

    return { status: 'no_change' };
  } catch (err) {
    console.error('[push-sync] error:', err);
    return { status: 'error', details: String(err) };
  }
}

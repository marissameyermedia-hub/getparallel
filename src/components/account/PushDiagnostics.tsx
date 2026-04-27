import { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { supabase, MISC_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';

interface Props {
  onBack: () => void;
}

export function PushDiagnostics({ onBack }: Props) {
  const [results, setResults] = useState<Array<{ label: string; value: string; status: 'ok' | 'warn' | 'fail' }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    const out: Array<{ label: string; value: string; status: 'ok' | 'warn' | 'fail' }> = [];

    // 1. Standalone (PWA) detection
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    out.push({
      label: 'Running as PWA (home screen)',
      value: isStandalone ? 'Yes' : 'No — open from home screen icon',
      status: isStandalone ? 'ok' : 'fail',
    });

    // 2. iOS version
    const ua = navigator.userAgent;
    const iosMatch = ua.match(/OS (\d+)_(\d+)/);
    const iosVersion = iosMatch ? `${iosMatch[1]}.${iosMatch[2]}` : 'Unknown';
    out.push({
      label: 'iOS version',
      value: iosVersion,
      status: iosMatch && parseInt(iosMatch[1]) >= 16 ? 'ok' : 'fail',
    });

    // 3. Notification API available
    const hasNotificationApi = typeof Notification !== 'undefined';
    out.push({
      label: 'Notification API available',
      value: hasNotificationApi ? 'Yes' : 'No',
      status: hasNotificationApi ? 'ok' : 'fail',
    });

    // 4. Notification permission
    const permission = hasNotificationApi ? Notification.permission : 'unavailable';
    out.push({
      label: 'Browser notification permission',
      value: permission,
      status: permission === 'granted' ? 'ok' : permission === 'denied' ? 'fail' : 'warn',
    });

    // 5. Service worker registration
    let swStatus = 'No service worker support';
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        const oneSignalSW = regs.find(r => r.active?.scriptURL?.includes('OneSignal'));
        swStatus = oneSignalSW ? `Registered: ${oneSignalSW.active?.scriptURL.split('/').pop()}` : `${regs.length} SWs but no OneSignal`;
      } catch (e: any) {
        swStatus = `Error: ${e.message}`;
      }
    }
    out.push({
      label: 'OneSignal service worker',
      value: swStatus,
      status: swStatus.startsWith('Registered') ? 'ok' : 'fail',
    });

    // 6. window.OneSignal loaded
    const oneSignalReady = !!(window as any).OneSignal && !!((window as any).OneSignal.User || (window as any).OneSignal.Notifications);
    out.push({
      label: 'OneSignal SDK loaded',
      value: oneSignalReady ? 'Yes' : 'No',
      status: oneSignalReady ? 'ok' : 'fail',
    });

    // 7. OneSignal subscription ID
    let playerId = 'Not available';
    if (oneSignalReady) {
      try {
        const id = (window as any).OneSignal?.User?.PushSubscription?.id;
        playerId = id || 'null (not subscribed)';
      } catch (e: any) {
        playerId = `Error: ${e.message}`;
      }
    }
    out.push({
      label: 'OneSignal player ID (this device)',
      value: playerId,
      status: playerId && playerId.length > 20 ? 'ok' : 'fail',
    });

    // 8. Saved player ID in DB
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const res = await fetch(`${MISC_FUNCTION_URL}/notifications/preferences`, {
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': publicAnonKey },
        });
        const data = await res.json();
        out.push({
          label: 'push_enabled in database',
          value: String(data.push_enabled),
          status: data.push_enabled ? 'ok' : 'fail',
        });
      }
    } catch (e: any) {
      out.push({ label: 'DB check', value: `Error: ${e.message}`, status: 'fail' });
    }

    setResults(out);
    setLoading(false);
  };

  const forceRegister = async () => {
    setLoading(true);
    try {
      const OneSignal = (window as any).OneSignal;
      if (!OneSignal) {
        alert('OneSignal SDK not loaded');
        setLoading(false);
        return;
      }

      // Force permission prompt
      await OneSignal.Notifications.requestPermission();
      
      // Wait for subscription
      await new Promise(r => setTimeout(r, 2000));
      
      const id = OneSignal.User?.PushSubscription?.id;
      if (!id) {
        // Try opt-in
        try {
          await OneSignal.User?.PushSubscription?.optIn();
          await new Promise(r => setTimeout(r, 2000));
        } catch {}
      }
      
      const finalId = OneSignal.User?.PushSubscription?.id;
      if (finalId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(`${MISC_FUNCTION_URL}/notifications/preferences`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': publicAnonKey },
            body: JSON.stringify({ push_enabled: true, onesignal_player_id: finalId }),
          });
          alert(`✅ Registered! Player ID: ${finalId.slice(0, 16)}...`);
        }
      } else {
        alert('❌ Could not get player ID. Check permission was granted.');
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
    runDiagnostics();
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack}><ChevronLeft size={24} /></button>
        <h1 className="text-lg font-semibold">Push Diagnostics</h1>
      </div>
      <div className="p-4 space-y-4">
        {loading && <p className="text-gray-500">Running checks...</p>}
        {results.map((r, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <span className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${r.status === 'ok' ? 'bg-green-500' : r.status === 'warn' ? 'bg-yellow-500' : 'bg-red-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{r.label}</p>
                <p className="text-sm text-gray-600 break-all">{r.value}</p>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={forceRegister}
          className="w-full bg-black text-white rounded-full py-3 font-medium"
        >
          Force re-register push notifications
        </button>
        <button
          onClick={runDiagnostics}
          className="w-full bg-gray-100 text-black rounded-full py-3 font-medium"
        >
          Refresh diagnostics
        </button>
      </div>
    </div>
  );
}

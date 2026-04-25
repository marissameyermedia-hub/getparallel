import { Pause, Play, AlertCircle, ChevronLeft } from 'lucide-react';
import { useState, useEffect } from 'react';
import { EDGE_FUNCTION_URL, ONBOARDING_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';

interface PauseProfileViewProps {
  onBack: () => void;
  hasActivated?: boolean;
}

function getAuthHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'apikey': publicAnonKey,
  };
}

export function PauseProfileView({ onBack, hasActivated = false }: PauseProfileViewProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  const handleCancelSubscription = async () => {
    setCancelLoading(true);
    const token = localStorage.getItem('parallel_access_token');
    if (!token) return;
    try {
      const res = await fetch(`${EDGE_FUNCTION_URL}/payment/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
      });
      if (res.ok) {
        setCancelSuccess(true);
        setShowCancelConfirm(false);
      }
    } catch (err) {
      console.error('Cancel failed:', err);
    }
    setCancelLoading(false);
  };

  useEffect(() => {
    const token = localStorage.getItem('parallel_access_token');
    if (!token) return;
    fetch(`${ONBOARDING_FUNCTION_URL}/user/profile`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (typeof data?.isPaused === 'boolean') setIsPaused(data.isPaused); })
      .catch(err => console.error('Failed to fetch pause state:', err));
  }, []);

  // If the user arrived here via "Cancel Subscription" on the Account page,
  // AccountPage sets a sessionStorage flag. Open the cancel confirmation modal immediately.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('parallel_auto_open_cancel') === '1') {
        sessionStorage.removeItem('parallel_auto_open_cancel');
        if (hasActivated) {
          setShowCancelConfirm(true);
        }
      }
    } catch {
      // sessionStorage can throw in some privacy contexts — fail silently, no harm
    }
  }, [hasActivated]);

  const setPauseState = async (paused: boolean) => {
    const token = localStorage.getItem('parallel_access_token');
    if (token) {
      try {
        await fetch(`${ONBOARDING_FUNCTION_URL}/user/profile`, {
          method: 'PUT',
          headers: getAuthHeaders(token),
          body: JSON.stringify({ isPaused: paused }),
        });
      } catch (err) {
        console.error('Failed to update pause state:', err);
      }
    }
    setIsPaused(paused);
  };

  const handleTogglePause = () => {
    if (isPaused) { setPauseState(false); } else { setShowConfirmation(true); }
  };

  const confirmPause = () => {
    setPauseState(true);
    setShowConfirmation(false);
  };

  return (
    <div className="min-h-screen bg-white pt-6 pb-24 px-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="mb-6 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Go back">
          <ChevronLeft size={28} />
        </button>
        <h1 className="mb-3">Pause My Profile</h1>
        <p className="text-gray-600 mb-8">Take a break without losing your matches or data</p>
        <div className={`rounded-2xl p-6 mb-6 ${isPaused ? 'bg-gray-100' : 'bg-black text-white'}`}>
          <div className="flex items-center gap-3 mb-3">
            {isPaused ? <Pause className="w-6 h-6 text-gray-600" /> : <Play className="w-6 h-6 text-white" />}
            <h2 className={isPaused ? 'text-black' : 'text-white'}>{isPaused ? 'Profile is Paused' : 'Profile is Active'}</h2>
          </div>
          <p className={isPaused ? 'text-gray-700' : 'text-gray-300'}>
            {isPaused ? "Your profile is hidden. Messaging is disabled until you unpause." : 'Your profile is visible and you can receive new matches.'}
          </p>
        </div>
        <div className="mb-6">
          <h3 className="mb-4">What happens when you pause?</h3>
          <div className="space-y-3">
            {[
              { title: 'Your profile is hidden', sub: "You won't appear in anyone's match queue" },
              { title: 'No new matches', sub: "You won't receive any new match suggestions" },
              { title: 'Messaging is disabled', sub: 'Active conversations are frozen — they resume the moment you unpause' },
              { title: 'Your data is safe', sub: 'Match history and questionnaire answers are saved and waiting for you' },
            ].map(({ title, sub }) => (
              <div key={title} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                <AlertCircle className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-700">
                  <div className="font-medium mb-1">{title}</div>
                  <div className="text-gray-600">{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button onClick={handleTogglePause} className="w-full py-4 px-6 rounded-full bg-black text-white hover:bg-gray-800 transition-colors">
          {isPaused ? 'Resume My Profile' : 'Pause My Profile'}
        </button>

        {hasActivated && !cancelSuccess && (
          <div className="mt-12 pt-8 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Danger Zone</h3>
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">
              Cancelling ends your subscription at the current billing period. You'll lose access to matches and messaging.
            </p>
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="w-full py-4 px-6 rounded-full border-2 border-red-200 text-red-600 hover:border-red-500 transition-colors text-sm"
            >
              Cancel Subscription
            </button>
          </div>
        )}

        {cancelSuccess && (
          <div className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">Subscription cancelling at period end.</p>
          </div>
        )}

        {showConfirmation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full">
              <h3 className="mb-3">Pause your profile?</h3>
              <p className="text-gray-700 mb-3">While paused:</p>
              <ul className="text-sm text-gray-600 space-y-2 mb-6">
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">•</span>You won't appear in new or existing match queues</li>
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">•</span>Messaging is disabled</li>
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">•</span>Your matches and data are saved</li>
                <li className="flex items-start gap-2"><span className="text-gray-400 mt-0.5">•</span>Unpause anytime to reactivate instantly</li>
              </ul>
              <div className="flex gap-3">
                <button onClick={() => setShowConfirmation(false)} className="flex-1 py-3 px-6 rounded-full border-2 border-gray-200 hover:border-black transition-colors">Cancel</button>
                <button onClick={confirmPause} className="flex-1 py-3 px-6 rounded-full bg-black text-white hover:bg-gray-800 transition-colors">Pause Profile</button>
              </div>
            </div>
          </div>
        )}
        {showCancelConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full">
              <h3 className="mb-3">Cancel Subscription?</h3>
              <p className="text-gray-700 mb-6">Your access continues until the end of your current billing period. Your matches and questionnaire data are saved — you can resubscribe anytime.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowCancelConfirm(false)} className="flex-1 py-3 px-6 rounded-full border-2 border-gray-200 hover:border-black transition-colors">Keep subscription</button>
                <button onClick={handleCancelSubscription} className="flex-1 py-3 px-6 rounded-full bg-black text-white hover:bg-gray-800 transition-colors">
                  {cancelLoading ? 'Canceling...' : 'Cancel Subscription'}
                </button>
              </div>
              {cancelSuccess && (
                <div className="mt-4 text-green-500 font-medium">Subscription canceled successfully!</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
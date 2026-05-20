import { ChevronLeft, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { MISC_FUNCTION_URL } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { getAccessToken } from '../../utils/auth';

interface CancelSubscriptionViewProps {
  onBack: () => void;
}

export function CancelSubscriptionView({ onBack }: CancelSubscriptionViewProps) {
  const [step, setStep] = useState<'confirm' | 'loading' | 'done' | 'error'>('confirm');
  const [errorMsg, setErrorMsg] = useState('');

  const handleCancel = async () => {
    setStep('loading');
    try {
      const token = await getAccessToken();
      if (!token) { setStep('error'); setErrorMsg('Session expired — please sign in again.'); return; }
      const res = await fetch(`${MISC_FUNCTION_URL}/payment/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
      });
      if (res.ok) {
        setStep('done');
      } else {
        const data = await res.json().catch(() => ({}));
        setStep('error');
        setErrorMsg(data?.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setStep('error');
      setErrorMsg('Network error. Please check your connection and try again.');
    }
  };

  if (step === 'done') {
    return (
      <div className="min-h-full bg-parallel-cream px-6 pt-6 pb-24">
        <div className="max-w-2xl mx-auto">
          <button onClick={onBack} className="mb-6 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Go back">
            <ChevronLeft size={28} aria-hidden="true" />
          </button>
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-gray-500" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold mb-3">Subscription cancelled</h1>
            <p className="text-gray-600 mb-2">You'll keep access through the end of your current billing period.</p>
            <p className="text-gray-600 mb-8">A confirmation email is on its way. Your matches and questionnaire data are saved — you can resubscribe anytime.</p>
            <button
              onClick={onBack}
              className="px-8 py-3 rounded-full bg-parallel-void text-parallel-cream font-medium hover:bg-parallel-void/90 transition-colors"
            >
              Back to account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-parallel-cream px-6 pt-6 pb-24">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="mb-6 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Go back">
          <ChevronLeft size={28} aria-hidden="true" />
        </button>

        <h1 className="mb-2">Cancel Subscription</h1>
        <p className="text-gray-600 mb-8">Before you go, here's what cancelling means for your account.</p>

        <div className="space-y-3 mb-10">
          {[
            { title: 'Access until end of billing period', sub: "You won't be charged again, but you keep access until your current period ends." },
            { title: 'No new matches', sub: 'Match suggestions stop immediately after cancellation.' },
            { title: 'Your data is saved', sub: 'Questionnaire answers and match history are preserved. Resubscribe anytime to pick up where you left off.' },
            { title: 'Active conversations are frozen', sub: 'Messaging is disabled, but your conversations are saved.' },
          ].map(({ title, sub }) => (
            <div key={title} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
              <AlertCircle className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-sm">
                <div className="font-medium text-gray-900 mb-1">{title}</div>
                <div className="text-gray-600">{sub}</div>
              </div>
            </div>
          ))}
        </div>

        {step === 'error' && (
          <p className="text-red-600 text-sm mb-4 text-center" role="alert">{errorMsg}</p>
        )}

        <button
          onClick={handleCancel}
          disabled={step === 'loading'}
          className="w-full py-4 px-6 rounded-full border-2 border-red-200 text-red-600 hover:border-red-500 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {step === 'loading' ? 'Cancelling…' : 'Confirm Cancellation'}
        </button>
        <button
          onClick={onBack}
          className="w-full mt-3 py-4 px-6 rounded-full bg-parallel-void text-parallel-cream font-medium hover:bg-parallel-void/90 transition-colors"
        >
          Keep my subscription
        </button>
      </div>
    </div>
  );
}

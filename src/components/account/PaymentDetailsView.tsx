import { CreditCard, CheckCircle, Lock, ChevronLeft } from 'lucide-react';

interface PaymentDetailsViewProps {
  onBack: () => void;
  hasActivated?: boolean;
  onGoToPayment?: () => void;
  plan?: 'annual' | 'monthly' | 'free';
}

export function PaymentDetailsView({ onBack, hasActivated = true, onGoToPayment, plan = 'annual' }: PaymentDetailsViewProps) {
  // Derive display values from plan prop — no hardcoding
  const planLabel = plan === 'annual' ? 'Parallel — Annual' : plan === 'monthly' ? 'Parallel — Monthly' : 'Parallel';
  const planPrice = plan === 'annual' ? '$79.00' : plan === 'monthly' ? '$24.99' : '—';

  return (
    <div className="min-h-screen bg-white pt-6 pb-24 px-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="mb-6 p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft size={28} aria-hidden="true" />
        </button>

        <h1 className="mb-6">Payment Details</h1>

        {hasActivated ? (
          <>
            {/* Active Membership Status */}
            <div className="bg-black text-white rounded-3xl p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="w-6 h-6 text-white" />
                <h2 className="text-white">Parallel — active</h2>
              </div>
              <p className="text-gray-300">
                Your plan is active. Manage billing and renewals from this page.
              </p>
            </div>

            {/* Payment History */}
            <div className="bg-gray-50 rounded-2xl p-6">
              <h3 className="mb-4">Payment History</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-white rounded-xl">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-gray-600" />
                    <div>
                      <div className="font-medium">{planLabel}</div>
                      <div className="text-sm text-gray-600">Payment confirmed</div>
                    </div>
                  </div>
                  <div className="font-medium">{planPrice}</div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Locked State - No Payment Yet */}
            <div className="bg-gray-50 rounded-3xl p-8 mb-6 text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-gray-600" />
              </div>
              <h2 className="mb-2">No Active Membership</h2>
              <p className="text-gray-600 mb-6">
                Start matching — plans from $6.58/month
              </p>
              <button
                onClick={onGoToPayment}
                className="w-full py-4 px-6 bg-black text-white rounded-full hover:bg-gray-800 transition-colors font-medium"
              >
                See plans
              </button>
            </div>

            {/* Benefits Preview */}
            <div className="bg-gray-50 rounded-2xl p-6">
              <h3 className="mb-4">What You'll Get</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-medium">Unlock all your matches</div>
                    <div className="text-sm text-gray-600">View full profiles and compatibility breakdowns</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-medium">Annual or monthly plans</div>
                    <div className="text-sm text-gray-600">Cancel anytime</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-medium">Message your matches</div>
                    <div className="text-sm text-gray-600">Connect with compatible people</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
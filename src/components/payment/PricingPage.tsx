import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Check, Lock, Loader, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { publicAnonKey } from '../../utils/supabase/info';
import { MISC_FUNCTION_URL } from '../../utils/supabase/client';
import { PromoCodeInput } from "./PromoCodeInput";
import { getAccessToken } from '../../utils/auth';

interface PricingPageProps {
  onBack: () => void;
  onCheckout: (plan: 'annual') => void;
  onSkip?: () => void;
  userEmail?: string;
  plan?: string;
  onNavigate?: (view: string) => void;
}

interface PayPalConfig {
  clientId: string;
  env: 'sandbox' | 'live';
  plans: {
    annualFounding: { planId: string; price: string; currency: string; interval: string; label: string; trialDays?: number };
  };
  annualPlanId?: string;
}

function getTrialEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getFirstChargeDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getNextRenewalDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  d.setFullYear(d.getFullYear() + 1);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Load the PayPal JS SDK once per page session.
function loadPayPalSdk(clientId: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as any;
  if (w.paypal) return Promise.resolve(w.paypal);
  if (w.__paypal_sdk_promise__) return w.__paypal_sdk_promise__;

  w.__paypal_sdk_promise__ = new Promise((resolve, reject) => {
    const existing = document.getElementById('paypal-sdk') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).paypal));
      existing.addEventListener('error', () => reject(new Error('PayPal SDK failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.id = 'paypal-sdk';
    s.src =
      `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}` +
      `&components=buttons&intent=subscription&vault=true&currency=USD`;
    s.async = true;
    s.onload = () => resolve((window as any).paypal);
    s.onerror = () => reject(new Error('PayPal SDK failed to load'));
    document.head.appendChild(s);
  });

  return w.__paypal_sdk_promise__;
}

export function PricingPage({ onBack, onCheckout, onSkip, plan = 'free', onNavigate }: PricingPageProps) {
  const [config, setConfig] = useState<PayPalConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const buttonContainerRef = useRef<HTMLDivElement | null>(null);
  const buttonsInstanceRef = useRef<any>(null);

  const trialEndDate = getTrialEndDate();
  const firstChargeDate = getFirstChargeDate();
  const nextRenewalDate = getNextRenewalDate();

  // Load PayPal config once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${MISC_FUNCTION_URL}/paypal/config`, {
          headers: { 'apikey': publicAnonKey },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load payment options.');
        if (!data.clientId) throw new Error('Payment is temporarily unavailable. Please try again in a moment.');
        if (!cancelled) {
          setConfig(data);
          setLoadingConfig(false);
        }
      } catch (e: any) {
        console.error('[Subscribe] config load failed:', e);
        if (!cancelled) {
          setError(e.message || 'Could not load payment options.');
          setLoadingConfig(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Render PayPal buttons
  useEffect(() => {
    if (!config) return;

    let cancelled = false;

    (async () => {
      try {
        const paypal = await loadPayPalSdk(config.clientId);
        if (cancelled || !buttonContainerRef.current) return;

        const planId = config.plans.annualFounding?.planId || config.annualPlanId || 'P-7PT724153F712010ANIFAOHA';

        if (!planId) {
          setError('This plan is not available right now. Please contact support.');
          return;
        }

        if (buttonsInstanceRef.current) {
          try { buttonsInstanceRef.current.close(); } catch {}
          buttonsInstanceRef.current = null;
        }
        buttonContainerRef.current.innerHTML = '';

        const buttons = paypal.Buttons({
          style: {
            shape: 'pill',
            color: 'black',
            layout: 'vertical',
            label: 'subscribe',
          },
          createSubscription: (_data: any, actions: any) => {
            return actions.subscription.create({ plan_id: planId });
          },
          onApprove: async (data: any) => {
            setProcessing(true);
            setError('');
            try {
              const token = await getAccessToken();
              if (!token) {
                setError('Please sign in to continue.');
                setProcessing(false);
                return;
              }
              const res = await fetch(`${MISC_FUNCTION_URL}/paypal/record-subscription`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'apikey': publicAnonKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  subscriptionId: data.subscriptionID,
                  plan: 'annual_founding',
                }),
              });
              const body = await res.json();
              if (!res.ok) {
                throw new Error(body.error || 'Could not confirm your subscription. Please contact support.');
              }
              onCheckout('annual');
            } catch (e: any) {
              console.error('[Subscribe] onApprove error:', e);
              setError(e.message || 'Something went wrong confirming your subscription.');
              setProcessing(false);
            }
          },
          onCancel: () => {
            setProcessing(false);
          },
          onError: (err: any) => {
            console.error('[Subscribe] PayPal button error:', err);
            setError('Payment could not be completed. Please try again.');
            setProcessing(false);
          },
        });

        buttonsInstanceRef.current = buttons;
        if (buttons.isEligible()) {
          await buttons.render(buttonContainerRef.current);
        } else {
          setError('PayPal is not available. Please try another device or contact support.');
        }
      } catch (e: any) {
        console.error('[Subscribe] render buttons failed:', e);
        setError(e.message || 'Could not load payment options.');
      }
    })();

    return () => {
      cancelled = true;
      if (buttonsInstanceRef.current) {
        try { buttonsInstanceRef.current.close(); } catch {}
        buttonsInstanceRef.current = null;
      }
    };
  }, [config, onCheckout]);

  return (
    <div className="min-h-screen bg-parallel-cream">
      <div className="sticky top-0 bg-parallel-cream border-b border-gray-100 z-10 px-6 py-3">
        <button
          onClick={onBack}
          className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="max-w-md mx-auto px-6 py-6 pb-16">

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-5"
        >
          <h1 className="text-3xl leading-tight mb-2">
            Find your person.<br />Then leave.
          </h1>
          <p className="text-sm text-gray-600">
            Professional matchmaking. Minus the price tag.
          </p>
        </motion.div>

        {/* What's included */}
        <div className="bg-gray-100 border border-gray-200 rounded-2xl p-4 mb-5">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">What's included</p>
          <ul className="grid grid-cols-1 gap-1.5">
            {[
              'Unlock all your matches',
              'View their full profiles',
              'See your compatibility breakdown',
              'Start messaging',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check size={14} className="text-parallel-void mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-800">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Plan card — annual with free trial */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="mb-5"
        >
          <div className="rounded-2xl border-2 border-parallel-purple bg-parallel-purple text-parallel-cream p-5">
            {/* Free trial badge */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold bg-white/20 text-white px-3 py-1 rounded-full">
                5-day free trial
              </span>
              {PRE_LAUNCH && (
                <span className="text-xs font-medium bg-white/15 text-parallel-cream px-2 py-0.5 rounded-full">
                  ⭐ Founding Rate
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between mb-1">
              <p className="text-xl font-bold">$0.00 today</p>
              <p className="text-sm text-white/70">then $79 / year</p>
            </div>
            <p className="text-xs text-white/60 mb-3">
              Try free for 5 days — cancel anytime before {trialEndDate} and you won't be charged.
            </p>

            <div className="border-t border-white/20 pt-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-white/80">
                <Check size={12} className="flex-shrink-0" />
                First charge of $79.00 on {firstChargeDate}
              </div>
              <div className="flex items-center gap-2 text-xs text-white/80">
                <Check size={12} className="flex-shrink-0" />
                Renews annually — cancel anytime
              </div>
              <div className="flex items-center gap-2 text-xs text-white/80">
                <Check size={12} className="flex-shrink-0" />
                $6.58 / month — billed once a year
              </div>
            </div>
          </div>
        </motion.div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* PayPal buttons */}
        {loadingConfig ? (
          <div className="flex items-center justify-center py-6 text-gray-500 gap-2">
            <Loader size={18} className="animate-spin" />
            Loading payment options…
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="relative mb-3"
          >
            {processing && (
              <div className="absolute inset-0 z-10 bg-parallel-cream/90 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                <div className="flex items-center gap-2 text-gray-700">
                  <Loader size={18} className="animate-spin" />
                  Confirming your subscription…
                </div>
              </div>
            )}
            <div ref={buttonContainerRef} id="paypal-button-container" />
            <PromoCodeInput />
          </motion.div>
        )}

        {/* ROSCA disclosure */}
        {!loadingConfig && (
          <p className="text-[11px] text-gray-500 text-center leading-relaxed mb-4">
            Free trial ends <span className="text-gray-700 font-medium">{trialEndDate}</span>. After that,{' '}
            <span className="text-gray-700 font-medium">$79.00 USD</span> will be charged on{' '}
            <span className="text-gray-700 font-medium">{firstChargeDate}</span> and every year after until you cancel.
          </p>
        )}

        {/* Expandable details */}
        {!loadingConfig && (
          <div className="border-t border-gray-100 pt-3 mb-4">
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              className="w-full flex items-center justify-between text-sm text-gray-600 hover:text-parallel-void transition-colors"
            >
              <span>Auto-renewal details &amp; cancellation</span>
              {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <AnimatePresence initial={false}>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 space-y-2 text-sm text-gray-600 leading-relaxed">
                    <p>
                      Your 5-day free trial begins immediately. If you don't cancel before{' '}
                      <strong>{trialEndDate}</strong>, you'll be charged{' '}
                      <strong>$79.00 USD</strong> on {firstChargeDate}.
                      Your subscription then auto-renews annually on{' '}
                      <strong>{nextRenewalDate}</strong> and each year after.
                    </p>
                    <p>
                      Cancel anytime in{' '}
                      <span className="font-medium text-gray-900">Account Settings → Cancel Subscription</span>.
                      Cancelling takes effect at the end of your current billing period.
                    </p>
                    {PRE_LAUNCH && (
                      <p>
                        After launch, annual renews at <strong>$149/year</strong>.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Founding footnote */}
        {PRE_LAUNCH && !loadingConfig && (
          <p className="text-center text-[11px] text-gray-500 leading-relaxed mb-5">
            Founding pricing is available for a limited time. After launch, annual renews at $149/year.
          </p>
        )}

        {/* Legal + security */}
        {!loadingConfig && (
          <div className="border-t border-gray-100 pt-4">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-gray-500 mb-3">
              {onNavigate ? (
                <>
                  <button type="button" onClick={() => onNavigate('terms-service')} className="underline hover:text-parallel-void transition-colors">Terms of Service</button>
                  <span className="text-gray-300">·</span>
                  <button type="button" onClick={() => onNavigate('privacy-policy')} className="underline hover:text-parallel-void transition-colors">Privacy Policy</button>
                  <span className="text-gray-300">·</span>
                  <button type="button" onClick={() => onNavigate('refund-policy')} className="underline hover:text-parallel-void transition-colors">Refund Policy</button>
                </>
              ) : (
                <>
                  <span>Terms of Service</span>
                  <span className="text-gray-300">·</span>
                  <span>Privacy Policy</span>
                  <span className="text-gray-300">·</span>
                  <span>Refund Policy</span>
                </>
              )}
            </div>

            <p className="text-center text-[11px] text-gray-500 leading-relaxed mb-3">
              Subscriptions are non-refundable once the trial period ends. By continuing, you agree to the Terms, Privacy Policy, and Refund Policy.
            </p>

            <p className="text-center text-[11px] text-gray-500 leading-relaxed mb-3">
              PARALLEL VIP LLC · Spokane, WA · USD pricing<br />
              Questions?{' '}
              <a href="mailto:legal@getparallel.vip" className="underline hover:text-gray-700 transition-colors">
                legal@getparallel.vip
              </a>
            </p>

            <div className="flex items-start justify-center gap-1.5 text-[11px] text-gray-500 leading-relaxed">
              <Lock size={11} className="flex-shrink-0 mt-0.5" />
              <span className="text-center">
                We never see or store your card details. Payments are processed securely by PayPal.
              </span>
            </div>
          </div>
        )}

        {/* Skip for now */}
        {onSkip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="text-center mt-6"
          >
            <button
              onClick={onSkip}
              className="text-xs text-gray-500 hover:text-gray-600 transition-colors underline underline-offset-2"
            >
              Skip for now
            </button>
          </motion.div>
        )}

        {/* Sandbox banner */}
        {config?.env === 'sandbox' && (
          <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-2.5 text-xs text-yellow-800 text-center">
            Test mode — no real charges. Use a PayPal sandbox account.
          </div>
        )}
      </div>
    </div>
  );
}

// PRE_LAUNCH flag — same pattern as MatchesView
const PRE_LAUNCH = import.meta.env.VITE_PRE_LAUNCH === 'true';

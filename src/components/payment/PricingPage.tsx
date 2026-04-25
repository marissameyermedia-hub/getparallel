import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Check, Lock, Loader, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { publicAnonKey } from '../../utils/supabase/info';
import { EDGE_FUNCTION_URL } from '../../utils/supabase/client';
import { PromoCodeInput } from "./PromoCodeInput";

// ── PRE_LAUNCH flag — controlled by VITE_PRE_LAUNCH env var ───
const PRE_LAUNCH = import.meta.env.VITE_PRE_LAUNCH === 'true';

interface PricingPageProps {
  onBack: () => void;
  onCheckout: (plan: 'annual' | 'monthly') => void; // called after successful subscription
  onSkip?: () => void;
  userEmail?: string;
  plan?: string; // current user plan: 'free' | 'monthly' | 'annual'
  onNavigate?: (view: string) => void; // for linking to Refund Policy / Terms / Privacy
}

// PayPal config fetched from the edge function. Client ID and plan IDs live
// in Supabase secrets so we can flip sandbox ↔ live without redeploying.
interface PayPalConfig {
  clientId: string;
  env: 'sandbox' | 'live';
  plans: {
    monthly: { planId: string; price: string; currency: string; interval: string; label: string };
    annualFounding: { planId: string; price: string; currency: string; interval: string; label: string };
  };
}

// First renewal date for display in the ROSCA disclosure.
function getRenewalDateString(billing: 'annual' | 'monthly'): string {
  const d = new Date();
  if (billing === 'annual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
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

export function PricingPage({ onBack, onCheckout, onSkip, userEmail = '', plan = 'free', onNavigate }: PricingPageProps) {
  const [billing, setBilling] = useState<'annual' | 'monthly'>('annual');
  const [config, setConfig] = useState<PayPalConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const buttonContainerRef = useRef<HTMLDivElement | null>(null);
  const buttonsInstanceRef = useRef<any>(null);

  const isMonthlyUser = plan === 'monthly';
  const planPriceFull = billing === 'annual' ? '$79' : '$24.99';
  const planCadence = billing === 'annual' ? 'year' : 'month';
  const renewalDate = getRenewalDateString(billing);

  // Load PayPal config once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${EDGE_FUNCTION_URL}/paypal/config`, {
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

  // Render PayPal buttons — re-renders when `billing` toggles so the plan_id
  // sent to PayPal always matches the user's current selection.
  useEffect(() => {
    if (!config) return;

    let cancelled = false;

    (async () => {
      try {
        const paypal = await loadPayPalSdk(config.clientId);
        if (cancelled || !buttonContainerRef.current) return;

        const planId = billing === 'annual'
          ? config.plans.annualFounding.planId
          : config.plans.monthly.planId;

        if (!planId) {
          setError('This plan is not available right now. Please try the other option or contact support.');
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
              const token = localStorage.getItem('parallel_access_token');
              if (!token) {
                setError('Please sign in to continue.');
                setProcessing(false);
                return;
              }
              const res = await fetch(`${EDGE_FUNCTION_URL}/paypal/record-subscription`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'apikey': publicAnonKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  subscriptionId: data.subscriptionID,
                  plan: billing === 'annual' ? 'annual_founding' : 'monthly',
                }),
              });
              const body = await res.json();
              if (!res.ok) {
                throw new Error(body.error || 'Could not confirm your subscription. Please contact support.');
              }
              onCheckout(billing);
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
  }, [config, billing, onCheckout]);

  // Click handler for the radio-card rows. Visible click target is the whole card.
  const selectAnnual = () => setBilling('annual');
  const selectMonthly = () => setBilling('monthly');

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 bg-white border-b border-gray-100 z-10 px-6 py-3">
        <button
          onClick={onBack}
          className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft size={20} />
        </button>
      </div>

      <div className="max-w-md mx-auto px-6 py-6 pb-16">

        {/* Monthly-to-annual conversion banner — pre-launch, monthly subscribers only */}
        {PRE_LAUNCH && isMonthlyUser && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 bg-black text-white rounded-2xl p-4"
          >
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Founding pricing ends at launch</p>
            <p className="text-sm leading-relaxed">
              You're on monthly. Select annual below to lock in founding pricing before it's gone.
            </p>
          </motion.div>
        )}

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

        {/* What's included — darker box, positioned first to sell value before price */}
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
                <Check size={14} className="text-black mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-800">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Cart-style plan selector — two radio cards */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="space-y-3 mb-5"
          role="radiogroup"
          aria-label="Choose your plan"
        >
          {/* Annual card */}
          <button
            type="button"
            role="radio"
            aria-checked={billing === 'annual'}
            onClick={selectAnnual}
            className={`w-full text-left rounded-2xl p-4 border-2 transition-all ${
              billing === 'annual'
                ? 'border-black bg-black text-white'
                : 'border-gray-200 bg-white text-black hover:border-gray-400'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Radio indicator */}
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-1 flex items-center justify-center ${
                billing === 'annual' ? 'border-white bg-white' : 'border-gray-300 bg-white'
              }`}>
                {billing === 'annual' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-black" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">Annual</p>
                  <div className="text-right">
                    <p className="font-semibold">$6.58<span className={`text-xs font-normal ml-1 ${billing === 'annual' ? 'text-gray-400' : 'text-gray-500'}`}>/ mo</span></p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {PRE_LAUNCH && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      billing === 'annual' ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-700'
                    }`}>
                      ⭐ Founding Rate
                    </span>
                  )}
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    billing === 'annual' ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-700'
                  }`}>
                    Save 73%
                  </span>
                </div>
                <p className={`text-xs mt-2 ${billing === 'annual' ? 'text-gray-300' : 'text-gray-500'}`}>
                  Billed as $79 USD once a year
                </p>
              </div>
            </div>
          </button>

          {/* Monthly card */}
          <button
            type="button"
            role="radio"
            aria-checked={billing === 'monthly'}
            onClick={selectMonthly}
            className={`w-full text-left rounded-2xl p-4 border-2 transition-all ${
              billing === 'monthly'
                ? 'border-black bg-black text-white'
                : 'border-gray-200 bg-white text-black hover:border-gray-400'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-1 flex items-center justify-center ${
                billing === 'monthly' ? 'border-white bg-white' : 'border-gray-300 bg-white'
              }`}>
                {billing === 'monthly' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-black" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">Monthly</p>
                  <p className="font-semibold">$24.99<span className={`text-xs font-normal ml-1 ${billing === 'monthly' ? 'text-gray-400' : 'text-gray-500'}`}>/ mo</span></p>
                </div>
                <p className={`text-xs mt-2 ${billing === 'monthly' ? 'text-gray-300' : 'text-gray-500'}`}>
                  Billed monthly — cancel anytime. We hope you do.
                </p>
              </div>
            </div>
          </button>
        </motion.div>

        {/* Sandbox banner moved to bottom of page — see below for placement */}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* PayPal buttons — prominent, immediate action */}
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
              <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-sm flex items-center justify-center rounded-2xl">
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


        {/* ROSCA auto-renewal disclosure — always visible, compact */}
        {!loadingConfig && (
          <p className="text-[11px] text-gray-500 text-center leading-relaxed mb-4">
            Your payment method will be charged{' '}
            <span className="text-gray-700 font-medium">{planPriceFull} USD</span> on{' '}
            <span className="text-gray-700 font-medium">{renewalDate}</span> and every {planCadence} after until you cancel.
          </p>
        )}

        {/* Expandable details */}
        {!loadingConfig && (
          <div className="border-t border-gray-100 pt-3 mb-4">
            <button
              type="button"
              onClick={() => setShowDetails(v => !v)}
              className="w-full flex items-center justify-between text-sm text-gray-600 hover:text-black transition-colors"
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
                      Your subscription auto-renews at <strong>{planPriceFull} USD per {planCadence}</strong> until you cancel.
                      Cancel anytime in <span className="font-medium text-gray-900">Account Settings → Cancel Subscription</span>.
                      Cancelling takes effect at the end of your current billing period.
                    </p>
                    {billing === 'annual' && PRE_LAUNCH && (
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

        {/* Founding footnote — pre-launch only */}
        {PRE_LAUNCH && !loadingConfig && (
          <p className="text-center text-[11px] text-gray-500 leading-relaxed mb-5">
            Founding pricing is annual-only, available for a limited time. After launch, annual renews at $149/year.
          </p>
        )}

        {/* Legal + security block — clean, structured, clickable links */}
        {!loadingConfig && (
          <div className="border-t border-gray-100 pt-4">
            {/* Row 1: Legal links */}
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-gray-500 mb-3">
              {onNavigate ? (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('terms-service')}
                    className="underline hover:text-black transition-colors"
                  >
                    Terms of Service
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('privacy-policy')}
                    className="underline hover:text-black transition-colors"
                  >
                    Privacy Policy
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('refund-policy')}
                    className="underline hover:text-black transition-colors"
                  >
                    Refund Policy
                  </button>
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

            {/* Row 2: Refund & agreement note */}
            <p className="text-center text-[11px] text-gray-500 leading-relaxed mb-3">
              Subscriptions are non-refundable once active. By continuing, you agree to the Terms, Privacy Policy, and Refund Policy.
            </p>

            {/* Row 3: Business entity + support */}
            <p className="text-center text-[11px] text-gray-400 leading-relaxed mb-3">
              PARALLEL VIP LLC · Spokane, WA · USD pricing<br />
              Questions?{' '}
              <a href="mailto:legal@getparallel.vip" className="underline hover:text-gray-700 transition-colors">
                legal@getparallel.vip
              </a>
            </p>

            {/* Row 4: Security reassurance */}
            <div className="flex items-start justify-center gap-1.5 text-[11px] text-gray-400 leading-relaxed">
              <Lock size={11} className="flex-shrink-0 mt-0.5" />
              <span className="text-center">
                We never see or store your card details. Payments are processed securely by PayPal.
              </span>
            </div>
          </div>
        )}

        {/* Skip for now — beta/review access */}
        {onSkip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="text-center mt-6"
          >
            <button
              onClick={onSkip}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
            >
              Skip for now
            </button>
          </motion.div>
        )}

        {/* Sandbox banner — moved to very bottom so it doesn't mess up the design while testing */}
        {config?.env === 'sandbox' && (
          <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-xl p-2.5 text-xs text-yellow-800 text-center">
            Test mode — no real charges. Use a PayPal sandbox account.
          </div>
        )}
      </div>
    </div>
  );
}
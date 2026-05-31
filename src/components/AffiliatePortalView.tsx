import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Copy, Check, Share2, Users, Star, Mic, Anchor,
  Clock, CheckCircle2, AlertCircle, ShieldCheck, Link2, Tag,
  ChevronDown, ChevronUp, History, CreditCard,
  Sparkles, FileText, Image, Lightbulb, ExternalLink,
} from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

const PERSONA_TEMPLATE_ID = 'itmpl_w7GgvrzeQ8P6sopBcayQBcBP39gG';
const PERSONA_ENV = 'production';
const AFFILIATE_FN_URL = `https://${projectId}.supabase.co/functions/v1/affiliate`;

// ── Types ─────────────────────────────────────────────────────────────────────

type AffiliateTier = 'seeds' | 'voices' | 'anchors';
type AppAuditStatus = 'pending' | 'in_review' | 'approved' | 'rejected';
type DashboardTab = 'promote' | 'payouts';
type PortalState = 'loading' | 'apply' | 'submitted' | 'dashboard';

interface AffiliateApplication {
  id: string;
  tier_applied_for: AffiliateTier;
  audit_status: AppAuditStatus;
  persona_status: string;
  created_at: string;
}

interface ProgramInfo {
  payout_cadence: string;
  minimum_payout_usd: number;
  clawback_window_days: number;
  attribution_window_days: number;
  payout_method: string;
  tax_note: string;
}

interface AffiliateProfile {
  id: string;
  display_name: string;
  email: string | null;
  tier: AffiliateTier;
  status: string;
  promo_code: string | null;
  affiliate_link: string | null;
  commission_rate: number;
  commission_rate_pct: number;
  subscription_discount_pct: number;
  total_conversions: number;
  total_paid_lifetime: number;
  legal_name: string | null;
  tax_address: string | null;
  tax_country: string;
  tax_info_collected: boolean;
  bank_account_connected: boolean;
  program: ProgramInfo;
}

interface EarningAttribution {
  id: string;
  commission_amount: number;
  commission_status: string;
  clawback_deadline: string | null;
  days_until_eligible: number | null;
  subscribed_at: string | null;
  signed_up_at: string | null;
  promo_code_used: string | null;
}

interface EarningsData {
  by_year: Record<string, {
    total_earned: number;
    total_paid: number;
    attributions: EarningAttribution[];
  }>;
  lifetime: {
    total_earned: number;
    total_paid: number;
    pending_count: number;
    in_window_count: number;
    eligible_count: number;
    released_count: number;
  };
}

interface PayoutRecord {
  id: string;
  period_start: string;
  period_end: string;
  gross_amount: number;
  net_amount: number;
  mercury_status: string;
  paid_at: string | null;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIERS: Array<{
  id: AffiliateTier;
  label: string;
  icon: typeof Star;
  commission: string;
  description: string;
  requirement: string;
}> = [
  {
    id: 'seeds',
    label: 'Tier 1',
    icon: Star,
    commission: '10% commission · 20% member discount',
    description: 'Growing creators building their audience.',
    requirement: '1K–10K followers',
  },
  {
    id: 'voices',
    label: 'Tier 2',
    icon: Mic,
    commission: '15% commission · 25% member discount',
    description: 'Established voices with engaged communities.',
    requirement: '10K–100K followers',
  },
  {
    id: 'anchors',
    label: 'Tier 3',
    icon: Anchor,
    commission: '20% commission · 30% member discount',
    description: 'Powerhouse partners with major reach.',
    requirement: '100K+ followers',
  },
];

const TIER_COLORS: Record<AffiliateTier, { bg: string; text: string; border: string }> = {
  seeds:   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  voices:  { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  anchors: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
};

const TIER_HEX: Record<AffiliateTier, {
  accent: string; btn: string;
  badgeBg: string; badgeText: string;
  dotBg: string; dotText: string;
}> = {
  seeds:   { accent: '#059669', btn: '#059669', badgeBg: '#ECFDF5', badgeText: '#065F46', dotBg: '#D1FAE5', dotText: '#065F46' },
  voices:  { accent: '#7B5EA7', btn: '#7B5EA7', badgeBg: '#F3F0F9', badgeText: '#4A3270', dotBg: '#E8E0F5', dotText: '#4A3270' },
  anchors: { accent: '#7C3AED', btn: '#7C3AED', badgeBg: '#F5F3FF', badgeText: '#4C1D95', dotBg: '#EDE9FE', dotText: '#4C1D95' },
};

const MILESTONES = [0, 5, 10, 25, 50, 100];

const CHALLENGES = [
  { from: 0,   to: 5,    text: 'Get your first 5 referrals' },
  { from: 5,   to: 10,   text: '5 in — keep going' },
  { from: 10,  to: 25,   text: '10 done. Can you hit 25?' },
  { from: 25,  to: 50,   text: '25 in — push to 50' },
  { from: 50,  to: 100,  text: 'Halfway to 100' },
  { from: 100, to: null, text: "You're a Parallel champion" },
];

const SHARE_NUDGES = [
  'Share your link. Your audience is looking for this.',
  'Every referral is someone who actually wants a real relationship.',
  'The pool gets better with every person you bring in.',
  "Know someone who's done with the apps?",
  "At this point you're basically a matchmaker.",
];

// Matches the actual commission_status DB enum values
const COMMISSION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Awaiting subscription', color: 'text-yellow-600' },
  releasable:  { label: 'Eligible',              color: 'text-emerald-600' },
  released:    { label: 'Paid',                  color: 'text-emerald-600' },
  clawed_back: { label: 'Reversed',              color: 'text-red-500' },
  fraud:       { label: 'Flagged',               color: 'text-red-500' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getChallenge(n: number) {
  for (let i = CHALLENGES.length - 1; i >= 0; i--) {
    if (n >= CHALLENGES[i].from) return CHALLENGES[i];
  }
  return CHALLENGES[0];
}

function getProgressPct(n: number, ch: typeof CHALLENGES[0]) {
  if (!ch.to) return 100;
  return Math.min(100, Math.round(((n - ch.from) / (ch.to - ch.from)) * 100));
}

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return { copied, copy };
}

async function affiliateApi<T = any>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const token = localStorage.getItem('parallel_access_token');
    if (!token) return { data: null, error: 'Not signed in' };
    const fetchOpts: RequestInit = {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': publicAnonKey,
      },
    };
    if (opts.body !== undefined) fetchOpts.body = JSON.stringify(opts.body);
    const res = await fetch(`${AFFILIATE_FN_URL}/${path}`, fetchOpts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: (data as any)?.error ?? `HTTP ${res.status}` };
    return { data: data as T, error: null };
  } catch (e: any) {
    return { data: null, error: e.message ?? 'Network error' };
  }
}

// ── Apply Form ────────────────────────────────────────────────────────────────

function ApplyForm({ userId, personaPreVerified, personaPreInquiryId, onSubmitted, onAlreadyApplied }: {
  userId: string | null;
  personaPreVerified?: boolean;
  personaPreInquiryId?: string | null;
  onSubmitted: (app: AffiliateApplication) => void;
  onAlreadyApplied: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [tier, setTier] = useState<AffiliateTier | null>(null);
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [youtube, setYoutube] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExpectations, setShowExpectations] = useState(false);
  const [personaVerified, setPersonaVerified] = useState(!!personaPreVerified);
  const [personaInquiryId, setPersonaInquiryId] = useState<string | null>(personaPreInquiryId ?? null);

  // Restore form state after returning from Persona redirect
  useEffect(() => {
    if (!personaPreVerified) return;
    try {
      const saved = sessionStorage.getItem('affiliate_form_state');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.tier) setTier(s.tier);
        setInstagram(s.instagram || '');
        setTiktok(s.tiktok || '');
        setYoutube(s.youtube || '');
        sessionStorage.removeItem('affiliate_form_state');
        setStep(2);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!tier || !termsAccepted || !personaVerified) return;
    setIsSubmitting(true);
    setError(null);
    const { data, error: err } = await affiliateApi<{ application: AffiliateApplication }>('apply', {
      method: 'POST',
      body: {
        tier,
        terms_accepted: true,
        instagram: instagram || null,
        tiktok: tiktok || null,
        youtube: youtube || null,
        persona_inquiry_id: personaInquiryId || null,
      },
    });
    setIsSubmitting(false);
    if (err) {
      if (/already submitted/i.test(err)) { onAlreadyApplied(); return; }
      setError(err);
      return;
    }
    if (data?.application) onSubmitted(data.application);
  }

  const hasHandle = instagram.trim() || tiktok.trim() || youtube.trim();
  const personaUrl = userId
    ? `https://withpersona.com/verify?inquiry-template-id=${encodeURIComponent(PERSONA_TEMPLATE_ID)}&reference-id=${encodeURIComponent(userId)}&environment=${PERSONA_ENV}&redirect-uri=${encodeURIComponent(window.location.origin + '/?view=affiliate-portal&affiliate_pre_verified=1')}`
    : '#';

  function handlePersonaClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!userId) { e.preventDefault(); return; }
    try {
      sessionStorage.setItem('affiliate_form_state', JSON.stringify({
        tier, instagram, tiktok, youtube,
      }));
    } catch { /* ignore */ }
  }

  return (
    <div className="px-5 pb-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Join the Affiliate Army</h2>
        <p className="text-sm text-gray-500">Earn commission for every member you bring to Parallel.</p>
      </div>

      {step === 1 && (
        <>
          <button
            onClick={() => setShowExpectations(v => !v)}
            className="w-full flex items-center justify-between py-2.5 mb-4 text-left"
          >
            <span className="text-sm font-medium text-[#7B5EA7]">What happens after I apply?</span>
            {showExpectations
              ? <ChevronUp size={14} className="text-[#7B5EA7]" />
              : <ChevronDown size={14} className="text-[#7B5EA7]" />
            }
          </button>
          {showExpectations && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-5 space-y-3">
              {([
                { n: '1', title: 'Verify your identity', body: 'Complete a quick 2-minute Persona ID verification before submitting.' },
                { n: '2', title: 'We review your application', body: 'Our team checks your content and audience fit within a few business days.' },
                { n: '3', title: 'Dashboard activated', body: 'Your tracked link, promo code, and earnings dashboard go live immediately after approval.' },
              ] as const).map(({ n, title, body }) => (
                <div key={n} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#7B5EA7]/10 text-[#7B5EA7] text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-sm font-medium text-gray-700 mb-3">Choose your tier</p>
          <div className="space-y-3 mb-6">
            {TIERS.map(t => {
              const colors = TIER_COLORS[t.id];
              const Icon = t.icon;
              const selected = tier === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                    selected
                      ? `${colors.bg} ${colors.border}`
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <Icon size={16} className={selected ? colors.text : 'text-gray-400'} />
                    <span className={`font-semibold text-sm ${selected ? colors.text : 'text-gray-900'}`}>{t.label}</span>
                    <span className="text-xs text-gray-400 ml-auto">{t.requirement}</span>
                  </div>
                  <p className="text-xs text-gray-500 pl-7">{t.description}</p>
                  <p className={`text-xs font-medium pl-7 mt-1 ${selected ? colors.text : 'text-gray-400'}`}>{t.commission}</p>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={!tier}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm bg-[#7B5EA7] text-white disabled:opacity-40 transition-opacity"
          >
            Continue
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="space-y-4 mb-6">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Social handles <span className="text-gray-400 font-normal">(at least one)</span></p>
              <div className="space-y-2">
                {[
                  { label: 'Instagram', value: instagram, set: setInstagram, placeholder: '@yourhandle' },
                  { label: 'TikTok',    value: tiktok,    set: setTiktok,    placeholder: '@yourhandle' },
                  { label: 'YouTube',   value: youtube,   set: setYoutube,   placeholder: '@yourchannel' },
                ].map(({ label, value, set, placeholder }) => (
                  <div key={label} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                    <span className="text-xs text-gray-400 w-16 flex-shrink-0">{label}</span>
                    <input
                      type="text"
                      value={value}
                      onChange={e => set(e.target.value.replace(/^@+/, ''))}
                      placeholder={placeholder}
                      className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder-gray-300"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Persona identity verification */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Identity verification <span className="text-red-400 font-normal">required</span></p>
              {personaVerified ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-3 text-sm text-emerald-700 font-medium">
                  <ShieldCheck size={15} className="text-emerald-500 flex-shrink-0" />
                  Identity verified
                </div>
              ) : (
                <a
                  href={personaUrl}
                  onClick={handlePersonaClick}
                  className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    userId
                      ? 'border-[#7B5EA7] text-[#7B5EA7] hover:bg-[#7B5EA7]/5'
                      : 'border-gray-200 text-gray-400 pointer-events-none'
                  }`}
                >
                  <ShieldCheck size={15} />
                  Verify Identity
                </a>
              )}
              {!personaVerified && (
                <p className="text-xs text-gray-400 mt-1.5 text-center leading-relaxed">
                  Required before submission · Powered by Persona · ~2 minutes
                </p>
              )}
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-[#7B5EA7]"
              />
              <span className="text-sm text-gray-700">
                I agree to the{' '}
                <a
                  href="https://getparallel.vip/affiliate-terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-[#7B5EA7]"
                  onClick={e => e.stopPropagation()}
                >
                  Affiliate Program Terms
                </a>
                {' '}and understand that commissions are subject to a 30-day clawback window.
              </span>
            </label>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4 text-sm text-red-600">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          {!hasHandle && (
            <p className="text-xs text-gray-400 text-center mb-3">Add at least one social handle to continue.</p>
          )}
          {hasHandle && !personaVerified && (
            <p className="text-xs text-amber-600 text-center mb-3">Complete identity verification above to submit.</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="flex-shrink-0 px-4 py-3.5 rounded-2xl font-semibold text-sm border-2 border-gray-200 text-gray-700"
            >
              Back
            </button>
            <button
              onClick={submit}
              disabled={isSubmitting || !hasHandle || !termsAccepted || !personaVerified}
              className="flex-1 py-3.5 rounded-2xl font-semibold text-sm bg-[#7B5EA7] text-white disabled:opacity-40 transition-opacity"
            >
              {isSubmitting ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Pending Screen ────────────────────────────────────────────────────────────

function PendingScreen({ app, onRefresh, onReapply, justVerified }: { app: AffiliateApplication; onRefresh: () => void; onReapply?: () => void; justVerified?: boolean }) {
  const [pollTimedOut, setPollTimedOut] = useState(false);

  // Start the 2-minute timeout exactly once when justVerified is first true.
  // Do NOT depend on `app` or other values that change during polling to avoid
  // resetting the clock on every re-render.
  useEffect(() => {
    if (!justVerified) return;
    const t = setTimeout(() => setPollTimedOut(true), 120_000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justVerified]); // intentionally omits app — timeout must not reset on polls

  const needsVerification = app.audit_status === 'approved' && app.persona_status !== 'approved';
  const redirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}/?affiliate_verified=1`
    : '';
  const personaUrl = `https://withpersona.com/verify?inquiry-template-id=${encodeURIComponent(PERSONA_TEMPLATE_ID)}&reference-id=${encodeURIComponent(`aff_${app.id}`)}&environment=${PERSONA_ENV}&redirect-uri=${encodeURIComponent(redirectUri)}`;

  if (needsVerification) {
    // User just returned from Persona but the webhook hasn't fired yet —
    // show a processing state instead of the Verify Identity CTA again.
    if (justVerified) {
      if (pollTimedOut) {
        return (
          <div className="px-5 pb-8 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-5">
              <Clock size={24} className="text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Still activating…</h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto mb-6">
              This is taking longer than usual. You'll receive an email when your account is ready — or try refreshing now.
            </p>
            <button
              onClick={onRefresh}
              className="px-6 py-3.5 rounded-2xl font-semibold text-sm bg-[#7B5EA7] text-white"
            >
              Refresh
            </button>
          </div>
        );
      }
      return (
        <div className="px-5 pb-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[#7B5EA7]/10 flex items-center justify-center mx-auto mb-5">
            <div className="w-6 h-6 rounded-full border-2 border-[#7B5EA7] border-t-transparent animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Activating your account…</h2>
          <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto mb-6">
            Identity verification received. Your dashboard will be ready in just a moment — hang tight.
          </p>
          <p className="text-xs text-gray-400">This usually takes less than a minute.</p>
        </div>
      );
    }

    return (
      <div className="px-5 pb-8 text-center">
        <ShieldCheck size={40} className="text-[#7B5EA7] mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">One last step</h2>
        <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto mb-6">
          Your application was approved! Complete a quick identity verification to activate your affiliate account.
        </p>
        <a
          href={personaUrl}
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl font-semibold text-sm bg-[#7B5EA7] text-white"
        >
          <ShieldCheck size={16} />
          Verify Identity
        </a>
        <p className="text-xs text-gray-400 mt-4">Powered by Persona · Takes ~2 minutes</p>
      </div>
    );
  }

  const statusMessages: Record<AppAuditStatus, { icon: typeof Clock; color: string; title: string; body: string }> = {
    pending:    { icon: Clock,         color: 'text-yellow-500', title: 'Application received',    body: "We're reviewing your application. Typically 1–3 business days." },
    in_review:  { icon: Clock,         color: 'text-[#7B5EA7]',  title: 'Under review',            body: "We're actively reviewing your application. Typically 1–3 business days." },
    approved:   { icon: CheckCircle2,  color: 'text-emerald-500',title: 'Application approved',    body: "Your identity is verified and your application has been approved. We'll activate your account and send you an email — usually within 1 business day." },
    rejected:   { icon: AlertCircle,   color: 'text-red-500',    title: 'Application not approved', body: "Thank you for your interest. This tier may not be the right fit right now." },
  };

  const s = statusMessages[app.audit_status];
  const Icon = s.icon;
  const colors = app.tier_applied_for ? TIER_COLORS[app.tier_applied_for] : { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };

  return (
    <div className="px-5 pb-8 text-center">
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border mb-6 ${colors.bg} ${colors.text} ${colors.border}`}>
        {TIERS.find(t => t.id === app.tier_applied_for)?.label ?? app.tier_applied_for} tier
      </div>
      <Icon size={40} className={`${s.color} mx-auto mb-4`} />
      <h2 className="text-xl font-bold text-gray-900 mb-2">{s.title}</h2>
      <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto mb-6">{s.body}</p>
      {app.audit_status === 'rejected' ? (
        onReapply ? (
          <button
            onClick={onReapply}
            className="inline-block px-6 py-3 rounded-2xl font-semibold text-sm bg-[#7B5EA7] text-white"
          >
            Reapply
          </button>
        ) : null
      ) : null}
    </div>
  );
}

// ── Payout Setup Form ─────────────────────────────────────────────────────────

function PayoutSetupForm({
  profile,
  onSuccess,
}: {
  profile: AffiliateProfile;
  onSuccess: (updates: { tax_info_collected: boolean; bank_account_connected: boolean }) => void;
}) {
  const [legalName, setLegalName] = useState(profile.legal_name ?? '');
  // Parse stored address back into fields (stored as "street, city, state zip")
  const parseStoredAddress = (addr: string | null) => {
    if (!addr) return { street: '', city: '', state: '', zip: '' };
    const parts = addr.split(',').map(s => s.trim());
    const street = parts[0] ?? '';
    const city = parts[1] ?? '';
    const stateZip = (parts[2] ?? '').trim().split(' ');
    const state = stateZip[0] ?? '';
    const zip = stateZip[1] ?? '';
    return { street, city, state, zip };
  };
  const parsed = parseStoredAddress(profile.tax_address);
  const [street, setStreet] = useState(parsed.street);
  const [city, setCity] = useState(parsed.city);
  const [addrState, setAddrState] = useState(parsed.state);
  const [zip, setZip] = useState(parsed.zip);
  const [accountType, setAccountType] = useState('personalChecking');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const bankPartiallyFilled = routingNumber.trim() || accountNumber.trim();
  const bankValid = !bankPartiallyFilled || (routingNumber.length === 9 && accountNumber.length >= 4);
  const isOverwritingBank = profile.bank_account_connected && !!(routingNumber.trim() || accountNumber.trim());

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setSavedMessage(null);
    const taxAddress = [street.trim(), city.trim(), `${addrState.trim()} ${zip.trim()}`.trim()].filter(Boolean).join(', ');
    const body: Record<string, any> = {
      legal_name: legalName.trim(),
      tax_address: taxAddress,
    };
    if (routingNumber.trim() || accountNumber.trim()) {
      body.routing_number = routingNumber.trim();
      body.account_number = accountNumber.trim();
      body.account_type = accountType;
    }
    const { data, error: err } = await affiliateApi<{ ok: boolean; bank_account_connected: boolean }>(
      'payout/setup',
      { method: 'POST', body }
    );
    setSubmitting(false);
    if (err) { setError(err); return; }
    const bankConnected = data?.bank_account_connected ?? false;
    setSavedMessage(bankConnected
      ? "Payout info saved — you're all set!"
      : "Legal info saved. Add your bank account below to start receiving payouts."
    );
    onSuccess({ tax_info_collected: true, bank_account_connected: bankConnected });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1.5">Legal Name</label>
        <input
          type="text"
          value={legalName}
          onChange={e => setLegalName(e.target.value)}
          placeholder="Full legal name (as on tax documents)"
          className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 outline-none border border-gray-100 focus:border-[#7B5EA7]"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1.5">Mailing Address</label>
        <div className="space-y-2">
          <input
            type="text"
            value={street}
            onChange={e => setStreet(e.target.value)}
            placeholder="Street address"
            className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 outline-none border border-gray-100 focus:border-[#7B5EA7]"
          />
          <input
            type="text"
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="City"
            className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 outline-none border border-gray-100 focus:border-[#7B5EA7]"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={addrState}
              onChange={e => setAddrState(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="State"
              maxLength={2}
              className="w-20 bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 outline-none border border-gray-100 focus:border-[#7B5EA7] font-mono uppercase"
            />
            <input
              type="text"
              inputMode="numeric"
              value={zip}
              onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="ZIP code"
              className="flex-1 bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 outline-none border border-gray-100 focus:border-[#7B5EA7] font-mono"
            />
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
        <div className="relative flex justify-center">
          <span className="bg-parallel-cream px-3 text-xs text-gray-400">Bank account for ACH payouts</span>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1.5">Account Type</label>
        <select
          value={accountType}
          onChange={e => setAccountType(e.target.value)}
          className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none border border-gray-100 focus:border-[#7B5EA7]"
        >
          <option value="personalChecking">Personal Checking</option>
          <option value="personalSavings">Personal Savings</option>
          <option value="businessChecking">Business Checking</option>
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1.5">Routing Number</label>
        <input
          type="text"
          inputMode="numeric"
          value={routingNumber}
          onChange={e => setRoutingNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
          placeholder="9-digit routing number"
          className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 outline-none font-mono border border-gray-100 focus:border-[#7B5EA7]"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1.5">Account Number</label>
        <input
          type="text"
          inputMode="numeric"
          value={accountNumber}
          onChange={e => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 17))}
          placeholder="Bank account number"
          className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 outline-none font-mono border border-gray-100 focus:border-[#7B5EA7]"
        />
      </div>

      {savedMessage && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 text-sm text-emerald-700">
          <CheckCircle2 size={14} className="flex-shrink-0" />
          <span>{savedMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-600">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {bankPartiallyFilled && !bankValid && (
        <p className="text-xs text-amber-600">
          Routing number must be 9 digits and account number must be 4–17 digits.
        </p>
      )}

      {isOverwritingBank && bankValid && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-xs text-amber-700">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          <span>This will replace your existing bank account on file. Make sure the new details are correct before saving.</span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !legalName.trim() || !street.trim() || !city.trim() || !addrState.trim() || !zip.trim() || !bankValid}
        className="w-full py-3.5 rounded-2xl font-semibold text-sm bg-[#7B5EA7] text-white disabled:opacity-40 transition-opacity"
      >
        {submitting ? 'Saving…' : 'Save Payout Info'}
      </button>

      <p className="text-xs text-gray-400 text-center">Stored securely by Mercury.</p>
    </div>
  );
}

// ── Earnings Tab ──────────────────────────────────────────────────────────────

function EarningsTab() {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    affiliateApi<EarningsData>('earnings').then(({ data, error }) => {
      if (error) { setError(error); setLoading(false); return; }
      if (data) {
        setData(data);
        const currentYear = new Date().getFullYear().toString();
        if (data.by_year[currentYear]) setExpandedYears(new Set([currentYear]));
      }
      setLoading(false);
    });
  }, [retryCount]);

  function toggleYear(year: string) {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next;
    });
  }

  function getStatusDisplay(attr: EarningAttribution): { label: string; color: string } {
    if (attr.commission_status === 'releasable') {
      if (attr.days_until_eligible && attr.days_until_eligible > 0) {
        return { label: `${attr.days_until_eligible}d until eligible`, color: 'text-yellow-600' };
      }
      return { label: 'Eligible', color: 'text-emerald-600' };
    }
    return COMMISSION_STATUS_LABELS[attr.commission_status] ?? { label: attr.commission_status, color: 'text-gray-500' };
  }

  if (loading) return (
    <div className="space-y-3 pt-2 pb-8">
      {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />)}
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600 my-4 flex items-center justify-between gap-3">
      <span>{error}</span>
      <button
        onClick={() => setRetryCount(c => c + 1)}
        className="flex-shrink-0 text-xs font-medium text-red-700 underline"
      >
        Try again
      </button>
    </div>
  );

  if (!data) return null;

  const { lifetime, by_year } = data;
  const years = Object.keys(by_year).sort((a, b) => Number(b) - Number(a));
  const pendingTotal = parseFloat((lifetime.total_earned - lifetime.total_paid).toFixed(2));

  return (
    <div className="pb-4">

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total earned</p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">${lifetime.total_earned.toFixed(2)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-1">Pending payout</p>
          <p className={`text-xl font-bold tabular-nums ${pendingTotal > 0 ? 'text-yellow-600' : 'text-gray-900'}`}>
            ${pendingTotal.toFixed(2)}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-xs text-gray-400 mb-1">Total paid</p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">${lifetime.total_paid.toFixed(2)}</p>
        </div>
      </div>

      {(lifetime.pending_count > 0 || lifetime.in_window_count > 0 || lifetime.eligible_count > 0) && (
        <div className="flex flex-wrap gap-2 mb-5">
          {lifetime.pending_count > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-100">
              {lifetime.pending_count} awaiting payment
            </span>
          )}
          {lifetime.in_window_count > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
              {lifetime.in_window_count} in clawback window
            </span>
          )}
          {lifetime.eligible_count > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
              {lifetime.eligible_count} eligible for payout
            </span>
          )}
        </div>
      )}

      {years.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center">
          <Users size={20} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No earnings yet — share your link or promo code to start earning.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {years.map(year => {
            const yr = by_year[year];
            const isExpanded = expandedYears.has(year);
            return (
              <div key={year} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left"
                  onClick={() => toggleYear(year)}
                >
                  <div>
                    <span className="font-medium text-gray-900">{year}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {yr.attributions.length} referral{yr.attributions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-900 tabular-nums">${yr.total_earned.toFixed(2)}</span>
                    {isExpanded
                      ? <ChevronUp size={14} className="text-gray-400" />
                      : <ChevronDown size={14} className="text-gray-400" />
                    }
                  </div>
                </button>
                {isExpanded && (
                  <div className="divide-y divide-gray-50 border-t border-gray-100">
                    {yr.attributions.map(attr => {
                      const statusDisplay = getStatusDisplay(attr);
                      const date = attr.subscribed_at ?? attr.signed_up_at;
                      return (
                        <div key={attr.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-gray-400">
                              {date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                              {attr.promo_code_used ? ` · ${attr.promo_code_used}` : ''}
                            </p>
                            <p className={`text-xs font-medium ${statusDisplay.color}`}>{statusDisplay.label}</p>
                          </div>
                          <span className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">
                            {attr.commission_amount > 0
                              ? `$${attr.commission_amount.toFixed(2)}`
                              : <span className="text-xs text-gray-400 font-normal" title="Amount set when subscription confirms">TBD</span>
                            }
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Payouts Tab ───────────────────────────────────────────────────────────────

function PayoutsTab({
  profile,
  onProfileUpdate,
}: {
  profile: AffiliateProfile;
  onProfileUpdate: (updates: Partial<AffiliateProfile>) => void;
}) {
  const [payouts, setPayouts] = useState<PayoutRecord[] | null>(null);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const [showSetupForm, setShowSetupForm] = useState(!profile.bank_account_connected);

  useEffect(() => {
    affiliateApi<{ payouts: PayoutRecord[] }>('payout/history').then(({ data }) => {
      setPayouts(data?.payouts ?? []);
      setLoadingPayouts(false);
    });
  }, []);

  const prog = profile.program;

  return (
    <div className="pb-8 space-y-6">
      {/* Bank account section */}
      {profile.bank_account_connected && !showSetupForm ? (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3.5">
          <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-800">Bank account connected</p>
            <p className="text-xs text-emerald-600">Payouts are sent via ACH on the 1st of each month.</p>
          </div>
          <button
            onClick={() => setShowSetupForm(true)}
            className="text-xs text-emerald-700 underline flex-shrink-0"
          >
            Update
          </button>
        </div>
      ) : (
        <div>
          {!profile.bank_account_connected && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-4">
              <AlertCircle size={15} className="text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-800">Add your bank account to receive payouts</p>
            </div>
          )}
          <PayoutSetupForm
            profile={profile}
            onSuccess={(updates) => {
              onProfileUpdate(updates);
              if (updates.bank_account_connected) setShowSetupForm(false);
            }}
          />
        </div>
      )}

      {/* Payout cadence note */}
      <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
        <Clock size={13} className="text-gray-400 flex-shrink-0" />
        <p className="text-xs text-gray-500">Paid out on the 1st of each month — you'll get an email confirmation.</p>
      </div>

      {/* Payout history */}
      <div>
        <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Payout history</div>
        {loadingPayouts ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : payouts && payouts.length > 0 ? (
          <div className="space-y-2">
            {payouts.map(p => (
              <div key={p.id} className={`flex items-start justify-between bg-white border rounded-xl px-4 py-3 gap-3 ${p.mercury_status === 'failed' ? 'border-red-200' : 'border-gray-100'}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(p.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' – '}
                    {new Date(p.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  <p className={`text-xs capitalize mt-0.5 ${p.mercury_status === 'failed' ? 'text-red-500' : 'text-gray-400'}`}>
                    {p.mercury_status === 'sent'
                      ? `Sent (arrives 3–5 business days)${p.paid_at ? ` · ${new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
                      : p.mercury_status === 'failed'
                      ? 'Transfer failed'
                      : p.mercury_status.replace(/_/g, ' ')
                    }
                  </p>
                  {p.mercury_status === 'failed' && (
                    <p className="text-xs text-red-400 mt-1">
                      Your commissions are safe.{' '}
                      <a
                        href="mailto:hello@getparallel.vip?subject=Payout%20Issue"
                        className="underline"
                      >
                        Contact us
                      </a>
                      {' '}and we'll get this sorted.
                    </p>
                  )}
                </div>
                <span className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">
                  ${Number(p.net_amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center">
            <History size={20} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No payouts yet.</p>
            {!profile.bank_account_connected && (
              <p className="text-xs text-gray-400 mt-1">Connect your bank account above to start receiving payouts.</p>
            )}
          </div>
        )}
      </div>

      {/* Program details */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs uppercase tracking-widest text-gray-500">Program details</p>
        </div>
        <div className="divide-y divide-gray-50">
          {([
            ['Payout schedule', prog.payout_cadence],
            ['Minimum payout', `$${prog.minimum_payout_usd}`],
            ['Payout method', prog.payout_method],
            ['Clawback window', `${prog.clawback_window_days} days from payment`],
            ['Attribution window', `${prog.attribution_window_days}-day cookie`],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex items-start justify-between px-4 py-2.5 gap-3">
              <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
              <span className="text-xs text-gray-700 text-right">{value}</span>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 leading-relaxed">{prog.tax_note}</p>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function AffiliateDashboard({
  profile: initialProfile,
}: {
  profile: AffiliateProfile;
}) {
  const [profile, setProfile] = useState<AffiliateProfile>(initialProfile);
  const [tab, setTab] = useState<DashboardTab>('promote');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [sharedFallback, setSharedFallback] = useState(false);

  const hex = TIER_HEX[profile.tier];
  const conversions = profile.total_conversions;
  const challenge = getChallenge(conversions);
  const progressPct = getProgressPct(conversions, challenge);
  const nudge = SHARE_NUDGES[Math.min(Math.floor(conversions / 20), SHARE_NUDGES.length - 1)];
  const tierOrder: Record<AffiliateTier, number> = { seeds: 0, voices: 1, anchors: 2 };

  const handleCopyLink = () => {
    if (!profile.affiliate_link) return;
    navigator.clipboard.writeText(profile.affiliate_link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleCopyCode = () => {
    if (!profile.promo_code) return;
    navigator.clipboard.writeText(profile.promo_code).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Join Parallel',
      text: profile.promo_code
        ? `Use code ${profile.promo_code} for ${profile.subscription_discount_pct}% off your first month on Parallel!`
        : 'Join Parallel — real compatibility, real matches.',
      url: profile.affiliate_link ?? 'https://getparallel.vip',
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Web Share API not available — copy the link and show feedback on Share button
        await navigator.clipboard.writeText(profile.affiliate_link ?? 'https://getparallel.vip');
        setSharedFallback(true);
        setTimeout(() => setSharedFallback(false), 2000);
      }
    } catch { /* user cancelled */ }
  };

  return (
    <div className="pt-14 max-w-lg mx-auto">

      {/* ── Tab bar ── */}
      <div className="flex border-b border-gray-100 sticky top-14 bg-parallel-cream z-10">
        {(['promote', 'payouts'] as DashboardTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'text-gray-900 border-b-2 border-[#7B5EA7]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t === 'payouts' && !profile.bank_account_connected
              ? <span className="flex items-center justify-center gap-1.5">
                  Payouts <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                </span>
              : t === 'promote' ? 'Promote' : 'Payouts'
            }
          </button>
        ))}
      </div>

      <div className="px-5">

        {/* ── Promote tab ── */}
        {tab === 'promote' && (
          <div className="pb-12 pt-5 space-y-6">

            {/* Referral link */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Referral link</p>
              {profile.affiliate_link ? (
                <>
                  <div className="flex gap-2 mb-1.5">
                    <button
                      onClick={handleCopyLink}
                      className="flex-1 border border-gray-200 bg-parallel-cream text-gray-800 px-4 py-2.5 rounded-full text-sm font-medium flex items-center justify-center gap-2"
                    >
                      {copiedLink ? <><Check size={14} aria-hidden="true" />Copied!</> : <><Copy size={14} aria-hidden="true" />Copy link</>}
                    </button>
                    <button
                      onClick={handleShare}
                      className="flex-1 text-white px-4 py-2.5 rounded-full text-sm font-medium flex items-center justify-center gap-2"
                      style={{ background: hex.btn }}
                    >
                      {sharedFallback ? <><Check size={14} aria-hidden="true" />Copied!</> : <><Share2 size={14} aria-hidden="true" />Share</>}
                    </button>
                  </div>
                  <p className="text-center text-xs text-gray-300 font-mono break-all">{profile.affiliate_link}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400">Your link is being set up — check back soon.</p>
              )}
            </div>

            {/* Discount code */}
            {profile.promo_code && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Discount code</p>
                <button
                  onClick={handleCopyCode}
                  className="w-full flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Tag size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="font-mono text-sm font-bold text-gray-900">{profile.promo_code}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium flex-shrink-0" style={{ color: hex.accent }}>
                    {copiedCode ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}
                  </div>
                </button>
                <p className="text-xs text-gray-400 mt-1.5 text-center">Your audience uses this at checkout for {profile.subscription_discount_pct}% off</p>
              </div>
            )}

            <ResourcesTab profile={profile} />
          </div>
        )}

        {/* ── Payouts tab ── */}
        {tab === 'payouts' && (
          <div className="pb-8 pt-5">

            {/* Stats header */}
            <div className="flex items-baseline gap-3 mb-6">
              <div className="text-5xl font-medium leading-none" style={{ color: hex.accent }}>
                {conversions}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">referral{conversions !== 1 ? 's' : ''}</p>
                {Number(profile.total_paid_lifetime) > 0 && (
                  <p className="text-xs text-gray-400">${Number(profile.total_paid_lifetime).toFixed(2)} paid out</p>
                )}
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-gray-400">Commission</p>
                <p className="text-sm font-bold" style={{ color: hex.accent }}>{profile.commission_rate_pct}%</p>
              </div>
            </div>

            {/* Payout nudge */}
            {conversions > 0 && !profile.bank_account_connected && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-5">
                <AlertCircle size={15} className="text-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-800 flex-1">Connect your bank to receive commissions</p>
                <button
                  onClick={() => setTab('payouts')}
                  className="text-xs font-medium text-amber-700 underline flex-shrink-0"
                >
                  Set up →
                </button>
              </div>
            )}

            {/* Earnings */}
            <EarningsTab />

            {/* Payout setup divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
              <div className="relative flex justify-center">
                <span className="bg-parallel-cream px-3 text-xs text-gray-400">Payout setup</span>
              </div>
            </div>

            <PayoutsTab
              profile={profile}
              onProfileUpdate={(updates) => setProfile(prev => ({ ...prev, ...updates }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Resources Tab ─────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#7B5EA7]/10 text-[#7B5EA7] hover:bg-[#7B5EA7]/20 transition-colors flex-shrink-0"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : (label ?? 'Copy')}
    </button>
  );
}

interface CaptionCard {
  id: string;
  platform: string;
  angle: string;
  body: string;
}

function buildCaptions(link: string | null, code: string | null): CaptionCard[] {
  const l = link ?? 'https://getparallel.vip';
  const c = code ?? 'YOUR_CODE';
  return [
    {
      id: 'authentic',
      platform: 'Instagram · TikTok',
      angle: 'Personal recommendation',
      body: `I've been using this dating app called Parallel and honestly it's the most thoughtful one I've come across. Instead of swiping, you go through a detailed questionnaire and they match you based on real compatibility — values, lifestyle, attachment style, all of it.\n\nIf you want to try it, use my code ${c} for a discount on your subscription 🖤\n\n${l}`,
    },
    {
      id: 'problem',
      platform: 'Instagram · TikTok',
      angle: 'Problem → solution',
      body: `If you're tired of dating apps that feel like shopping for people, Parallel is different. They actually care about compatibility over appearance — their matching is based on a deep questionnaire, not just photos.\n\nUse code ${c} to get a discount when you sign up:\n${l}`,
    },
    {
      id: 'short',
      platform: 'Stories · Twitter/X',
      angle: 'Short & punchy',
      body: `Found a dating app that actually takes compatibility seriously. Use my code ${c} for a discount → ${l}`,
    },
    {
      id: 'why',
      platform: 'Long-form · YouTube desc',
      angle: 'Why Parallel',
      body: `I partnered with Parallel because I genuinely believe in what they're building. It's a curated matchmaking app — you fill out a thoughtful questionnaire covering your values, lifestyle, and what you're really looking for, and they handle the matching. No endless swiping.\n\nUse code ${c} to get a discount on your subscription: ${l}\n\n(I earn a small commission at no extra cost to you — thank you for supporting me!)`,
    },
  ];
}

function ResourcesTab({ profile }: { profile: AffiliateProfile }) {
  const captions = buildCaptions(profile.affiliate_link, profile.promo_code);
  const [openCaption, setOpenCaption] = useState<string | null>(null);

  const hooks = [
    '"I finally found a dating app that treats you like a whole person, not a photo"',
    '"This app asked me more questions about myself than any date ever has"',
    '"The reason I like Parallel: they actually think about whether two people are compatible before connecting them"',
    '"Genuine question — why are most dating apps still just about photos? Parallel is doing it differently"',
    '"Dating app hot take: the questionnaire is the most attractive part"',
  ];

  const dos = [
    'Share your genuine experience — authenticity converts far better than scripted posts',
    'Mention what specifically resonated with you about Parallel\'s approach',
    'Use your unique code and link so you get credit for every referral',
    'Disclose the partnership (required by FTC) — something like "partnered with" or "use my code"',
    'Tag @getparallel or use #parallel if it fits your style',
  ];

  const donts = [
    'Don\'t make guarantees about finding love or relationships',
    'Don\'t compare Parallel negatively to specific other apps by name',
    'Don\'t alter or fabricate screenshots of the app',
    'Don\'t run paid ads targeting "Parallel" as a keyword without approval',
    'Don\'t use the PARA//EL. wordmark in ways that look like official Parallel content',
  ];

  return (
    <div className="space-y-8">

      {/* Caption Templates */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <FileText size={16} className="text-[#7B5EA7]" />
          <h3 className="text-sm font-semibold text-gray-900">Caption templates</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">Tap to expand and copy — your code and link are already filled in.</p>
        <div className="space-y-2">
          {captions.map(c => (
            <div key={c.id} className="border border-gray-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpenCaption(openCaption === c.id ? null : c.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.angle}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.platform}</p>
                </div>
                {openCaption === c.id ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
              </button>
              {openCaption === c.id && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans mt-3 mb-3">{c.body}</pre>
                  <CopyButton text={c.body} label="Copy caption" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Follow & share our posts */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <Share2 size={16} className="text-[#7B5EA7]" />
          <h3 className="text-sm font-semibold text-gray-900">Share our posts</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">Repost one of our existing ads to your story and add your code or link on top.</p>

        {/* Profile links */}
        <div className="flex gap-3 mb-4">
          <a
            href="https://www.instagram.com/parallel_vip"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 text-white text-sm font-semibold"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            @parallel_vip
          </a>
          <a
            href="https://www.tiktok.com/@parallel_vip"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-black text-white text-sm font-semibold"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>
            @parallel_vip
          </a>
        </div>

        {/* Story sharing steps */}
        <div className="bg-gray-50 rounded-2xl px-4 py-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">How to share a post to your story</p>
          {[
            { n: '1', text: 'Open our Instagram or TikTok and find a post you like' },
            { n: '2', text: 'Tap the share icon → "Add to Story" (Instagram) or "Share to Story" (TikTok)' },
            { n: '3', text: 'Add a sticker or text with your promo code and affiliate link' },
            { n: '4', text: 'Post — your followers see our content with your personal referral on top' },
          ].map(step => (
            <div key={step.n} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-[#7B5EA7] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{step.n}</span>
              <p className="text-sm text-gray-600 leading-snug">{step.text}</p>
            </div>
          ))}
        </div>

        {/* Quick copy for story overlay */}
        <div className="mt-3 border border-gray-200 rounded-2xl px-4 py-3">
          <p className="text-xs text-gray-500 mb-2">Quick copy for your story overlay:</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-800 font-medium">
              Use code <span className="font-bold text-[#7B5EA7]">{profile.promo_code ?? 'YOUR_CODE'}</span> → {profile.affiliate_link ?? 'getparallel.vip'}
            </p>
            <CopyButton text={`Use code ${profile.promo_code ?? 'YOUR_CODE'} → ${profile.affiliate_link ?? 'https://getparallel.vip'}`} />
          </div>
        </div>
      </section>

      {/* Content hooks */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb size={16} className="text-[#7B5EA7]" />
          <h3 className="text-sm font-semibold text-gray-900">Hook ideas</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">Use as-is or riff on them.</p>
        <div className="space-y-2">
          {hooks.map((h, i) => (
            <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-sm text-gray-700 flex-1 leading-snug italic">{h}</p>
              <CopyButton text={h} />
            </div>
          ))}
        </div>
      </section>

      {/* Visual assets — coming soon */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <Image size={16} className="text-[#7B5EA7]" />
          <h3 className="text-sm font-semibold text-gray-900">Visual assets</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">Branded graphics, story templates, and Canva files — coming soon.</p>
        <div className="grid grid-cols-2 gap-3">
          {['Story slides', 'Square graphics', 'Canva templates', 'Logo kit'].map(name => (
            <div key={name} className="border border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center py-7 gap-2">
              <Sparkles size={18} className="text-gray-300" />
              <p className="text-xs text-gray-400 text-center font-medium">{name}</p>
              <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Coming soon</span>
            </div>
          ))}
        </div>
      </section>

      {/* Do's and don'ts */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 size={16} className="text-[#7B5EA7]" />
          <h3 className="text-sm font-semibold text-gray-900">Brand guidelines</h3>
        </div>
        <div className="space-y-3">
          <div className="bg-emerald-50 rounded-2xl px-4 py-4">
            <p className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">Do</p>
            <ul className="space-y-2">
              {dos.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-emerald-800">
                  <Check size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-red-50 rounded-2xl px-4 py-4">
            <p className="text-xs font-semibold text-red-600 mb-2 uppercase tracking-wide">Don't</p>
            <ul className="space-y-2">
              {donts.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Need something custom */}
      <section className="bg-[#7B5EA7]/8 rounded-2xl px-5 py-5 text-center" style={{ background: 'rgba(123,94,167,0.08)' }}>
        <p className="text-sm font-semibold text-gray-900 mb-1">Need custom content?</p>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">Have a specific campaign in mind or want co-created content? Reach out and we'll work with you directly.</p>
        <a
          href="mailto:hello@getparallel.vip?subject=Affiliate%20Content%20Request"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7B5EA7] hover:opacity-80 transition-opacity"
        >
          hello@getparallel.vip <ExternalLink size={13} />
        </a>
      </section>

    </div>
  );
}

// ── Portal (state machine) ────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  onSignOut?: () => void;
  isAffiliateOnly?: boolean;
  personaJustVerified?: boolean;
  affiliatePreVerified?: boolean;
  affiliatePreInquiryId?: string | null;
}

export function AffiliatePortalView({ onBack, onSignOut, isAffiliateOnly, personaJustVerified, affiliatePreVerified, affiliatePreInquiryId }: Props) {
  const [state, setState] = useState<PortalState>('loading');
  const [profile, setProfile] = useState<AffiliateProfile | null>(null);
  const [application, setApplication] = useState<AffiliateApplication | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  // When the user lands back from Persona (?affiliate_verified=1), the webhook
  // may not have fired yet so /profile still returns 404 and the portal would
  // show the "Verify Identity" CTA again — confusing. Poll every 3 s for up to
  // 2 minutes; once the webhook activates the affiliate, /profile returns 200
  // and the load effect switches state to 'dashboard'.
  useEffect(() => {
    if (!personaJustVerified || state !== 'submitted') return;
    const interval = setInterval(() => setLoadKey(k => k + 1), 3000);
    const timeout = setTimeout(() => clearInterval(interval), 120_000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [personaJustVerified, state]);

  useEffect(() => {
    setState('loading');
    async function load() {
      // Try profile API first — succeeds only for active affiliates
      const { data: prof } = await affiliateApi<AffiliateProfile>('profile');
      if (prof) {
        localStorage.setItem('parallel_is_affiliate', 'true');
        setProfile(prof);
        setState('dashboard');
        return;
      }

      // Not yet an affiliate — check for pending application
      const token = localStorage.getItem('parallel_access_token');
      if (!token) { setState('apply'); return; }

      const userRes = await fetch(`https://${projectId}.supabase.co/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey },
      }).catch(() => null);
      const userData = userRes?.ok ? await userRes.json() : null;
      const userEmail = userData?.email;
      if (userData?.id) setUserId(userData.id);
      if (!userEmail) { setState('apply'); return; }

      const appsRes = await fetch(
        `https://${projectId}.supabase.co/rest/v1/affiliate_applications?select=id,tier_applied_for,audit_status,persona_status,created_at&email=eq.${encodeURIComponent(userEmail)}&order=created_at.desc&limit=1`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': publicAnonKey } }
      ).catch(() => null);
      const apps = appsRes?.ok ? await appsRes.json() : null;

      if (Array.isArray(apps) && apps.length > 0) {
        setApplication(apps[0] as AffiliateApplication);
        setState('submitted');
        // Ensure refresh without ?view=affiliate-portal still routes here, not to dating onboarding
        try { localStorage.setItem('parallel_is_affiliate', 'true'); } catch { /* noop */ }
      } else {
        setState('apply');
      }
    }
    load();
  }, [loadKey]);

  const hex = profile ? TIER_HEX[profile.tier] : null;
  const tierLabel = profile ? TIERS.find(t => t.id === profile.tier)?.label : null;

  return (
    <div className="min-h-screen bg-parallel-cream">
      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 bg-parallel-cream z-10 border-b border-gray-100">
        {isAffiliateOnly ? (
          <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-full bg-parallel-void flex items-center justify-center"
                aria-hidden="true"
              >
                <span
                  style={{
                    fontSize: '8px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    letterSpacing: '.02em',
                    userSelect: 'none',
                  }}
                >
                  P<span style={{ color: '#A98FD0' }}>//</span>
                </span>
              </div>
              <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400">
                Affiliate
              </span>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Sign out
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
            <button
              onClick={onBack}
              aria-label="Go back"
              className="p-2 -ml-2 hover:bg-gray-50 rounded-full transition-colors"
            >
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
            <h1 className="font-medium text-base absolute left-1/2 -translate-x-1/2">Affiliate Program</h1>
            {hex && tierLabel ? (
              <div
                className="text-xs font-medium px-3 py-1 rounded-full uppercase tracking-wide"
                style={{ background: hex.badgeBg, color: hex.badgeText }}
              >
                {tierLabel}
              </div>
            ) : (
              <div className="w-16" />
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto">
        {state === 'loading' && (
          <div className="pt-20 px-5 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        )}
        {state === 'apply' && (
          <div className="pt-16 px-0">
            <ApplyForm
              userId={userId}
              personaPreVerified={affiliatePreVerified}
              personaPreInquiryId={affiliatePreInquiryId}
              onSubmitted={(app) => { setApplication(app); setState('submitted'); }}
              onAlreadyApplied={() => setLoadKey(k => k + 1)}
            />
          </div>
        )}
        {state === 'submitted' && application && (
          <div className="pt-24">
            <PendingScreen app={application} onRefresh={() => setLoadKey(k => k + 1)} onReapply={() => setState('apply')} justVerified={personaJustVerified} />
          </div>
        )}
        {state === 'dashboard' && profile && (
          <AffiliateDashboard profile={profile} />
        )}
      </div>
    </div>
  );
}

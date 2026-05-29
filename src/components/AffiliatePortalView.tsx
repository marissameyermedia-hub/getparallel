import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Copy, Check, Share2, Users, Star, Mic, Anchor,
  Clock, CheckCircle2, AlertCircle, ShieldCheck, Link2, Tag,
  ChevronDown, ChevronUp, History, CreditCard,
} from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

const PERSONA_TEMPLATE_ID = 'itmpl_w7GgvrzeQ8P6sopBcayQBcBP39gG';
const PERSONA_ENV = 'production';
const AFFILIATE_FN_URL = `https://${projectId}.supabase.co/functions/v1/affiliate`;

// ── Types ─────────────────────────────────────────────────────────────────────

type AffiliateTier = 'seeds' | 'voices' | 'anchors';
type AppAuditStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_info';
type DashboardTab = 'overview' | 'earnings' | 'payouts';
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
    label: 'Seeds',
    icon: Star,
    commission: '10% commission · 20% member discount',
    description: 'Growing creators building their audience.',
    requirement: '1K–10K followers',
  },
  {
    id: 'voices',
    label: 'Voices',
    icon: Mic,
    commission: '15% commission · 25% member discount',
    description: 'Established voices with engaged communities.',
    requirement: '10K–100K followers',
  },
  {
    id: 'anchors',
    label: 'Anchors',
    icon: Anchor,
    commission: '20% commission · 30% member discount',
    description: 'Powerhouse partners with major reach.',
    requirement: '100K+ followers',
  },
];

const TIER_COLORS: Record<AffiliateTier, { bg: string; text: string; border: string }> = {
  seeds:   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  voices:  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  anchors: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
};

const TIER_HEX: Record<AffiliateTier, {
  accent: string; btn: string;
  badgeBg: string; badgeText: string;
  dotBg: string; dotText: string;
}> = {
  seeds:   { accent: '#059669', btn: '#059669', badgeBg: '#ECFDF5', badgeText: '#065F46', dotBg: '#D1FAE5', dotText: '#065F46' },
  voices:  { accent: '#2563EB', btn: '#2563EB', badgeBg: '#EFF6FF', badgeText: '#1E40AF', dotBg: '#DBEAFE', dotText: '#1E40AF' },
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
  const [phase1City, setPhase1City] = useState(false);
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
        setPhase1City(s.phase1City || false);
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
        phase1_city_audience: phase1City,
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
        tier, instagram, tiktok, youtube, phase1City,
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
                checked={phase1City}
                onChange={e => setPhase1City(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-[#7B5EA7]"
              />
              <span className="text-sm text-gray-700">
                My audience is primarily in a Phase 1 launch city (NYC, LA, Chicago, SF, Austin, Miami)
                <span className="block text-xs text-gray-400 mt-0.5 leading-relaxed">Phase 1 cities have the most active members — checking this may speed up approval.</span>
              </span>
            </label>

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
    in_review:  { icon: Clock,         color: 'text-blue-500',   title: 'Under review',            body: "We're actively reviewing your application. Typically 1–3 business days." },
    approved:   { icon: CheckCircle2,  color: 'text-emerald-500',title: 'Verified!',               body: "Identity confirmed. Your affiliate dashboard is being activated — check back shortly." },
    needs_info: { icon: AlertCircle,   color: 'text-orange-500', title: 'More info needed',        body: "We need a bit more info before we can process your application. Check your email for details — then reply directly to that message." },
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
      ) : app.audit_status === 'needs_info' ? (
        <a
          href={`mailto:hello@getparallel.vip?subject=Affiliate%20Application%20Info&body=Application%20ID%3A%20${app.id}`}
          className="inline-block px-6 py-3 rounded-2xl font-semibold text-sm border-2 border-[#7B5EA7] text-[#7B5EA7]"
        >
          Reply by email
        </a>
      ) : (
        <button
          onClick={onRefresh}
          className="text-xs text-[#7B5EA7] underline"
        >
          Check for updates
        </button>
      )}
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
  const [taxAddress, setTaxAddress] = useState(profile.tax_address ?? '');
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
    const body: Record<string, any> = {
      legal_name: legalName.trim(),
      tax_address: taxAddress.trim(),
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
        <textarea
          value={taxAddress}
          onChange={e => setTaxAddress(e.target.value)}
          placeholder={'Street address, City, State ZIP'}
          rows={2}
          className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 outline-none resize-none border border-gray-100 focus:border-[#7B5EA7]"
        />
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
        disabled={submitting || !legalName.trim() || !taxAddress.trim() || !bankValid}
        className="w-full py-3.5 rounded-2xl font-semibold text-sm bg-[#7B5EA7] text-white disabled:opacity-40 transition-opacity"
      >
        {submitting ? 'Saving…' : 'Save Payout Info'}
      </button>

      <p className="text-xs text-gray-400 text-center leading-relaxed">
        Your banking details are securely stored by Mercury, our payment processor, not on Parallel's servers directly.
      </p>
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
    <div className="pb-8">
      <p className="text-xs text-gray-400 pt-1 pb-4 leading-relaxed">
        Commissions lock in when your referral's subscription payment confirms. They're held for 30 days (clawback window), then become eligible for payout.
      </p>
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
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
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
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3.5 mb-4">
              <AlertCircle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Set up payouts to get paid</p>
                <p className="text-xs text-amber-600">Add your bank account and legal info to receive ACH payouts when commissions are released.</p>
              </div>
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
      <div className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5">
        <Clock size={15} className="text-gray-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500 leading-relaxed">
          Payouts are reviewed and processed by the Parallel team around the 1st of each month. No action needed from you — we'll send a confirmation email when your payout is on its way.
        </p>
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
  const [tab, setTab] = useState<DashboardTab>('overview');
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
        {(['overview', 'earnings', 'payouts'] as DashboardTab[]).map(t => (
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
              : t
            }
          </button>
        ))}
      </div>

      <div className="px-5">

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <div className="pb-8">

            {/* Hero */}
            <div className="text-center pt-8 pb-2">
              <div
                className="text-8xl font-medium leading-none mb-2 transition-colors duration-500"
                style={{ color: hex.accent }}
              >
                {conversions}
              </div>
              <div className="text-xs uppercase tracking-widest text-gray-500">members referred</div>
              {Number(profile.total_paid_lifetime) > 0 && (
                <div className="text-sm text-gray-400 mt-1">
                  ${Number(profile.total_paid_lifetime).toFixed(2)} paid out
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="mt-6">
              <div className="flex justify-between items-baseline mb-2">
                <div className="text-sm font-medium text-gray-900">{challenge.text}</div>
                {challenge.to && (
                  <div className="text-xs text-gray-500">{conversions} / {challenge.to}</div>
                )}
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%`, background: hex.accent }}
                />
              </div>
              <div className="flex justify-between mt-2">
                {MILESTONES.map(m => (
                  <div key={m} className="text-center">
                    <div
                      className="w-1.5 h-1.5 rounded-full mx-auto mb-1 transition-colors duration-300"
                      style={{ background: conversions >= m ? hex.accent : '#E8E4DE' }}
                    />
                    <div
                      className="text-[10px] transition-colors duration-300"
                      style={{ color: conversions >= m ? '#888780' : '#D3D1C7' }}
                    >
                      {m}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* At a glance */}
            <div className="mt-8 grid grid-cols-3 gap-2">
              <div className="bg-white border border-gray-100 rounded-2xl p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Commission</p>
                <p className="text-base font-bold tabular-nums" style={{ color: hex.accent }}>
                  {profile.commission_rate_pct}%
                </p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Your discount</p>
                <p className="text-base font-bold tabular-nums text-gray-900">
                  {profile.subscription_discount_pct}% off
                </p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Attribution</p>
                <p className="text-base font-bold tabular-nums text-gray-900">
                  {profile.program.attribution_window_days}d
                </p>
              </div>
            </div>

            {/* Own discount callout */}
            {profile.subscription_discount_pct > 0 && (
              <div className="mt-4 bg-white border border-gray-100 rounded-2xl px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <Tag size={15} className="text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">Your member discount</p>
                    <p className="text-xs text-gray-500 mt-0.5">Affiliates get {profile.subscription_discount_pct}% off their own subscription.</p>
                  </div>
                  <a
                    href="/?view=pricing"
                    className="text-xs font-medium underline flex-shrink-0"
                    style={{ color: hex.accent }}
                  >
                    Subscribe →
                  </a>
                </div>
                {profile.promo_code && (
                  <p className="text-xs text-gray-400 mt-2.5 pl-[26px]">
                    Enter code <span className="font-mono font-semibold text-gray-700">{profile.promo_code}</span> at checkout.
                  </p>
                )}
              </div>
            )}

            {/* Payout nudge */}
            {conversions > 0 && !profile.bank_account_connected && (
              <div className="mt-6 flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3.5">
                <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800">Set up payouts to get paid</p>
                  <p className="text-xs text-amber-600 mt-0.5">You have referrals — connect your bank to start receiving commissions.</p>
                </div>
                <button
                  onClick={() => setTab('payouts')}
                  className="text-xs font-medium text-amber-700 underline flex-shrink-0"
                >
                  Set up →
                </button>
              </div>
            )}

            {/* Share section */}
            <div className="mt-8">
              <div className="text-center text-sm text-gray-500 italic mb-4 px-4 leading-relaxed">
                {nudge}
              </div>

              {profile.affiliate_link ? (
                <>
                  <div className="flex gap-3 mb-3">
                    <button
                      onClick={handleCopyLink}
                      className="flex-1 border border-gray-200 bg-parallel-cream text-gray-800 px-5 py-3.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {copiedLink
                        ? <><Check size={16} aria-hidden="true" />Copied!</>
                        : <><Copy size={16} aria-hidden="true" />Copy link</>
                      }
                    </button>
                    <button
                      onClick={handleShare}
                      className="flex-1 text-white px-5 py-3.5 rounded-full text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      style={{ background: hex.btn }}
                    >
                      {sharedFallback
                        ? <><Check size={16} aria-hidden="true" />Copied!</>
                        : <><Share2 size={16} aria-hidden="true" />Share</>
                      }
                    </button>
                  </div>
                  <div className="text-center text-xs text-gray-300 font-mono break-all mb-4">
                    {profile.affiliate_link}
                  </div>
                </>
              ) : (
                <div className="bg-white border border-gray-100 rounded-2xl p-4 text-sm text-gray-500 text-center mb-4">
                  Your tracked link is being set up — check back soon.
                </div>
              )}

              {profile.promo_code && (
                <button
                  onClick={handleCopyCode}
                  className="w-full flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Tag size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 mr-1">Promo code</span>
                    <span className="font-mono text-sm font-semibold text-gray-900">{profile.promo_code}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium flex-shrink-0" style={{ color: hex.accent }}>
                    {copiedCode
                      ? <><Check size={13} />Copied</>
                      : <><Copy size={13} />Copy</>
                    }
                  </div>
                </button>
              )}
            </div>

            {/* Tier ladder */}
            <div className="mt-8">
              <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Affiliate tiers</div>
              <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-100 bg-white">
                {TIERS.map((t, i) => {
                  const isCurrent = profile.tier === t.id;
                  const isPast = tierOrder[profile.tier] > i;
                  const isActive = isCurrent || isPast;
                  const tHex = TIER_HEX[t.id];
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ opacity: isActive ? 1 : 0.35 }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                        style={{
                          background: isActive ? tHex.dotBg : '#F1EFE8',
                          color: isActive ? tHex.dotText : '#B4B2A9',
                        }}
                      >
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{t.label}</div>
                        <div className="text-xs text-gray-500 truncate">{t.requirement} · {t.commission}</div>
                      </div>
                      <div className="text-sm font-medium w-5 text-right flex-shrink-0" style={{ color: isActive ? tHex.accent : '#D3D1C7' }}>
                        {isPast ? '✓' : isCurrent ? '→' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Earnings tab ── */}
        {tab === 'earnings' && (
          <div className="pt-5">
            <EarningsTab />
          </div>
        )}

        {/* ── Payouts tab ── */}
        {tab === 'payouts' && (
          <div className="pt-5">
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

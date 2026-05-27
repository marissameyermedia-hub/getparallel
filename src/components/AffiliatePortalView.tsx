import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Copy, Check, Share2, Users, Star, Mic, Anchor, Clock, CheckCircle2, AlertCircle, DollarSign, ShieldCheck, Link2, Tag } from 'lucide-react';
import { supabase } from '../utils/supabase/client';

const PERSONA_TEMPLATE_ID = 'itmpl_w7GgvrzeQ8P6sopBcayQBcBP39gG';
const PERSONA_ENV = 'production';

// ── Types ─────────────────────────────────────────────────────────────────────

type AffiliateTier = 'seeds' | 'voices' | 'anchors';
type AppAuditStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_info';
type AffiliateStatus = 'pending' | 'approved' | 'active' | 'paused' | 'banned';

interface AffiliateApplication {
  id: string;
  tier_applied_for: AffiliateTier;
  audit_status: AppAuditStatus;
  persona_status: string;
  created_at: string;
}

interface AffiliateRow {
  id: string;
  display_name: string;
  tier: AffiliateTier;
  status: AffiliateStatus;
  commission_rate: number;
  subscription_discount_pct: number;
  promo_code: string | null;
  tracked_link_slug: string | null;
  total_conversions: number;
  total_paid_lifetime: number;
}

interface Payout {
  id: string;
  period_start: string;
  period_end: string;
  net_amount: number;
  mercury_status: string;
  paid_at: string | null;
  created_at: string;
}

interface Attribution {
  id: string;
  attribution_method: 'cookie' | 'promo_code' | 'manual';
  promo_code_used: string | null;
  signed_up_at: string;
  commission_amount: number;
  commission_status: 'pending' | 'approved' | 'paid' | 'clawed_back' | 'cancelled';
}

type PortalState = 'loading' | 'apply' | 'submitted' | 'dashboard';

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

// Tailwind classes for apply form tier cards
const TIER_COLORS: Record<AffiliateTier, { bg: string; text: string; border: string }> = {
  seeds:   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  voices:  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  anchors: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
};

// Hex values for dynamic dashboard elements (progress bar, hero, buttons, badge)
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

const TRACKED_LINK_BASE = 'https://getparallel.vip/r';
const AFFILIATE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/affiliate`;

const COMMISSION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Pending',     color: 'text-yellow-600' },
  approved:    { label: 'Approved',    color: 'text-blue-600' },
  paid:        { label: 'Paid',        color: 'text-emerald-600' },
  clawed_back: { label: 'Clawed back', color: 'text-red-500' },
  cancelled:   { label: 'Cancelled',  color: 'text-gray-400' },
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

// ── Apply Form ────────────────────────────────────────────────────────────────

function ApplyForm({ onSubmitted }: { onSubmitted: (app: AffiliateApplication) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [tier, setTier] = useState<AffiliateTier | null>(null);
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [youtube, setYoutube] = useState('');
  const [whyParallel, setWhyParallel] = useState('');
  const [audienceDesc, setAudienceDesc] = useState('');
  const [phase1City, setPhase1City] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!tier) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const res = await fetch(`${AFFILIATE_FN_URL}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
        },
        body: JSON.stringify({
          tier,
          instagram: instagram || null,
          tiktok:    tiktok    || null,
          youtube:   youtube   || null,
          why_parallel:         whyParallel || null,
          audience_description: audienceDesc || null,
          phase1_city_audience: phase1City,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.');
      onSubmitted(data.application as AffiliateApplication);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Please try again.');
    }
    setIsSubmitting(false);
  }

  const hasHandle = instagram.trim() || tiktok.trim() || youtube.trim();

  return (
    <div className="px-5 pb-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Join the Affiliate Army</h2>
        <p className="text-sm text-gray-500">Earn commission for every member you bring to Parallel.</p>
      </div>

      {step === 1 && (
        <>
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
                      onChange={e => set(e.target.value)}
                      placeholder={placeholder}
                      className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder-gray-300"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Why do you want to promote Parallel?</label>
              <textarea
                value={whyParallel}
                onChange={e => setWhyParallel(e.target.value)}
                placeholder="Tell us about your audience and why Parallel resonates with them..."
                rows={3}
                className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 outline-none resize-none"
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={phase1City}
                onChange={e => setPhase1City(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-[#7B5EA7]"
              />
              <span className="text-sm text-gray-700">My audience is primarily in a Phase 1 launch city (NYC, LA, Chicago, SF, Austin, Miami)</span>
            </label>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4 text-sm text-red-600">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
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
              disabled={isSubmitting || !hasHandle}
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

function PendingScreen({ app }: { app: AffiliateApplication }) {
  const needsVerification = app.audit_status === 'approved' && app.persona_status !== 'approved';
  const redirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?affiliate_verified=1`
    : '';
  const personaUrl = `https://withpersona.com/verify?inquiry-template-id=${encodeURIComponent(PERSONA_TEMPLATE_ID)}&reference-id=${encodeURIComponent(`aff_${app.id}`)}&environment=${PERSONA_ENV}&redirect-uri=${encodeURIComponent(redirectUri)}`;

  if (needsVerification) {
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
    pending:    { icon: Clock,         color: 'text-yellow-500', title: 'Application received',    body: "We're reviewing your application. You'll hear from us within a few business days." },
    in_review:  { icon: Clock,         color: 'text-blue-500',   title: 'Under review',            body: "We're actively reviewing your application — hang tight!" },
    approved:   { icon: CheckCircle2,  color: 'text-emerald-500',title: 'Verified!',               body: "Identity confirmed. Your affiliate dashboard is being activated — check back shortly." },
    needs_info: { icon: AlertCircle,   color: 'text-orange-500', title: 'More info needed',        body: "Check your email — we need a bit more information to process your application." },
    rejected:   { icon: AlertCircle,   color: 'text-red-500',    title: 'Application not approved', body: "Thank you for your interest. This tier may not be the right fit right now. You're welcome to reapply in the future." },
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
      <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">{s.body}</p>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function AffiliateDashboard({ affiliate }: { affiliate: AffiliateRow }) {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [attributions, setAttributions] = useState<Attribution[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const trackedLink = affiliate.tracked_link_slug ? `${TRACKED_LINK_BASE}/${affiliate.tracked_link_slug}` : null;
  const hex = TIER_HEX[affiliate.tier];
  const conversions = affiliate.total_conversions;
  const challenge = getChallenge(conversions);
  const progressPct = getProgressPct(conversions, challenge);
  const nudge = SHARE_NUDGES[Math.min(Math.floor(conversions / 20), SHARE_NUDGES.length - 1)];
  const tierOrder: Record<AffiliateTier, number> = { seeds: 0, voices: 1, anchors: 2 };

  useEffect(() => {
    supabase
      .from('affiliate_payouts')
      .select('id,period_start,period_end,net_amount,mercury_status,paid_at,created_at')
      .eq('affiliate_id', affiliate.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setPayouts(data ?? []));

    supabase
      .from('affiliate_attributions')
      .select('id,attribution_method,promo_code_used,signed_up_at,commission_amount,commission_status')
      .eq('affiliate_id', affiliate.id)
      .order('signed_up_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setAttributions((data ?? []) as Attribution[]));
  }, [affiliate.id]);

  const handleCopyLink = () => {
    if (!trackedLink) return;
    navigator.clipboard.writeText(trackedLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleCopyCode = () => {
    if (!affiliate.promo_code) return;
    navigator.clipboard.writeText(affiliate.promo_code).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Join Parallel',
      text: affiliate.promo_code
        ? `Use code ${affiliate.promo_code} for ${affiliate.subscription_discount_pct}% off your first month on Parallel!`
        : 'Join Parallel — real compatibility, real matches.',
      url: trackedLink ?? 'https://getparallel.vip',
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else handleCopyLink();
    } catch { /* user cancelled */ }
  };

  return (
    <div className="pt-16 max-w-lg mx-auto px-5 pb-8">

      {/* ── Hero: referral count ── */}
      <div className="text-center pt-8 pb-2">
        <div
          className="text-8xl font-medium leading-none mb-2 transition-colors duration-500"
          style={{ color: hex.accent }}
        >
          {conversions}
        </div>
        <div className="text-xs uppercase tracking-widest text-gray-500">members referred</div>
        {Number(affiliate.total_paid_lifetime) > 0 && (
          <div className="text-sm text-gray-400 mt-1">
            ${Number(affiliate.total_paid_lifetime).toFixed(2)} earned total
          </div>
        )}
      </div>

      {/* ── Progress bar ── */}
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

      {/* ── Share section ── */}
      <div className="mt-8">
        <div className="text-center text-sm text-gray-500 italic mb-4 px-4 leading-relaxed">
          {nudge}
        </div>

        {trackedLink ? (
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
                <Share2 size={16} aria-hidden="true" />
                Share
              </button>
            </div>
            <div className="text-center text-xs text-gray-300 font-mono break-all mb-4">
              {trackedLink}
            </div>
          </>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl p-4 text-sm text-gray-500 text-center mb-4">
            Your tracked link is being set up — check back soon.
          </div>
        )}

        {affiliate.promo_code && (
          <button
            onClick={handleCopyCode}
            className="w-full flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3.5 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Tag size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500 mr-1">Promo code</span>
              <span className="font-mono text-sm font-semibold text-gray-900">{affiliate.promo_code}</span>
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

      {/* ── Tier ladder ── */}
      <div className="mt-8">
        <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Affiliate tiers</div>
        <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-100 bg-white">
          {TIERS.map((t, i) => {
            const isCurrent = affiliate.tier === t.id;
            const isPast = tierOrder[affiliate.tier] > i;
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

      {/* ── Recent referrals ── */}
      <div className="mt-8">
        <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Recent referrals</div>
        {attributions.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 text-center">
            <Users size={20} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No referrals yet — share your link or promo code to get started!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attributions.map(attr => {
              const statusInfo = COMMISSION_STATUS_LABELS[attr.commission_status] ?? { label: attr.commission_status, color: 'text-gray-500' };
              return (
                <div key={attr.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {attr.attribution_method === 'promo_code'
                      ? <Tag size={14} className="text-[#7B5EA7] flex-shrink-0" />
                      : <Link2 size={14} className="text-gray-400 flex-shrink-0" />
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {attr.attribution_method === 'promo_code' ? 'Promo code' : 'Tracked link'}
                        {attr.promo_code_used ? ` · ${attr.promo_code_used}` : ''}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(attr.signed_up_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</p>
                    <p className="text-sm font-bold text-gray-900 tabular-nums">
                      {Number(attr.commission_amount) > 0
                        ? `$${Number(attr.commission_amount).toFixed(2)}`
                        : '—'
                      }
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Payout history ── */}
      {payouts.length > 0 && (
        <div className="mt-8">
          <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Payout history</div>
          <div className="space-y-2">
            {payouts.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(p.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' – '}
                    {new Date(p.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">{p.mercury_status.replace('_', ' ')}</p>
                </div>
                <span className="text-sm font-bold text-gray-900 tabular-nums">
                  ${p.net_amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Portal (state machine) ────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
}

export function AffiliatePortalView({ onBack }: Props) {
  const [state, setState] = useState<PortalState>('loading');
  const [affiliate, setAffiliate] = useState<AffiliateRow | null>(null);
  const [application, setApplication] = useState<AffiliateApplication | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setState('apply'); return; }

      const selectFields = 'id,display_name,tier,status,commission_rate,subscription_discount_pct,promo_code,tracked_link_slug,total_conversions,total_paid_lifetime';

      // Query by user_id first; if the affiliates row was created before user_id was set,
      // fall back to email so the dashboard isn't gated on user_id being populated.
      const { data: affById } = await supabase
        .from('affiliates')
        .select(selectFields)
        .eq('user_id', user.id)
        .maybeSingle();

      let aff: AffiliateRow | null = affById;

      if (!aff && user.email) {
        const { data: affByEmail } = await supabase
          .from('affiliates')
          .select(selectFields)
          .eq('email', user.email)
          .maybeSingle();
        aff = affByEmail;
      }

      const { data: apps } = await supabase
        .from('affiliate_applications')
        .select('id,tier_applied_for,audit_status,persona_status,created_at')
        .eq('email', user.email ?? '')
        .order('created_at', { ascending: false })
        .limit(1);

      if (aff && (aff.status === 'active' || aff.status === 'approved')) {
        setAffiliate(aff);
        setState('dashboard');
      } else if (apps && apps.length > 0) {
        setApplication(apps[0]);
        setState('submitted');
      } else {
        setState('apply');
      }
    }
    load();
  }, []);

  const hex = affiliate ? TIER_HEX[affiliate.tier] : null;
  const tierLabel = affiliate ? TIERS.find(t => t.id === affiliate.tier)?.label : null;

  return (
    <div className="min-h-screen bg-parallel-cream">
      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 bg-parallel-cream z-10 border-b border-gray-100">
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
            <ApplyForm onSubmitted={(app) => { setApplication(app); setState('submitted'); }} />
          </div>
        )}
        {state === 'submitted' && application && (
          <div className="pt-24">
            <PendingScreen app={application} />
          </div>
        )}
        {state === 'dashboard' && affiliate && (
          <AffiliateDashboard affiliate={affiliate} />
        )}
      </div>
    </div>
  );
}

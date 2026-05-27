import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Copy, Check, Users, Star, Mic, Anchor, Clock, CheckCircle2, AlertCircle, DollarSign, ShieldCheck } from 'lucide-react';
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
    commission: '20% — $29.80/member',
    description: 'Growing creators building their audience.',
    requirement: '1K–10K followers',
  },
  {
    id: 'voices',
    label: 'Voices',
    icon: Mic,
    commission: '25% — $37.25/member',
    description: 'Established voices with engaged communities.',
    requirement: '10K–100K followers',
  },
  {
    id: 'anchors',
    label: 'Anchors',
    icon: Anchor,
    commission: '30% — $44.70/member',
    description: 'Powerhouse partners with major reach.',
    requirement: '100K+ followers',
  },
];

const TIER_COLORS: Record<AffiliateTier, { bg: string; text: string; border: string }> = {
  seeds:   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  voices:  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  anchors: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
};

const TRACKED_LINK_BASE = 'https://getparallel.vip/r';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function CopyField({ label, value }: { label: string; value: string }) {
  const { copied, copy } = useCopy(value);
  return (
    <div className="bg-gray-50 rounded-2xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-gray-900 truncate">{value}</span>
        <button
          onClick={copy}
          className="flex-shrink-0 flex items-center gap-1 text-xs text-[#7B5EA7] font-medium"
        >
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ── Apply Form ────────────────────────────────────────────────────────────────

function ApplyForm({ onSubmitted }: { onSubmitted: () => void }) {
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Not signed in');
      const { error: err } = await supabase.from('affiliate_applications').insert({
        email: user.email,
        tier_applied_for: tier,
        instagram_handle: instagram.replace('@', '') || null,
        tiktok_handle: tiktok.replace('@', '') || null,
        youtube_handle: youtube.replace('@', '') || null,
        why_parallel: whyParallel || null,
        audience_description: audienceDesc || null,
        phase1_city_audience: phase1City,
      });
      if (err) throw err;
      onSubmitted();
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
    pending:    { icon: Clock,         color: 'text-yellow-500', title: 'Application received',   body: "We're reviewing your application. You'll hear from us within a few business days." },
    in_review:  { icon: Clock,         color: 'text-blue-500',   title: 'Under review',           body: "We're actively reviewing your application — hang tight!" },
    approved:   { icon: CheckCircle2,  color: 'text-emerald-500',title: 'Verified!',              body: "Identity confirmed. Your affiliate dashboard is being activated — check back shortly." },
    needs_info: { icon: AlertCircle,   color: 'text-orange-500', title: 'More info needed',       body: "Check your email — we need a bit more information to process your application." },
    rejected:   { icon: AlertCircle,   color: 'text-red-500',    title: 'Application not approved',body: "Thank you for your interest. This tier may not be the right fit right now. You're welcome to reapply in the future." },
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
  const trackedLink = affiliate.tracked_link_slug ? `${TRACKED_LINK_BASE}/${affiliate.tracked_link_slug}` : null;
  const colors = TIER_COLORS[affiliate.tier];

  useEffect(() => {
    supabase
      .from('affiliate_payouts')
      .select('id,period_start,period_end,net_amount,mercury_status,paid_at,created_at')
      .eq('affiliate_id', affiliate.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setPayouts(data ?? []));
  }, [affiliate.id]);

  return (
    <div className="px-5 pb-8">
      <div className={`rounded-3xl border-2 p-5 mb-5 ${colors.bg} ${colors.border}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-bold uppercase tracking-wider ${colors.text}`}>
            {affiliate.tier} affiliate
          </span>
        </div>
        <p className="font-bold text-gray-900 text-lg">{affiliate.display_name}</p>
        <p className="text-sm text-gray-500">{(affiliate.commission_rate * 100).toFixed(0)}% commission · {affiliate.subscription_discount_pct}% member discount</p>
      </div>

      <div className="space-y-3 mb-5">
        {affiliate.promo_code && (
          <CopyField label="Promo code" value={affiliate.promo_code} />
        )}
        {trackedLink && (
          <CopyField label="Tracked link" value={trackedLink} />
        )}
        {!affiliate.promo_code && !trackedLink && (
          <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-500 text-center">
            Your promo code & link are being set up — check back soon.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-parallel-cream border-2 border-gray-100 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{affiliate.total_conversions.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-0.5">Members referred</p>
        </div>
        <div className="bg-parallel-cream border-2 border-gray-100 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            ${affiliate.total_paid_lifetime.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Total earned</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Payout history</h3>
        {payouts.length === 0 ? (
          <div className="bg-gray-50 rounded-2xl p-5 text-center">
            <DollarSign size={20} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No payouts yet — they'll appear here after your first referral converts.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payouts.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
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
        )}
      </div>
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

      const [{ data: aff }, { data: apps }] = await Promise.all([
        supabase
          .from('affiliates')
          .select('id,display_name,tier,status,commission_rate,subscription_discount_pct,promo_code,tracked_link_slug,total_conversions,total_paid_lifetime')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('affiliate_applications')
          .select('id,tier_applied_for,audit_status,persona_status,created_at')
          .eq('email', user.email ?? '')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

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

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 h-14 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-xl hover:bg-gray-100 transition-colors">
          <ChevronLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="font-semibold text-gray-900">Affiliate Program</h1>
      </div>

      <div className="pt-5">
        {state === 'loading' && (
          <div className="px-5 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        )}
        {state === 'apply' && <ApplyForm onSubmitted={() => setState('submitted')} />}
        {state === 'submitted' && application && <PendingScreen app={application} />}
        {state === 'dashboard' && affiliate && <AffiliateDashboard affiliate={affiliate} />}
      </div>
    </div>
  );
}

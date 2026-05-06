import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Copy, Share2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { MISC_FUNCTION_URL } from '../utils/supabase/client';
import { publicAnonKey } from '../utils/supabase/info';
import { getAccessToken } from '../utils/auth';

interface InviteViewProps {
  onBack: () => void;
}

// ── Tier config ────────────────────────────────────────────────────────────────
// Matches exactly what the backend getTierName() function returns.
// Pioneer → Trailblazer → Star → Icon → Legend
const TIERS = [
  {
    name: 'Pioneer',
    min: 1, max: 9,
    dotBg: '#EEEDFE', dotText: '#534AB7',
    badgeBg: '#EEEDFE', badgeText: '#534AB7',
    bar: '#A98FD0', btn: '#7B5EA7',
    bannerBg: '#EEEDFE', bannerText: '#534AB7',
    unlockTitle: 'Welcome, Pioneer.',
    unlockSub: 'You started a ripple. The pool is growing because of you.',
  },
  {
    name: 'Trailblazer',
    min: 10, max: 19,
    dotBg: '#E1F5EE', dotText: '#0F6E56',
    badgeBg: '#E1F5EE', badgeText: '#0F6E56',
    bar: '#1D9E75', btn: '#0F6E56',
    bannerBg: '#E1F5EE', bannerText: '#0F6E56',
    unlockTitle: "You're a Trailblazer.",
    unlockSub: '10 ripples. You\'re building something real.',
  },
  {
    name: 'Star',
    min: 20, max: 34,
    dotBg: '#FAEEDA', dotText: '#854F0B',
    badgeBg: '#FAEEDA', badgeText: '#854F0B',
    bar: '#EF9F27', btn: '#BA7517',
    bannerBg: '#FAEEDA', bannerText: '#854F0B',
    unlockTitle: "You're a Star.",
    unlockSub: '20 ripples. The pool is growing because of you.',
  },
  {
    name: 'Icon',
    min: 35, max: 49,
    dotBg: '#FAECE7', dotText: '#993C1D',
    badgeBg: '#FAECE7', badgeText: '#993C1D',
    bar: '#D85A30', btn: '#993C1D',
    bannerBg: '#FAECE7', bannerText: '#993C1D',
    unlockTitle: "You're an Icon.",
    unlockSub: '35 ripples. You might be the reason someone finds their person.',
  },
  {
    name: 'Legend',
    min: 50, max: Infinity,
    dotBg: '#0D0D0F', dotText: '#FFFFFF',
    badgeBg: '#0D0D0F', badgeText: '#FFFFFF',
    bar: '#0D0D0F', btn: '#0D0D0F',
    bannerBg: '#0D0D0F', bannerText: '#FFFFFF',
    unlockTitle: 'Parallel Legend.',
    unlockSub: "50 ripples. There's no tier above this. You're it.",
  },
];

const MILESTONES = [0, 5, 10, 20, 35, 50];

const CHALLENGES = [
  { from: 0, to: 5, text: 'Send your first 5 ripples' },
  { from: 5, to: 10, text: "You're on your way — reach 10" },
  { from: 10, to: 20, text: '10 down. Can you hit 20?' },
  { from: 20, to: 35, text: 'Star status — push to Icon' },
  { from: 35, to: 50, text: 'Icon status — 15 more to Legend' },
  { from: 50, to: null, text: "You're a Parallel Legend" },
];

const SHARE_NUDGES = [
  "Know someone who's done with apps?",
  "Who in your life actually wants a real relationship?",
  "The pool gets better with every real person.",
  "Someone in your contacts deserves a real match.",
  "At this point you're basically a matchmaker.",
];

function getTier(ripples: number) {
  if (ripples < 1) return null;
  return TIERS.find(t => ripples >= t.min && ripples <= t.max) ?? TIERS[TIERS.length - 1];
}

function getChallenge(ripples: number) {
  for (let i = CHALLENGES.length - 1; i >= 0; i--) {
    if (ripples >= CHALLENGES[i].from) return CHALLENGES[i];
  }
  return CHALLENGES[0];
}

function getProgressPct(ripples: number, ch: typeof CHALLENGES[0]) {
  if (!ch.to) return 100;
  return Math.min(100, Math.round(((ripples - ch.from) / (ch.to - ch.from)) * 100));
}

// Pill for friend status
const STATUS_PILL: Record<string, { bg: string; text: string; label: string }> = {
  subscribed: { bg: '#E1F5EE', text: '#085041', label: 'founding member' },
  joined:     { bg: '#EEEDFE', text: '#3C3489', label: 'in the pool' },
  sent:       { bg: '#F1EFE8', text: '#5F5E5A', label: 'link sent' },
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface Friend {
  firstName: string;
  status: 'sent' | 'joined' | 'subscribed';
}

interface DashboardData {
  code: string;
  referralLink: string;
  rippleCount: number;
  directRippleCount: number;
  indirectRippleCount: number;
  tier: string;
  nextMilestone: number | null;
  friendsInvited: number;
  friendsSubscribed: number;
  friends: Friend[];
}

// ── Component ──────────────────────────────────────────────────────────────────
export function InviteView({ onBack }: InviteViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Track previous tier so we can detect a tier-up and show the celebration banner
  const prevTierNameRef = useRef<string | null>(null);
  const [unlockBanner, setUnlockBanner] = useState<{ title: string; sub: string; bg: string; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const token = await getAccessToken();
      if (!token) { setIsLoading(false); return; }
      try {
        const res = await fetch(`${MISC_FUNCTION_URL}/referral/dashboard`, {
          headers: { Authorization: `Bearer ${token}`, apikey: publicAnonKey },
        });
        if (res.ok) {
          const d: DashboardData = await res.json();
          setData(d);
          // Don't show banner on initial load — only on live tier-ups in session
          prevTierNameRef.current = d.tier;
        }
      } catch (err) {
        console.error('[InviteView] failed to load dashboard:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (!data && !isLoading) return null;

  const ripples = data?.rippleCount ?? 0;
  const tier = getTier(ripples);
  const challenge = getChallenge(ripples);
  const progressPct = getProgressPct(ripples, challenge);
  const referralLink = data?.referralLink ?? 'https://getparallel.vip';
  // The fallback link doesn't include ?ref=CODE — sharing it would credit
  // nobody. Treat the share buttons as "still loading" until the real link
  // (with the user's referral code) lands. Belt-and-suspenders on top of
  // the isLoading gate, in case /referral/dashboard returns 200 with an
  // empty referralLink.
  const hasValidReferralLink = !!data?.referralLink && data.referralLink.includes('ref=');
  const nudge = SHARE_NUDGES[Math.min(Math.floor(ripples / 12), SHARE_NUDGES.length - 1)];

  const accentColor = tier?.bar ?? '#7B5EA7';
  const btnColor = tier?.btn ?? '#7B5EA7';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success('Link copied!', { duration: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Failed to copy link'); }
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Join me on Parallel',
      text: `${nudge} Join me on Parallel — a matchmaking app that actually matches you based on what matters most. ${referralLink}`,
      url: referralLink,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await handleCopy();
    } catch { /* user cancelled */ }
  };

  return (
    <div className="min-h-screen bg-parallel-cream pb-24">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 bg-parallel-cream z-10 border-b border-gray-100">
        <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
          <button
            onClick={onBack}
            aria-label="Go back"
            className="p-2 -ml-2 hover:bg-gray-50 rounded-full transition-colors"
          >
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
          <h1 className="font-medium text-base absolute left-1/2 -translate-x-1/2">Your Ripples</h1>
          {/* Tier badge */}
          {tier && (
            <div
              className="text-xs font-medium px-3 py-1 rounded-full uppercase tracking-wide"
              style={{ background: tier.badgeBg, color: tier.badgeText }}
            >
              {tier.name}
            </div>
          )}
          {!tier && <div className="w-16" />}
        </div>
      </div>

      <div className="pt-16 max-w-lg mx-auto px-5">

        {/* ── Hero: Ripple count ── */}
        <div className="text-center pt-8 pb-2">
          {isLoading ? (
            <div className="h-20 w-24 bg-gray-100 rounded-2xl animate-pulse mx-auto mb-3" />
          ) : (
            <div
              className="text-8xl font-medium leading-none mb-2 transition-colors duration-500"
              style={{ color: accentColor }}
            >
              {ripples}
            </div>
          )}
          <div className="text-xs uppercase tracking-widest text-gray-400">ripples started</div>
          {data && data.indirectRippleCount > 0 && (
            <div className="text-xs text-gray-400 mt-1">
              {data.directRippleCount} direct · {data.indirectRippleCount} through your referrals
            </div>
          )}
        </div>

        {/* ── Tier unlock celebration banner ── */}
        {unlockBanner && (
          <div
            className="mx-0 mt-4 rounded-2xl p-4 text-center"
            style={{ background: unlockBanner.bg }}
          >
            <div className="font-medium text-base mb-1" style={{ color: unlockBanner.text }}>
              {unlockBanner.title}
            </div>
            <div className="text-sm opacity-80" style={{ color: unlockBanner.text }}>
              {unlockBanner.sub}
            </div>
          </div>
        )}

        {/* ── Progress bar ── */}
        <div className="mt-6">
          <div className="flex justify-between items-baseline mb-2">
            <div className="text-sm font-medium text-gray-900">
              {isLoading ? '—' : challenge.text}
            </div>
            {challenge.to && !isLoading && (
              <div className="text-xs text-gray-400">{ripples} / {challenge.to}</div>
            )}
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: isLoading ? '0%' : `${progressPct}%`, background: accentColor }}
            />
          </div>
          {/* Milestone dots */}
          <div className="flex justify-between mt-2">
            {MILESTONES.map(m => (
              <div key={m} className="text-center">
                <div
                  className="w-1.5 h-1.5 rounded-full mx-auto mb-1 transition-colors duration-300"
                  style={{ background: ripples >= m ? accentColor : '#E8E4DE' }}
                />
                <div
                  className="text-[10px] transition-colors duration-300"
                  style={{ color: ripples >= m ? '#888780' : '#D3D1C7' }}
                >
                  {m}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Share CTA ── */}
        <div className="mt-8">
          {/* Nudge copy */}
          <div className="text-center text-sm text-gray-500 italic mb-4 px-4 leading-relaxed">
            "{nudge}"
          </div>

          {/* Share buttons.
              Skeleton stays up while either (a) the dashboard call is in
              flight, or (b) it returned without a real ?ref= link. Prevents
              the user from sharing a code-less URL that credits nobody. */}
          {isLoading || !hasValidReferralLink ? (
            <div className="h-12 bg-gray-100 rounded-full animate-pulse" aria-label="Loading share link" />
          ) : (
            <div className="flex gap-3">
              <button
                onClick={handleCopy}
                className="flex-1 border border-gray-200 bg-parallel-cream text-gray-800 px-5 py-3.5 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                aria-label="Copy referral link"
              >
                {copied ? <><Check size={16} aria-hidden="true" />Copied!</> : <><Copy size={16} aria-hidden="true" />Copy link</>}
              </button>
              <button
                onClick={handleShare}
                className="flex-1 text-parallel-cream px-5 py-3.5 rounded-full text-sm font-medium transition-colors flex items-center justify-center gap-2"
                style={{ background: btnColor }}
                aria-label="Share referral link"
              >
                <Share2 size={16} aria-hidden="true" />
                Share
              </button>
            </div>
          )}

          {/* Link display */}
          {!isLoading && (
            <div className="mt-3 text-center text-xs text-gray-300 font-mono break-all">
              {referralLink}
            </div>
          )}
        </div>

        {/* ── Tier ladder ── */}
        <div className="mt-8">
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Ripple tiers</div>
          <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-100">
            {TIERS.map((t, i) => {
              const active = ripples >= t.min;
              const current = tier?.name === t.name;
              const past = active && !current && ripples > t.max;
              return (
                <div
                  key={t.name}
                  className="flex items-center gap-3 px-4 py-3 transition-opacity duration-300"
                  style={{ opacity: active ? 1 : 0.35 }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 transition-colors duration-400"
                    style={{
                      background: active ? t.dotBg : '#F1EFE8',
                      color: active ? t.dotText : '#B4B2A9',
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{t.name}</div>
                    <div className="text-xs text-gray-400">{t.min === 50 ? '50+ ripples' : `${t.min}–${t.max} ripples`}</div>
                  </div>
                  <div
                    className="text-sm font-medium w-5 text-right transition-colors duration-300"
                    style={{ color: active ? t.bar : '#D3D1C7' }}
                  >
                    {past ? '✓' : current ? '→' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Friends list ── */}
        {!isLoading && (data?.friends?.length ?? 0) > 0 && (
          <div className="mt-8">
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Your referrals</div>
            <div className="space-y-2">
              {data!.friends.map((friend, idx) => {
                const pill = STATUS_PILL[friend.status];
                const pipDone = '#7B5EA7';
                const pipEmpty = '#E8E4DE';
                const steps: Array<{ key: 'sent' | 'joined' | 'subscribed'; label: string }> = [
                  { key: 'sent', label: 'link sent' },
                  { key: 'joined', label: 'joined' },
                  { key: 'subscribed', label: 'subscribed' },
                ];
                const statusOrder = { sent: 0, joined: 1, subscribed: 2 };
                const currentOrder = statusOrder[friend.status];

                return (
                  <div key={idx} className="bg-parallel-cream border border-gray-100 rounded-2xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
                        style={{ background: '#EEEDFE', color: '#3C3489' }}
                        aria-hidden="true"
                      >
                        {friend.firstName.charAt(0).toUpperCase()}
                      </div>
                      <div className="font-medium text-sm text-gray-900 flex-1">{friend.firstName}</div>
                      <div
                        className="text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{ background: pill.bg, color: pill.text }}
                      >
                        {pill.label}
                      </div>
                    </div>
                    {/* Three-pip progress track */}
                    <div className="flex items-center gap-1">
                      {steps.map((step, si) => {
                        const done = currentOrder >= statusOrder[step.key];
                        return (
                          <div key={step.key} className="flex items-center gap-1 flex-1">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: done ? pipDone : pipEmpty }}
                            />
                            <div
                              className="text-[10px]"
                              style={{ color: done ? '#888780' : '#D3D1C7' }}
                            >
                              {step.label}
                            </div>
                            {si < steps.length - 1 && (
                              <div className="flex-1 h-px max-w-[10px]" style={{ background: '#E8E4DE' }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── What is a ripple? ── */}
        <div className="mt-8 bg-gray-50 rounded-2xl p-5">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-2">What is a ripple?</div>
          <p className="text-sm text-gray-600 leading-relaxed">
            A ripple is someone who joined the matching pool because of you — directly or through someone you referred. Every real person who completes their profile makes the pool better for everyone.
          </p>
        </div>

      </div>
    </div>
  );
}

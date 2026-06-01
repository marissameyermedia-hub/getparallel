import { ArrowRight, CheckCircle } from 'lucide-react';
import { AppFooter } from './AppFooter';

interface Props {
  onNavigate?: (view: string) => void;
}

export function AffiliateLandingPage({ onNavigate }: Props) {
  return (
    <div className="min-h-screen bg-parallel-cream text-parallel-void">
      {/* ── Header ── */}
      <header className="sticky top-0 bg-parallel-cream/95 backdrop-blur-sm border-b border-gray-100 z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full bg-parallel-void flex items-center justify-center"
              aria-hidden="true"
            >
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  letterSpacing: '.02em',
                  userSelect: 'none',
                }}
              >
                P<span style={{ color: '#A98FD0' }}>//</span>
              </span>
            </div>
            <span className="text-sm font-semibold tracking-tight">PARA//EL</span>
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center">
        <p className="text-xs tracking-[0.25em] uppercase text-[#7B5EA7] font-semibold mb-4">
          Affiliate Program
        </p>
        <h1 className="text-4xl font-bold tracking-tight mb-4 leading-tight">
          Earn by growing<br />the pool.
        </h1>
        <p className="text-gray-500 text-base leading-relaxed max-w-md mx-auto mb-8">
          Share Parallel with your audience. Earn up to 20% commission on every subscription you
          refer — monthly, on autopilot.
        </p>
        <a
          href="/?view=affiliate-portal"
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-parallel-void text-parallel-cream font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Apply to the Affiliate Program
          <ArrowRight size={16} />
        </a>
        <p className="text-xs text-gray-400 mt-3">
          Open application — not everyone is approved.
        </p>
      </section>

      {/* ── How it works ── */}
      <section className="bg-white border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h2 className="text-xl font-semibold text-center mb-8">How it works</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {([
              {
                n: '1',
                title: 'Apply',
                body: 'Submit your application. Our team reviews your fit within a few business days.',
              },
              {
                n: '2',
                title: 'Share',
                body: 'Get your unique tracked link and promo code. Share with your audience anywhere.',
              },
              {
                n: '3',
                title: 'Earn',
                body: 'Earn commission every month on active subscriptions referred by your link.',
              },
            ] as const).map(({ n, title, body }) => (
              <div key={n} className="text-center">
                <div className="w-10 h-10 rounded-full bg-[#F5F0FF] text-[#7B5EA7] font-bold text-base flex items-center justify-center mx-auto mb-3">
                  {n}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tiers ── */}
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-xl font-semibold text-center mb-2">Tiers</h2>
        <p className="text-sm text-gray-500 text-center mb-8 max-w-xs mx-auto">
          Your tier is based on audience size. Higher tier = higher commission.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {([
            {
              label: 'Tier 1',
              commission: '10%',
              discount: '20%',
              range: '1K–10K followers',
              bg: 'bg-emerald-50',
              text: 'text-emerald-700',
              border: 'border-emerald-200',
            },
            {
              label: 'Tier 2',
              commission: '15%',
              discount: '25%',
              range: '10K–100K followers',
              bg: 'bg-purple-50',
              text: 'text-purple-700',
              border: 'border-purple-200',
            },
            {
              label: 'Tier 3',
              commission: '20%',
              discount: '30%',
              range: '100K+ followers',
              bg: 'bg-purple-50',
              text: 'text-purple-700',
              border: 'border-purple-200',
            },
          ] as const).map(({ label, commission, discount, range, bg, text, border }) => (
            <div key={label} className={`rounded-2xl border p-5 ${bg} ${border}`}>
              <p className={`font-semibold text-sm mb-3 ${text}`}>{label}</p>
              <p className={`text-3xl font-bold ${text} mb-0.5`}>{commission}</p>
              <p className="text-xs text-gray-500 mb-3">commission per subscription</p>
              <p className="text-xs text-gray-600">
                {discount} member discount · {range}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What you get ── */}
      <section className="bg-white border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h2 className="text-xl font-semibold text-center mb-8">What you get</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-w-lg mx-auto">
            {[
              'Unique tracked link and promo code',
              'Real-time earnings dashboard',
              'Monthly ACH payouts',
              'Brand assets and guidelines',
              'Dedicated affiliate support',
              'Commission on every referral subscription',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle size={16} className="text-[#7B5EA7] mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-xl font-semibold text-center mb-8">Common questions</h2>
        <div className="space-y-4 max-w-xl mx-auto">
          {([
            {
              q: 'Who can apply?',
              a: 'Anyone — but we look for creators, coaches, podcasters, newsletter writers, and community builders whose audience values intentional relationships.',
            },
            {
              q: 'How does commission work?',
              a: 'You earn a percentage of every active Parallel subscription referred by your link or promo code, paid out monthly via ACH.',
            },
            {
              q: 'When do I get paid?',
              a: 'Payouts are reviewed and processed around the 1st of each month.',
            },
            {
              q: "What if I'm rejected?",
              a: 'You can reapply directly through the portal. We review everyone on a rolling basis as the program grows.',
            },
            {
              q: "Do I need to be a Parallel member?",
              a: "No. Affiliate accounts are completely separate from the matching service. You're here to grow the pool and earn.",
            },
          ] as const).map(({ q, a }) => (
            <div key={q} className="border border-gray-200 rounded-2xl p-4">
              <p className="font-medium text-gray-900 text-sm mb-1">{q}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="bg-parallel-void text-parallel-cream">
        <div className="max-w-3xl mx-auto px-6 py-14 text-center">
          <h2 className="text-2xl font-bold mb-3">Ready to grow together?</h2>
          <p className="text-gray-400 text-sm mb-8 max-w-sm mx-auto leading-relaxed">
            Apply to the Parallel Affiliate Program. Build something real with us.
          </p>
          <a
            href="/?view=affiliate-portal"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#7B5EA7] text-white font-semibold text-sm hover:bg-[#6a4e96] transition-colors"
          >
            Apply to the Affiliate Program
            <ArrowRight size={16} />
          </a>
          <p className="text-xs text-gray-500 mt-4">
            Questions?{' '}
            <a
              href="mailto:hello@getparallel.vip"
              className="text-gray-400 hover:text-gray-200 underline transition-colors"
            >
              hello@getparallel.vip
            </a>
          </p>
        </div>
      </section>

      {onNavigate && <AppFooter onNavigate={onNavigate} />}
    </div>
  );
}

import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

interface WelcomeScreenProps {
  onContinue: () => void;
  userName?: string;
}

export function WelcomeScreen({ onContinue, userName }: WelcomeScreenProps) {
  const firstName = userName?.split(' ')[0];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F5F2EE' }}>

      {/* ── Scrollable content ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center px-6 pt-10 pb-36 overflow-auto">
        <div className="max-w-md w-full">

          {/* ── P// circle mark ─────────────────────────────────── */}
          {/* Brand rule: P// circle is the in-app mark.
              Void (#0D0D0F) circle, Cream P, Soft Violet // on dark bg. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-center mb-6"
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: '#0D0D0F' }}
              aria-hidden="true"
            >
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#F5F2EE',
                  letterSpacing: '0.02em',
                  lineHeight: 1,
                  userSelect: 'none',
                }}
              >
                P<span style={{ color: '#A98FD0' }}>//</span>
              </span>
            </div>
          </motion.div>

          {/* ── Headline ────────────────────────────────────────── */}
          {/* "Here's how Para//el works." — approved locked headline.
              // in Purple (#7B5EA7) on light bg — brand rule. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="text-center mb-6"
          >
            {firstName && (
              <p
                className="font-medium mb-3 uppercase"
                style={{ fontSize: '10px', color: '#8A8690', letterSpacing: '0.14em' }}
              >
                You're in, {firstName}
              </p>
            )}
            <h1
              className="font-semibold leading-tight"
              style={{
                fontSize: '28px',
                letterSpacing: '-0.022em',
                color: '#0D0D0F',
              }}
            >
              Here's how Para
              <span style={{ color: '#7B5EA7' }}>//</span>
              el works.
            </h1>
          </motion.div>

          {/* ── // divider — brand motif as UI element ──────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.18 }}
            className="flex items-center gap-3 mb-7"
            aria-hidden="true"
          >
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#7B5EA7', lineHeight: 1 }}>
              //
            </span>
            <span className="flex-1" style={{ height: '0.5px', background: '#E8E4DE' }} />
          </motion.div>

          {/* ── Steps ───────────────────────────────────────────── */}
          {/* Numbered 1-2-3, Void circles, Linen borders between steps. */}
          <div className="mb-7">
            {[
              {
                num: '1',
                title: 'Answer the questionnaire',
                body: '68 questions on values, lifestyle, attraction, and dealbreakers. About 15 minutes. Saves automatically — come back anytime.',
                pill: 'The only part that drives your matches',
                delay: 0.22,
              },
              {
                num: '2',
                title: 'Set up your profile',
                body: 'Add photos and a short bio. We keep it brief — the questionnaire already tells us who you are.',
                pill: null,
                delay: 0.30,
              },
              {
                num: '3',
                title: 'Get matched',
                body: 'Compatibility scored, reasons explained, identity verified. We tell you exactly why we paired you.',
                pill: null,
                delay: 0.38,
              },
            ].map((step, i, arr) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: step.delay, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-4 py-4"
                style={{
                  borderBottom: i < arr.length - 1 ? '0.5px solid #E8E4DE' : 'none',
                }}
              >
                {/* Void number circle */}
                <div
                  className="rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    width: '28px',
                    height: '28px',
                    background: '#0D0D0F',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#F5F2EE',
                  }}
                  aria-hidden="true"
                >
                  {step.num}
                </div>
                <div>
                  <p
                    className="font-semibold mb-1"
                    style={{ fontSize: '13px', color: '#0D0D0F', letterSpacing: '-0.01em' }}
                  >
                    {step.title}
                  </p>
                  <p style={{ fontSize: '13px', color: '#8A8690', lineHeight: 1.6 }}>
                    {step.body}
                  </p>
                  {step.pill && (
                    /* Purple pill — brand CTA color signals importance */
                    <div
                      className="inline-flex items-center gap-1.5 mt-2 rounded-full"
                      style={{
                        background: '#7B5EA7',
                        color: '#F5F2EE',
                        fontSize: '10px',
                        fontWeight: 500,
                        padding: '3px 10px',
                      }}
                    >
                      <span style={{ color: '#A98FD0' }}>//</span>
                      {step.pill}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── Honest note ─────────────────────────────────────── */}
          {/* Void surface on Cream page — brand emphasis card pattern.
              Cream for strong text, Stone for muted body. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.46 }}
            className="rounded-2xl p-5"
            style={{ background: '#0D0D0F' }}
          >
            <p style={{ fontSize: '13px', lineHeight: 1.65 }}>
              <span style={{ color: '#F5F2EE', fontWeight: 600 }}>
                No right answers. Only honest ones.{' '}
              </span>
              <span style={{ color: '#8A8690' }}>
                The more specific you are, the better your matches. Your individual answers are
                never shown to anyone — only the compatibility result.
              </span>
            </p>
          </motion.div>

        </div>
      </div>

      {/* ── CTA — fixed at bottom ────────────────────────────────── */}
      {/* Purple fill (#7B5EA7), Cream text (#F5F2EE) — locked brand rule.
          Linen top border, Cream bg — never pure white. */}
      <div
        className="fixed bottom-0 left-0 right-0 px-6 pb-10 pt-4"
        style={{ background: '#F5F2EE', borderTop: '0.5px solid #E8E4DE' }}
      >
        <div className="max-w-md mx-auto">
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.52, ease: [0.22, 1, 0.36, 1] }}
            onClick={onContinue}
            className="w-full flex items-center justify-center gap-2 rounded-full font-medium transition-opacity hover:opacity-90"
            style={{
              background: '#7B5EA7',
              color: '#F5F2EE',
              padding: '16px 24px',
              fontSize: '15px',
              letterSpacing: '0.01em',
            }}
          >
            Start the questionnaire
            <ArrowRight size={18} aria-hidden="true" />
          </motion.button>
          <p
            className="text-center mt-3"
            style={{ fontSize: '12px', color: '#8A8690', letterSpacing: '0.02em' }}
          >
            Saves automatically · ~15 minutes
          </p>
        </div>
      </div>

    </div>
  );
}

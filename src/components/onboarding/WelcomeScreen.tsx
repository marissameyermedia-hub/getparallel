import { motion } from 'motion/react';
import { Sparkles, Heart, MessageCircle, ArrowRight } from 'lucide-react';
import { ParallelIcon } from '../ParallelIcon';

interface WelcomeScreenProps {
  onContinue: () => void;
  userName?: string;
}

export function WelcomeScreen({ onContinue, userName }: WelcomeScreenProps) {
  const firstName = userName?.split(' ')[0];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-start px-6 pt-10 pb-32 overflow-auto">
        <div className="max-w-md w-full">

          {/* ── Logo + welcome ──────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="text-center mb-10"
          >
            <div className="w-16 h-16 rounded-full bg-black mx-auto flex items-center justify-center mb-6">
              <ParallelIcon size={32} className="text-parallel-soft-violet" />
            </div>
            <p className="text-xs tracking-[0.2em] uppercase text-gray-400 mb-3 font-medium">
              Welcome to Parallel
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight mb-4">
              {firstName ? `You're in, ${firstName}.` : `You're in.`}
            </h1>
            <p className="text-gray-600 leading-relaxed text-base">
              Before we match you, we need to know who you are and what you're looking for.
              Next up: the questionnaire.
            </p>
          </motion.div>

          {/* ── 3 step map ──────────────────────────────────────── */}
          <div className="space-y-5 mb-10">
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="pt-1.5">
                <h3 className="font-semibold tracking-tight mb-1">The questionnaire</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  68 questions covering values, lifestyle, attraction, dealbreakers, and the life you're building.
                  About 15 minutes. Saves automatically — you can stop and come back anytime.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                <Heart className="w-4 h-4 text-white" />
              </div>
              <div className="pt-1.5">
                <h3 className="font-semibold tracking-tight mb-1">Your profile</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  2–3 photos, a short bio, a few basics. Kept brief on purpose — we'd rather you spend time on the questionnaire.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div className="pt-1.5">
                <h3 className="font-semibold tracking-tight mb-1">Your matches</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  We find the person you're looking for. You'll get a compatibility score and a clear breakdown of why we matched you.
                </p>
              </div>
            </motion.div>
          </div>

          {/* ── Tone-setting note ─────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="rounded-2xl bg-gray-50 border border-gray-100 p-5 mb-4"
          >
            <p className="text-sm text-gray-700 leading-relaxed">
              <span className="font-semibold">One thing before you start:</span> there are no right answers — only honest ones.
              The more specific you are, the better we can match you. Nobody sees your individual answers except you.
            </p>
          </motion.div>

        </div>
      </div>

      {/* ── CTA — fixed at bottom ─────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 px-6 pb-8 pt-4 bg-white border-t border-gray-100">
        <div className="max-w-md mx-auto">
          <button
            onClick={onContinue}
            className="w-full py-4 px-6 rounded-full bg-black text-white font-medium transition-all hover:bg-gray-800 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
          >
            Start the questionnaire
            <ArrowRight size={18} />
          </button>
          <p className="text-center text-xs text-gray-400 mt-3">
            Your progress saves as you go
          </p>
        </div>
      </div>
    </div>
  );
}
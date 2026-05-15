import { motion } from 'motion/react';
import { ArrowRight, ChevronLeft } from 'lucide-react';

interface ChapterTitleProps {
  title: string;
  subtitle: string;
  chapterNumber: number;
  totalChapters?: number;
  onContinue: () => void;
  onBack?: () => void;
  canGoBack?: boolean;
}

const MOTIVATIONAL_COPY: Record<number, string> = {
  1: "Let's start with the basics.",
  2: "Almost done with the essentials.",
  3: "You're making great progress.",
  4: "More than halfway there.",
  5: "Keep going — this is the good stuff.",
  6: "Nearly done with Part 1.",
  7: "This one really matters for matching.",
  8: "Last section before your preferences.",
  9: "Now tell us what you're looking for.",
  10: "Almost finished — great work.",
  11: "Just a few more.",
  12: "You're in the home stretch.",
  13: "Last section — you've got this.",
  14: "Almost there — final step.",
};

export function ChapterTitle({ title, subtitle, chapterNumber, totalChapters, onContinue, onBack, canGoBack }: ChapterTitleProps) {
  const total = totalChapters || 13;
  const progressPercent = Math.round((chapterNumber / total) * 100);
  const motivationalText = MOTIVATIONAL_COPY[chapterNumber] || 'Keep going — great matches await.';

  return (
    <div className="flex flex-col h-full bg-parallel-cream">
      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-8 pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-md w-full mx-auto text-center">

          {/* Progress indicator */}
          <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 uppercase tracking-widest font-medium">
                Section {chapterNumber} of {total}
              </span>
              <span className="text-xs text-gray-500 font-medium">
                {progressPercent}% complete
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <motion.div
                className="bg-parallel-void h-1.5 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2 text-center">{motivationalText}</p>
          </motion.div>

          {/* Chapter number circle */}
          <motion.div
            className="mb-6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', duration: 0.5 }}
          >
            <div
              className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4"
              style={{ backgroundColor: '#000000' }}
            >
              <span className="text-parallel-cream text-2xl font-medium">{chapterNumber}</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-md mx-auto w-full text-center"
          >
            <h1 className="text-4xl font-medium mb-4">{title}</h1>
            <p className="text-xl text-gray-600">{subtitle}</p>
          </motion.div>

        </div>
      </div>

      {/* Sticky footer with CTA + back button */}
      <div
        className="flex-shrink-0 bg-parallel-cream border-t border-gray-100 px-4 pt-3"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto flex items-center gap-3">
          {canGoBack && onBack ? (
            <button
              onClick={onBack}
              aria-label="Go back"
              className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full border-2 border-gray-200 hover:border-parallel-void transition-colors bg-parallel-cream"
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
          ) : (
            <div className="w-12 h-12 flex-shrink-0" />
          )}
          <motion.button
            onClick={onContinue}
            whileTap={{ scale: 0.98 }}
            className="flex-1 py-4 px-6 rounded-full text-parallel-cream flex items-center justify-center gap-2 transition-all hover:shadow-lg text-lg font-medium"
            style={{
              backgroundColor: '#000000',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            }}
          >
            Start this section
            <ArrowRight size={20} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}

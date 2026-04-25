import { motion } from 'motion/react';
import { AlertCircle } from 'lucide-react';

interface DealbreakerExplanationScreenProps {
  onContinue: () => void;
}

export function DealbreakerExplanationScreen({ onContinue }: DealbreakerExplanationScreenProps) {
  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="mb-8 w-24 h-24 rounded-full bg-black flex items-center justify-center"
        >
          <AlertCircle className="w-12 h-12 text-primary" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl font-bold text-center mb-6"
        >
          About Dealbreakers
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4 text-gray-700 text-center max-w-md"
        >
          <p className="text-base leading-relaxed">
            For certain questions, you'll see an option to <span className="font-semibold">mark your answer as a dealbreaker</span>.
          </p>

          <p className="text-base leading-relaxed">
            When you mark something as a dealbreaker, <span className="font-semibold">we will never show you people who don't meet that requirement</span>.
          </p>

          <div className="bg-gray-50 rounded-xl p-4 my-6">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">Remember:</span> The more dealbreakers you add, the fewer matches you may receive — but those matches will be more aligned with what matters most to you.
            </p>
          </div>

          <p className="text-sm text-gray-500">
            You can update your dealbreakers anytime from your profile.
          </p>
        </motion.div>
      </div>

      <div className="p-6">
        <button
          onClick={onContinue}
          className="w-full bg-black text-primary py-4 rounded-full text-lg font-medium hover:bg-gray-800 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

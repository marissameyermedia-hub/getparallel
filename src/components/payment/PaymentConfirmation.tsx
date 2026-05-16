import { useState } from 'react';
import { CheckCircle, ShieldCheck, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface PaymentConfirmationProps {
  onContinue: () => void;
  onVerify?: () => void;
}

export function PaymentConfirmation({ onContinue, onVerify }: PaymentConfirmationProps) {
  const [showVerifyPrompt, setShowVerifyPrompt] = useState(true);

  return (
    <div className="min-h-screen bg-parallel-cream flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, type: 'spring' }}
          className="mb-8"
        >
          <div className="w-24 h-24 bg-parallel-void rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={44} className="text-parallel-cream" />
          </div>
          <h1 className="text-4xl mb-3">You're in.</h1>
          <p className="text-gray-600 leading-relaxed">
            Matches are ready.
          </p>
        </motion.div>

        {showVerifyPrompt && onVerify && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gray-50 border-2 border-gray-200 rounded-3xl p-6 mb-6 text-left"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-parallel-void rounded-full flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={22} className="text-parallel-cream" />
              </div>
              <div className="flex-1">
                <p className="font-semibold mb-1">Get your verified badge</p>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  Takes 2 minutes. Shows matches you're a real person — and helps you stand out.
                </p>
                <button
                  onClick={onVerify}
                  className="w-full bg-parallel-purple text-parallel-cream py-3 rounded-full text-sm font-medium hover:bg-parallel-purple/90 transition-colors flex items-center justify-center gap-2"
                >
                  Verify my identity
                  <ArrowRight size={16} />
                </button>
                <button
                  onClick={() => setShowVerifyPrompt(false)}
                  className="w-full text-gray-500 text-sm py-2 mt-2 hover:text-gray-600 transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {(!showVerifyPrompt || !onVerify) && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={onContinue}
            className="w-full bg-parallel-purple text-parallel-cream py-4 rounded-full font-medium hover:bg-parallel-purple/90 transition-colors"
          >
            See my matches
          </motion.button>
        )}
      </div>
    </div>
  );
}
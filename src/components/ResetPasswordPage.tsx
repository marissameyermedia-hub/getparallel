import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase/client';
import { Eye, EyeOff } from 'lucide-react';
import { ParallelIcon } from './ParallelIcon';
import { ParallelWordmark } from './ParallelWordmark';

interface ResetPasswordPageProps {
  onComplete: () => void;
}

export function ResetPasswordPage({ onComplete }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Supabase automatically exchanges the recovery token from the URL hash
    // and fires onAuthStateChange with event SIGNED_IN or PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setSessionReady(true);
      }
    });

    // Also check if we already have a session from the hash
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async () => {
    setError('');

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'Failed to update password. Please try again.');
      } else {
        await supabase.auth.signOut();
        onComplete();
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    }

    setIsLoading(false);
  };

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-parallel-cream flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <ParallelIcon size={32} className="text-parallel-purple" />
          </div>
          <p className="text-gray-500 text-sm mt-2">Verifying your reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parallel-cream flex flex-col items-center justify-start px-6 pt-16">
      <div className="max-w-md w-full">

        {/* Logo — pre-app PARA//EL. wordmark per brand book */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <ParallelWordmark variant="light" sizeClassName="text-2xl" />
          </div>
          <h1 className="text-2xl font-medium mb-2">Set a new password</h1>
          <p className="text-gray-500 text-sm">Choose something secure — at least 8 characters.</p>
        </div>

        {/* New password */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">New password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full p-4 pr-12 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {/* Confirm password */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Confirm new password</label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full p-4 pr-12 rounded-2xl border-2 border-gray-200 focus:border-parallel-purple focus:outline-none transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password && confirmPassword) handleSubmit();
              }}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || !password || !confirmPassword}
          className="w-full py-4 px-6 rounded-full bg-parallel-purple text-parallel-cream font-medium text-lg transition-all hover:bg-parallel-purple/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Updating...' : 'Update password'}
        </button>

      </div>
    </div>
  );
}
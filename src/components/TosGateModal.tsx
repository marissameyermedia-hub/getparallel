import { useState } from 'react';
import { FileText } from 'lucide-react';
import { ONBOARDING_FUNCTION_URL } from '../utils/supabase/client';

interface TosGateModalProps {
  accessToken: string;
  onAccepted: () => void;
  onNavigateTerms: () => void;
}

export function TosGateModal({ accessToken, onAccepted, onNavigateTerms }: TosGateModalProps) {
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAccept = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${ONBOARDING_FUNCTION_URL}/accept-tos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error('Failed to record acceptance');
      onAccepted();
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#F5F2EE' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 py-5"
        style={{ borderBottom: '0.5px solid #E8E4DE' }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: '#7B5EA7' }}
        >
          <FileText size={16} className="text-white" />
        </div>
        <div>
          <p
            className="font-semibold"
            style={{ fontSize: '15px', color: '#0D0D0F', letterSpacing: '-0.01em' }}
          >
            Updated Terms of Service
          </p>
          <p style={{ fontSize: '12px', color: '#8A8690' }}>
            Please review and accept to continue
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-md mx-auto">
          <p style={{ fontSize: '14px', color: '#3D3A42', lineHeight: 1.65, marginBottom: '20px' }}>
            We've updated our Terms of Service. You'll need to review and accept the
            updated terms before continuing to use Parallel.
          </p>

          {/* Read terms CTA */}
          <button
            onClick={onNavigateTerms}
            className="w-full flex items-center justify-between px-4 py-4 rounded-2xl mb-6 transition-colors hover:opacity-90"
            style={{
              background: '#EDEAF6',
              border: '1px solid #D4C9F0',
            }}
          >
            <div className="flex items-center gap-3">
              <FileText size={18} style={{ color: '#7B5EA7' }} />
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#7B5EA7' }}>
                Read Terms of Service
              </span>
            </div>
            <span style={{ fontSize: '13px', color: '#7B5EA7' }}>→</span>
          </button>

          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer mb-6 select-none">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setChecked(e.target.checked)}
                className="sr-only"
              />
              <div
                className="w-5 h-5 rounded flex items-center justify-center transition-colors"
                style={{
                  background: checked ? '#7B5EA7' : '#FFFFFF',
                  border: `2px solid ${checked ? '#7B5EA7' : '#C8C4CE'}`,
                }}
              >
                {checked && (
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <span style={{ fontSize: '13px', color: '#3D3A42', lineHeight: 1.6 }}>
              I have read and agree to the updated{' '}
              <button
                type="button"
                onClick={onNavigateTerms}
                className="underline"
                style={{ color: '#7B5EA7' }}
              >
                Terms of Service
              </button>
            </span>
          </label>

          {error && (
            <p className="text-red-600 text-sm mb-4">{error}</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-6 pb-10 pt-4"
        style={{ borderTop: '0.5px solid #E8E4DE', background: '#F5F2EE' }}
      >
        <div className="max-w-md mx-auto">
          <button
            onClick={handleAccept}
            disabled={!checked || submitting}
            className="w-full py-4 rounded-full font-medium text-base transition-all"
            style={{
              background: checked && !submitting ? '#7B5EA7' : '#C8C4CE',
              color: '#F5F2EE',
              fontSize: '15px',
              cursor: checked && !submitting ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'Saving…' : 'Accept & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

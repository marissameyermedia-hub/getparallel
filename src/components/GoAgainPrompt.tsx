interface Props {
  matchName: string;
  onSubmit: (outcome: 'yes' | 'maybe' | 'no') => void;
  onSkip: () => void;
}

export function GoAgainPrompt({ matchName, onSubmit, onSkip }: Props) {
  const firstName = matchName.split(' ')[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0D0D0F]/50 px-6">
      <div className="bg-[#F5F2EE] rounded-3xl w-full max-w-sm p-7 shadow-2xl">
        <div className="flex items-center gap-1.5 mb-5">
          <span className="text-[11px] font-bold text-[#7B5EA7] tracking-wide">
            P<span className="font-black">//</span>
          </span>
          <span className="text-[11px] font-semibold text-[#7B5EA7] uppercase tracking-wide">
            One more thing
          </span>
        </div>

        <h2 className="text-[22px] font-bold text-[#0D0D0F] leading-snug mb-2">
          Would you go on another date with {firstName}?
        </h2>
        <p className="text-sm text-[#8A8690] leading-relaxed mb-7">
          Your answer helps us find better matches for you.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => onSubmit('yes')}
            className="w-full h-12 rounded-full bg-[#0D0D0F] text-[#F5F2EE] font-medium text-sm hover:opacity-80 transition-opacity"
          >
            Yes, I would
          </button>
          <button
            onClick={() => onSubmit('maybe')}
            className="w-full h-12 rounded-full bg-white border border-[#E8E4DE] text-[#0D0D0F] font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            Maybe
          </button>
          <button
            onClick={() => onSubmit('no')}
            className="w-full h-12 rounded-full bg-white border border-[#E8E4DE] text-[#0D0D0F] font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            No
          </button>
        </div>

        <button
          onClick={onSkip}
          className="mt-4 w-full text-center text-xs text-[#8A8690] hover:text-[#0D0D0F] transition-colors py-1"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

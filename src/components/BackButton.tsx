import { ChevronLeft } from 'lucide-react';

interface BackButtonProps {
  onClick: () => void;
  className?: string;
}

export function BackButton({ onClick, className = '' }: BackButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`fixed bottom-6 left-6 w-12 h-12 flex items-center justify-center rounded-full border-2 border-gray-200 hover:border-parallel-void transition-colors bg-parallel-cream shadow-sm z-50 ${className}`}
      aria-label="Go back"
    >
      <ChevronLeft size={22} aria-hidden="true" />
    </button>
  );
}

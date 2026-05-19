// AppHeader — uses the locked P// circle mark per brand book (locked May 17, 2026).
// The full PARA//EL. wordmark is reserved for pre-app surfaces (landing, ads, emails).
// Never show the full wordmark here — it clashes with the page title in the nav.

import { ParaelCircle } from './branding/ParaelCircle';

interface AppHeaderProps {
  onNavigate?: () => void;
}

export function AppHeader({ onNavigate }: AppHeaderProps) {
  return (
    <div className="w-full bg-parallel-cream border-b border-gray-100 py-3 px-5">
      <div className="max-w-7xl mx-auto flex items-center">
        <button
          onClick={onNavigate}
          disabled={!onNavigate}
          className="flex items-center justify-center w-9 h-9 rounded-full hover:opacity-80 transition-opacity disabled:pointer-events-none"
          aria-label="Parallel — go to home"
        >
          {/* P// circle mark — locked brand mark for in-app nav */}
          <ParaelCircle size={36} />
        </button>
      </div>
    </div>
  );
}

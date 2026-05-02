// AppHeader — uses the locked P// circle mark per brand book (April 30, 2026)
// The circle mark (black circle, cream P, soft violet //) is the in-app nav mark.
// The full PARA//EL. wordmark is reserved for pre-app surfaces (landing, ads, emails).
// Never show the full wordmark here — it clashes with the page title centered in the nav.

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
          className="flex items-center justify-center w-9 h-9 rounded-full bg-parallel-void hover:opacity-80 transition-opacity disabled:pointer-events-none"
          aria-label="Parallel — go to home"
        >
          {/* P// circle mark — locked brand mark for in-app nav */}
          <span
            style={{
              fontFamily: 'inherit',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.02em',
              color: '#F5F2EE',
              lineHeight: 1,
              userSelect: 'none',
            }}
            aria-hidden="true"
          >
            P<span style={{ color: '#A98FD0' }}>//</span>
          </span>
        </button>
      </div>
    </div>
  );
}

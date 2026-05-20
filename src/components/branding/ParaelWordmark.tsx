// PARA//EL. wordmark — canonical React component.
// Locked spec: Notion Brand Identity page, May 17, 2026.
// Inter 800 · 0.08em letter-spacing · light or dark mode.
// Use on pre-app surfaces only (landing, ads, emails, onboarding).
// Inside the app nav, use ParaelCircle instead.

interface ParaelWordmarkProps {
  mode?: 'light' | 'dark';
  /** Fixed-px size bucket per locked spec. Default: 'medium' (32px). */
  size?: 'small' | 'medium' | 'large' | 'xl';
  className?: string;
}

const SIZES: Record<string, string> = {
  small:  '20px',
  medium: '32px',
  large:  '48px',
  xl:     '64px',
};

export function ParaelWordmark({
  mode = 'light',
  size = 'medium',
  className = '',
}: ParaelWordmarkProps) {
  const fg    = mode === 'dark' ? '#FFFFFF' : '#0D0D0F';
  const slash = mode === 'dark' ? '#A98FD0' : '#7B5EA7';

  return (
    <span
      className={className}
      style={{
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontWeight: 800,
        fontSize: SIZES[size],
        letterSpacing: '0.08em',
        lineHeight: 1,
        WebkitFontSmoothing: 'antialiased',
        color: fg,
        display: 'inline-block',
      }}
      aria-label="Parallel"
    >
      <span aria-hidden="true">PARA</span>
      <span aria-hidden="true" style={{ color: slash }}>//</span>
      <span aria-hidden="true">EL.</span>
    </span>
  );
}

export default ParaelWordmark;

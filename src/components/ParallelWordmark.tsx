// PARA//EL. wordmark — pre-app brand mark (locked May 17, 2026).
// Thin wrapper that accepts Tailwind sizeClassName for backward-compat with
// existing callers while delegating all brand-spec CSS to inline styles.
// Canonical spec: Inter 800, 0.08em letter-spacing, antialiased.
// In-app nav uses ParaelCircle, not this wordmark.

interface ParallelWordmarkProps {
  variant?: 'light' | 'dark';
  /** Tailwind text-size class, e.g. "text-xl". Default: "text-xl" */
  sizeClassName?: string;
  className?: string;
}

export function ParallelWordmark({
  variant = 'light',
  sizeClassName = 'text-xl',
  className = '',
}: ParallelWordmarkProps) {
  const fg = variant === 'dark' ? '#FFFFFF' : '#0D0D0F';

  return (
    <span
      className={`inline-flex items-baseline ${sizeClassName} ${className}`}
      style={{
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontWeight: 800,
        letterSpacing: '0.08em',
        lineHeight: 1,
        WebkitFontSmoothing: 'antialiased',
        color: fg,
      }}
      aria-label="Parallel"
    >
      <span aria-hidden="true">PARA</span>
      <span aria-hidden="true" style={{ color: '#7B5EA7' }}>/</span>
      <span aria-hidden="true" style={{ color: '#A98FD0' }}>/</span>
      <span aria-hidden="true">EL.</span>
    </span>
  );
}

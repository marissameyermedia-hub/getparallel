// PARA//EL. wordmark — pre-app brand mark per brand book (April 30, 2026).
// Used on landing, sign-in, sign-up, phone verification, onboarding,
// password reset, ads, emails — anywhere a user encounters Parallel
// before they're inside the app.
//
// In-app surfaces (nav bar, etc.) use the P// circle mark instead — never
// this wordmark.
//
// Rules (locked):
//   - The // is always Parallel Purple #7B5EA7 on light backgrounds and
//     Soft Violet #A98FD0 on dark/Void backgrounds.
//   - All other letterforms are Void #0D0D0F on light, Cream #F5F2EE on dark.
//   - The trailing period . is part of the logo. Never drop it.
//   - All caps. Never sentence case.
//   - No taglines, icons, or extra elements appended.

interface ParallelWordmarkProps {
  /** Pick the variant that matches the surface this sits on. */
  variant?: 'light' | 'dark';
  /** Tailwind text-size class. Default: text-xl */
  sizeClassName?: string;
  className?: string;
}

export function ParallelWordmark({
  variant = 'light',
  sizeClassName = 'text-xl',
  className = '',
}: ParallelWordmarkProps) {
  const letterColor = variant === 'dark' ? 'text-parallel-cream' : 'text-parallel-void';
  // Left slash = darker purple, right slash = lighter violet — per brand logo spec.
  const slash1Color = variant === 'dark' ? 'text-parallel-purple' : 'text-parallel-purple';
  const slash2Color = variant === 'dark' ? 'text-parallel-soft-violet' : 'text-parallel-soft-violet';

  return (
    <span
      className={`inline-flex items-baseline font-bold tracking-tight ${sizeClassName} ${letterColor} ${className}`}
      aria-label="Parallel"
    >
      <span aria-hidden="true">PARA</span>
      <span aria-hidden="true" className={slash1Color}>/</span>
      <span aria-hidden="true" className={slash2Color}>/</span>
      <span aria-hidden="true">EL.</span>
    </span>
  );
}

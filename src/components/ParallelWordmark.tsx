// PARA//EL. wordmark — uses official brand PNGs from /public.
// variant='light' → black text on transparent bg (for white/light backgrounds)
// variant='dark'  → white text on transparent bg (for dark backgrounds)
// sizeClassName maps Tailwind text-size classes to image height classes.

interface ParallelWordmarkProps {
  variant?: 'light' | 'dark';
  /** Tailwind text-size class, e.g. "text-xl". Controls image height. */
  sizeClassName?: string;
  className?: string;
}

const SIZE_HEIGHT: Record<string, string> = {
  'text-xs':   'h-3',
  'text-sm':   'h-3.5',
  'text-base': 'h-4',
  'text-lg':   'h-5',
  'text-xl':   'h-5',
  'text-2xl':  'h-6',
  'text-3xl':  'h-8',
  'text-4xl':  'h-9',
  'text-5xl':  'h-11',
};

export function ParallelWordmark({
  variant = 'light',
  sizeClassName = 'text-xl',
  className = '',
}: ParallelWordmarkProps) {
  const src = variant === 'dark'
    ? '/PARA-EL-transparent-dark.png'
    : '/PARA-EL-transparent-light.png';

  const heightClass = SIZE_HEIGHT[sizeClassName] ?? 'h-5';

  return (
    <img
      src={src}
      alt="Parallel"
      className={`${heightClass} w-auto ${className}`}
      draggable={false}
    />
  );
}

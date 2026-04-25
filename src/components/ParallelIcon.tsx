import { cn } from "./ui/utils";

/**
 * ParallelIcon — the canonical brand mark.
 *
 * Two rounded vertical bars on a transparent background. Use this everywhere
 * the Parallel logo appears (headers, navs, splash, marketing surfaces).
 *
 * Standardized tokens:
 *   - `size`: named tier (`xs` 16 / `sm` 20 / `md` 24 / `lg` 32 / `xl` 48 / `2xl` 96)
 *             or a raw pixel number for one-off cases.
 *   - `tone`: semantic color (`default` = currentColor, `foreground`, `primary`,
 *             `inverse` = on-dark surfaces, `muted`).
 *
 * Color always flows through `currentColor`, so the icon inherits text color
 * unless a `tone` is set.
 */

export const PARALLEL_ICON_SIZES = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 48,
  "2xl": 96,
} as const;

export type ParallelIconSize = keyof typeof PARALLEL_ICON_SIZES | number;
export type ParallelIconTone =
  | "default"
  | "foreground"
  | "primary"
  | "inverse"
  | "muted";

const TONE_CLASSES: Record<ParallelIconTone, string> = {
  default: "",
  foreground: "text-foreground",
  primary: "text-primary",
  inverse: "text-primary-foreground",
  muted: "text-muted-foreground",
};

interface ParallelIconProps {
  className?: string;
  size?: ParallelIconSize;
  tone?: ParallelIconTone;
  /** Accessibility label. Omit (or pass empty) to mark as decorative. */
  label?: string;
}

function resolveSize(size: ParallelIconSize): number {
  if (typeof size === "number") return size;
  return PARALLEL_ICON_SIZES[size];
}

export function ParallelIcon({
  className = "",
  size = "md",
  tone = "default",
  label,
}: ParallelIconProps) {
  const px = resolveSize(size);
  const isDecorative = !label;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(TONE_CLASSES[tone], className)}
      role={isDecorative ? "presentation" : "img"}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={isDecorative ? undefined : label}
      focusable="false"
    >
      <path
        d="M9 4L9 20"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M15 4L15 20"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

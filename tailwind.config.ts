import type { Config } from "tailwindcss";

// ── Parallel brand palette ────────────────────────────────────────────────────
// These are the locked brand colors from the brand book (April 2026).
// Use these tokens in Tailwind classes: bg-parallel-purple, text-parallel-stone,
// border-parallel-linen, etc. They resolve to the exact hex values from the brand
// book so there's no guessing about what color you're actually applying.
//
// The CSS variables in index.css handle the semantic tokens (bg-background,
// text-foreground, etc.) — use those for generic surfaces. Use these named
// tokens when you specifically need a brand color by name.
const parallelColors = {
  void:         "#0D0D0F",  // Near-black. Primary text, dark backgrounds.
  cream:        "#F5F2EE",  // Off-white. Light backgrounds, text on dark.
  purple:       "#7B5EA7",  // Brand accent. CTA buttons, the // in the logo.
  "soft-violet":"#A98FD0",  // Hover states, // on pure-black backgrounds.
  linen:        "#E8E4DE",  // Borders and dividers on light backgrounds.
  stone:        "#8A8690",  // Secondary / muted text on any background.
  "deep-ink":   "#1E1C22",  // Dark card surfaces.
  dusk:         "#2E2A36",  // Dark UI elements, borders on dark backgrounds.
};

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // ── Semantic tokens (wired to CSS variables in index.css) ──────────
        border:      "hsl(var(--border) / <alpha-value>)",
        input:       "hsl(var(--input))",
        "input-background": "hsl(var(--input-background))",
        "switch-background": "hsl(var(--switch-background))",
        ring:        "hsl(var(--ring))",
        background:  "hsl(var(--background))",
        foreground:  "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT:              "hsl(var(--sidebar-background))",
          foreground:           "hsl(var(--sidebar-foreground))",
          primary:              "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent:               "hsl(var(--sidebar-accent))",
          "accent-foreground":  "hsl(var(--sidebar-accent-foreground))",
          border:               "hsl(var(--sidebar-border))",
          ring:                 "hsl(var(--sidebar-ring))",
        },

        // ── Named Parallel brand tokens ─────────────────────────────────────
        // Usage: bg-parallel-purple, text-parallel-stone, border-parallel-linen
        // These never change — they always resolve to the exact brand hex.
        parallel: parallelColors,
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

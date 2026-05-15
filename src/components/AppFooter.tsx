// AppFooter — required for two legal reasons:
// 1. WA My Health MY Data Act (MHMDA) — Consumer Health Data Privacy Policy must be
//    linked SEPARATELY from the general Privacy Policy on the homepage and app entry
//    points. Cannot simply be a section inside the general policy (RCW 19.373).
// 2. ADA accessibility statement — good-faith contact link reduces serial plaintiff
//    firm targeting. Not legally required for private apps but strongly recommended.
//
// Rendered in three places:
//   - SignInPage (public homepage / unauthenticated entry point)
//   - AccountCreationPage (public entry point)
//   - App.tsx shell (all non-fullscreen authenticated views)

interface AppFooterProps {
  onNavigate: (view: string) => void;
}

export function AppFooter({ onNavigate }: AppFooterProps) {
  return (
    <footer className="w-full border-t border-gray-100 bg-parallel-cream pb-24">
      <div className="max-w-2xl mx-auto px-6 py-6">

        <p className="text-center text-xs text-gray-500 mb-4">
          © {new Date().getFullYear()} PARALLEL VIP LLC · getparallel.vip
        </p>

        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-gray-500">
          <button
            onClick={() => onNavigate('privacy-policy')}
            className="hover:text-parallel-void transition-colors hover:underline underline-offset-2"
          >
            Privacy Policy
          </button>

          {/* Consumer Health Data Policy MUST appear as a distinct link per WA MHMDA —
              cannot be merged with or referenced from inside the general Privacy Policy link */}
          <button
            onClick={() => onNavigate('consumer-health-data-policy')}
            className="hover:text-parallel-void transition-colors hover:underline underline-offset-2"
          >
            Consumer Health Data Policy (WA)
          </button>

          <button
            onClick={() => onNavigate('terms-service')}
            className="hover:text-parallel-void transition-colors hover:underline underline-offset-2"
          >
            Terms of Service
          </button>

          <button
            onClick={() => onNavigate('refund-policy')}
            className="hover:text-parallel-void transition-colors hover:underline underline-offset-2"
          >
            Refund Policy
          </button>

          <button
            onClick={() => onNavigate('community-guidelines')}
            className="hover:text-parallel-void transition-colors hover:underline underline-offset-2"
          >
            Community Guidelines
          </button>

          {/* Accessibility statement — links to static /accessibility page (HTML in /public).
              Required as a public, indexable URL for ADA defense (search engines and
              plaintiff firms can find it without signing in). Opens in a new tab so the
              user's signed-in session and onboarding/match flow are preserved. */}
          <a
            href="/accessibility"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-parallel-void transition-colors hover:underline underline-offset-2"
          >
            Accessibility
          </a>
        </div>

      </div>
    </footer>
  );
}
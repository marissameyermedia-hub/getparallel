// DevGallery: a built-in component preview surface used during development.
//
// Activated by either:
//   ?dev=1            → mounts the gallery instead of <App />
//   ?d=<screen-id>    → mounts the gallery and deep-links into that screen
//
// `main.tsx` checks both params; this component reads `?d` to decide whether
// to render the index page or a single full-screen preview.
import { useEffect, useMemo } from "react";
import { Toaster } from "sonner";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { installDevFetchInterceptor } from "./devFetchInterceptor";
import { findScreen, SCREENS, SCREEN_GROUPS, type ScreenEntry } from "./screens";

function setParam(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  // Always preserve dev=1 so reloads stay in the gallery
  url.searchParams.set("dev", "1");
  window.history.pushState({}, "", url.toString());
  // Trigger a re-render via popstate listener
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function useSearchParam(key: string): string | null {
  // Lightweight reactive query-param hook
  const params = new URLSearchParams(window.location.search);
  const value = params.get(key);
  // Force re-render on history changes
  useEffect(() => {
    const handler = () => {
      // no-op; reading window.location.search on next render
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  return value;
}

function GalleryIndex() {
  const grouped = useMemo(() => {
    return SCREEN_GROUPS.map((group) => ({
      group,
      items: SCREENS.filter((s) => s.group === group),
    }));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Dev Gallery</p>
          <h1 className="text-3xl font-semibold">Component preview</h1>
          <p className="text-sm text-muted-foreground mt-2">
            All {SCREENS.length} screens render with mocked data and a stubbed
            backend. Append <code className="px-1 py-0.5 rounded bg-muted">?dev=1&amp;d=&lt;id&gt;</code> to
            deep-link.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {grouped.map(({ group, items }) => (
          <section key={group}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {group}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {items.map((screen) => (
                <button
                  key={screen.id}
                  type="button"
                  onClick={() => setParam("d", screen.id)}
                  className="text-left rounded-lg border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors p-4"
                >
                  <div className="font-medium">{screen.label}</div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono">{screen.id}</div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

function ScreenViewer({ screen }: { screen: ScreenEntry }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="border-b border-border bg-card flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setParam("d", null)}
            className="text-muted-foreground hover:text-foreground"
          >
            ← All screens
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{screen.label}</span>
          <code className="text-xs text-muted-foreground font-mono">{screen.id}</code>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <ErrorBoundary>{screen.render()}</ErrorBoundary>
      </div>
    </div>
  );
}

export function DevGallery() {
  useEffect(() => {
    installDevFetchInterceptor();
  }, []);

  const screenId = useSearchParam("d");
  const screen = findScreen(screenId);

  return (
    <>
      {screen ? <ScreenViewer screen={screen} /> : <GalleryIndex />}
      <Toaster richColors position="top-center" />
    </>
  );
}

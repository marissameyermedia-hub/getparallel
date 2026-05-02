/**
 * NavigationProgress
 *
 * Thin 2px progress bar that shows at the top of the screen during async
 * operations. Uses an imperative API so any code path (button click, fetch,
 * navigation) can trigger it without prop drilling:
 *
 *   import { progress } from './NavigationProgress';
 *   progress.start();
 *   try {
 *     await someAsyncWork();
 *   } finally {
 *     progress.done();
 *   }
 *
 * Or for tracking multiple concurrent operations (recommended pattern):
 *
 *   progress.start();   // ref count: 1
 *   progress.start();   // ref count: 2
 *   progress.done();    // ref count: 1 (still showing)
 *   progress.done();    // ref count: 0 (hides)
 *
 * Why an imperative API instead of React context? Because most async work
 * happens inside fetch wrappers, hooks, and event handlers — passing a
 * setIsLoading prop to every fetch site is brittle. An imperative API is
 * a single global subscriber that anyone can poke. React state still drives
 * the actual rendering inside the component.
 *
 * The bar:
 *  - 2px tall, fixed to top of viewport, above all other UI
 *  - Solid black (matches Parallel's brand)
 *  - Indeterminate "loading" animation (left-to-right slide, infinite)
 *  - Fades out 200ms after done() to avoid flicker if work resumes
 */
import { useEffect, useState } from 'react';

type Listener = (visible: boolean) => void;

class ProgressController {
  private refCount = 0;
  private listeners = new Set<Listener>();
  private timeout: ReturnType<typeof setTimeout> | null = null;

  start = () => {
    this.refCount++;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.notify();
  };

  done = () => {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) {
      // Tiny delay before hiding so consecutive ops don't flicker the bar.
      this.timeout = setTimeout(() => {
        this.notify();
        this.timeout = null;
      }, 200);
    }
  };

  // Useful for "definitely stop right now" cases.
  reset = () => {
    this.refCount = 0;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.notify();
  };

  isActive = () => this.refCount > 0;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  private notify() {
    const visible = this.refCount > 0;
    for (const fn of this.listeners) fn(visible);
  }
}

export const progress = new ProgressController();

/**
 * Convenience wrapper that auto-tracks an async operation. Recommended over
 * manual start/done pairs because it can't leak ref counts on errors.
 *
 *   const data = await withProgress(() => fetch('/api/whatever').then(r => r.json()));
 */
export async function withProgress<T>(work: () => Promise<T>): Promise<T> {
  progress.start();
  try {
    return await work();
  } finally {
    progress.done();
  }
}

export function NavigationProgress() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return progress.subscribe(setVisible);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[100] pointer-events-none h-0.5 overflow-hidden transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="h-full bg-parallel-void"
        style={{
          // Indeterminate loading animation — slides a bar from left to right repeatedly.
          // Pure CSS so it doesn't compete with React for the main thread.
          width: '40%',
          animation: visible ? 'parallel-progress-slide 1.2s ease-in-out infinite' : 'none',
        }}
      />
      <style>{`
        @keyframes parallel-progress-slide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(150%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
    </div>
  );
}

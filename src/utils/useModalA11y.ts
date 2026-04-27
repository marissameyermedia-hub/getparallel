import { useEffect, useRef } from 'react';

/**
 * useModalA11y — accessibility helpers for modal/dialog overlays.
 *
 * When `open` is true:
 *   1. Listens for the Escape key globally and calls `onClose()`.
 *   2. Locks body scroll so the page behind the modal doesn't move.
 *   3. On open, captures the currently focused element (the trigger button)
 *      and on close, returns focus to it — so keyboard users don't lose
 *      their place in the page.
 *
 * It does NOT trap focus inside the modal (that's a heavier dependency,
 * deferred to post-launch). It does provide the most common screen-reader
 * and keyboard expectations: Escape closes, scroll is locked, focus
 * returns home.
 *
 * Usage:
 *   useModalA11y(showEmailModal, () => setShowEmailModal(false));
 */
export function useModalA11y(open: boolean, onClose: () => void) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Capture the element that had focus when the modal opened,
    // so we can return focus to it on close.
    previouslyFocused.current = (document.activeElement as HTMLElement) || null;

    // Lock body scroll. Save the original overflow so we can restore it.
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Listen for Escape.
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = originalOverflow;
      // Return focus to the element that opened the modal, if it still exists.
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === 'function' && document.body.contains(prev)) {
        // Defer to next tick so the modal's unmount doesn't fight us.
        setTimeout(() => prev.focus(), 0);
      }
    };
  }, [open, onClose]);
}

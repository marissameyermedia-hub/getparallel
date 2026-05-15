import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * useModalA11y — accessibility helpers for modal/dialog overlays.
 *
 * When `open` is true:
 *   1. Listens for the Escape key globally and calls `onClose()`.
 *   2. Locks body scroll so the page behind the modal doesn't move.
 *   3. Captures the currently focused element (the trigger button) and
 *      returns focus to it on close — keyboard users don't lose their place.
 *   4. When `containerRef` is supplied, traps focus inside the dialog:
 *      - Moves initial focus to the first focusable element on open.
 *      - Tab / Shift+Tab cycle within the container; focus cannot escape.
 *      This satisfies WCAG 2.1 AA § 2.1.2 (No Keyboard Trap) + the
 *      implicit requirement of role="dialog" aria-modal="true".
 *
 * Usage (basic):
 *   useModalA11y(showEmailModal, () => setShowEmailModal(false));
 *
 * Usage (with focus trap — pass a ref to the dialog root element):
 *   const dialogRef = useRef<HTMLDivElement>(null);
 *   useModalA11y(showEmailModal, () => setShowEmailModal(false), dialogRef);
 *   // <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}>
 */
export function useModalA11y(
  open: boolean,
  onClose: () => void,
  containerRef?: React.RefObject<HTMLElement | null>,
) {
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

  // Focus trap — active only when containerRef is provided.
  useEffect(() => {
    if (!open || !containerRef?.current) return;
    const container = containerRef.current;

    // Move initial focus into the modal on open.
    const firstFocusable = container.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
    (firstFocusable ?? container).focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, [open, containerRef]);
}

/**
 * After a failed submit: brings the first error into view (inside a scrolling
 * sheet too) and focuses its field, so the message is never below the fold.
 * Runs on the next frame, once React has rendered the errors.
 */
export function focusFirstError(root: HTMLElement | null | undefined): void {
  requestAnimationFrame(() => {
    const target = root?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]');
    if (!target) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    if (target.matches('input, select, textarea')) target.focus({ preventScroll: true });
  });
}

/** Brings an element into view inside the flow's scroll area; instant when the visitor prefers reduced motion. */
export function revealElement(el: Element | null | undefined, block: ScrollLogicalPosition = 'center'): void {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block, behavior: reduce ? 'auto' : 'smooth' });
}

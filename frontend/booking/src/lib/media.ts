/** Viewport queries the layout needs in JavaScript (not just CSS). */
import { useEffect, useState } from 'preact/hooks';

/** Same breakpoint as the `short:` Tailwind variant in styles.css (landscape phones). */
const SHORT_SCREEN_QUERY = '(max-height: 520px)';

function mediaQuery(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

/** True on short screens; follows rotation. */
export function useShortScreen(): boolean {
  const [short, setShort] = useState(() => mediaQuery(SHORT_SCREEN_QUERY)?.matches ?? false);
  useEffect(() => {
    const list = mediaQuery(SHORT_SCREEN_QUERY);
    if (!list) return;
    const update = () => setShort(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);
  return short;
}

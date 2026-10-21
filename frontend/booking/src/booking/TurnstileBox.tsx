/**
 * Invisible-unless-needed Turnstile widget. With `interaction-only` the box
 * takes no space unless Cloudflare asks the visitor to click.
 */
import { useEffect, useRef } from 'preact/hooks';
import { loadTurnstile, type TurnstileApi } from '../lib/turnstile';

interface Props {
  siteKey: string;
  /** Bump to discard the current token and get a fresh one (tokens are single-use). */
  resetKey: number;
  onToken: (token: string | null) => void;
  onError: () => void;
  /** true while Cloudflare shows a challenge the visitor has to click. */
  onInteractive: (interactive: boolean) => void;
}

export function TurnstileBox({ siteKey, resetKey, onToken, onError, onInteractive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const handlersRef = useRef({ onToken, onError, onInteractive });
  useEffect(() => {
    handlersRef.current = { onToken, onError, onInteractive };
  });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        const id = api.render(containerRef.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          language: 'es',
          callback: (token) => handlersRef.current.onToken(token),
          'expired-callback': () => handlersRef.current.onToken(null),
          'error-callback': () => handlersRef.current.onError(),
          'before-interactive-callback': () => handlersRef.current.onInteractive(true),
          'after-interactive-callback': () => handlersRef.current.onInteractive(false),
        });
        widgetRef.current = { api, id };
      })
      .catch(() => handlersRef.current.onError());
    return () => {
      cancelled = true;
      if (widgetRef.current) widgetRef.current.api.remove(widgetRef.current.id);
      widgetRef.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey > 0 && widgetRef.current) widgetRef.current.api.reset(widgetRef.current.id);
  }, [resetKey]);

  return <div ref={containerRef} class="flex justify-center empty:hidden max-w-full overflow-hidden" />;
}

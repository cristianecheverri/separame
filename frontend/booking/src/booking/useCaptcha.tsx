/**
 * Turnstile token handling shared by the booking and waitlist submits:
 * `withToken(run, onFail)` runs immediately when a token is ready, or as soon
 * as Turnstile hands one over. Without a site key (mock mode) it runs at once.
 * When Cloudflare asks the visitor to click while a submit is waiting,
 * `needsInteraction` turns on and the widget is scrolled into view (the
 * footer shows a hint pointing at it).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { revealElement } from '../lib/scroll';
import { TurnstileBox } from './TurnstileBox';

const MOCK_TOKEN = 'mock-turnstile-token';

export function useCaptcha(siteKey: string | null) {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const pendingRef = useRef<{ run: (token: string) => void; onFail: () => void } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const needsInteraction = waiting && interactive;

  useEffect(() => {
    if (needsInteraction) revealElement(boxRef.current);
  }, [needsInteraction]);

  const reset = () => {
    if (!siteKey) return;
    setToken(null);
    setResetKey((n) => n + 1);
  };

  const withToken = (run: (token: string) => void, onFail: () => void) => {
    if (!siteKey) return run(MOCK_TOKEN);
    if (token) return run(token);
    if (failed) {
      setFailed(false);
      reset();
      return onFail();
    }
    pendingRef.current = { run, onFail };
    setWaiting(true);
  };

  const onToken = (next: string | null) => {
    setToken(next);
    if (!next) return;
    setFailed(false);
    setInteractive(false);
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      setWaiting(false);
      pending.run(next);
    }
  };

  const onError = () => {
    setFailed(true);
    setInteractive(false);
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      setWaiting(false);
      pending.onFail();
    }
  };

  const box = siteKey ? (
    <div ref={boxRef} class="has-[>div:empty]:hidden">
      <TurnstileBox siteKey={siteKey} resetKey={resetKey} onToken={onToken} onError={onError} onInteractive={setInteractive} />
    </div>
  ) : null;
  return { box, withToken, reset, waiting, needsInteraction };
}

/** Footer hint while the submit waits for the visitor to solve the challenge above. */
export function CaptchaHint() {
  return (
    <div role="status" class="text-center text-[14px] font-semibold text-ink-2">
      Confirma que eres una persona <span aria-hidden="true">↑</span>
    </div>
  );
}

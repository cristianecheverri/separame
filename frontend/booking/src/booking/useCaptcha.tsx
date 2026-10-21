/**
 * Turnstile token handling shared by the booking and waitlist submits:
 * `withToken(run, onFail)` runs immediately when a token is ready, or as soon
 * as Turnstile hands one over. Without a site key (mock mode) it runs at once.
 */
import { useRef, useState } from 'preact/hooks';
import { TurnstileBox } from './TurnstileBox';

const MOCK_TOKEN = 'mock-turnstile-token';

export function useCaptcha(siteKey: string | null) {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const pendingRef = useRef<{ run: (token: string) => void; onFail: () => void } | null>(null);

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
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      setWaiting(false);
      pending.run(next);
    }
  };

  const onError = () => {
    setFailed(true);
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      setWaiting(false);
      pending.onFail();
    }
  };

  const box = siteKey ? <TurnstileBox siteKey={siteKey} resetKey={resetKey} onToken={onToken} onError={onError} /> : null;
  return { box, withToken, reset, waiting };
}

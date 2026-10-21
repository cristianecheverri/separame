/** localStorage/sessionStorage that never throws (private mode, blocked storage…). */
function safe(kind: 'local' | 'session') {
  const store = (): Storage | null => {
    try {
      return kind === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    get(key: string): string | null {
      try {
        return store()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key: string, value: string): void {
      try {
        store()?.setItem(key, value);
      } catch {
        /* ignore */
      }
    },
    remove(key: string): void {
      try {
        store()?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export const local = safe('local');
export const session = safe('session');

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertIcon, CheckIcon } from './icons';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++seq.current;
    setItems((list) => [...list.slice(-2), { id, message, kind }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 6_000 : 3_500);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ show, success: (m) => show(m, 'success'), error: (m) => show(m, 'error') }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed z-[60] bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 flex flex-col gap-2 items-stretch sm:items-end pointer-events-none" aria-live="polite" role="status">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto bg-ink text-white rounded-[16px] px-4 py-3 flex gap-3 items-center text-[14px] font-semibold leading-[1.35] sm:max-w-[420px] shadow-[0_10px_30px_rgba(21,36,29,0.25)]">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${t.kind === 'error' ? 'bg-accent text-ink' : 'bg-primary text-white'}`}>
              {t.kind === 'error' ? <AlertIcon size={16} /> : <CheckIcon size={14} />}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

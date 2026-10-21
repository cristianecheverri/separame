import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../ui/cx';

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  label: string;
  className: string;
  children: ReactNode;
  /** 'left': off-canvas panel. 'bottom': sheet that rises above the tab bar, which stays visible and usable. */
  placement?: 'left' | 'bottom';
}

const PLACEMENT = {
  left: { root: 'fixed inset-0 z-50 lg:hidden', panel: 'absolute inset-y-0 left-0 w-[280px] max-w-[86vw]' },
  bottom: { root: 'fixed inset-x-0 top-0 bottom-[var(--bottom-nav)] z-40 lg:hidden', panel: 'absolute inset-x-0 bottom-0 max-h-[calc(100%-16px)] rounded-t-[28px]' },
} as const;

/** Off-canvas navigation for phones and tablets: focus trap, Esc, scroll lock. */
export function Drawer({ open, onClose, label, className, children, placement = 'left' }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      if (e.shiftKey && document.activeElement === items[0]) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === items[items.length - 1]) {
        e.preventDefault();
        items[0].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={PLACEMENT[placement].root}>
      <div className="absolute inset-0 bg-[rgba(21,36,29,0.45)]" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className={cx('on-dark overflow-y-auto overscroll-contain', PLACEMENT[placement].panel, className)}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

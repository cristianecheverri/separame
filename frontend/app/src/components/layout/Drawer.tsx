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
}

/** Off-canvas navigation for phones and tablets: focus trap, Esc, scroll lock. */
export function Drawer({ open, onClose, label, className, children }: DrawerProps) {
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
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-[rgba(21,36,29,0.45)]" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className={cx('on-dark absolute inset-y-0 left-0 w-[280px] max-w-[86vw] overflow-y-auto', className)}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

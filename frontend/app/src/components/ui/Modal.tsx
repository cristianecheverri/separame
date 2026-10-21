import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { CloseIcon } from './icons';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

/** Accessible dialog: focus trap, Esc to close, focus restored, bottom sheet on phones. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-[rgba(21,36,29,0.45)]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'relative w-full bg-white rounded-t-[24px] sm:rounded-[24px] flex flex-col max-h-[92dvh] outline-none',
          size === 'lg' ? 'sm:max-w-[620px]' : 'sm:max-w-[480px]',
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 id={titleId} className="m-0 font-display font-extrabold text-[22px] leading-[1.2]">
              {title}
            </h2>
            {description && <div className="text-[14px] text-muted leading-[1.4]">{description}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-11 h-11 -mr-2 -mt-2 rounded-full flex items-center justify-center text-ink-2 hover:bg-surface shrink-0">
            <CloseIcon />
          </button>
        </div>
        <div className={cx('px-5 sm:px-6 pt-3 overflow-y-auto flex flex-col gap-4', footer ? 'pb-3' : 'pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-6')}>{children}</div>
        {footer && <div className="px-5 sm:px-6 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-6 flex flex-wrap gap-[10px] border-t border-line mt-1">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useId, useState, type ReactNode } from 'react';
import { PlusIcon } from './icons';

/**
 * Phones and tablets (< 1024 px): round 56 px "Nueva cita" button in the thumb zone, above the
 * tab bar (proposal MP-03). Renders a spacer too, so the end of the page can scroll clear of it.
 */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <>
      <div aria-hidden="true" className="lg:hidden h-8 shrink-0" />
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="lg:hidden fixed right-4 bottom-[calc(var(--bottom-nav)+16px)] z-20 w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-[0_8px_20px_rgba(11,110,79,0.35)] hover:bg-primary-dark transition-colors"
      >
        <PlusIcon size={24} />
      </button>
    </>
  );
}

export interface FabAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

/**
 * The same 56 px button opening a short menu above it (proposal block-hours-agenda-phone):
 * «Bloquear horas» / «Nueva cita». Esc or a tap outside closes it; the «+» turns into «×».
 */
export function FabMenu({ actions }: { actions: FabAction[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const run = (action: FabAction) => {
    setOpen(false);
    action.onClick();
  };
  return (
    <>
      <div aria-hidden="true" className="lg:hidden h-8 shrink-0" />
      {open && <div aria-hidden="true" onClick={() => setOpen(false)} className="lg:hidden fixed inset-0 z-20 bg-[rgba(21,36,29,0.45)]" />}
      {open && (
        <div id={menuId} role="menu" aria-label="Agregar" className="lg:hidden fixed right-4 bottom-[calc(var(--bottom-nav)+84px)] z-30 flex flex-col items-end gap-[10px]">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={() => run(a)}
              className="h-[52px] px-5 rounded-full bg-white text-ink font-bold text-[15px] inline-flex items-center gap-[10px] shadow-[0_8px_20px_rgba(21,36,29,0.18)]"
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        aria-label={open ? 'Cerrar menú' : 'Agregar'}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="lg:hidden fixed right-4 bottom-[calc(var(--bottom-nav)+16px)] z-30 w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-[0_8px_20px_rgba(11,110,79,0.35)] hover:bg-primary-dark transition-colors"
      >
        <PlusIcon size={24} className={open ? 'rotate-45 transition-transform' : 'transition-transform'} />
      </button>
    </>
  );
}

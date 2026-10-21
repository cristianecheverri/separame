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

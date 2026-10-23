import { cx } from '../../components/ui/cx';
import { MinusIcon, PlusIcon } from '../../components/ui/icons';

interface Props {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  labelledBy: string;
  describedBy?: string;
  decreaseLabel: string;
  increaseLabel: string;
  /** 'form': 48 px buttons and a boxed number (team request); 'compact': 44 px, bare number (admin). */
  size?: 'form' | 'compact';
}

/** − value + (team request «¿Cuántos profesionales?», admin «Cupos adicionales»). */
export function Stepper({ value, min, max, onChange, labelledBy, describedBy, decreaseLabel, increaseLabel, size = 'form' }: Props) {
  const big = size === 'form';
  const button = (disabled: boolean) =>
    cx(
      'rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
      big ? 'w-12 h-12' : 'w-11 h-11',
      disabled ? (big ? 'border-line bg-surface text-muted cursor-not-allowed' : 'border-line-strong bg-white text-ink opacity-45 cursor-not-allowed') : 'border-line-strong bg-white text-ink hover:border-ink-2',
    );
  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="flex items-center gap-3">
      <button type="button" aria-label={decreaseLabel} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className={button(value <= min)}>
        <MinusIcon size={big ? 20 : 18} />
      </button>
      <output
        aria-live="polite"
        className={cx(
          'flex items-center justify-center font-display font-extrabold',
          big ? 'min-w-16 h-12 rounded-[14px] bg-surface text-[24px]' : 'min-w-9 text-[28px] leading-none',
        )}
      >
        {value}
      </output>
      <button type="button" aria-label={increaseLabel} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className={button(value >= max)}>
        <PlusIcon size={big ? 20 : 18} />
      </button>
    </div>
  );
}

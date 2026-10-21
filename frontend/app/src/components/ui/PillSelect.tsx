import { cx } from './cx';
import { ChevronDownIcon } from './icons';

interface PillSelectProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  variant?: 'rule' | 'field' | 'fieldSelected';
}

const VARIANT = {
  rule: 'h-11 rounded-[12px] border-2 border-line bg-white pl-[14px] pr-[32px] text-[16px] whitespace-nowrap',
  field: 'h-12 rounded-[14px] border-2 border-line bg-white pl-[14px] pr-[38px] text-[16px]',
  fieldSelected: 'h-12 rounded-[14px] border-2 border-primary bg-primary-soft pl-[14px] pr-[38px] text-[16px]',
} as const;

/**
 * A real <select> drawn like the mockups' dropdown buttons. The "rule" variant
 * sizes itself to the selected label (an invisible sizer in the same grid cell),
 * like the drawn pill, instead of to the widest option.
 */
export function PillSelect<T extends string | number>({ value, options, onChange, label, disabled, className, variant = 'rule' }: PillSelectProps<T>) {
  const isNumber = typeof value === 'number';
  const current = options.find((o) => o.value === value)?.label ?? String(value);
  return (
    <div className={cx('relative', variant === 'rule' ? 'inline-grid' : 'grid', className)}>
      {variant === 'rule' && (
        <span aria-hidden="true" className={cx(VARIANT.rule, 'invisible flex items-center font-bold [grid-area:1/1]')}>
          {current}
        </span>
      )}
      <select
        aria-label={label}
        value={String(value)}
        disabled={disabled}
        onChange={(e) => onChange((isNumber ? Number(e.target.value) : e.target.value) as T)}
        className={cx(
          'appearance-none w-full min-w-0 font-bold text-ink outline-none focus-visible:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(11,110,79,0.15)] disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted [grid-area:1/1] text-ellipsis',
          VARIANT[variant],
        )}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={14} className={cx('pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink', variant === 'rule' ? 'right-3' : 'right-[14px]')} />
    </div>
  );
}

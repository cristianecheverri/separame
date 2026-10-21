import { cx } from './cx';

interface SwitchProps {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}

/** 52×32 pill switch from the mockups (`aria-pressed`). */
export function Switch({ on, onToggle, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cx(
        'hit-44 w-[52px] h-8 rounded-full p-[3px] shrink-0 flex box-border transition-colors disabled:cursor-not-allowed',
        on ? 'bg-primary justify-end' : 'bg-line-strong justify-start',
        disabled && 'opacity-60',
      )}
    >
      <span className="block w-[26px] h-[26px] rounded-full bg-white" />
    </button>
  );
}

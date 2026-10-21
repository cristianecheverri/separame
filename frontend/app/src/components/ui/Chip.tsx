import type { ReactNode } from 'react';
import { cx } from './cx';
import { ui } from './styles';

interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Toggle chip: yellow when selected (duration, method, period, target…). */
export function Chip({ selected, onClick, children, disabled, className }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cx(ui.chip, selected ? ui.chipOn : ui.chipOff, className)}
    >
      {children}
    </button>
  );
}

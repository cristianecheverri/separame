import { useId, useRef, useState } from 'react';
import { Chip } from '../../components/ui/Chip';
import { cx } from '../../components/ui/cx';
import { ui } from '../../components/ui/styles';
import { DURATIONS, durationProblem, MAX_DURATION, MIN_DURATION } from './durations';

interface Props {
  value: number;
  /** NaN while the «Otra» field is empty. */
  onChange: (minutes: number) => void;
  error?: string | null;
  disabled?: boolean;
}

/** "Duración": common chips plus «Otra» with a minutes field (5–480, multiples of 5). */
export function DurationPicker({ value, onChange, error, disabled }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [custom, setCustom] = useState(() => !DURATIONS.includes(value));
  const [text, setText] = useState(() => (DURATIONS.includes(value) || !Number.isFinite(value) ? '' : String(value)));
  const [touched, setTouched] = useState(false);
  const liveProblem = custom && touched && text !== '' ? durationProblem(Number(text)) : null;
  const message = error ?? liveProblem;

  const chooseCustom = () => {
    setCustom(true);
    onChange(text === '' ? Number.NaN : Number(text));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={`${id}-label`}>
      <div id={`${id}-label`} className={ui.label}>
        Duración
      </div>
      <div className="flex flex-wrap gap-2">
        {DURATIONS.map((m) => (
          <Chip
            key={m}
            selected={!custom && value === m}
            disabled={disabled}
            onClick={() => {
              setCustom(false);
              onChange(m);
            }}
          >
            {m} min
          </Chip>
        ))}
        <Chip selected={custom} disabled={disabled} onClick={chooseCustom}>
          Otra
        </Chip>
      </div>
      {custom && (
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-minutes`} className="sr-only">
            Duración en minutos
          </label>
          <input
            ref={inputRef}
            id={`${id}-minutes`}
            type="text"
            inputMode="numeric"
            maxLength={3}
            disabled={disabled}
            value={text}
            placeholder="Minutos"
            aria-invalid={message ? true : undefined}
            aria-describedby={`${id}-help`}
            onBlur={() => setTouched(true)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '');
              setText(digits);
              onChange(digits === '' ? Number.NaN : Number(digits));
            }}
            className={cx(ui.input, 'max-w-[120px]')}
          />
          <span className="text-[15px] font-semibold text-ink-2">minutos</span>
        </div>
      )}
      {message ? (
        <div id={`${id}-help`} className="text-[13px] font-semibold text-warn-ink" role="alert">
          {message}
        </div>
      ) : (
        custom && (
          <div id={`${id}-help`} className={ui.help}>
            De {MIN_DURATION} a {MAX_DURATION} minutos, en múltiplos de 5.
          </div>
        )
      )}
    </div>
  );
}

import { useId, type ReactNode } from 'react';
import { cx } from './cx';
import { ui } from './styles';

interface FieldProps {
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  className?: string;
}

/** Label + control + help/error, wired with ids. */
export function Field({ label, help, error, children, className }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const describedBy = error || help ? helpId : undefined;
  return (
    <div className={cx('flex flex-col gap-[6px] min-w-0', className)}>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <div id={helpId} className="text-[13px] font-semibold text-warn-ink" role="alert">
          {error}
        </div>
      ) : help ? (
        <div id={helpId} className={ui.help}>
          {help}
        </div>
      ) : null}
    </div>
  );
}

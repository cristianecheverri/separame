import { useEffect, useId, useState, type ReactNode } from 'react';
import { Wordmark } from '../../components/layout/Wordmark';
import { cx } from '../../components/ui/cx';
import { CheckIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { PASSWORD_RULES } from '../../lib/authClient';

export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface flex flex-col items-center px-4 py-10 sm:py-16">
      <Wordmark size={30} className="text-primary mb-7" />
      <main className="bg-white rounded-[24px] p-6 sm:p-8 w-full max-w-[420px] flex flex-col gap-5">{children}</main>
      {footer && <div className="mt-6 text-[14px] text-ink-2 text-center">{footer}</div>}
    </div>
  );
}

export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <h1 className="m-0 font-display font-extrabold text-[28px] leading-[1.15] tracking-[-0.8px]">{title}</h1>
      {children && <p className="m-0 text-[15px] text-muted leading-[1.45]">{children}</p>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="bg-warn-soft text-warn-ink rounded-[14px] px-4 py-3 text-[14px] font-semibold leading-[1.4]">
      {message}
    </div>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return <div role="status" className="bg-primary-soft text-primary rounded-[14px] px-4 py-3 text-[14px] font-semibold leading-[1.4]">{children}</div>;
}

export function SubmitButton({ busy, children, disabled }: { busy: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="submit" disabled={busy || disabled} aria-busy={busy} className="h-[52px] rounded-full bg-primary text-white font-bold text-[16px] hover:bg-primary-dark disabled:bg-disabled disabled:text-muted disabled:cursor-not-allowed transition-colors">
      {busy ? 'Un momento…' : children}
    </button>
  );
}

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  showRules?: boolean;
  labelAside?: ReactNode;
}

export function PasswordField({ label, value, onChange, autoComplete, showRules, labelAside }: PasswordFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className={ui.label}>
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          aria-describedby={showRules ? `${id}-rules` : undefined}
          className={cx(ui.input, 'pr-[92px]')}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-10 px-3 rounded-full text-[13px] font-bold text-primary hover:bg-primary-soft"
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {showRules && (
        <ul id={`${id}-rules`} className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-1 pt-1" aria-label="Reglas de la contraseña">
          {PASSWORD_RULES.map((rule) => {
            const ok = rule.test(value);
            return (
              <li key={rule.id} className={cx('flex items-center gap-[6px] text-[13px] font-semibold', ok ? 'text-primary' : 'text-muted')}>
                <span className={cx('w-[18px] h-[18px] rounded-full flex items-center justify-center', ok ? 'bg-primary text-white' : 'bg-surface text-transparent')}>
                  <CheckIcon size={11} />
                </span>
                {rule.label}
                <span className="sr-only">{ok ? '(cumple)' : '(falta)'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function EmailField({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={id} className={ui.label}>
        Correo
      </label>
      <input
        id={id}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="tu@correo.com"
        className={ui.input}
      />
    </div>
  );
}

/** 6-digit code: one real input (paste and SMS/email autofill work) drawn as six boxes. */
export function CodeInput({ value, onChange, label = 'Código de 6 dígitos' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <div className="flex flex-col gap-[6px]">
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <div className="relative">
        <div className="grid grid-cols-6 gap-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => {
            const active = focused && (i === value.length || (i === 5 && value.length === 6));
            return (
              <div
                key={i}
                className={cx(
                  'h-14 rounded-[14px] border-2 flex items-center justify-center font-display font-extrabold text-[24px] bg-white',
                  active ? 'border-primary shadow-[0_0_0_3px_rgba(11,110,79,0.15)]' : value[i] ? 'border-line-strong' : 'border-line',
                )}
              >
                {value[i] ?? ''}
              </div>
            );
          })}
        </div>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onPaste={(e) => {
            e.preventDefault();
            onChange(e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6));
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-text text-[16px]"
        />
      </div>
    </div>
  );
}

/** "Reenviar código" with a cooldown. */
export function ResendButton({ onResend, seconds = 30 }: { onResend: () => Promise<void>; seconds?: number }) {
  const [left, setLeft] = useState(seconds);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1_000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <button
      type="button"
      disabled={left > 0 || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onResend();
        } finally {
          setBusy(false);
          setLeft(seconds);
        }
      }}
      className="min-h-11 font-bold text-[14px] text-primary hover:text-primary-dark disabled:text-muted disabled:cursor-not-allowed"
    >
      {left > 0 ? `Reenviar código en 0:${String(left).padStart(2, '0')}` : 'Reenviar código'}
    </button>
  );
}

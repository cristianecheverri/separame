import type { ContactErrors, ContactField, ContactForm } from '../lib/validation';
import { StepTitle } from './FlowChrome';

export const PRIVACY_URL = '/privacy';

interface FieldsProps {
  form: ContactForm;
  errors: ContactErrors;
  onChange: (field: ContactField, value: string | boolean) => void;
  /** Hint under the email field. */
  emailHint?: string;
}

interface Props extends FieldsProps {
  titleRef: preact.Ref<HTMLHeadingElement>;
}

export const FIELD_IDS: Record<ContactField, string> = {
  name: 'p-name',
  email: 'p-mail',
  phone: 'p-phone',
  agree: 'p-agree',
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} class="text-[13px] font-semibold text-warn-ink">
      {message}
    </span>
  );
}

export function StepDetails({ titleRef, ...fields }: Props) {
  return (
    <section class="flex flex-col gap-3.5">
      <StepTitle titleRef={titleRef}>¿A nombre de quién?</StepTitle>
      <ContactFields {...fields} />
    </section>
  );
}

/** Name / email / phone (+57) / Ley 1581 consent — shared by the booking and the waitlist. */
export function ContactFields({ form, errors, onChange, emailHint = 'Aquí te llega la confirmación y el recordatorio.' }: FieldsProps) {
  const describedBy = (field: ContactField, extra?: string) =>
    [errors[field] ? `${FIELD_IDS[field]}-error` : '', extra ?? ''].filter(Boolean).join(' ') || undefined;
  const text = (field: 'name' | 'email' | 'phone') => (e: Event) => onChange(field, (e.currentTarget as HTMLInputElement).value);

  return (
    <>
      <div class="flex flex-col gap-1.5">
        <label for={FIELD_IDS.name} class="text-[14px] font-semibold">Nombre completo</label>
        <input
          id={FIELD_IDS.name}
          class="field"
          type="text"
          name="name"
          autocomplete="name"
          autocapitalize="words"
          enterkeyhint="next"
          maxLength={80}
          placeholder="Ej. Mariana Gómez"
          value={form.name}
          aria-invalid={errors.name ? 'true' : undefined}
          aria-describedby={describedBy('name')}
          onInput={text('name')}
        />
        <FieldError id={`${FIELD_IDS.name}-error`} message={errors.name} />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for={FIELD_IDS.email} class="text-[14px] font-semibold">Correo</label>
        <input
          id={FIELD_IDS.email}
          class="field"
          type="email"
          name="email"
          autocomplete="email"
          inputMode="email"
          autocapitalize="none"
          spellcheck={false}
          enterkeyhint="next"
          maxLength={254}
          placeholder="tucorreo@ejemplo.com"
          value={form.email}
          aria-invalid={errors.email ? 'true' : undefined}
          aria-describedby={describedBy('email', 'p-mail-hint')}
          onInput={text('email')}
        />
        <FieldError id={`${FIELD_IDS.email}-error`} message={errors.email} />
        <span id="p-mail-hint" class="text-[12px] text-muted">{emailHint}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <label for={FIELD_IDS.phone} class="text-[14px] font-semibold">Celular</label>
        <div class="flex gap-2">
          <div class="h-[52px] rounded-[14px] bg-surface px-3.5 flex items-center font-semibold text-[16px] shrink-0" aria-hidden="true">
            +57
          </div>
          <input
            id={FIELD_IDS.phone}
            class="field grow"
            type="tel"
            name="phone"
            autocomplete="tel-national"
            inputMode="tel"
            enterkeyhint="done"
            maxLength={16}
            placeholder="300 123 4567"
            value={form.phone}
            aria-invalid={errors.phone ? 'true' : undefined}
            aria-describedby={describedBy('phone')}
            onInput={text('phone')}
          />
        </div>
        <FieldError id={`${FIELD_IDS.phone}-error`} message={errors.phone} />
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="flex gap-3 items-start text-[13px] leading-[1.45] text-ink-2 cursor-pointer">
          <input
            id={FIELD_IDS.agree}
            type="checkbox"
            class="w-[22px] h-[22px] m-0 shrink-0 accent-primary cursor-pointer"
            checked={form.agree}
            aria-invalid={errors.agree ? 'true' : undefined}
            aria-describedby={describedBy('agree')}
            onChange={(e) => onChange('agree', (e.currentTarget as HTMLInputElement).checked)}
          />
          <span>
            Autorizo el tratamiento de mis datos personales para gestionar esta cita, según la{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener" class="text-primary">
              política de privacidad
            </a>{' '}
            (Ley 1581 de 2012).
          </span>
        </label>
        <FieldError id={`${FIELD_IDS.agree}-error`} message={errors.agree} />
      </div>
    </>
  );
}

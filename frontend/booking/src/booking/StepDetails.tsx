import { PHONE_INPUT_MAX_LENGTH, stripCountryCode } from '@shared/contact';
import { Check } from '../components/icons';
import { useShortScreen } from '../lib/media';
import type { ContactErrors, ContactField, ContactForm } from '../lib/validation';
import { StepTitle } from './FlowChrome';

export const PRIVACY_URL = '/privacy';

interface FieldsProps {
  form: ContactForm;
  errors: ContactErrors;
  onChange: (field: ContactField, value: string | boolean) => void;
  /** Validates a field when it loses focus. */
  onBlur: (field: ContactField) => void;
  /** Booking: the email is optional ("Correo (opcional)"). */
  emailOptional?: boolean;
  /** Hint under the email field. */
  emailHint: string;
  /** What the data is for, in the Ley 1581 consent ("gestionar esta cita"). */
  consentPurpose: string;
}

interface Props extends Omit<FieldsProps, 'emailHint' | 'consentPurpose' | 'emailOptional'> {
  titleRef: preact.Ref<HTMLHeadingElement>;
  /** "Recordar mis datos en este celular" checkbox. */
  remember: boolean;
  onRemember: (remember: boolean) => void;
  /** The fields came prefilled from this phone's saved data. */
  prefilled: boolean;
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

const CHECKBOX = 'w-[22px] h-[22px] m-0 shrink-0 accent-primary cursor-pointer';
const CHECK_LABEL = 'min-h-11 flex gap-3 items-start text-[13px] leading-[1.45] text-ink-2 cursor-pointer';

export function StepDetails({ titleRef, remember, onRemember, prefilled, ...fields }: Props) {
  return (
    <section class="flex flex-col gap-3.5 short:gap-2.5">
      <StepTitle titleRef={titleRef}>¿A nombre de quién?</StepTitle>
      {prefilled && (
        <div class="bg-primary-soft rounded-2xl py-3 px-3.5 flex gap-2 items-center text-[14px] leading-[1.4]">
          <Check size={18} strokeWidth={2.2} stroke="#0B6E4F" class="shrink-0" />
          <span>Usamos los datos que guardaste en este celular.</span>
        </div>
      )}
      <ContactFields
        {...fields}
        emailOptional
        emailHint="Si lo escribes, te enviamos la confirmación y el recordatorio."
        consentPurpose="gestionar esta cita"
      />
      <label class={CHECK_LABEL}>
        <input
          id="p-remember"
          type="checkbox"
          class={CHECKBOX}
          checked={remember}
          onChange={(e) => onRemember((e.currentTarget as HTMLInputElement).checked)}
        />
        <span class="flex flex-col gap-0.5">
          <span class="font-semibold text-ink">
            Recordar mis datos en este celular <span class="font-medium text-muted">(opcional)</span>
          </span>
          <span>La próxima vez no tendrás que escribirlos. Solo quedan en este celular.</span>
        </span>
      </label>
    </section>
  );
}

/** Name / phone (+57) / email / Ley 1581 consent — shared by the booking and the waitlist (required phone before the email). */
const FIELD_GROUP = 'flex flex-col gap-1.5 min-w-0 short:gap-1';
const LABEL = 'text-[14px] font-semibold short:text-[13px]';

export function ContactFields({ form, errors, onChange, onBlur, emailOptional = false, emailHint, consentPurpose }: FieldsProps) {
  const describedBy = (field: ContactField, extra?: string) =>
    [errors[field] ? `${FIELD_IDS[field]}-error` : '', extra ?? ''].filter(Boolean).join(' ') || undefined;
  const text = (field: 'name' | 'email' | 'phone') => (e: Event) => onChange(field, (e.currentTarget as HTMLInputElement).value);
  // The field already shows "+57": a pasted or typed country code is dropped instead of doubled.
  const phoneInput = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const value = stripCountryCode(input.value);
    if (value !== input.value) input.value = value;
    onChange('phone', value);
  };

  const blur = (field: ContactField) => () => onBlur(field);
  // Side by side on short screens, the phone field is too narrow for the long hint.
  const shortScreen = useShortScreen();

  return (
    <>
      {/* Landscape / short screens: name and phone side by side. */}
      <div class="contents short:grid short:grid-cols-2 short:gap-2.5">
        <div class={FIELD_GROUP}>
          <label for={FIELD_IDS.name} class={LABEL}>Nombre completo</label>
          <input
            id={FIELD_IDS.name}
            class="field"
            type="text"
            name="name"
            autocomplete="name"
            autocapitalize="words"
            enterkeyhint="next"
            maxLength={80}
            placeholder="Tu nombre y apellido"
            value={form.name}
            aria-invalid={errors.name ? 'true' : undefined}
            aria-describedby={describedBy('name')}
            onInput={text('name')}
            onBlur={blur('name')}
          />
          <FieldError id={`${FIELD_IDS.name}-error`} message={errors.name} />
        </div>
        <div class={FIELD_GROUP}>
          <label for={FIELD_IDS.phone} class={LABEL}>Celular</label>
          <div class="flex gap-2">
            <div class="h-[52px] short:h-[46px] rounded-[14px] bg-surface px-3.5 flex items-center font-semibold text-[16px] shrink-0" aria-hidden="true">
              +57
            </div>
            <input
              id={FIELD_IDS.phone}
              class="field grow"
              type="tel"
              name="phone"
              autocomplete="tel-national"
              inputMode="tel"
              enterkeyhint="next"
              maxLength={PHONE_INPUT_MAX_LENGTH}
              placeholder={shortScreen ? 'Tu celular' : 'Tu número de celular'}
              value={form.phone}
              aria-invalid={errors.phone ? 'true' : undefined}
              aria-describedby={describedBy('phone')}
              onInput={phoneInput}
              onBlur={blur('phone')}
            />
          </div>
          <FieldError id={`${FIELD_IDS.phone}-error`} message={errors.phone} />
        </div>
      </div>
      <div class={FIELD_GROUP}>
        <label for={FIELD_IDS.email} class={LABEL}>
          Correo{emailOptional && <span class="font-normal text-muted"> (opcional)</span>}
        </label>
        <input
          id={FIELD_IDS.email}
          class="field"
          type="email"
          name="email"
          autocomplete="email"
          inputMode="email"
          autocapitalize="none"
          spellcheck={false}
          enterkeyhint="done"
          maxLength={254}
          placeholder="Tu correo electrónico"
          value={form.email}
          aria-invalid={errors.email ? 'true' : undefined}
          aria-describedby={describedBy('email', 'p-mail-hint')}
          onInput={text('email')}
          onBlur={blur('email')}
        />
        <FieldError id={`${FIELD_IDS.email}-error`} message={errors.email} />
        <span id="p-mail-hint" class="text-[12px] text-muted">{emailHint}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class={CHECK_LABEL}>
          <input
            id={FIELD_IDS.agree}
            type="checkbox"
            class={CHECKBOX}
            checked={form.agree}
            aria-invalid={errors.agree ? 'true' : undefined}
            aria-describedby={describedBy('agree')}
            onChange={(e) => onChange('agree', (e.currentTarget as HTMLInputElement).checked)}
          />
          <span>
            Autorizo el tratamiento de mis datos personales para {consentPurpose}, según la{' '}
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

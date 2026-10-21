/**
 * "¿No encuentras hora?" — the client picks up to 7 days of the window and
 * leaves their contact; the API emails them when a slot frees up.
 */
import { useState } from 'preact/hooks';
import { WAITLIST_MAX_DATES, type PublicProfile, type PublicService } from '@shared/api';
import type { DayAvailability } from '@shared/availability';
import { normalizeEmail, normalizePhone } from '@shared/contact';
import { capitalize, DAY_SHORT, formatDayLong, formatDayShort } from '@shared/format';
import { jsWeekday } from '@shared/time';
import { Check } from '../components/icons';
import { DayPill, DISABLED_BUTTON, Frame, PRIMARY_BUTTON, RevealedNotice } from '../components/ui';
import { ApiError, errorMessage, type ApiClient } from '../lib/api';
import { chunk, DAYS_PER_WEEK, monthLabel } from '../lib/slots';
import {
  CONTACT_FIELDS, contactBlockedLabel, fieldsFromApi, isContactFilled, validateContact, validateField, type ContactErrors, type ContactField, type ContactForm,
} from '../lib/validation';
import { FlowFooter, ProfileRow, StepTitle } from './FlowChrome';
import { ContactFields, FIELD_IDS } from './StepDetails';
import { CaptchaHint, useCaptcha } from './useCaptcha';

interface Props {
  api: ApiClient;
  turnstileSiteKey: string | null;
  profile: PublicProfile;
  service: PublicService;
  days: DayAvailability[];
  initialDate: string | null;
  form: ContactForm;
  errors: ContactErrors;
  onChange: (field: ContactField, value: string | boolean) => void;
  onErrors: (errors: ContactErrors) => void;
  onClose: () => void;
  onUnavailable: () => void;
}

/** "jue 22, vie 23 y lun 26" */
function listDays(dates: string[]): string {
  const names = [...dates].sort().map((d) => formatDayShort(d).toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : (names[0] ?? '');
}

/** Open days with nothing free: the only ones worth waiting for. */
const isWaitable = (day: DayAvailability) => day.closed === null && day.slots.length === 0;

export function WaitlistScreen(props: Props) {
  const { api, turnstileSiteKey, profile, service, days, initialDate, form, errors, onChange, onErrors, onClose, onUnavailable } = props;
  const eligible = days.filter(isWaitable);
  // Same 7-day rows as "Día y hora" (one column per weekday); rows without a waitable day are skipped.
  const weeks = chunk(days, DAYS_PER_WEEK).filter((week) => week.some(isWaitable));
  const [dates, setDates] = useState<string[]>(() => (initialDate && eligible.some((d) => d.date === initialDate) ? [initialDate] : []));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneEmail, setDoneEmail] = useState<string | null>(null);
  const captcha = useCaptcha(turnstileSiteKey);

  const toggle = (date: string) =>
    setDates((current) =>
      current.includes(date) ? current.filter((d) => d !== date) : current.length >= WAITLIST_MAX_DATES ? current : [...current, date],
    );

  const join = async (token: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await api.joinWaitlist(profile.slug, {
        serviceId: service.id,
        dates: [...dates].sort(),
        client: { name: form.name.trim(), email: normalizeEmail(form.email), phone: normalizePhone(form.phone) },
        consent: true,
        turnstileToken: token,
      });
      setDoneEmail(normalizeEmail(form.email));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'internal';
      if (code === 'agenda_unavailable') return onUnavailable();
      if (code === 'validation' && e instanceof ApiError) {
        const found = fieldsFromApi(e.fields);
        onErrors(found);
        setError(Object.keys(found).length ? null : 'Revisa los días y tus datos e inténtalo de nuevo.');
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setSubmitting(false);
      captcha.reset();
    }
  };

  /** Same as the booking: a typed field is checked when it loses focus. */
  const blur = (field: ContactField) => {
    const value = form[field];
    if (typeof value !== 'string' || (!value.trim() && !errors[field])) return;
    onErrors({ ...errors, [field]: validateField(field, form) });
  };

  const submit = () => {
    if (submitting || captcha.waiting) return;
    const found = validateContact(form);
    onErrors(found);
    const first = CONTACT_FIELDS.find((f) => found[f]);
    if (first) {
      document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }
    captcha.withToken(
      (token) => void join(token),
      () => setError(errorMessage(new ApiError('captcha_failed', ''))),
    );
  };

  if (doneEmail) {
    return (
      <Frame label="Lista de espera">
        <header class="safe-top border-b border-line shrink-0 px-4 py-3.5 short:py-2">
          <ProfileRow profile={profile} />
        </header>
        <main class="scroll-area">
          <div class="min-h-full pt-7 px-5 pb-4 flex flex-col gap-3.5 fade-in">
            <div class="w-16 h-16 rounded-full bg-accent text-ink flex items-center justify-center">
              <Check size={32} strokeWidth={2.6} />
            </div>
            <StepTitle class="max-[359px]:text-[24px]">
              Listo. Te escribiremos a <span class="[overflow-wrap:anywhere]">{doneEmail}</span> si se libera un cupo.
            </StepTitle>
            <p class="m-0 text-[15px] text-ink-2 leading-[1.45]">
              Quedaste en la lista de espera de {service.name} para {listDays(dates)}. Si alguien cancela, te llega un correo para que separes
              primero. En ese mismo correo puedes salir de la lista.
            </p>
          </div>
        </main>
        <FlowFooter>
          <button type="button" onClick={onClose} class={PRIMARY_BUTTON}>
            Volver a la agenda
          </button>
        </FlowFooter>
      </Frame>
    );
  }

  const filled = isContactFilled(form);
  const busy = submitting || captcha.waiting;
  return (
    <Frame label="Lista de espera">
      <header class="safe-top border-b border-line shrink-0 px-4 py-3.5 short:py-2">
        <ProfileRow profile={profile} onBack={onClose} backLabel="Volver a elegir día y hora" />
      </header>
      <main class="scroll-area">
        <section class="pt-[22px] px-5 pb-4 flex flex-col gap-3.5 fade-in short:pt-3">
          <StepTitle>Te avisamos si se libera un cupo</StepTitle>
          <p class="m-0 text-[15px] text-ink-2 leading-[1.45]">
            Elige hasta {WAITLIST_MAX_DATES} días que te sirvan para {service.name}. Si alguien cancela, te escribimos para que separes primero.
          </p>
          <div class="flex justify-between items-center gap-2">
            <span class="text-[14px] font-semibold text-muted">{monthLabel(eligible.map((d) => d.date))}</span>
            <span class="text-[14px] font-semibold text-muted" aria-live="polite">
              {dates.length} de {WAITLIST_MAX_DATES}
            </span>
          </div>
          <div class="grid grid-cols-7 gap-1.5" role="group" aria-label="Días que te sirven">
            {weeks.flatMap((week) =>
              week.map((d) => {
                if (!isWaitable(d)) return <span key={d.date} aria-hidden="true" />;
                const selected = dates.includes(d.date);
                return (
                  <DayPill
                    key={d.date}
                    dow={DAY_SHORT[jsWeekday(d.date)]}
                    num={String(Number(d.date.slice(8)))}
                    label={capitalize(formatDayLong(d.date))}
                    selected={selected}
                    disabled={!selected && dates.length >= WAITLIST_MAX_DATES}
                    onPick={() => toggle(d.date)}
                  />
                );
              }),
            )}
          </div>
          <ContactFields
            form={form}
            errors={errors}
            onChange={onChange}
            onBlur={blur}
            emailHint="Te avisamos por correo si se libera un cupo."
            consentPurpose="avisarme si se libera un cupo"
          />
          {error && <RevealedNotice message={error} />}
          {captcha.box}
        </section>
      </main>
      <FlowFooter>
        {captcha.needsInteraction && <CaptchaHint />}
        {dates.length > 0 && filled ? (
          <button type="button" onClick={submit} aria-busy={busy} class={`${PRIMARY_BUTTON} ${busy ? 'opacity-80 cursor-progress' : ''}`}>
            {busy ? 'Guardando…' : 'Avisarme si se libera'}
          </button>
        ) : (
          <button type="button" disabled class={DISABLED_BUTTON}>
            {dates.length === 0 ? 'Elige al menos un día' : contactBlockedLabel(form)}
          </button>
        )}
      </FlowFooter>
    </Frame>
  );
}

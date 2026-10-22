/**
 * The /<slug> booking flow: Servicio → Día y hora → Tus datos → Confirmar
 * (3 steps when the professional offers a single service), then the
 * confirmation screen. Each step is a history entry (the browser back button
 * steps back), the half-filled form survives a reload (sessionStorage) and
 * `?service=<id>&date=<YYYY-MM-DD>` deep-links into "Día y hora" (the date is
 * only used when it has free hours; otherwise, as always, the first day with
 * free hours comes preselected). The email is optional here; the phone is not.
 * "Recordar mis datos" keeps name / phone / email in this browser for next time.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { AVAILABILITY_DAYS, type CreateBookingResponse, type PublicProfile, type PublicService } from '@shared/api';
import { normalizeEmail } from '@shared/contact';
import { capitalize, formatDayLong, formatDayShort, formatDuration, formatInstantTime, formatServicePrice, MONTH_SHORT } from '@shared/format';
import { bogotaDate } from '@shared/time';
import { Frame, DISABLED_BUTTON, LegalLinks, PRIMARY_BUTTON } from '../components/ui';
import { track } from '../lib/analytics';
import { ApiError, errorMessage } from '../lib/api';
import type { Runtime } from '../lib/bootstrap';
import { loadJson, loadSavedContact, removeKey, saveContact, saveJson } from '../lib/storage';
import { newUuid } from '../lib/ids';
import { formatPhone, fullAddress, joinDot, normalizePhone } from '../lib/text';
import { useShortScreen } from '../lib/media';
import { isDayBookable, resolveDay } from '../lib/slots';
import { timeLabel } from '../lib/when';
import {
  CONTACT_FIELDS, contactBlockedLabel, fieldsFromApi, isContactFilled, validateContact, validateField,
  type ContactErrors, type ContactField, type ContactForm, type ContactRules,
} from '../lib/validation';
import { Confirmed } from './Confirmed';
import { FlowFooter, FlowHeader, FlowIntro, type SelectionChip, type StepId } from './FlowChrome';
import { FIELD_IDS, StepDetails } from './StepDetails';
import { StepReview, type ReviewRow } from './StepReview';
import { StepService } from './StepService';
import { StepWhen, type AvailabilityState } from './StepWhen';
import { CaptchaHint, useCaptcha } from './useCaptcha';
import { MissingScreen, Unavailable } from './Unavailable';
import { WaitlistScreen } from './WaitlistScreen';

interface Draft extends ContactForm {
  serviceId: string | null;
  day: string | null;
  start: string | null;
  /** UUID of this booking attempt (new for every picked slot): a retry after a lost response gets the same appointment. */
  idempotencyKey?: string | null;
  /** "Recordar mis datos en este celular". */
  remember?: boolean;
}

interface HistoryState {
  sep: StepId | 'done' | 'waitlist';
  d: number;
}

const ALL_STEPS: StepId[] = ['service', 'when', 'details', 'review'];
const EMPTY_DRAFT: Draft = {
  serviceId: null, day: null, start: null, name: '', email: '', phone: '', agree: false, idempotencyKey: null, remember: false,
};
/** The phone is what the pro needs; the email only brings the confirmation and the reminder. */
const CONTACT_RULES: ContactRules = { emailOptional: true };
const BLOCKED_LABELS = {
  service: 'Elige un servicio',
  when: 'Elige día y hora',
  hour: 'Elige una hora',
} as const;
const SLOT_TAKEN_NOTICE = 'Alguien acaba de separar esa hora. Elige otra, por favor.';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Screen = 'flow' | 'unavailable' | 'notfound' | 'error';

interface Props {
  slug: string;
  initialProfile: PublicProfile | null;
  runtime: Runtime;
}

function historyState(): Partial<HistoryState> {
  return (history.state as Partial<HistoryState> | null) ?? {};
}

function stepsFor(profile: PublicProfile | null): StepId[] {
  return profile?.services.length === 1 ? ALL_STEPS.slice(1) : ALL_STEPS;
}

/** Furthest step the draft supports (used when restoring after a reload or a back/forward jump). */
function maxStep(draft: Draft): StepId {
  if (!draft.serviceId) return 'service';
  if (!draft.start) return 'when';
  if (Object.keys(validateContact(draft, CONTACT_RULES)).length > 0) return 'details';
  return 'review';
}

function clampStep(wanted: unknown, draft: Draft, steps: StepId[]): StepId {
  const limit = ALL_STEPS.indexOf(maxStep(draft));
  const index = typeof wanted === 'string' ? ALL_STEPS.indexOf(wanted as StepId) : -1;
  const clamped = ALL_STEPS[Math.min(Math.max(index, 0), limit)];
  return steps.includes(clamped) ? clamped : steps[0];
}

interface Boot {
  draft: Draft;
  deepLinked: boolean;
  /** Deep-linked date, used only if it has free hours once availability arrives. */
  date: string | null;
  /** Name / phone / email came from this browser's saved data. */
  prefilled: boolean;
}

/** An untouched contact gets the data saved with "Recordar mis datos". */
function withSavedContact(draft: Draft): { draft: Draft; prefilled: boolean } {
  const saved = draft.name || draft.phone || draft.email ? null : loadSavedContact();
  return saved ? { draft: { ...draft, ...saved, remember: true }, prefilled: true } : { draft, prefilled: false };
}

/** Restored draft + saved contact + single-service preselection + `?service=&date=` deep link. */
function initialDraft(key: string, profile: PublicProfile | null): Boot {
  const restored = withSavedContact({ ...EMPTY_DRAFT, ...loadJson<Partial<Draft>>(key) });
  let draft = restored.draft;
  const boot = (deepLinked: boolean, date: string | null = null): Boot => ({ draft, deepLinked, date, prefilled: restored.prefilled });
  if (!profile) return boot(false);
  const known = (id: string | null) => Boolean(id && profile.services.some((s) => s.id === id));
  if (!known(draft.serviceId)) draft = { ...draft, serviceId: null, day: null, start: null };
  if (profile.services.length === 1 && !draft.serviceId) draft = { ...draft, serviceId: profile.services[0].id };

  const params = new URLSearchParams(location.search);
  const serviceParam = params.get('service');
  const dateParam = params.get('date');
  if (!known(serviceParam)) return boot(false);
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : null;
  if (serviceParam !== draft.serviceId || date) draft = { ...draft, serviceId: serviceParam, day: null, start: null };
  return boot(true, date);
}

/** Drops `service`/`date` from the URL once applied so a reload keeps the client's own progress. */
function stripDeepLink(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has('service') && !url.searchParams.has('date')) return;
  url.searchParams.delete('service');
  url.searchParams.delete('date');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

/** "Jue 22 oct · 10:00 a. m." */
function whenChip(start: string): string {
  const date = bogotaDate(start);
  return `${formatDayShort(date)} ${MONTH_SHORT[Number(date.slice(5, 7)) - 1].replace('.', '')} · ${formatInstantTime(start)}`;
}

function serviceChip(service: PublicService): string {
  return joinDot(service.name, formatDuration(service.durationMin), formatServicePrice(service));
}

export function BookingApp({ slug, initialProfile, runtime }: Props) {
  const draftKey = `separame:booking:${slug}`;
  const doneKey = `${draftKey}:done`;
  const { api, turnstileSiteKey } = runtime;

  const [boot] = useState(() => initialDraft(draftKey, initialProfile));
  const [profile, setProfile] = useState(initialProfile);
  const [screen, setScreen] = useState<Screen>('flow');
  const [draft, setDraft] = useState<Draft>(boot.draft);
  const [step, setStep] = useState<StepId>(() =>
    boot.deepLinked ? 'when' : clampStep(historyState().sep, boot.draft, stepsFor(initialProfile)),
  );
  const [done, setDone] = useState<CreateBookingResponse | null>(() =>
    historyState().sep === 'done' ? loadJson<CreateBookingResponse>(doneKey) : null,
  );
  const [waitlistOpen, setWaitlistOpen] = useState(() => historyState().sep === 'waitlist');
  const [availability, setAvailability] = useState<Record<string, AvailabilityState>>({});
  const [errors, setErrors] = useState<ContactErrors>({});
  const [prefilled, setPrefilled] = useState(boot.prefilled);
  const [wantedDate, setWantedDate] = useState(boot.date);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const captcha = useCaptcha(turnstileSiteKey);
  const shortScreen = useShortScreen();

  const depthRef = useRef<number>(historyState().d ?? 0);
  const inflightRef = useRef(new Set<string>());
  const focusTitleRef = useRef(false);
  const scrollerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const latestRef = useRef({ draft, done, profile });

  const steps = stepsFor(profile);
  const stepIndex = Math.max(0, steps.indexOf(step));
  const apiSlug = profile?.slug ?? slug;
  const service = profile?.services.find((s) => s.id === draft.serviceId) ?? null;

  // ── Profile (only fetched when the page wasn't generated with it embedded) ──
  useEffect(() => {
    if (profile) return;
    let cancelled = false;
    api
      .getPro(slug)
      .then((res) => {
        if (cancelled) return;
        const next = initialDraft(draftKey, res.profile);
        setWantedDate(next.date);
        setProfile(res.profile);
        setDraft(next.draft);
        setPrefilled((was) => was || next.prefilled);
        setStep(next.deepLinked ? 'when' : clampStep(historyState().sep, next.draft, stepsFor(res.profile)));
        if (!res.active) setScreen('unavailable');
      })
      .catch((error: unknown) => {
        if (!cancelled) setScreen(error instanceof ApiError && error.code === 'not_found' ? 'notfound' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [api, slug, profile, draftKey]);

  const viewTrackedRef = useRef(false);
  useEffect(() => {
    if (!profile) return;
    if (!viewTrackedRef.current) {
      viewTrackedRef.current = true;
      track('booking_view', { pro_slug: profile.slug });
    }
    stripDeepLink();
    if (!document.title) document.title = `${profile.name} · Separa tu cita · Sepárame`;
  }, [profile]);

  useEffect(() => {
    if (screen === 'unavailable') track('booking_unavailable', { pro_slug: apiSlug });
  }, [screen, apiSlug]);

  // ── Availability: one call (14 days) per service; prefetch the first service ──
  const fetchAvailability = useCallback(
    (serviceId: string) => {
      if (inflightRef.current.has(serviceId)) return;
      inflightRef.current.add(serviceId);
      api
        .getAvailability(apiSlug, { serviceId, days: AVAILABILITY_DAYS })
        .then((data) => {
          setAvailability((all) => ({ ...all, [serviceId]: { status: 'ready', data } }));
          if (!data.active) setScreen('unavailable');
        })
        .catch((error: unknown) => {
          setAvailability((all) => ({ ...all, [serviceId]: { status: 'error', message: errorMessage(error) } }));
        })
        .finally(() => inflightRef.current.delete(serviceId));
    },
    [api, apiSlug],
  );

  const wantedService = draft.serviceId ?? profile?.services[0]?.id ?? null;
  useEffect(() => {
    if (wantedService && !availability[wantedService]) fetchAvailability(wantedService);
  }, [wantedService, availability, fetchAvailability]);

  // The first day with free hours comes preselected (or the deep-linked one, if it has free hours);
  // a closed / out-of-window day (stale draft) never stays selected. Resolved during render so the
  // hours paint together with the days; the effect then stores it in the draft.
  const selectedServiceAvailability = draft.serviceId ? availability[draft.serviceId] : undefined;
  const availableDays = selectedServiceAvailability?.status === 'ready' ? selectedServiceAvailability.data.days : null;
  const day = availableDays ? resolveDay(availableDays, draft.day, wantedDate) : draft.day;
  useEffect(() => {
    if (!availableDays) return;
    setWantedDate(null);
    // Re-resolved from the latest draft: a day the client tapped before this ran must win.
    setDraft((d) => {
      const next = resolveDay(availableDays, d.day, wantedDate);
      return next === d.day ? d : { ...d, day: next, start: d.start && bogotaDate(d.start) === next ? d.start : null };
    });
  }, [availableDays, wantedDate, draft.day]);

  const refreshAvailability = (serviceId: string) =>
    setAvailability((all) => {
      const next = { ...all };
      delete next[serviceId];
      return next;
    });

  // ── Persistence + history ──
  useEffect(() => {
    latestRef.current = { draft, done, profile };
    saveJson(draftKey, draft);
  }, [draft, done, profile, draftKey]);

  useEffect(() => {
    if (historyState().sep === undefined) {
      history.replaceState({ sep: latestRef.current.done ? 'done' : step, d: 0 } satisfies HistoryState, '');
    }
    const onPop = (event: PopStateEvent) => {
      const state = event.state as Partial<HistoryState> | null;
      if (!state?.sep) return;
      depthRef.current = state.d ?? 0;
      if (state.sep === 'done') {
        const saved = loadJson<CreateBookingResponse>(doneKey);
        if (saved) setDone(saved);
        return;
      }
      if (state.sep === 'waitlist') {
        setWaitlistOpen(true);
        return;
      }
      setWaitlistOpen(false);
      focusTitleRef.current = true;
      const current = latestRef.current;
      if (current.done) {
        // Leaving the confirmation through "back" starts a fresh booking.
        setDone(null);
        removeKey(doneKey);
        setStep(stepsFor(current.profile)[0]);
        return;
      }
      setStep(clampStep(state.sep, current.draft, stepsFor(current.profile)));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // Registered once; reads fresh values through latestRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    if (focusTitleRef.current) {
      focusTitleRef.current = false;
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [step, waitlistOpen]);

  const go = (next: StepId) => {
    track('booking_step', { pro_slug: apiSlug, step: next });
    depthRef.current += 1;
    history.pushState({ sep: next, d: depthRef.current } satisfies HistoryState, '');
    focusTitleRef.current = true;
    setStep(next);
  };

  const back = () => {
    if (stepIndex === 0) return;
    if (depthRef.current > 0 && historyState().sep === step) {
      history.back();
      return;
    }
    const prev = steps[stepIndex - 1];
    history.replaceState({ sep: prev, d: 0 } satisfies HistoryState, '');
    focusTitleRef.current = true;
    setStep(prev);
  };

  const openWaitlist = () => {
    depthRef.current += 1;
    history.pushState({ sep: 'waitlist', d: depthRef.current } satisfies HistoryState, '');
    setWaitlistOpen(true);
  };

  const closeWaitlist = () => {
    if (historyState().sep === 'waitlist') {
      history.back();
      return;
    }
    setWaitlistOpen(false);
  };

  // ── Step actions ──
  const pickService = (serviceId: string) =>
    setDraft((d) => (d.serviceId === serviceId ? d : { ...d, serviceId, day: null, start: null }));

  const pickDay = (date: string) =>
    setDraft((d) => ({ ...d, day: date, start: d.start && bogotaDate(d.start) === date ? d.start : null }));

  const pickSlot = (start: string) => {
    setSlotNotice(null);
    setDraft((d) => ({ ...d, start, day: bogotaDate(start), idempotencyKey: d.start === start && d.idempotencyKey ? d.idempotencyKey : newUuid() }));
  };

  const changeField = (field: ContactField, value: string | boolean) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    if (errors[field]) setErrors((e) => ({ ...e, [field]: validateField(field, next, CONTACT_RULES) }));
  };

  /** On blur, a typed field is checked right away (an empty one waits for "Siguiente"). */
  const blurField = (field: ContactField) => {
    const value = draft[field];
    if (typeof value !== 'string' || (!value.trim() && !errors[field])) return;
    setErrors((e) => ({ ...e, [field]: validateField(field, draft, CONTACT_RULES) }));
  };

  const canNext = step === 'service' ? Boolean(service) : step === 'when' ? Boolean(draft.start) : isContactFilled(draft, CONTACT_RULES);
  const dayHasHours = Boolean(availableDays?.some((d) => d.date === day && isDayBookable(d)));
  const blockedLabel =
    step === 'service'
      ? BLOCKED_LABELS.service
      : step === 'when'
        ? BLOCKED_LABELS[dayHasHours ? 'hour' : 'when']
        : contactBlockedLabel(draft, CONTACT_RULES);

  const next = () => {
    if (!canNext) return;
    if (step === 'details') {
      const found = validateContact(draft, CONTACT_RULES);
      setErrors(found);
      const first = CONTACT_FIELDS.find((f) => found[f]);
      if (first) {
        document.getElementById(FIELD_IDS[first])?.focus();
        return;
      }
    }
    if (stepIndex < steps.length - 1) go(steps[stepIndex + 1]);
  };

  // ── Booking ──
  const book = async (token: string) => {
    if (!service || !draft.start) return;
    setSubmitting(true);
    setSubmitError(null);
    const idempotencyKey = draft.idempotencyKey ?? newUuid();
    if (!draft.idempotencyKey) setDraft((d) => ({ ...d, idempotencyKey }));
    try {
      const result = await api.createBooking(apiSlug, {
        serviceId: service.id,
        start: draft.start,
        client: { name: draft.name.trim(), email: normalizeEmail(draft.email), phone: normalizePhone(draft.phone) },
        consent: true,
        turnstileToken: token,
        idempotencyKey,
      });
      saveJson(doneKey, result);
      removeKey(draftKey);
      saveContact(draft.remember ? { name: draft.name.trim(), phone: formatPhone(normalizePhone(draft.phone)), email: normalizeEmail(draft.email) } : null);
      history.replaceState({ sep: 'done', d: depthRef.current } satisfies HistoryState, '');
      setDraft(EMPTY_DRAFT);
      setDone(result);
      track('booking_confirmed', { pro_slug: apiSlug, has_email: normalizeEmail(draft.email) ? 'yes' : 'no' });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'internal';
      track('booking_error', { pro_slug: apiSlug, reason: code });
      if (code === 'slot_taken') {
        setSlotNotice(SLOT_TAKEN_NOTICE);
        setDraft((d) => ({ ...d, start: null }));
        refreshAvailability(service.id);
        go('when');
      } else if (code === 'agenda_unavailable') {
        setScreen('unavailable');
      } else if (code === 'validation' && error instanceof ApiError) {
        const found = fieldsFromApi(error.fields);
        if (Object.keys(found).length > 0) {
          setErrors(found);
          go('details');
        } else {
          setSubmitError('Revisa los datos de tu cita e inténtalo de nuevo.');
        }
      } else {
        setSubmitError(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
      captcha.reset();
    }
  };

  const submit = () => {
    if (submitting || captcha.waiting) return;
    setSubmitError(null);
    captcha.withToken(
      (token) => void book(token),
      () => setSubmitError(errorMessage(new ApiError('captcha_failed', ''))),
    );
  };

  // ── Screens ──
  if (screen === 'notfound') {
    return <MissingScreen title="Esta agenda no existe" text="Revisa el enlace o pídele a quien te lo compartió que te lo envíe de nuevo." />;
  }
  if (screen === 'error') {
    return (
      <MissingScreen
        title="No pudimos cargar la agenda"
        text={errorMessage(new ApiError('network', ''))}
        actionLabel="Reintentar"
        actionHref={location.href}
      />
    );
  }
  if (!profile) return <LoadingFrame />;
  if (screen === 'unavailable') return <Unavailable profile={profile} />;
  if (done) return <Confirmed result={done} icsUrl={api.icsUrl(done.manageToken)} />;

  const serviceAvailability = service ? availability[service.id] : undefined;
  if (waitlistOpen && service && serviceAvailability?.status === 'ready') {
    return (
      <WaitlistScreen
        api={api}
        turnstileSiteKey={turnstileSiteKey}
        profile={profile}
        service={service}
        days={serviceAvailability.data.days}
        initialDate={day}
        form={draft}
        errors={errors}
        onChange={changeField}
        onErrors={setErrors}
        onClose={closeWaitlist}
        onUnavailable={() => setScreen('unavailable')}
      />
    );
  }

  const singleService = steps.length === 3;
  const chips: SelectionChip[] = [];
  if (service && (step === 'when' || step === 'details')) {
    const label = serviceChip(service);
    chips.push(singleService ? { label, title: label } : { label, title: `Cambiar servicio: ${label}`, target: 'service' });
  }
  if (draft.start && step === 'details') {
    const label = whenChip(draft.start);
    chips.push({ label, title: `Cambiar día y hora: ${label}`, target: 'when' });
  }

  const reviewRows: ReviewRow[] = [
    {
      label: 'Servicio',
      value: service ? joinDot(service.name, formatDuration(service.durationMin)) : '—',
      sub: service ? formatServicePrice(service) : '',
      step: singleService ? null : 'service',
    },
    {
      label: 'Cuándo',
      value: draft.start ? capitalize(formatDayLong(bogotaDate(draft.start))) : '—',
      sub: draft.start ? timeLabel(draft.start) : '',
      step: 'when',
    },
    {
      label: 'A nombre de',
      value: draft.name.trim() || '—',
      // Non-breaking spaces keep "+57 300 123 4567" on one line.
      sub: joinDot(draft.email.trim(), draft.phone && `+57 ${formatPhone(normalizePhone(draft.phone))}`.replace(/ /g, ' ')),
      step: 'details',
    },
  ];

  const busy = submitting || captcha.waiting;
  // First step: the green profile band, except on short screens (landscape), which keep the compact row.
  const intro = stepIndex === 0 && !shortScreen;
  const titleAs = intro ? 'h2' : 'h1';
  const progress = { index: stepIndex, total: steps.length, step, chips, onChip: go };
  return (
    <Frame label={`Separar cita con ${profile.name}`}>
      {!intro && <FlowHeader {...progress} profile={profile} onBack={back} />}
      <main ref={scrollerRef} class="scroll-area">
        {intro && <FlowIntro {...progress} profile={profile} />}
        <div class={`min-h-full px-5 pb-4 flex flex-col fade-in short:pt-3 ${intro ? 'pt-[18px]' : 'pt-[22px]'}`} key={step}>
          {step === 'service' && (
            <StepService profile={profile} serviceId={draft.serviceId} onPick={pickService} titleRef={titleRef} titleAs={titleAs} />
          )}
          {step === 'when' && (
            <StepWhen
              key={serviceAvailability?.status ?? 'idle'}
              availability={serviceAvailability}
              day={day}
              start={draft.start}
              notice={slotNotice}
              onPickDay={pickDay}
              onPickSlot={pickSlot}
              onRetry={() => service && refreshAvailability(service.id)}
              onWaitlist={openWaitlist}
              titleRef={titleRef}
              titleAs={titleAs}
            />
          )}
          {step === 'details' && (
            <StepDetails
              form={draft}
              errors={errors}
              onChange={changeField}
              onBlur={blurField}
              remember={Boolean(draft.remember)}
              onRemember={(remember) => setDraft((d) => ({ ...d, remember }))}
              prefilled={prefilled && Boolean(draft.remember)}
              titleRef={titleRef}
            />
          )}
          {step === 'review' && (
            <StepReview
              rows={reviewRows}
              address={fullAddress(profile, false)}
              error={submitError}
              onEdit={go}
              titleRef={titleRef}
              captcha={captcha.box}
            />
          )}
          {stepIndex === 0 && <LegalLinks class="mt-auto pt-6" />}
        </div>
      </main>
      <FlowFooter>
        {step === 'review' && captcha.needsInteraction && <CaptchaHint />}
        {step !== 'review' ? (
          <button type="button" onClick={next} disabled={!canNext} class={canNext ? PRIMARY_BUTTON : DISABLED_BUTTON}>
            {canNext ? 'Siguiente' : blockedLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            aria-busy={busy}
            aria-disabled={busy}
            class={`${PRIMARY_BUTTON} ${busy ? 'opacity-80 cursor-progress' : ''}`}
          >
            {busy ? 'Separando tu cita…' : 'Separar mi cita'}
          </button>
        )}
      </FlowFooter>
    </Frame>
  );
}

/** Profile not embedded in the page (rare): the step-1 band shape while it loads. */
function LoadingFrame() {
  return (
    <Frame label="Cargando agenda">
      <div class="safe-top bg-primary rounded-b-[28px] shrink-0" aria-hidden="true">
        <div class="pt-[18px] px-5 pb-6 flex flex-col gap-[18px] short:py-3">
          <div class="h-7 w-28 rounded-full bg-white/14" />
          <div class="flex items-center gap-3.5">
            <div class="w-16 h-16 rounded-full bg-white/14 short:w-9 short:h-9" />
            <div class="flex flex-col gap-2 grow">
              <div class="h-6 w-44 rounded-full bg-white/14" />
              <div class="h-4 w-32 rounded-full bg-white/14" />
            </div>
          </div>
        </div>
      </div>
      <div class="p-5 flex flex-col gap-3" aria-hidden="true">
        <div class="skeleton h-8 w-56 rounded-full" />
        {[0, 1, 2].map((i) => (
          <div key={i} class="skeleton h-[84px] rounded-[20px]" />
        ))}
      </div>
      <span class="sr-only" role="status">Cargando agenda…</span>
    </Frame>
  );
}

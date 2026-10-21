/**
 * The /<slug> booking flow: Servicio → Día y hora → Tus datos → Confirmar,
 * then the confirmation screen. Each step is a history entry (the browser
 * back button steps back) and the half-filled form survives a reload
 * (sessionStorage).
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { AVAILABILITY_DAYS, type CreateBookingResponse, type PublicProfile } from '@shared/api';
import { capitalize, formatCop, formatDayLong, formatDayShort, formatDuration, formatInstantTime } from '@shared/format';
import { normalizeEmail } from '@shared/contact';
import { bogotaDate } from '@shared/time';
import { Frame, DISABLED_BUTTON, LegalLinks, PRIMARY_BUTTON } from '../components/ui';
import { ApiError, errorMessage } from '../lib/api';
import type { Runtime } from '../lib/bootstrap';
import { loadJson, removeKey, saveJson } from '../lib/storage';
import { formatPhone, fullAddress, joinDot, normalizePhone } from '../lib/text';
import {
  CONTACT_FIELDS, fieldsFromApi, isContactFilled, validateContact, validateField,
  type ContactErrors, type ContactField, type ContactForm,
} from '../lib/validation';
import { Confirmed } from './Confirmed';
import { FlowFooter, FlowHeader, type Step } from './FlowChrome';
import { FIELD_IDS, StepDetails } from './StepDetails';
import { StepReview, type ReviewRow } from './StepReview';
import { StepService } from './StepService';
import { StepWhen, type AvailabilityState } from './StepWhen';
import { TurnstileBox } from './TurnstileBox';
import { MissingScreen, Unavailable } from './Unavailable';

interface Draft extends ContactForm {
  serviceId: string | null;
  day: string | null;
  start: string | null;
}

interface HistoryState {
  sep: Step | 'done';
  d: number;
}

const EMPTY_DRAFT: Draft = { serviceId: null, day: null, start: null, name: '', email: '', phone: '', agree: false };
const BLOCKED_LABELS: Record<1 | 2 | 3, string> = { 1: 'Elige un servicio', 2: 'Elige día y hora', 3: 'Completa tus datos' };
const SLOT_TAKEN_NOTICE = 'Alguien acaba de separar esa hora. Elige otra, por favor.';

type Screen = 'flow' | 'unavailable' | 'notfound' | 'error';

interface Props {
  slug: string;
  initialProfile: PublicProfile | null;
  runtime: Runtime;
}

function historyState(): Partial<HistoryState> {
  return (history.state as Partial<HistoryState> | null) ?? {};
}

/** Furthest step the draft supports (used when restoring after a reload or a back/forward jump). */
function maxStep(draft: Draft): Step {
  if (!draft.serviceId) return 1;
  if (!draft.start) return 2;
  if (Object.keys(validateContact(draft)).length > 0) return 3;
  return 4;
}

function clampStep(wanted: unknown, draft: Draft): Step {
  const n = typeof wanted === 'number' && wanted >= 1 && wanted <= 4 ? (wanted as Step) : 1;
  return Math.min(n, maxStep(draft)) as Step;
}

function restoreDraft(key: string, profile: PublicProfile | null): Draft {
  const saved = loadJson<Partial<Draft>>(key);
  const draft = { ...EMPTY_DRAFT, ...saved };
  if (profile && draft.serviceId && !profile.services.some((s) => s.id === draft.serviceId)) {
    return { ...draft, serviceId: null, day: null, start: null };
  }
  return draft;
}

export function BookingApp({ slug, initialProfile, runtime }: Props) {
  const draftKey = `separame:booking:${slug}`;
  const doneKey = `${draftKey}:done`;
  const { api, turnstileSiteKey } = runtime;

  const [profile, setProfile] = useState(initialProfile);
  const [screen, setScreen] = useState<Screen>('flow');
  const [draft, setDraft] = useState<Draft>(() => restoreDraft(draftKey, initialProfile));
  const [step, setStep] = useState<Step>(() => clampStep(historyState().sep, draft));
  const [done, setDone] = useState<CreateBookingResponse | null>(() =>
    historyState().sep === 'done' ? loadJson<CreateBookingResponse>(doneKey) : null,
  );
  const [availability, setAvailability] = useState<Record<string, AvailabilityState>>({});
  const [errors, setErrors] = useState<ContactErrors>({});
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);

  const depthRef = useRef<number>(historyState().d ?? 0);
  const inflightRef = useRef(new Set<string>());
  const pendingSubmitRef = useRef(false);
  const focusTitleRef = useRef(false);
  const scrollerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const latestRef = useRef({ draft, done });

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
        setProfile(res.profile);
        if (!res.active) setScreen('unavailable');
      })
      .catch((error: unknown) => {
        if (!cancelled) setScreen(error instanceof ApiError && error.code === 'not_found' ? 'notfound' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [api, slug, profile]);

  useEffect(() => {
    if (profile && !document.title) document.title = `${profile.name} · Separa tu cita · Sepárame`;
  }, [profile]);

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

  const refreshAvailability = (serviceId: string) =>
    setAvailability((all) => {
      const next = { ...all };
      delete next[serviceId];
      return next;
    });

  // ── Persistence + history ──
  useEffect(() => {
    latestRef.current = { draft, done };
    saveJson(draftKey, draft);
  }, [draft, done, draftKey]);

  useEffect(() => {
    if (historyState().sep === undefined) {
      history.replaceState({ sep: latestRef.current.done ? 'done' : 1, d: 0 } satisfies HistoryState, '');
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
      focusTitleRef.current = true;
      if (latestRef.current.done) {
        // Leaving the confirmation through "back" starts a fresh booking.
        setDone(null);
        removeKey(doneKey);
        setStep(1);
        return;
      }
      setStep(clampStep(state.sep, latestRef.current.draft));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [doneKey]);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    if (focusTitleRef.current) {
      focusTitleRef.current = false;
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [step]);

  const go = (next: Step) => {
    depthRef.current += 1;
    history.pushState({ sep: next, d: depthRef.current } satisfies HistoryState, '');
    focusTitleRef.current = true;
    setStep(next);
  };

  const back = () => {
    if (step === 1) return;
    if (depthRef.current > 0 && historyState().sep === step) {
      history.back();
      return;
    }
    const prev = (step - 1) as Step;
    history.replaceState({ sep: prev, d: 0 } satisfies HistoryState, '');
    focusTitleRef.current = true;
    setStep(prev);
  };

  // ── Step actions ──
  const pickService = (serviceId: string) =>
    setDraft((d) => (d.serviceId === serviceId ? d : { ...d, serviceId, day: null, start: null }));

  const pickDay = (date: string) =>
    setDraft((d) => ({ ...d, day: date, start: d.start && bogotaDate(d.start) === date ? d.start : null }));

  const pickSlot = (start: string) => {
    setSlotNotice(null);
    setDraft((d) => ({ ...d, start, day: bogotaDate(start) }));
  };

  const changeField = (field: ContactField, value: string | boolean) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    if (errors[field]) setErrors((e) => ({ ...e, [field]: validateField(field, next) }));
  };

  const canNext = step === 1 ? Boolean(service) : step === 2 ? Boolean(draft.start) : isContactFilled(draft);

  const next = () => {
    if (!canNext) return;
    if (step === 3) {
      const found = validateContact(draft);
      setErrors(found);
      const first = CONTACT_FIELDS.find((f) => found[f]);
      if (first) {
        document.getElementById(FIELD_IDS[first])?.focus();
        return;
      }
    }
    if (step < 4) go((step + 1) as Step);
  };

  // ── Booking ──
  const resetCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaReset((n) => n + 1);
  };

  const book = async (token: string) => {
    if (!service || !draft.start) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api.createBooking(apiSlug, {
        serviceId: service.id,
        start: draft.start,
        client: { name: draft.name.trim(), email: normalizeEmail(draft.email), phone: normalizePhone(draft.phone) },
        consent: true,
        turnstileToken: token,
      });
      saveJson(doneKey, result);
      removeKey(draftKey);
      history.replaceState({ sep: 'done', d: depthRef.current } satisfies HistoryState, '');
      setDraft(EMPTY_DRAFT);
      setDone(result);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'internal';
      if (code === 'slot_taken') {
        setSlotNotice(SLOT_TAKEN_NOTICE);
        setDraft((d) => ({ ...d, start: null }));
        refreshAvailability(service.id);
        go(2);
      } else if (code === 'agenda_unavailable') {
        setScreen('unavailable');
      } else if (code === 'validation' && error instanceof ApiError) {
        const found = fieldsFromApi(error.fields);
        if (Object.keys(found).length > 0) {
          setErrors(found);
          go(3);
        } else {
          setSubmitError('Revisa los datos de tu cita e inténtalo de nuevo.');
        }
      } else {
        setSubmitError(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
      if (turnstileSiteKey) resetCaptcha();
    }
  };

  const submit = () => {
    if (submitting) return;
    if (!turnstileSiteKey) {
      void book('mock-turnstile-token');
      return;
    }
    if (captchaToken) {
      void book(captchaToken);
      return;
    }
    if (captchaFailed) {
      setCaptchaFailed(false);
      setSubmitError(errorMessage(new ApiError('captcha_failed', '')));
      resetCaptcha();
      return;
    }
    // Token still on its way: submit as soon as Turnstile hands it over.
    pendingSubmitRef.current = true;
    setSubmitting(true);
  };

  const onCaptchaToken = (token: string | null) => {
    setCaptchaToken(token);
    if (token) setCaptchaFailed(false);
    if (token && pendingSubmitRef.current) {
      pendingSubmitRef.current = false;
      void book(token);
    }
  };

  const onCaptchaError = () => {
    setCaptchaFailed(true);
    if (pendingSubmitRef.current) {
      pendingSubmitRef.current = false;
      setSubmitting(false);
      setSubmitError(errorMessage(new ApiError('captcha_failed', '')));
    }
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
  if (done) return <Confirmed result={done} />;

  const summary =
    step === 2 && service
      ? joinDot(service.name, formatDuration(service.durationMin))
      : step === 3 && service && draft.start
        ? `${joinDot(service.name, formatDayShort(bogotaDate(draft.start)))}, ${formatInstantTime(draft.start)}`
        : '';

  const reviewRows: ReviewRow[] = [
    {
      label: 'Servicio',
      value: service ? joinDot(service.name, formatDuration(service.durationMin)) : '—',
      sub: service ? formatCop(service.priceCop) : '',
      step: 1,
    },
    {
      label: 'Cuándo',
      value: draft.start ? capitalize(formatDayLong(bogotaDate(draft.start))) : '—',
      sub: draft.start ? formatInstantTime(draft.start) : '',
      step: 2,
    },
    {
      label: 'A nombre de',
      value: draft.name.trim() || '—',
      // Non-breaking spaces keep "+57 300 123 4567" on one line.
      sub: joinDot(draft.email.trim(), draft.phone && `+57 ${formatPhone(normalizePhone(draft.phone))}`.replace(/ /g, '\u00a0')),
      step: 3,
    },
  ];

  return (
    <Frame label={`Separar cita con ${profile.name}`}>
      <FlowHeader profile={profile} step={step} onBack={back} />
      <main ref={scrollerRef} class="scroll-area">
        <div class="min-h-full pt-[22px] px-5 pb-4 flex flex-col fade-in" key={step}>
          {step === 1 && <StepService profile={profile} serviceId={draft.serviceId} onPick={pickService} titleRef={titleRef} />}
          {step === 1 && <LegalLinks class="mt-auto pt-6" />}
          {step === 2 && (
            <StepWhen
              availability={service ? availability[service.id] : undefined}
              day={draft.day}
              start={draft.start}
              notice={slotNotice}
              onPickDay={pickDay}
              onPickSlot={pickSlot}
              onRetry={() => service && refreshAvailability(service.id)}
              titleRef={titleRef}
            />
          )}
          {step === 3 && <StepDetails form={draft} errors={errors} onChange={changeField} titleRef={titleRef} />}
          {step === 4 && (
            <StepReview
              rows={reviewRows}
              address={fullAddress(profile, false)}
              error={submitError}
              onEdit={go}
              titleRef={titleRef}
              captcha={
                turnstileSiteKey ? (
                  <TurnstileBox siteKey={turnstileSiteKey} resetKey={captchaReset} onToken={onCaptchaToken} onError={onCaptchaError} />
                ) : null
              }
            />
          )}
        </div>
      </main>
      <FlowFooter summary={summary}>
        {step < 4 ? (
          <button type="button" onClick={next} disabled={!canNext} class={canNext ? PRIMARY_BUTTON : DISABLED_BUTTON}>
            {canNext ? 'Siguiente' : BLOCKED_LABELS[step as 1 | 2 | 3]}
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            aria-busy={submitting}
            aria-disabled={submitting}
            class={`${PRIMARY_BUTTON} ${submitting ? 'opacity-80 cursor-progress' : ''}`}
          >
            {submitting ? 'Separando tu cita…' : 'Separar mi cita'}
          </button>
        )}
      </FlowFooter>
    </Frame>
  );
}

function LoadingFrame() {
  return (
    <Frame label="Cargando agenda">
      <div class="safe-top border-b border-line px-4 py-3.5 flex flex-col gap-3.5" aria-hidden="true">
        <div class="flex items-center gap-2.5 min-h-11">
          <div class="skeleton w-11 h-11 rounded-full" />
          <div class="flex flex-col gap-1.5 grow">
            <div class="skeleton h-3.5 w-36 rounded-full" />
            <div class="skeleton h-3 w-48 rounded-full" />
          </div>
        </div>
        <div class="grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} class="block h-1.5 rounded-full bg-line" />
          ))}
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

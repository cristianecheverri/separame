/**
 * The /<slug> booking flow: Servicio → Día y hora → Tus datos → Confirmar
 * (3 steps when the professional offers a single service; team pages start
 * with «¿Con quién?», 5 steps — see lib/team.ts), then the
 * confirmation screen. Each step is a history entry (the browser back button
 * steps back), the half-filled form survives a reload (sessionStorage) and
 * `?service=<id>&date=<YYYY-MM-DD>` deep-links into "Día y hora" (the date is
 * only used when it has free hours; otherwise, as always, the first day with
 * free hours comes preselected). The email is optional here; the phone is not.
 * "Recordar mis datos" keeps name / phone / email in this browser for next time.
 *
 * The hour the client taps is held for them on the server (HOLD_MINUTES; nobody
 * else can take it meanwhile) and held again — which re-checks it — on every
 * "Siguiente" after it, so a taken hour sends them back to «Día y hora» before
 * they type their details, not after.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  AVAILABILITY_DAYS, HOLD_MINUTES, type CreateBookingResponse, type PublicProfile, type PublicService, type PublicTeam,
} from '@shared/api';
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
import { ANY_PRO, createTeamApi, profileForChoice, teamPageOf, type Offering, type TeamPage } from '../lib/team';
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
import { StepWhen, type Assignee, type AvailabilityState } from './StepWhen';
import { StepWho } from './StepWho';
import { CaptchaHint, useCaptcha } from './useCaptcha';
import { MissingScreen, Unavailable } from './Unavailable';
import { WaitlistScreen } from './WaitlistScreen';

interface Draft extends ContactForm {
  /** Team pages: the member's slug or ANY_PRO («Cualquiera disponible»). */
  who?: string | null;
  serviceId: string | null;
  day: string | null;
  start: string | null;
  /** UUID of this booking attempt (new for every picked slot): a retry after a lost response gets the same appointment. */
  idempotencyKey?: string | null;
  /** UUID of this visitor's hold (kept across reloads, so their own held hour doesn't show as taken). */
  holdId?: string | null;
  /** "Recordar mis datos en este celular". */
  remember?: boolean;
}

interface HistoryState {
  sep: StepId | 'done' | 'waitlist';
  d: number;
}

const ALL_STEPS: StepId[] = ['who', 'service', 'when', 'details', 'review'];
const EMPTY_DRAFT: Draft = {
  who: null, serviceId: null, day: null, start: null, name: '', email: '', phone: '', agree: false, idempotencyKey: null, holdId: null,
  remember: false,
};
/** The phone is what the pro needs; the email only brings the confirmation and the reminder. */
const CONTACT_RULES: ContactRules = { emailOptional: true };
const BLOCKED_LABELS = {
  who: 'Elige con quién',
  service: 'Elige un servicio',
  when: 'Elige día y hora',
  hour: 'Elige una hora',
} as const;
const THEME_GREEN = '#0B6E4F';
const THEME_WHITE = '#FFFFFF';
const SLOT_TAKEN_NOTICE = 'Alguien acaba de separar esa hora. Elige otra, por favor.';
/** The page stayed open past the hour's start (it can only be booked a few minutes after it starts). */
const SLOT_STARTED_NOTICE = 'Esa hora ya empezó. Elige otra, por favor.';
const hasStarted = (start: string): boolean => Date.parse(start) <= Date.now();
/** A hold younger than this already counts as the re-check of "Siguiente" (it was just tapped). */
const FRESH_HOLD_MS = 15_000;

interface HoldAttempt {
  start: string;
  at: number;
  /** false only when the hour is no longer free. */
  result: Promise<boolean>;
  /** `result` once it settled (null while on its way). */
  free: boolean | null;
}

function holdAttempt(start: string, result: Promise<boolean>): HoldAttempt {
  const attempt: HoldAttempt = { start, at: Date.now(), result, free: null };
  void result.then((free) => (attempt.free = free));
  return attempt;
}
const isFreshHold = (attempt: HoldAttempt | null, start: string): attempt is HoldAttempt =>
  attempt !== null && attempt.start === start && Date.now() - attempt.at < FRESH_HOLD_MS;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Screen = 'flow' | 'unavailable' | 'notfound' | 'error';

interface Props {
  slug: string;
  initialProfile: PublicProfile | null;
  /** Team plan: the consultorio page (first step «¿Con quién?»); `initialProfile` is then null. */
  team?: PublicTeam | null;
  runtime: Runtime;
}

function historyState(): Partial<HistoryState> {
  return (history.state as Partial<HistoryState> | null) ?? {};
}

/** Team pages always show the 5 steps (the service step too, even when the member offers one). */
function stepsFor(profile: PublicProfile | null, teamPage: boolean): StepId[] {
  if (teamPage) return ALL_STEPS;
  return profile?.services.length === 1 ? ALL_STEPS.slice(2) : ALL_STEPS.slice(1);
}

/** Furthest step the draft supports (used when restoring after a reload or a back/forward jump). */
function maxStep(draft: Draft, steps: StepId[]): StepId {
  if (steps[0] === 'who' && !draft.who) return 'who';
  if (!draft.serviceId) return 'service';
  if (!draft.start) return 'when';
  if (Object.keys(validateContact(draft, CONTACT_RULES)).length > 0) return 'details';
  return 'review';
}

function clampStep(wanted: unknown, draft: Draft, steps: StepId[]): StepId {
  const limit = ALL_STEPS.indexOf(maxStep(draft, steps));
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

/** The only service of a profile comes preselected. */
function withSingleService(draft: Draft, profile: PublicProfile | null): Draft {
  return profile?.services.length === 1 && !draft.serviceId ? { ...draft, serviceId: profile.services[0].id } : draft;
}

/** A restored service the profile no longer offers is dropped (with its day and hour). */
function withKnownService(draft: Draft, profile: PublicProfile | null): Draft {
  const known = Boolean(draft.serviceId && profile?.services.some((s) => s.id === draft.serviceId));
  return known ? draft : { ...draft, serviceId: null, day: null, start: null };
}

/** Team page: the restored «¿Con quién?» choice, if that member still exists, and its service. */
function initialTeamDraft(restored: { draft: Draft; prefilled: boolean }, page: TeamPage): Boot {
  let draft = restored.draft;
  const profile = profileForChoice(page, draft.who);
  if (!profile) draft = { ...draft, who: null };
  draft = withSingleService(withKnownService(draft, profile), profile);
  return { draft, deepLinked: false, date: null, prefilled: restored.prefilled };
}

/** Restored draft + saved contact + single-service preselection + `?service=&date=` deep link. */
function initialDraft(key: string, profile: PublicProfile | null, page: TeamPage | null = null): Boot {
  const restored = withSavedContact({ ...EMPTY_DRAFT, ...loadJson<Partial<Draft>>(key) });
  if (page) return initialTeamDraft(restored, page);
  let draft = restored.draft;
  const boot = (deepLinked: boolean, date: string | null = null): Boot => ({ draft, deepLinked, date, prefilled: restored.prefilled });
  if (!profile) return boot(false);
  const known = (id: string | null) => Boolean(id && profile.services.some((s) => s.id === id));
  draft = withSingleService(withKnownService(draft, profile), profile);

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

/** Availability is cached per professional and service (team pages mix several professionals). */
const availabilityKey = (slug: string, serviceId: string) => `${slug}|${serviceId}`;

export function BookingApp({ slug, initialProfile, team = null, runtime }: Props) {
  const draftKey = `separame:booking:${slug}`;
  const doneKey = `${draftKey}:done`;
  const { turnstileSiteKey } = runtime;
  // Team page: «Cualquiera disponible» books through the team's slug, which this client fans out to the members.
  const teamPage = useMemo(() => (team ? teamPageOf(team) : null), [team]);
  const teamApi = useMemo(() => (teamPage ? createTeamApi(runtime.api, teamPage) : null), [teamPage, runtime.api]);
  const api = teamApi ?? runtime.api;

  const [boot] = useState(() => initialDraft(draftKey, initialProfile, teamPage));
  const [fetchedProfile, setProfile] = useState(initialProfile);
  const [screen, setScreen] = useState<Screen>('flow');
  const [draft, setDraft] = useState<Draft>(boot.draft);
  const [step, setStep] = useState<StepId>(() =>
    boot.deepLinked ? 'when' : clampStep(historyState().sep, boot.draft, stepsFor(initialProfile, Boolean(teamPage))),
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
  /** "Siguiente" is re-checking the held hour. */
  const [checking, setChecking] = useState(false);
  /** The hour the server is holding for this visitor (null: none, or the service is too long to hold). */
  const [heldStart, setHeldStart] = useState<string | null>(null);
  const captcha = useCaptcha(turnstileSiteKey);
  const shortScreen = useShortScreen();

  /** The profile the flow books with (on a team page: the picked member, «Cualquiera disponible» or none yet). */
  const profile = teamPage ? profileForChoice(teamPage, draft.who) : fetchedProfile;
  /** The band and header row: the consultorio on a team page. */
  const shownProfile = teamPage?.header ?? fetchedProfile;
  const steps = stepsFor(profile, Boolean(teamPage));

  const depthRef = useRef<number>(historyState().d ?? 0);
  const inflightRef = useRef(new Set<string>());
  const focusTitleRef = useRef(false);
  const scrollerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const latestRef = useRef({ draft, done, steps });
  const holdIdRef = useRef(boot.draft.holdId ?? newUuid());
  const holdRef = useRef<HoldAttempt | null>(null);
  /** The page slug the current hold was placed through (team page: a member, or the team's for «Cualquiera disponible»). */
  const heldSlugRef = useRef<string | null>(null);

  const stepIndex = Math.max(0, steps.indexOf(step));
  const apiSlug = profile?.slug ?? slug;
  /** Analytics: the page's slug (the team's on a team page) and, there, whether the client chose someone. */
  const trackSlug = team?.slug ?? apiSlug;
  const proChoice = teamPage && draft.who ? { pro_choice: draft.who === ANY_PRO ? ('any' as const) : ('specific' as const) } : {};
  const service = profile?.services.find((s) => s.id === draft.serviceId) ?? null;

  // ── Profile (only fetched when the page wasn't generated with it embedded) ──
  useEffect(() => {
    if (fetchedProfile || teamPage) return;
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
        setStep(next.deepLinked ? 'when' : clampStep(historyState().sep, next.draft, stepsFor(res.profile, false)));
        if (!res.active) setScreen('unavailable');
      })
      .catch((error: unknown) => {
        if (!cancelled) setScreen(error instanceof ApiError && error.code === 'not_found' ? 'notfound' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [api, slug, fetchedProfile, teamPage, draftKey]);

  const viewTrackedRef = useRef(false);
  useEffect(() => {
    if (!shownProfile) return;
    if (!viewTrackedRef.current) {
      viewTrackedRef.current = true;
      track('booking_view', { pro_slug: shownProfile.slug });
    }
    stripDeepLink();
    if (!document.title) document.title = `${shownProfile.name} · Separa tu cita · Sepárame`;
  }, [shownProfile]);

  useEffect(() => {
    if (screen === 'unavailable') track('booking_unavailable', { pro_slug: trackSlug });
  }, [screen, trackSlug]);

  // ── Availability: one call (14 days) per professional and service; prefetch the first service ──
  const fetchAvailability = useCallback(
    (fromSlug: string, serviceId: string) => {
      const key = availabilityKey(fromSlug, serviceId);
      if (inflightRef.current.has(key)) return;
      inflightRef.current.add(key);
      api
        .getAvailability(fromSlug, { serviceId, days: AVAILABILITY_DAYS, holdId: holdIdRef.current })
        .then((data) => {
          setAvailability((all) => ({ ...all, [key]: { status: 'ready', data } }));
          if (!data.active) setScreen('unavailable');
        })
        .catch((error: unknown) => {
          setAvailability((all) => ({ ...all, [key]: { status: 'error', message: errorMessage(error) } }));
        })
        .finally(() => inflightRef.current.delete(key));
    },
    [api],
  );

  // Before «¿Con quién?» is answered, the owner's first service tells whether the agenda is open.
  const prefetchProfile = profile ?? team?.members[0] ?? null;
  const wantedService = (profile ? draft.serviceId : null) ?? prefetchProfile?.services[0]?.id ?? null;
  useEffect(() => {
    if (prefetchProfile && wantedService && !availability[availabilityKey(prefetchProfile.slug, wantedService)]) {
      fetchAvailability(prefetchProfile.slug, wantedService);
    }
  }, [prefetchProfile, wantedService, availability, fetchAvailability]);

  // The first day with free hours comes preselected (or the deep-linked one, if it has free hours);
  // a closed / out-of-window day (stale draft) never stays selected. Resolved during render so the
  // hours paint together with the days; the effect then stores it in the draft.
  const serviceAvailability = service ? availability[availabilityKey(apiSlug, service.id)] : undefined;
  const availableDays = serviceAvailability?.status === 'ready' ? serviceAvailability.data.days : null;
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
      delete next[availabilityKey(apiSlug, serviceId)];
      return next;
    });

  // ── Team page: who takes the appointment ──
  /** «Cualquiera disponible»: the member the picked hour was assigned to (null until an hour is picked). */
  const anyOffering: Offering | null =
    draft.who === ANY_PRO && service && draft.start ? (teamApi?.assigneeOf(service.id, draft.start) ?? null) : null;
  /** The professional of the appointment: the picked member, or the one assigned to the hour. */
  const attendant: PublicProfile | null = teamPage ? (draft.who === ANY_PRO ? (anyOffering?.member ?? null) : profile) : null;
  const assignee: Assignee | null =
    anyOffering && team
      ? { name: anyOffering.member.name, initials: anyOffering.member.initials, logo: anyOffering.member.logo, index: anyOffering.index }
      : null;
  /** What is booked: under «Cualquiera disponible», the assigned member's own service (their price). */
  const bookedService = anyOffering?.service ?? service;

  // ── Persistence + history ──
  useEffect(() => {
    latestRef.current = { draft, done, steps };
    saveJson(draftKey, draft);
  }, [draft, done, steps, draftKey]);

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
        setStep(current.steps[0]);
        return;
      }
      setStep(clampStep(state.sep, current.draft, current.steps));
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
    track('booking_step', { pro_slug: trackSlug, step: next, ...proChoice });
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
  /** Another professional = other services: the service, day and hour start over. */
  const pickWho = (who: string) =>
    setDraft((d) => {
      if (d.who === who || !teamPage) return d;
      return withSingleService({ ...d, who, serviceId: null, day: null, start: null }, profileForChoice(teamPage, who));
    });

  const pickService = (serviceId: string) =>
    setDraft((d) => (d.serviceId === serviceId ? d : { ...d, serviceId, day: null, start: null }));

  const pickDay = (date: string) =>
    setDraft((d) => ({ ...d, day: date, start: d.start && bogotaDate(d.start) === date ? d.start : null }));

  // ── Holding the picked hour ──
  /** The hour was taken meanwhile: back to its day's hours, with the notice, on fresh availability. */
  const loseSlot = (serviceId: string, start: string) => {
    setSlotNotice(hasStarted(start) ? SLOT_STARTED_NOTICE : SLOT_TAKEN_NOTICE);
    setHeldStart(null);
    setDraft((d) => ({ ...d, start: null }));
    refreshAvailability(serviceId);
  };

  /**
   * Holds `start` for this visitor; resolves false only when it is no longer free. Any other
   * failure lets the client go on (the booking itself still can't double-book).
   */
  const hold = (serviceId: string, start: string): Promise<boolean> => {
    // Another professional than the last hold (team page): free that one at once.
    const previousSlug = heldSlugRef.current;
    heldSlugRef.current = apiSlug;
    if (previousSlug && previousSlug !== apiSlug) void api.releaseHold(previousSlug, holdIdRef.current).catch(() => undefined);
    const result = api
      .holdSlot(apiSlug, { serviceId, start, holdId: holdIdRef.current })
      .then((res) => {
        if (latestRef.current.draft.start === start) setHeldStart(res.expiresAt ? start : null);
        return true;
      })
      .catch((error: unknown) => {
        const code = error instanceof ApiError ? error.code : 'internal';
        if (code === 'agenda_unavailable') setScreen('unavailable');
        return code !== 'slot_taken';
      });
    holdRef.current = holdAttempt(start, result);
    return result;
  };

  const pickSlot = (start: string) => {
    setSlotNotice(null);
    setHeldStart(null);
    setDraft((d) => ({
      ...d, start, day: bogotaDate(start), holdId: holdIdRef.current,
      idempotencyKey: d.start === start && d.idempotencyKey ? d.idempotencyKey : newUuid(),
    }));
    if (!service) return;
    const serviceId = service.id;
    void hold(serviceId, start).then((free) => {
      if (!free && latestRef.current.draft.start === start) loseSlot(serviceId, start);
    });
  };

  /** «Olvidar»: the saved contact leaves this phone and the form starts empty. */
  const forgetContact = () => {
    saveContact(null);
    setPrefilled(false);
    setErrors({});
    setDraft((d) => ({ ...d, name: '', phone: '', email: '', remember: false }));
    document.getElementById(FIELD_IDS.name)?.focus();
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

  const canNext =
    step === 'who'
      ? Boolean(profile)
      : step === 'service'
        ? Boolean(service)
        : step === 'when'
          ? Boolean(draft.start)
          : isContactFilled(draft, CONTACT_RULES);
  const dayHasHours = Boolean(availableDays?.some((d) => d.date === day && isDayBookable(d)));
  const blockedLabel =
    step === 'who' || step === 'service'
      ? BLOCKED_LABELS[step]
      : step === 'when'
        ? BLOCKED_LABELS[dayHasHours ? 'hour' : 'when']
        : contactBlockedLabel(draft, CONTACT_RULES);

  const next = async () => {
    if (!canNext || checking) return;
    if (step === 'details') {
      const found = validateContact(draft, CONTACT_RULES);
      setErrors(found);
      const first = CONTACT_FIELDS.find((f) => found[f]);
      if (first) {
        document.getElementById(FIELD_IDS[first])?.focus();
        return;
      }
    }
    // Leaving «Día y hora» or «Tus datos»: the hour must still be free (and stays held a while longer).
    // A hold from a tap a moment ago counts; when it already came back free, no wait at all.
    const start = draft.start;
    if ((step === 'when' || step === 'details') && service && start) {
      const last = holdRef.current;
      const fresh = isFreshHold(last, start);
      if (!fresh || last.free !== true) {
        setChecking(true);
        const free = await (fresh ? last.result : hold(service.id, start));
        setChecking(false);
        if (!free) {
          track('booking_error', { pro_slug: trackSlug, reason: 'slot_taken' });
          loseSlot(service.id, start);
          if (step !== 'when') go('when');
          return;
        }
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
        holdId: holdIdRef.current,
      });
      holdIdRef.current = newUuid();
      holdRef.current = null;
      heldSlugRef.current = null;
      setHeldStart(null);
      saveJson(doneKey, result);
      removeKey(draftKey);
      saveContact(draft.remember ? { name: draft.name.trim(), phone: formatPhone(normalizePhone(draft.phone)), email: normalizeEmail(draft.email) } : null);
      history.replaceState({ sep: 'done', d: depthRef.current } satisfies HistoryState, '');
      // A fresh attempt: the only service comes preselected again (else «Volver a la agenda» would open
      // «Día y hora» without a service), the saved contact is prefilled, and the availability fetched
      // before this booking is dropped so the booked hour doesn't show as free.
      const fresh = withSavedContact(EMPTY_DRAFT);
      setDraft(teamPage ? fresh.draft : withSingleService(fresh.draft, fetchedProfile));
      setPrefilled(fresh.prefilled);
      setAvailability({});
      setDone(result);
      track('booking_confirmed', { pro_slug: trackSlug, has_email: normalizeEmail(draft.email) ? 'yes' : 'no', ...proChoice });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'internal';
      track('booking_error', { pro_slug: trackSlug, reason: code });
      if (code === 'slot_taken') {
        loseSlot(service.id, draft.start);
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

  /** «Volver a la agenda» from the confirmation: a fresh booking on this same page. */
  const restart = () => {
    removeKey(doneKey);
    // The confirmation may have stayed open a while: hours are fetched again.
    setAvailability({});
    depthRef.current = 0;
    history.replaceState({ sep: steps[0], d: 0 } satisfies HistoryState, '');
    focusTitleRef.current = true;
    setDone(null);
    setStep(steps[0]);
  };

  // Android paints the status bar with theme-color: green while the green profile band is at the top.
  const greenTop = screen === 'unavailable' || !shownProfile || (screen === 'flow' && !done && !waitlistOpen && stepIndex === 0 && !shortScreen);
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', greenTop ? THEME_GREEN : THEME_WHITE);
  }, [greenTop]);

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
  if (!shownProfile) return <LoadingFrame />;
  if (screen === 'unavailable') return <Unavailable profile={shownProfile} />;
  if (done) return <Confirmed result={done} icsUrl={api.icsUrl(done.manageToken)} agendaSlug={team?.slug} onRestart={restart} />;

  if (waitlistOpen && profile && service && serviceAvailability?.status === 'ready') {
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
  const chips = teamPage ? teamChips(step, draft, service, attendant) : soloChips(step, draft, service, singleService);
  const teamName = team?.name ?? profile?.team?.name;

  const reviewRows: ReviewRow[] = [
    ...(teamPage
      ? [{
          label: 'Te atiende',
          value: attendant?.name ?? '—',
          sub: attendant ? joinDot(attendant.title, draft.who === ANY_PRO && 'asignado por estar libre') : '',
          step: 'who' as const,
          changeLabel: 'Cambiar con quién',
        }]
      : []),
    {
      label: 'Servicio',
      value: bookedService ? joinDot(bookedService.name, formatDuration(bookedService.durationMin)) : '—',
      sub: bookedService ? formatServicePrice(bookedService) : '',
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
    <Frame label={`Separar cita con ${shownProfile.name}`}>
      {!intro && <FlowHeader {...progress} profile={shownProfile} onBack={back} />}
      <main ref={scrollerRef} class="scroll-area">
        {intro && <FlowIntro {...progress} profile={shownProfile} members={team?.members} />}
        <div class={`min-h-full px-5 pb-4 flex flex-col fade-in short:pt-3 ${intro ? 'pt-[18px]' : 'pt-[22px]'}`} key={step}>
          {step === 'who' && team && (
            <StepWho team={team} who={draft.who ?? null} onPick={pickWho} titleRef={titleRef} titleAs={titleAs} />
          )}
          {step === 'service' && profile && (
            <StepService
              profile={profile}
              serviceId={draft.serviceId}
              onPick={pickService}
              titleRef={titleRef}
              titleAs={titleAs}
              title={teamPage ? '¿Qué servicio necesitas?' : undefined}
            />
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
              assignee={assignee}
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
              onForget={forgetContact}
              heldMinutes={heldStart && heldStart === draft.start ? HOLD_MINUTES : null}
              titleRef={titleRef}
            />
          )}
          {step === 'review' && (
            <StepReview
              rows={reviewRows}
              address={profile ? joinDot(teamName, fullAddress(profile, false)) : ''}
              error={submitError}
              onEdit={go}
              titleRef={titleRef}
            />
          )}
          {stepIndex === 0 && <LegalLinks class="mt-auto pt-6" />}
        </div>
        {/*
          The invisible captcha starts on «Tus datos» and lives outside the keyed step, so Cloudflare
          hands the token over while the client types: «Separar mi cita» doesn't wait for it.
        */}
        {(step === 'details' || step === 'review') && captcha.box && <div class="px-5 pb-4 -mt-1">{captcha.box}</div>}
      </main>
      <FlowFooter>
        {step === 'review' && captcha.needsInteraction && <CaptchaHint />}
        {step !== 'review' ? (
          <button
            type="button"
            onClick={() => void next()}
            disabled={!canNext}
            aria-busy={checking}
            class={`${canNext ? PRIMARY_BUTTON : DISABLED_BUTTON} ${checking ? 'opacity-80 cursor-progress' : ''}`}
          >
            {checking ? 'Verificando la hora…' : canNext ? 'Siguiente' : blockedLabel}
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

/** A professional's page: the service (steps 2–3) and the day and hour (step 3). */
function soloChips(step: StepId, draft: Draft, service: PublicService | null, singleService: boolean): SelectionChip[] {
  const chips: SelectionChip[] = [];
  if (service && (step === 'when' || step === 'details')) {
    // «Tus datos» also carries the day and hour: without the price both chips fit a 375 px row (it shows in «Confirmar»).
    const label = step === 'details' ? joinDot(service.name, formatDuration(service.durationMin)) : serviceChip(service);
    chips.push(singleService ? { label, title: label } : { label, title: `Cambiar servicio: ${label}`, target: 'service' });
  }
  if (draft.start && step === 'details') {
    const label = whenChip(draft.start);
    chips.push({ label, title: `Cambiar día y hora: ${label}`, target: 'when' });
  }
  return chips;
}

/**
 * Team page (mockup team-booking-who): «Con … · Cambiar» on Servicio; who + service
 * on Día y hora; who attends + day and hour on Tus datos.
 */
function teamChips(step: StepId, draft: Draft, service: PublicService | null, attendant: PublicProfile | null): SelectionChip[] {
  if (!draft.who) return [];
  const who = draft.who === ANY_PRO ? 'Cualquiera disponible' : attendant ? `Con ${attendant.name}` : '';
  const whoChip = (label: string, shrink: boolean): SelectionChip => ({ label, title: `Cambiar con quién: ${label}`, target: 'who', shrink });
  if (step === 'service' && who) return [{ ...whoChip(who, true), change: true }];
  if (step === 'when' && who && service) {
    const label = joinDot(service.name, formatDuration(service.durationMin));
    return [whoChip(who, false), { label, title: `Cambiar servicio: ${label}`, target: 'service', shrink: true }];
  }
  if (step === 'details' && draft.start) {
    const label = whenChip(draft.start);
    const attending = attendant ? `Con ${attendant.name}` : who;
    return [...(attending ? [whoChip(attending, true)] : []), { label, title: `Cambiar día y hora: ${label}`, target: 'when', shrink: false }];
  }
  return [];
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

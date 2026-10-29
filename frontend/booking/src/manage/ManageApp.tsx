/**
 * /c/<token>: the client cancels or reschedules from the link in the email.
 * Loaded lazily — profile pages never download this chunk.
 */
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  AVAILABILITY_DAYS, CLIENT_CHANGE_CUTOFF_MIN, CONFIRM_ACTION_PARAM, type AvailabilityResponse, type BookingSummary, type ManagedAppointmentResponse,
} from '@shared/api';
import { capitalize, DAY_SHORT, formatDayLong, formatInstantTime } from '@shared/format';
import { bogotaDate, jsWeekday } from '@shared/time';
import { CalendarX, Check, Cross, Phone, Swap } from '../components/icons';
import {
  Avatar, DayPill, DISABLED_BUTTON, Frame, Notice, OUTLINE_BUTTON, PageScroll, PRIMARY_BUTTON, SkeletonPills, SkeletonSlots, SlotGroup, WeekNav, Wordmark,
} from '../components/ui';
import { MissingScreen } from '../booking/Unavailable';
import { track } from '../lib/analytics';
import { ApiError, errorMessage, type ApiClient } from '../lib/api';
import { chunk, DAYS_PER_WEEK, isDayBookable, monthLabel, resolveDay, splitSlots, weekOf } from '../lib/slots';
import { firstName, formatPhone, telHref } from '../lib/text';
import { timeLabel, whenLabel } from '../lib/when';

type Mode = 'menu' | 'move' | 'cancel' | 'moved' | 'cancelled' | 'too_late' | 'was_cancelled' | 'past' | 'attended';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: ManagedAppointmentResponse }
  | { status: 'error'; notFound: boolean };

const PRIMARY_BUTTON_16 = PRIMARY_BUTTON.replace('text-[17px]', 'text-[16px]');
const DISABLED_BUTTON_16 = DISABLED_BUTTON.replace('text-[17px]', 'text-[16px]');
const H2 = 'm-0 font-display font-extrabold text-[24px] tracking-[-0.5px] leading-[1.15]';
const H1_BIG = 'm-0 font-display font-extrabold text-[28px] leading-[1.1] tracking-[-0.6px]';
const LINK_BUTTON = 'h-11 border-0 bg-transparent font-semibold text-[14px] text-ink-2 rounded-full hover:text-ink';
const OPTION =
  'flex gap-3.5 items-center w-full min-h-[76px] py-3.5 px-4 rounded-[20px] border-2 border-line bg-white text-ink text-left hover:border-line-strong transition-colors';
const SLOT_TAKEN_NOTICE = 'Alguien acaba de separar esa hora. Elige otra, por favor.';
const UNAVAILABLE_NOTICE = 'En este momento no se puede cambiar el día en línea. Si lo necesitas, puedes cancelar la cita.';

/**
 * `/c/<token>?action=confirm` comes from the reminder email's "Sí, voy" button.
 * It only highlights and focuses "Confirmar asistencia": acting on page load
 * would let link scanners that run JavaScript confirm for the client.
 */
function wantsConfirm(): boolean {
  return new URLSearchParams(location.search).get('action') === CONFIRM_ACTION_PARAM.split('=')[1];
}

function stripAction(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has('action')) return;
  url.searchParams.delete('action');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

function canConfirm(booking: BookingSummary): boolean {
  return booking.status === 'confirmed' && booking.clientConfirmation === 'pending' && new Date(booking.start).getTime() > Date.now();
}

/** "a las 10:00 a. m." / "a la 1:30 p. m." — glued with non-breaking spaces. */
function atTime(start: string): string {
  const time = timeLabel(start);
  return `${time.startsWith('1:') ? 'a la' : 'a las'} ${time}`;
}

/** Ends a sentence without doubling the period of "a. m.". */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

/** "Jue 22 de octubre · 10:00 a. m." */
function shortWhenLabel(start: string): string {
  const date = bogotaDate(start);
  return `${DAY_SHORT[jsWeekday(date)]} ${formatDayLong(date).split(' ').slice(1).join(' ')} · ${timeLabel(start)}`;
}

/** "jue 22, 10:30 a. m." for the move button. */
function moveTarget(start: string): string {
  const date = bogotaDate(start);
  return `${DAY_SHORT[jsWeekday(date)].toLowerCase()} ${Number(date.slice(8))}, ${formatInstantTime(start)}`;
}

/** The appointment summary at the top of every manage screen (compact while moving it). */
function AppointmentCard({ booking, label, cancelled = false, compact = false }: {
  booking: BookingSummary;
  label: string;
  cancelled?: boolean;
  compact?: boolean;
}) {
  return (
    <div class={`bg-primary-soft flex gap-3 items-center ${compact ? 'rounded-[20px] py-3 px-3.5' : 'rounded-[22px] p-4'}`}>
      <Avatar initials={booking.pro.initials} logo={booking.pro.logo} size={compact ? 40 : 44} />
      <div class={`flex flex-col min-w-0 ${compact ? 'gap-px' : 'gap-0.5'}`}>
        <div class="text-[13px] text-ink-2">{label}</div>
        <div class={`font-bold ${compact ? 'text-[15px]' : 'text-[16px]'} ${cancelled ? 'line-through text-muted' : ''}`}>
          {compact ? shortWhenLabel(booking.start) : whenLabel(booking.start)}
        </div>
        <div class={`${compact ? 'text-[13px]' : 'text-[14px]'} text-ink-2`}>
          {booking.serviceName} con {booking.pro.name}
        </div>
        {!cancelled && !compact && booking.status === 'confirmed' && booking.clientConfirmation === 'confirmed' && (
          <span class="mt-1.5 self-start inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-primary text-white text-[13px] font-semibold">
            <Check size={14} strokeWidth={3} />
            Asistencia confirmada
          </span>
        )}
      </div>
    </div>
  );
}

function initialMode(data: ManagedAppointmentResponse): Mode {
  if (data.booking.status === 'cancelled') return 'was_cancelled';
  if (data.canChange) return 'menu';
  return new Date(data.booking.start).getTime() < Date.now() ? 'past' : 'too_late';
}

export function ManageApp({ token, api }: { token: string; api: ApiClient }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [mode, setModeState] = useState<Mode>('menu');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [highlightConfirm, setHighlightConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fromReminder = wantsConfirm();
    stripAction();
    api
      .getAppointment(token)
      .then((data) => {
        if (cancelled) return;
        const current = data.booking;
        const alreadyConfirmed = current.status === 'confirmed' && current.clientConfirmation === 'confirmed' && new Date(current.start).getTime() > Date.now();
        setLoad({ status: 'ready', data });
        setBooking(current);
        setModeState(fromReminder && alreadyConfirmed ? 'attended' : initialMode(data));
        setHighlightConfirm(fromReminder && canConfirm(current));
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'error', notFound: error instanceof ApiError && error.code === 'not_found' });
      });
    return () => {
      cancelled = true;
    };
  }, [api, token]);

  // Back button: move/cancel → menu.
  useEffect(() => {
    const onPop = () => setModeState((m) => (m === 'move' || m === 'cancel' ? 'menu' : m));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openMode = (next: 'move' | 'cancel') => {
    if (mode === 'menu') history.pushState({ manage: next }, '');
    else history.replaceState({ manage: next }, '');
    setModeState(next);
  };
  const toMenu = () => {
    if ((history.state as { manage?: string } | null)?.manage) history.back();
    else setModeState('menu');
  };
  const confirmAttendance = async () => {
    if (confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await api.confirmAppointment(token);
      track('attendance_confirmed', {});
      finish('attended', res.booking);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'too_late') finish('past');
      else setConfirmError(errorMessage(error));
    } finally {
      setConfirming(false);
    }
  };
  const finish = (next: Mode, updated?: BookingSummary) => {
    if (updated) setBooking(updated);
    if ((history.state as { manage?: string } | null)?.manage) history.replaceState(null, '');
    setModeState(next);
  };

  if (load.status === 'error') {
    return load.notFound ? (
      <MissingScreen
        title="Este enlace no es válido"
        text="Puede que esté incompleto o que la cita ya no exista. Revisa el correo de confirmación de tu cita."
      />
    ) : (
      <MissingScreen title="No pudimos cargar tu cita" text={errorMessage(new ApiError('network', ''))} actionLabel="Reintentar" actionHref={location.href} />
    );
  }

  if (load.status === 'loading' || !booking) {
    return (
      <Frame label="Cargando tu cita">
        <PageScroll class="py-6 px-5 gap-5">
          <Wordmark />
          <div class="skeleton rounded-[22px] h-[92px]" />
          <div class="skeleton rounded-full h-8 w-4/5" />
          <div class="skeleton rounded-[20px] h-[76px]" />
          <div class="skeleton rounded-[20px] h-[76px]" />
          <span class="sr-only" role="status">Cargando tu cita…</span>
        </PageScroll>
      </Frame>
    );
  }

  const cancelledCard = mode === 'cancelled' || mode === 'was_cancelled';
  const cardLabel = mode === 'moved' ? 'Tu nueva cita' : cancelledCard ? 'Cita cancelada' : 'Tu cita';
  const proName = booking.pro.name;
  const bookAgain = `/${encodeURIComponent(booking.pro.slug)}`;

  if (mode === 'move') {
    return (
      <Frame label="Cambiar día u hora">
        <MovePanel
          api={api}
          token={token}
          booking={booking}
          onBack={toMenu}
          onMoved={(updated) => finish('moved', updated)}
          onTooLate={() => finish('too_late')}
        />
      </Frame>
    );
  }

  return (
    <Frame label="Cancelar o reprogramar">
      <PageScroll class="py-6 px-5 gap-5">
        <Wordmark />
        <AppointmentCard booking={booking} label={cardLabel} cancelled={cancelledCard} />

        {mode === 'menu' && (
          <div class="flex flex-col gap-4 grow fade-in">
            <h1 class={H1_BIG}>Hola, {firstName(booking.client.name)}. ¿Qué quieres hacer con tu cita?</h1>
            {confirmError && <Notice>{confirmError}</Notice>}
            {canConfirm(booking) && <ConfirmButton busy={confirming} highlight={highlightConfirm} onClick={confirmAttendance} />}
            <button type="button" class={OPTION} onClick={() => openMode('move')}>
              <span class="w-11 h-11 rounded-[14px] bg-accent-soft flex items-center justify-center shrink-0">
                <Swap size={20} stroke="#15241D" />
              </span>
              <span class="flex flex-col gap-0.5">
                <span class="font-bold text-[16px]">Cambiar día u hora</span>
                <span class="text-[14px] text-muted">Elige otro espacio libre</span>
              </span>
            </button>
            <button type="button" class={OPTION} onClick={() => openMode('cancel')}>
              <span class="w-11 h-11 rounded-[14px] bg-surface flex items-center justify-center shrink-0">
                <Cross size={20} stroke="#15241D" />
              </span>
              <span class="flex flex-col gap-0.5">
                <span class="font-bold text-[16px]">Cancelar la cita</span>
                <span class="text-[14px] text-muted">Le avisamos a {proName}</span>
              </span>
            </button>
            <div class="mt-auto text-[13px] text-muted leading-[1.45]">
              Puedes hacer cambios hasta {CLIENT_CHANGE_CUTOFF_MIN / 60} horas antes de la cita. No necesitas cuenta: este enlace es solo para ti.
            </div>
          </div>
        )}

        {mode === 'cancel' && (
          <CancelPanel
            api={api}
            token={token}
            proName={proName}
            onMove={() => openMode('move')}
            onCancelled={(updated) => finish('cancelled', updated)}
            onTooLate={() => finish('too_late')}
          />
        )}

        {(mode === 'moved' || mode === 'cancelled') && (
          <ResultPanel
            icon="check"
            title={mode === 'moved' ? 'Listo, tu cita cambió.' : 'Tu cita quedó cancelada.'}
            text={
              mode === 'moved'
                ? 'Te enviamos un correo con la nueva fecha y el archivo para tu calendario. El recordatorio se movió también.'
                : `Le avisamos a ${proName} y no te llegarán más recordatorios de esta cita.`
            }
            href={bookAgain}
          />
        )}

        {mode === 'too_late' && (
          <ResultPanel
            icon="locked"
            title="Ya no se puede cambiar en línea"
            text={`Faltan menos de ${CLIENT_CHANGE_CUTOFF_MIN / 60} horas para tu cita, así que ya no se puede mover ni cancelar desde aquí. Si lo necesitas, comunícate directamente con ${proName}.`}
            phone={booking.pro.phone}
            href={bookAgain}
          >
            {confirmError && <Notice>{confirmError}</Notice>}
            {canConfirm(booking) && <ConfirmButton busy={confirming} highlight={highlightConfirm} onClick={confirmAttendance} />}
          </ResultPanel>
        )}
        {mode === 'attended' && (
          <ResultPanel
            icon="check"
            title={`¡Gracias, ${firstName(booking.client.name)}! Confirmaste tu asistencia.`}
            text={`${sentence(`Te esperamos el ${formatDayLong(bogotaDate(booking.start))} ${atTime(booking.start)}`)} Si algo cambia, puedes cambiar o cancelar tu cita desde este mismo enlace.`}
            href={bookAgain}
            action={
              load.data.canChange ? (
                <button type="button" onClick={() => setModeState('menu')} class="font-bold text-[15px] text-primary border-0 bg-transparent h-11 px-3 rounded-full hover:text-primary-dark">
                  Ver opciones de mi cita
                </button>
              ) : undefined
            }
          />
        )}
        {mode === 'past' && (
          <ResultPanel icon="locked" title="Esta cita ya pasó" text="Si necesitas otra, puedes separarla en un momento." href={bookAgain} />
        )}
        {mode === 'was_cancelled' && (
          <ResultPanel
            icon="locked"
            title="Esta cita ya está cancelada"
            text="No tienes que hacer nada más. Si quieres, puedes separar una nueva."
            href={bookAgain}
          />
        )}
      </PageScroll>
    </Frame>
  );
}

/** "Confirmar asistencia"; `highlight` (from the reminder's "Sí, voy") rings and focuses it — one tap still required. */
function ConfirmButton({ busy, highlight = false, onClick }: { busy: boolean; highlight?: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (highlight) ref.current?.focus({ preventScroll: true });
  }, [highlight]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-busy={busy}
      class={`${PRIMARY_BUTTON_16} gap-2 ${highlight ? 'ring-4 ring-accent ring-offset-2' : ''} ${busy ? 'opacity-80 cursor-progress' : ''}`}
    >
      <Check size={20} strokeWidth={2.6} />
      {busy ? 'Confirmando…' : 'Confirmar asistencia'}
    </button>
  );
}

function ResultPanel({ icon, title, text, href, phone, action, children }: {
  icon: 'check' | 'locked';
  title: string;
  text: string;
  href: string;
  phone?: string | null;
  /** Replaces the "Separar otra cita" link at the bottom. */
  action?: ComponentChildren;
  children?: ComponentChildren;
}) {
  return (
    <div class="flex flex-col gap-3.5 grow fade-in">
      {icon === 'check' ? (
        <div class="w-14 h-14 rounded-full bg-accent flex items-center justify-center">
          <Check size={28} strokeWidth={2.6} stroke="#15241D" />
        </div>
      ) : (
        <div class="w-14 h-14 rounded-[18px] bg-accent-soft flex items-center justify-center">
          <CalendarX size={28} stroke="#15241D" />
        </div>
      )}
      <h1 class={H1_BIG} tabIndex={-1}>
        {title}
      </h1>
      <div class="text-[15px] text-ink-2 leading-[1.45]">{text}</div>
      {phone && (
        <a href={telHref(phone)} class={`${OUTLINE_BUTTON} mt-1 whitespace-nowrap`} aria-label={`Llamar al consultorio, ${formatPhone(phone)}`}>
          <Phone size={18} />
          <span>
            Llamar al consultorio<span class="max-[359px]:hidden"> · {formatPhone(phone)}</span>
          </span>
        </a>
      )}
      {children}
      <div class="mt-auto flex flex-col gap-2.5 items-center">
        {action ?? (
          <a href={href} class="inline-flex items-center min-h-11 px-3 -my-[13px] font-bold text-[15px]">
            Separar otra cita
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * "Cambiar día u hora" with the booking pattern: week rows of day pills, the
 * hours grouped Mañana / Tarde (the current one dashed) and a fixed footer
 * that says where the appointment goes ("Mover a jue 22, 10:30 a. m.").
 */
function MovePanel({ api, token, booking, onBack, onMoved, onTooLate }: {
  api: ApiClient;
  token: string;
  booking: BookingSummary;
  onBack: () => void;
  onMoved: (b: BookingSummary) => void;
  onTooLate: () => void;
}) {
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** `null` = the row of the selected day; set once the client browses the weeks. */
  const [week, setWeek] = useState<number | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const currentDay = bogotaDate(booking.start);

  useEffect(() => {
    let cancelled = false;
    api
      .getAvailability(booking.pro.slug, { serviceId: booking.serviceId, days: AVAILABILITY_DAYS })
      .then((data) => {
        if (cancelled) return;
        setAvailability(data);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [api, booking.pro.slug, booking.serviceId, reloadKey]);

  const reload = useCallback(() => {
    setAvailability(null);
    setLoadError(null);
    setReloadKey((k) => k + 1);
  }, []);

  const days = availability?.days ?? [];
  const weeks = chunk(days, DAYS_PER_WEEK);
  // The client's pick; else the appointment's own day when it still has free hours; else the first day that does.
  const selectedDate = resolveDay(days.filter(isDayBookable), day, currentDay);
  const selected = days.find((d) => d.date === selectedDate) ?? null;
  const shownWeek = week ?? weekOf(days, selectedDate);
  const current = weeks[Math.min(shownWeek, Math.max(0, weeks.length - 1))] ?? [];
  // The current hour (taken by this very appointment) shows dashed among the others on its day.
  const showCurrent = selected?.date === currentDay;
  const slots = selected ? (showCurrent && !selected.slots.includes(booking.start) ? [...selected.slots, booking.start].sort() : selected.slots) : [];
  const { morning, afternoon } = splitSlots(slots);

  const pickDay = (date: string) => {
    setDay(date);
    if (start && bogotaDate(start) !== date) setStart(null);
  };

  const confirm = async () => {
    if (!start || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await api.rescheduleAppointment(token, { start });
      track('appointment_rescheduled', { by: 'client' });
      onMoved(res.booking);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'internal';
      if (code === 'too_late') return onTooLate();
      if (code === 'slot_taken') {
        setNotice(SLOT_TAKEN_NOTICE);
        setStart(null);
        reload();
      } else if (code === 'agenda_unavailable') {
        setNotice(UNAVAILABLE_NOTICE);
      } else {
        setNotice(errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  const inactive = availability && !availability.active;
  const anyFree = days.some(isDayBookable);

  return (
    <>
      <main class="scroll-area">
        <div class="min-h-full safe-top pt-6 px-5 pb-4 flex flex-col gap-3.5 fade-in short:pt-3 short:gap-2.5">
          <Wordmark />
          <AppointmentCard booking={booking} label="Tu cita actual" compact />
          <h1 class="m-0 mt-1 font-display font-extrabold text-[26px] leading-[1.1] tracking-[-0.6px] short:mt-0 short:text-[22px]" tabIndex={-1}>
            Elige el nuevo espacio
          </h1>
          {notice && <Notice>{notice}</Notice>}
          {loadError ? (
            <div class="flex flex-col gap-3">
              <Notice>{loadError}</Notice>
              <button type="button" onClick={reload} class="h-11 rounded-full border-2 border-line bg-white font-bold text-[15px] text-ink">
                Reintentar
              </button>
            </div>
          ) : !availability ? (
            <>
              <SkeletonPills count={7} columns={7} />
              <SkeletonSlots />
              <span class="sr-only" role="status">Cargando horas libres…</span>
            </>
          ) : inactive ? (
            <Notice>{UNAVAILABLE_NOTICE}</Notice>
          ) : !anyFree ? (
            <div class="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center leading-[1.45]">
              No quedan horas libres en los próximos días. Vuelve a intentarlo más adelante.
            </div>
          ) : (
            <>
              <WeekNav label={monthLabel(current.map((d) => d.date))} week={shownWeek} weeks={weeks.length} onWeek={setWeek} />
              <div class="grid grid-cols-7 gap-[5px]">
                {current.map((d) => (
                  <DayPill
                    key={d.date}
                    dow={DAY_SHORT[jsWeekday(d.date)]}
                    num={String(Number(d.date.slice(8)))}
                    label={`${capitalize(formatDayLong(d.date))}${isDayBookable(d) ? '' : ', sin horas libres'}`}
                    selected={d.date === selected?.date}
                    disabled={!isDayBookable(d)}
                    compact
                    onPick={() => pickDay(d.date)}
                  />
                ))}
              </div>
              {selected ? (
                <div class="flex flex-col gap-3 fade-in" key={selected.date}>
                  <SlotGroup title="Mañana" slots={morning} start={start} onPickSlot={setStart} format={formatInstantTime} current={showCurrent ? booking.start : undefined} compact />
                  <SlotGroup title="Tarde" slots={afternoon} start={start} onPickSlot={setStart} format={formatInstantTime} current={showCurrent ? booking.start : undefined} compact />
                  {showCurrent && <div class="-mt-1 text-[12px] text-muted">La hora con borde punteado es tu cita actual.</div>}
                </div>
              ) : (
                <div class="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center">Elige un día para ver las horas libres.</div>
              )}
            </>
          )}
        </div>
      </main>
      <footer class="shrink-0 border-t border-line bg-white safe-bottom">
        {/* Short screens: "Volver" beside the button instead of under it. */}
        <div class="px-4 pt-3 pb-4 flex flex-col gap-1.5 short:flex-row-reverse short:items-center short:gap-2 short:pt-2 short:pb-2">
          {start ? (
            <button
              type="button"
              onClick={confirm}
              aria-busy={saving}
              class={`${PRIMARY_BUTTON_16} short:h-[46px] short:grow short:w-auto ${saving ? 'opacity-80 cursor-progress' : ''}`}
            >
              {saving ? 'Moviendo tu cita…' : `Mover a ${moveTarget(start)}`}
            </button>
          ) : (
            <button type="button" disabled class={`${DISABLED_BUTTON_16} short:h-[46px] short:grow short:w-auto`}>
              Elige la nueva hora
            </button>
          )}
          <button type="button" onClick={onBack} class={`${LINK_BUTTON} short:px-4 short:shrink-0`}>
            Volver
          </button>
        </div>
      </footer>
    </>
  );
}

function CancelPanel({ api, token, proName, onMove, onCancelled, onTooLate }: {
  api: ApiClient;
  token: string;
  proName: string;
  onMove: () => void;
  onCancelled: (b: BookingSummary) => void;
  onTooLate: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const trimmed = reason.trim();
      const res = await api.cancelAppointment(token, trimmed ? { reason: trimmed } : {});
      track('appointment_cancelled', { by: 'client' });
      onCancelled(res.booking);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'too_late') return onTooLate();
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="flex flex-col gap-3.5 grow fade-in">
      <h1 class={H2} tabIndex={-1}>
        ¿Seguro que quieres cancelar?
      </h1>
      <div class="text-[15px] text-ink-2 leading-[1.45]">
        El espacio queda libre para otra persona. Si quieres, cuéntale a {proName} por qué.
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="a-reason" class="text-[14px] font-semibold">
          Motivo (opcional)
        </label>
        <textarea
          id="a-reason"
          rows={3}
          maxLength={300}
          placeholder="Escribe aquí el motivo"
          value={reason}
          onInput={(e) => setReason((e.currentTarget as HTMLTextAreaElement).value)}
          class="field h-auto py-3 text-[15px] resize-none leading-[normal]"
        />
      </div>
      {notice && <Notice>{notice}</Notice>}
      <div class="mt-auto flex flex-col gap-2.5">
        <button
          type="button"
          onClick={confirm}
          aria-busy={saving}
          class={`h-14 rounded-full border-2 border-ink bg-white text-ink font-bold text-[16px] hover:bg-surface ${saving ? 'opacity-80 cursor-progress' : ''}`}
        >
          {saving ? 'Cancelando…' : 'Sí, cancelar la cita'}
        </button>
        <button type="button" onClick={onMove} class="h-11 border-0 bg-transparent font-bold text-[14px] text-primary rounded-full hover:text-primary-dark">
          Mejor la cambio de día
        </button>
      </div>
    </div>
  );
}

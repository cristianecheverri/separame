/**
 * /c/<token>: the client cancels or reschedules from the link in the email.
 * Loaded lazily — profile pages never download this chunk.
 */
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  AVAILABILITY_DAYS, CLIENT_CHANGE_CUTOFF_MIN, CONFIRM_ACTION_PARAM, type AvailabilityResponse, type BookingSummary, type ManagedAppointmentResponse,
} from '@shared/api';
import { capitalize, DAY_SHORT, formatDayLong, formatInstantTime, formatWhen } from '@shared/format';
import { bogotaDate, jsWeekday } from '@shared/time';
import { CalendarX, Check, ChevronLeft, ChevronRight, Cross, Phone, Swap } from '../components/icons';
import {
  Avatar, DayPill, DISABLED_BUTTON, Frame, Notice, OUTLINE_BUTTON, PageScroll, PRIMARY_BUTTON, SkeletonPills, SkeletonSlots, SlotButton, Wordmark,
} from '../components/ui';
import { MissingScreen } from '../booking/Unavailable';
import { ApiError, errorMessage, type ApiClient } from '../lib/api';
import { chunk, isDayBookable, monthLabel } from '../lib/slots';
import { firstName, formatPhone, telHref } from '../lib/text';

type Mode = 'menu' | 'move' | 'cancel' | 'moved' | 'cancelled' | 'too_late' | 'was_cancelled' | 'past' | 'attended';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: ManagedAppointmentResponse }
  | { status: 'error'; notFound: boolean };

const DAYS_PER_PAGE = 5;
const PRIMARY_BUTTON_16 = PRIMARY_BUTTON.replace('text-[17px]', 'text-[16px]');
const DISABLED_BUTTON_16 = DISABLED_BUTTON.replace('text-[17px]', 'text-[16px]');
const H2 = 'm-0 font-display font-extrabold text-[24px] tracking-[-0.5px] leading-[1.15]';
const H1_BIG = 'm-0 font-display font-extrabold text-[28px] leading-[1.1] tracking-[-0.6px]';
const LINK_BUTTON = 'h-11 border-0 bg-transparent font-semibold text-[14px] text-ink-2 rounded-full hover:text-ink';
const OPTION =
  'flex gap-3.5 items-center w-full min-h-[76px] py-3.5 px-4 rounded-[20px] border-2 border-line bg-white text-ink text-left hover:border-line-strong transition-colors';
const NAV_BUTTON =
  'w-11 h-11 rounded-full border-0 bg-surface text-ink flex items-center justify-center hover:bg-line disabled:opacity-40 disabled:cursor-default';

/** `/c/<token>?action=confirm` comes from the reminder email's "Sí, voy" button. */
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
  const time = formatInstantTime(start).replace(/ /g, '\u00a0');
  return `${time.startsWith('1:') ? 'a la' : 'a las'} ${time}`;
}

/** Ends a sentence without doubling the period of "a. m.". */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
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

  useEffect(() => {
    let cancelled = false;
    const autoConfirm = wantsConfirm();
    stripAction();
    api
      .getAppointment(token)
      .then(async (data) => {
        if (cancelled) return;
        let current = data.booking;
        let next = initialMode(data);
        if (autoConfirm && current.status === 'confirmed' && new Date(current.start).getTime() > Date.now()) {
          try {
            current = current.clientConfirmation === 'confirmed' ? current : (await api.confirmAppointment(token)).booking;
            next = 'attended';
          } catch (error) {
            if (!cancelled) setConfirmError(errorMessage(error));
          }
        }
        if (cancelled) return;
        setLoad({ status: 'ready', data });
        setBooking(current);
        setModeState(next);
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

  return (
    <Frame label="Cancelar o reprogramar">
      <PageScroll class="py-6 px-5 gap-5">
        <Wordmark />
        <div class="bg-primary-soft rounded-[22px] p-4 flex gap-3 items-center">
          <Avatar initials={booking.pro.initials} />
          <div class="flex flex-col gap-0.5 min-w-0">
            <div class="text-[13px] text-ink-2">{cardLabel}</div>
            <div class={`font-bold text-[16px] ${cancelledCard ? 'line-through text-muted' : ''}`}>{formatWhen(booking.start)}</div>
            <div class="text-[14px] text-ink-2">
              {booking.serviceName} con {proName}
            </div>
            {!cancelledCard && booking.status === 'confirmed' && booking.clientConfirmation === 'confirmed' && (
              <span class="mt-1.5 self-start inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-primary text-white text-[13px] font-semibold">
                <Check size={14} strokeWidth={3} />
                Asistencia confirmada
              </span>
            )}
          </div>
        </div>

        {mode === 'menu' && (
          <div class="flex flex-col gap-4 grow fade-in">
            <h1 class={H1_BIG}>Hola, {firstName(booking.client.name)}. ¿Qué quieres hacer con tu cita?</h1>
            {confirmError && <Notice>{confirmError}</Notice>}
            {canConfirm(booking) && <ConfirmButton busy={confirming} onClick={confirmAttendance} />}
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

        {mode === 'move' && (
          <MovePanel
            api={api}
            token={token}
            booking={booking}
            onBack={toMenu}
            onMoved={(updated) => finish('moved', updated)}
            onTooLate={() => finish('too_late')}
          />
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
            {canConfirm(booking) && <ConfirmButton busy={confirming} onClick={confirmAttendance} />}
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

function ConfirmButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-busy={busy} class={`${PRIMARY_BUTTON_16} gap-2 ${busy ? 'opacity-80 cursor-progress' : ''}`}>
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
          <a href={href} class="font-bold text-[15px]">
            Separar otra cita
          </a>
        )}
      </div>
    </div>
  );
}

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
  const [page, setPage] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const days = (availability?.days ?? []).filter(isDayBookable);
  const pages = chunk(days, DAYS_PER_PAGE);
  const current = pages[Math.min(page, Math.max(0, pages.length - 1))] ?? [];
  const selected = days.find((d) => d.date === day) ?? null;

  const confirm = async () => {
    if (!start || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await api.rescheduleAppointment(token, { start });
      onMoved(res.booking);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'internal';
      if (code === 'too_late') return onTooLate();
      if (code === 'slot_taken') {
        setNotice('Alguien acaba de separar esa hora. Elige otra, por favor.');
        setStart(null);
        reload();
      } else if (code === 'agenda_unavailable') {
        setNotice('En este momento no se puede cambiar el día en línea. Si lo necesitas, puedes cancelar la cita.');
      } else {
        setNotice(errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  const newWhen = start
    ? `${DAY_SHORT[jsWeekday(bogotaDate(start))].toLowerCase()} ${Number(bogotaDate(start).slice(8))}, ${formatInstantTime(start)}`
    : '';
  const inactive = availability && !availability.active;

  return (
    <div class="flex flex-col gap-3.5 grow fade-in">
      <h1 class={H2} tabIndex={-1}>
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
          <SkeletonPills count={5} columns={5} />
          <SkeletonSlots />
          <span class="sr-only" role="status">Cargando horas libres…</span>
        </>
      ) : inactive ? (
        <Notice>En este momento no se puede cambiar el día en línea. Si lo necesitas, puedes cancelar la cita.</Notice>
      ) : days.length === 0 ? (
        <div class="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center leading-[1.45]">
          No quedan horas libres en los próximos días. Vuelve a intentarlo más adelante.
        </div>
      ) : (
        <>
          {pages.length > 1 && (
            <div class="flex justify-between items-center gap-2 -mb-1">
              <span class="text-[14px] font-semibold text-muted">{monthLabel(current.map((d) => d.date))}</span>
              <div class="flex gap-1">
                <button type="button" aria-label="Días anteriores" class={NAV_BUTTON} disabled={page <= 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft size={16} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  aria-label="Días siguientes"
                  class={NAV_BUTTON}
                  disabled={page >= pages.length - 1}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={16} strokeWidth={2.4} />
                </button>
              </div>
            </div>
          )}
          <div class="grid grid-cols-5 gap-1.5">
            {current.map((d) => (
              <DayPill
                key={d.date}
                dow={DAY_SHORT[jsWeekday(d.date)]}
                num={String(Number(d.date.slice(8)))}
                label={capitalize(formatDayLong(d.date))}
                selected={d.date === day}
                disabled={false}
                onPick={() => {
                  setDay(d.date);
                  if (start && bogotaDate(start) !== d.date) setStart(null);
                }}
              />
            ))}
          </div>
          {selected ? (
            <div class="grid grid-cols-3 gap-2 fade-in" key={selected.date}>
              {selected.slots.map((slot) => (
                <SlotButton key={slot} label={formatInstantTime(slot)} selected={slot === start} onPick={() => setStart(slot)} />
              ))}
            </div>
          ) : (
            <div class="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center">Elige un día para ver las horas libres.</div>
          )}
        </>
      )}
      <div class="mt-auto flex flex-col gap-2.5">
        {start ? (
          <button
            type="button"
            onClick={confirm}
            aria-busy={saving}
            class={`${PRIMARY_BUTTON_16} ${saving ? 'opacity-80 cursor-progress' : ''}`}
          >
            {saving ? 'Moviendo tu cita…' : `Mover a ${newWhen}`}
          </button>
        ) : (
          <button type="button" disabled class={DISABLED_BUTTON_16}>
            Elige día y hora
          </button>
        )}
        <button type="button" onClick={onBack} class={LINK_BUTTON}>
          Volver
        </button>
      </div>
    </div>
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
          placeholder="Ej. Me salió un viaje"
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

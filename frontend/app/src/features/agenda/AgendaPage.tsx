import { useEffect, useState } from 'react';
import { formatDateNoYear, formatDayLong } from '@shared/format';
import { holidayOn } from '@shared/holidays';
import { addDays, addMinutes, bogotaDate, bogotaTime, jsWeekday, todayBogota, weekdayOf, type ISODate } from '@shared/time';
import { cx } from '../../components/ui/cx';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, LinkIcon, LockIcon, PlusIcon, ShareIcon } from '../../components/ui/icons';
import { EmptyState } from '../../components/ui/EmptyState';
import { Fab, FabMenu } from '../../components/ui/Fab';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { activeAppointments, buildDayRows } from '../../lib/agenda';
import { now } from '../../lib/clock';
import { firstName, formatDayMonth, formatDayShortMonth, formatDayTitle, linkLabel, plural } from '../../lib/format';
import { canShareNatively, shareOrCopy, trackShare } from '../../lib/share';
import { usePro } from '../../lib/pro';
import { useActing, useAgendaAppointments, useAvailability } from '../../lib/queries';
import { ProSelector } from '../team/ProSelector';
import { TeamCard, TeamRequestCard } from '../team/TeamCards';
import { useMemberTag } from '../team/useMemberTag';
import { AppointmentCard } from '../appointments/AppointmentCard';
import { useOutcome } from '../appointments/useOutcome';
import { WaitlistCard } from '../appointments/Waitlist';
import { InstallCard } from '../../components/install/InstallCard';
import type { AppointmentModalState } from '../appointments/AppointmentModals';
import { LazyAppointmentModals as AppointmentModals } from '../appointments/LazyAppointmentModals';
import { CalendarSyncCard, ReadOnlyChecklist, ReminderNote, ShareCard, UpcomingCard } from './SideCards';
import { ReferralCard } from '../referrals/ReferralCard';
import { BlockSheet, type BlockPrefill } from '../availability/BlockSheet';
import { useBlocks } from '../availability/useBlocks';
import { ValueCard } from './ValueCard';
import { WeekView } from './WeekView';

/** Team plan: whose agenda the headline talks about. */
type Whose = { kind: 'own' } | { kind: 'all' } | { kind: 'member'; first: string };

function greeting(name: string, count: number, readOnly: boolean, whose: Whose): string {
  if (whose.kind === 'member') return count === 0 ? `${whose.first} no tiene citas hoy.` : `${whose.first} tiene ${plural(count, 'cita', 'citas')} hoy.`;
  if (whose.kind === 'all') {
    const today = count === 0 ? 'Hoy no hay citas en el consultorio' : `Hoy hay ${plural(count, 'cita', 'citas')} en el consultorio`;
    return readOnly ? today : `Hola, ${firstName(name)}. ${today}.`;
  }
  const today = count === 0 ? 'Hoy no tienes citas' : count === 1 ? 'Hoy tienes 1 cita' : `Hoy tienes ${count} citas`;
  return readOnly ? today : `Hola, ${firstName(name)}. ${today}.`;
}

/** Phones: one line, "Hola, Laura · 6 citas hoy" (proposal MP-02; team: board team-owner-agenda-phone). */
function compactGreeting(name: string, count: number, readOnly: boolean, whose: Whose): string {
  if (whose.kind === 'member') return `${whose.first} · ${count === 0 ? 'sin citas hoy' : `${plural(count, 'cita', 'citas')} hoy`}`;
  if (whose.kind === 'all') {
    const today = count === 0 ? 'sin citas en el consultorio' : `${plural(count, 'cita', 'citas')} en el consultorio`;
    return readOnly ? today.charAt(0).toUpperCase() + today.slice(1) : `Hola, ${firstName(name)} · ${today}`;
  }
  const today = count === 0 ? 'Sin citas hoy' : count === 1 ? '1 cita hoy' : `${count} citas hoy`;
  return readOnly ? today : `Hola, ${firstName(name)} · ${count === 0 ? 'sin citas hoy' : today}`;
}

/** Day/week arrows: plain 44 px circles beside the title on phones, inside a pill from sm. */
const navArrow = 'w-10 h-11 sm:w-9 sm:h-9 sm:hit-44 shrink-0 rounded-full flex items-center justify-center text-ink-2 hover:bg-surface sm:hover:bg-white';

function sectionTitle(view: 'day' | 'week', date: ISODate, today: ISODate, weekStart: ISODate, compact = false): string {
  if (view === 'week') return `Semana del ${compact ? formatDateNoYear(weekStart) : formatDayMonth(weekStart)}`;
  if (compact) return formatDayShortMonth(date);
  if (date === today) return 'Agenda de hoy';
  if (date === addDays(today, 1)) return 'Agenda de mañana';
  if (date === addDays(today, -1)) return 'Agenda de ayer';
  return `Agenda del ${formatDayLong(date)}`;
}

/** pro-agenda-day (and pro-expired-read-only when the subscription expired). */
export function AgendaPage() {
  const { profile, readOnly, publicUrl, me } = usePro();
  const acting = useActing();
  const team = me.team;
  const actingMember = acting.isAll ? null : acting.members.find((m) => m.proId === acting.proId) ?? null;
  const whose: Whose = acting.isAll ? { kind: 'all' } : actingMember && !actingMember.isOwner ? { kind: 'member', first: firstName(actingMember.name) } : { kind: 'own' };
  /** The link to share: the team page under «Todos», the selected professional's otherwise. */
  const shareUrl = acting.isAll && team ? team.publicUrl : (actingMember?.publicUrl ?? publicUrl);
  const memberTag = useMemberTag();
  const toast = useToast();
  const clock = now();
  const today = todayBogota(clock);
  const [view, setView] = useState<'day' | 'week'>('day');
  const [date, setDate] = useState<ISODate>(today);
  const [modal, setModal] = useState<AppointmentModalState>(null);
  /** Appointment picked in the week view: shown and briefly highlighted in its day. */
  const [focusId, setFocusId] = useState<string | null>(null);
  const markOutcome = useOutcome();
  /** «No estaré disponible» open (from «+», the desktop button or a free gap). */
  const [blocking, setBlocking] = useState<{ prefill?: BlockPrefill } | null>(null);
  const { remove: removeBlock } = useBlocks();
  /** Blocks belong to one professional: not under the team's «Todos». */
  const canBlock = !readOnly && !acting.isAll;

  const shownDate = readOnly ? today : date;
  const weekStart = addDays(shownDate, -((jsWeekday(shownDate) + 6) % 7));
  const availability = useAvailability();
  // Team plan: «Todos» merges every professional's appointments (free gaps aren't shown then).
  const todayQuery = useAgendaAppointments(today, today);
  const dayQuery = useAgendaAppointments(shownDate, shownDate, view === 'day');
  const weekQuery = useAgendaAppointments(weekStart, addDays(weekStart, 6), view === 'week' && !readOnly);
  const upcomingQuery = useAgendaAppointments(addDays(today, 1), addDays(today, 14), !readOnly);

  const settings = availability.data?.settings;
  const todayCount = todayQuery.data ? activeAppointments(todayQuery.data.appointments).length : null;
  const rows =
    dayQuery.data && settings
      ? buildDayRows(shownDate, dayQuery.data.appointments, settings.schedule, settings.rules, clock, {
          includeFree: !readOnly && !acting.isAll,
          blocks: acting.isAll ? [] : settings.blocks,
        })
      : null;

  const focusReady = !!focusId && !!rows?.some((row) => row.key === focusId);
  useEffect(() => {
    if (!focusReady || !focusId) return;
    const card = document.getElementById(`appointment-${focusId}`);
    card?.scrollIntoView?.({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const timer = setTimeout(() => setFocusId(null), 2_500);
    return () => clearTimeout(timer);
  }, [focusReady, focusId]);

  const step = (delta: number) => setDate(addDays(date, view === 'week' ? delta * 7 : delta));
  const nativeShare = canShareNatively();
  const share = async () => {
    const text = shareUrl === publicUrl ? 'Separa tu cita conmigo' : 'Separa tu cita';
    const outcome = await shareOrCopy({ title: text, text, url: shareUrl });
    trackShare(outcome, 'booking_link');
    if (outcome === 'copied') toast.success('Enlace copiado. Pégalo donde quieras.');
    else if (outcome === 'failed') toast.error('No pudimos copiar el enlace.');
  };
  const newAppointment = () => setModal({ kind: 'new', date: view === 'day' && date >= today ? date : undefined });
  const blockHours = () => setBlocking({});

  const emptyText = () => {
    const holiday = holidayOn(shownDate);
    if (holiday && settings?.rules.closedOnHolidays) return `Es festivo (${holiday.name}): tu agenda está cerrada.`;
    if (settings && (settings.schedule[weekdayOf(shownDate)] ?? []).length === 0) return 'No atiendes este día.';
    return shownDate === today ? 'Cuando alguien reserve, la cita aparece aquí.' : 'Todavía nadie ha reservado este día.';
  };

  return (
    <div className={cx('flex flex-col', readOnly ? 'gap-4 sm:gap-[22px]' : 'gap-4 sm:gap-6')}>
      <div className="flex flex-nowrap sm:flex-wrap gap-3 sm:gap-4 justify-between items-center sm:items-end">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="hidden sm:block text-[15px] text-muted font-semibold">
            {formatDayTitle(today)}
            {team && ` · ${team.name}`}
          </div>
          <h1 className="m-0 font-display font-extrabold text-[24px] leading-[1.2] tracking-[-0.5px] sm:text-[34px] sm:tracking-[-0.8px]">
            {todayCount === null ? (
              <span className="skeleton inline-block h-7 sm:h-9 w-[min(420px,60vw)] align-middle" />
            ) : (
              <>
                <span className="sm:hidden">{compactGreeting(profile.name, todayCount, readOnly, whose)}</span>
                <span className="hidden sm:inline">{greeting(profile.name, todayCount, readOnly, whose)}</span>
              </>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap gap-[10px] shrink-0 sm:shrink sm:min-w-0 max-w-full">
          {!readOnly && (
            <button
              type="button"
              className={cx(ui.btnOutline, 'h-11 px-[14px] gap-[6px] sm:h-[46px] sm:px-[18px] sm:gap-2 min-w-0')}
              aria-label={team ? `${nativeShare ? 'Compartir' : 'Copiar'} enlace ${linkLabel(shareUrl)}` : nativeShare ? 'Compartir mi enlace' : 'Copiar mi enlace'}
              onClick={() => void share()}
            >
              {nativeShare ? <ShareIcon className="shrink-0" /> : <LinkIcon className="shrink-0" />}
              <span className="sm:hidden">{nativeShare ? 'Compartir' : 'Copiar'}</span>
              {/* Team plan: the link of who is selected, as in board team-owner-agenda-desktop. */}
              <span className="hidden sm:inline truncate">{team ? linkLabel(shareUrl) : nativeShare ? 'Compartir mi enlace' : 'Copiar mi enlace'}</span>
            </button>
          )}
          {/* Below 1024 px the floating button takes over (MP-03), except when it's locked (read-only). */}
          <div className={cx(readOnly ? 'flex' : 'hidden lg:flex', 'gap-[10px]')}>
            {canBlock && (
              <button type="button" onClick={blockHours} className={ui.btnOutline}>
                <LockIcon size={16} />
                Bloquear horas
              </button>
            )}
            <button
              type="button"
              disabled={readOnly}
              onClick={newAppointment}
              className={cx(ui.btnPrimary, readOnly && cx(ui.btnLocked, 'h-11 sm:h-[46px]'))}
              title={readOnly ? 'Renueva tu plan para crear citas' : undefined}
            >
              {readOnly ? <LockIcon size={16} /> : <PlusIcon />}
              Nueva cita
            </button>
          </div>
        </div>
      </div>

      {!readOnly && !acting.isAll && <ValueCard variant="phone" onShare={() => void share()} className="lg:hidden" />}

      <div className="flex flex-wrap gap-6 items-start">
        <section className={cx(ui.card, 'flex-[999_1_480px] min-w-0 gap-[6px]')} aria-labelledby="agenda-title">
          {readOnly ? (
            <div className="flex flex-wrap justify-between items-center gap-3 pb-[10px]">
              <h2 id="agenda-title" className={ui.h2}>
                {sectionTitle(view, shownDate, today, weekStart)}
              </h2>
              <span className="text-[13px] font-bold bg-surface text-ink-2 py-[6px] px-3 rounded-full">Solo lectura</span>
            </div>
          ) : (
            /* Phones: "‹ Mar 20 oct. ›" + Día/Semana (proposal MP-02). sm+: title, then Hoy, ‹ › and Día/Semana on the right. */
            <div className="flex flex-wrap items-center gap-x-0 gap-y-2 sm:gap-2 pb-[10px]">
              <h2 id="agenda-title" className="order-2 sm:order-none sm:mr-auto m-0 min-w-0 font-display font-extrabold text-[17px] sm:text-[20px]">
                <span className="sm:hidden">{sectionTitle(view, shownDate, today, weekStart, true)}</span>
                <span className="hidden sm:inline">
                  {sectionTitle(view, shownDate, today, weekStart)}
                  {whose.kind === 'member' && ` · ${whose.first}`}
                </span>
              </h2>
              {date !== today && (
                <button type="button" onClick={() => setDate(today)} className="order-4 sm:order-none hit-44 h-9 px-[14px] rounded-full text-[13px] font-bold text-primary hover:bg-primary-soft">
                  Hoy
                </button>
              )}
              <div className="contents sm:flex sm:gap-1 sm:bg-surface sm:rounded-full sm:p-1">
                <button type="button" onClick={() => step(-1)} aria-label={view === 'week' ? 'Semana anterior' : 'Día anterior'} className={cx(navArrow, 'order-1 -ml-[10px] sm:ml-0')}>
                  <ChevronLeftIcon size={16} />
                </button>
                <button type="button" onClick={() => step(1)} aria-label={view === 'week' ? 'Semana siguiente' : 'Día siguiente'} className={cx(navArrow, 'order-3 mr-auto sm:mr-0')}>
                  <ChevronRightIcon size={16} />
                </button>
              </div>
              <div className="order-5 sm:order-none ml-auto sm:ml-0 flex gap-[6px] bg-surface rounded-full p-1" role="group" aria-label="Vista">
                {(['day', 'week'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={cx('hit-44 h-9 px-3 sm:px-[14px] rounded-full text-[13px] text-ink', view === v ? 'bg-white font-bold' : 'bg-transparent font-semibold text-ink-2')}
                  >
                    {v === 'day' ? 'Día' : 'Semana'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ProSelector variant="inline" allowAll className="hidden lg:flex pb-3 border-b border-line mb-2" />
          {view === 'week' && !readOnly ? (
            weekQuery.data ? (
              <WeekView
                weekStart={weekStart}
                today={today}
                appointments={weekQuery.data.appointments}
                blocks={acting.isAll ? [] : settings?.blocks}
                schedule={settings?.schedule}
                now={clock}
                onPickDay={(d) => {
                  setDate(d);
                  setView('day');
                }}
                onPickAppointment={(appointment) => {
                  setDate(bogotaDate(appointment.start));
                  setView('day');
                  setFocusId(appointment.id);
                }}
              />
            ) : (
              <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-14" />
                ))}
              </div>
            )
          ) : !rows ? (
            <div className="flex flex-col gap-[6px]" aria-busy="true" aria-label="Cargando">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4">
                  <div className="skeleton hidden sm:block w-[84px] h-5 mt-[14px]" />
                  <div className="skeleton grow h-16 rounded-[16px]" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title={shownDate === today ? 'No tienes citas hoy' : 'Sin citas este día'}
              action={
                !readOnly && (
                  <button type="button" className={ui.btnPrimary} onClick={() => setModal({ kind: 'new', date: shownDate >= today ? shownDate : undefined })}>
                    <PlusIcon /> Nueva cita
                  </button>
                )
              }
            >
              {emptyText()}
            </EmptyState>
          ) : (
            rows.map((row) => (
              <AppointmentCard
                key={row.key}
                row={row}
                now={clock}
                readOnly={readOnly}
                highlighted={row.key === focusId}
                member={memberTag(row.appointment)}
                onOutcome={markOutcome}
                onMove={(appointment) => setModal({ kind: 'move', appointment })}
                onCancel={(appointment) => setModal({ kind: 'cancel', appointment })}
                onFree={(free) => setModal({ kind: 'new', date: shownDate, start: free.start, freeMinutes: free.freeMinutes })}
                onBlockFree={
                  canBlock
                    ? (free) =>
                        setBlocking({ prefill: { date: shownDate, startTime: bogotaTime(free.start), endTime: bogotaTime(addMinutes(free.start, free.freeMinutes ?? 30)) } })
                    : undefined
                }
                onUnblock={canBlock ? (block) => removeBlock.mutate(block) : undefined}
              />
            ))
          )}
          {readOnly && rows && rows.length > 0 && <div className="text-[13px] text-muted pt-2">Estas citas se agendaron antes del vencimiento y siguen en pie.</div>}
        </section>

        {readOnly ? (
          <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-5">
            <ReadOnlyChecklist />
            <CalendarSyncCard />
          </div>
        ) : (
          <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-5">
            {!acting.isAll && <ValueCard variant="desktop" onShare={() => void share()} className="hidden lg:flex" />}
            {/* First of the side cards: right after the day's appointments on phones (proposal MP-03). */}
            <div className="empty:hidden">
              <InstallCard />
            </div>
            {team && <TeamCard team={team} />}
            <ShareCard url={shareUrl} slug={actingMember?.slug ?? (acting.isAll && team ? team.slug : profile.slug)} />
            {/* Right below "Comparte tu agenda" (proposal referral-agenda-card), on phones and desktop. */}
            <ReferralCard />
            {/* Team plan request (board team-request-card-desktop); hidden once the team exists. */}
            <TeamRequestCard team={team} request={me.teamRequest} />
            <UpcomingCard today={today} appointments={upcomingQuery.data?.appointments} schedule={settings?.schedule} rules={settings?.rules} />
            <WaitlistCard />
            <ReminderNote today={today} appointments={upcomingQuery.data?.appointments} />
            <CalendarSyncCard />
          </div>
        )}
      </div>
      {canBlock ? (
        <FabMenu
          actions={[
            { label: 'Bloquear horas', icon: <LockIcon size={18} />, onClick: blockHours },
            { label: 'Nueva cita', icon: <CalendarIcon size={18} />, onClick: newAppointment },
          ]}
        />
      ) : (
        !readOnly && <Fab label="Nueva cita" onClick={newAppointment} />
      )}
      <AppointmentModals state={modal} onClose={() => setModal(null)} />
      {blocking && <BlockSheet prefill={blocking.prefill} onClose={() => setBlocking(null)} />}
    </div>
  );
}


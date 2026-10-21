import { useState } from 'react';
import { formatDayLong } from '@shared/format';
import { holidayOn } from '@shared/holidays';
import { addDays, jsWeekday, todayBogota, weekdayOf, type ISODate } from '@shared/time';
import { cx } from '../../components/ui/cx';
import { ChevronLeftIcon, ChevronRightIcon, LinkIcon, LockIcon, PlusIcon } from '../../components/ui/icons';
import { EmptyState } from '../../components/ui/EmptyState';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { activeAppointments, buildDayRows } from '../../lib/agenda';
import { copyText } from '../../lib/clipboard';
import { now } from '../../lib/clock';
import { firstName, formatDayMonth, formatDayTitle, linkLabel } from '../../lib/format';
import { usePro } from '../../lib/pro';
import { useAppointments, useAvailability } from '../../lib/queries';
import { AppointmentCard } from '../appointments/AppointmentCard';
import type { AppointmentModalState } from '../appointments/AppointmentModals';
import { LazyAppointmentModals as AppointmentModals } from '../appointments/LazyAppointmentModals';
import { CalendarSyncCard, ReadOnlyChecklist, ReminderNote, ShareCard, UpcomingCard } from './SideCards';
import { WeekView } from './WeekView';

function greeting(name: string, count: number, readOnly: boolean): string {
  const today = count === 0 ? 'Hoy no tienes citas' : count === 1 ? 'Hoy tienes 1 cita' : `Hoy tienes ${count} citas`;
  return readOnly ? today : `Hola, ${firstName(name)}. ${today}.`;
}

function sectionTitle(view: 'day' | 'week', date: ISODate, today: ISODate, weekStart: ISODate): string {
  if (view === 'week') return `Semana del ${formatDayMonth(weekStart)}`;
  if (date === today) return 'Agenda de hoy';
  if (date === addDays(today, 1)) return 'Agenda de mañana';
  if (date === addDays(today, -1)) return 'Agenda de ayer';
  return `Agenda del ${formatDayLong(date)}`;
}

/** pro-agenda-day (and pro-expired-read-only when the subscription expired). */
export function AgendaPage() {
  const { profile, readOnly, publicUrl } = usePro();
  const toast = useToast();
  const clock = now();
  const today = todayBogota(clock);
  const [view, setView] = useState<'day' | 'week'>('day');
  const [date, setDate] = useState<ISODate>(today);
  const [modal, setModal] = useState<AppointmentModalState>(null);

  const shownDate = readOnly ? today : date;
  const weekStart = addDays(shownDate, -((jsWeekday(shownDate) + 6) % 7));
  const availability = useAvailability();
  const todayQuery = useAppointments(today, today);
  const dayQuery = useAppointments(shownDate, shownDate, view === 'day');
  const weekQuery = useAppointments(weekStart, addDays(weekStart, 6), view === 'week' && !readOnly);
  const upcomingQuery = useAppointments(addDays(today, 1), addDays(today, 14), !readOnly);

  const settings = availability.data?.settings;
  const todayCount = todayQuery.data ? activeAppointments(todayQuery.data.appointments).length : null;
  const rows =
    dayQuery.data && settings
      ? buildDayRows(shownDate, dayQuery.data.appointments, settings.schedule, settings.rules, clock, { includeFree: !readOnly })
      : null;

  const step = (delta: number) => setDate(addDays(date, view === 'week' ? delta * 7 : delta));
  const link = linkLabel(publicUrl);

  const emptyText = () => {
    const holiday = holidayOn(shownDate);
    if (holiday && settings?.rules.closedOnHolidays) return `Es festivo (${holiday.name}): tu agenda está cerrada.`;
    if (settings && (settings.schedule[weekdayOf(shownDate)] ?? []).length === 0) return 'No atiendes este día.';
    return shownDate === today ? 'Cuando alguien reserve, la cita aparece aquí.' : 'Todavía nadie ha reservado este día.';
  };

  return (
    <div className={cx('flex flex-col', readOnly ? 'gap-[22px]' : 'gap-6')}>
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="text-[15px] text-muted font-semibold">{formatDayTitle(today)}</div>
          <h1 className={ui.h1}>{todayCount === null ? <span className="skeleton inline-block h-9 w-[min(420px,80vw)] align-middle" /> : greeting(profile.name, todayCount, readOnly)}</h1>
        </div>
        <div className="flex flex-wrap gap-[10px] min-w-0 max-w-full">
          {!readOnly && (
            <button
              type="button"
              className={cx(ui.btnOutline, 'min-w-0 max-w-full')}
              aria-label={`Copiar enlace ${link}`}
              onClick={async () => (await copyText(publicUrl)) ? toast.success('Enlace copiado. Pégalo donde quieras.') : toast.error('No pudimos copiar el enlace.')}
            >
              <LinkIcon className="shrink-0" />
              <span className="truncate">{link}</span>
            </button>
          )}
          <button
            type="button"
            disabled={readOnly}
            onClick={() => setModal({ kind: 'new', date: view === 'day' && date >= today ? date : undefined })}
            className={cx(ui.btnPrimary, readOnly && ui.btnLocked)}
            title={readOnly ? 'Renueva tu plan para crear citas' : undefined}
          >
            {readOnly ? <LockIcon size={16} /> : <PlusIcon />}
            Nueva cita
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <section className={cx(ui.card, 'flex-[999_1_480px] min-w-0 gap-[6px]')} aria-labelledby="agenda-title">
          <div className="flex flex-wrap justify-between items-center gap-3 pb-[10px]">
            <h2 id="agenda-title" className={ui.h2}>
              {sectionTitle(view, shownDate, today, weekStart)}
            </h2>
            {readOnly ? (
              <span className="text-[13px] font-bold bg-surface text-ink-2 py-[6px] px-3 rounded-full">Solo lectura</span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {date !== today && (
                  <button type="button" onClick={() => setDate(today)} className="hit-44 h-9 px-[14px] rounded-full text-[13px] font-bold text-primary hover:bg-primary-soft">
                    Hoy
                  </button>
                )}
                <div className="flex gap-1 bg-surface rounded-full p-1">
                  <button type="button" onClick={() => step(-1)} aria-label={view === 'week' ? 'Semana anterior' : 'Día anterior'} className="hit-44 w-9 h-9 rounded-full flex items-center justify-center text-ink-2 hover:bg-white">
                    <ChevronLeftIcon size={16} />
                  </button>
                  <button type="button" onClick={() => step(1)} aria-label={view === 'week' ? 'Semana siguiente' : 'Día siguiente'} className="hit-44 w-9 h-9 rounded-full flex items-center justify-center text-ink-2 hover:bg-white">
                    <ChevronRightIcon size={16} />
                  </button>
                </div>
                <div className="flex gap-[6px] bg-surface rounded-full p-1" role="group" aria-label="Vista">
                  {(['day', 'week'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      onClick={() => setView(v)}
                      className={cx('hit-44 h-9 px-[14px] rounded-full text-[13px] text-ink', view === v ? 'bg-white font-bold' : 'bg-transparent font-semibold text-ink-2')}
                    >
                      {v === 'day' ? 'Día' : 'Semana'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {view === 'week' && !readOnly ? (
            weekQuery.data ? (
              <WeekView
                weekStart={weekStart}
                today={today}
                appointments={weekQuery.data.appointments}
                schedule={settings?.schedule}
                now={clock}
                onPickDay={(d) => {
                  setDate(d);
                  setView('day');
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
                readOnly={readOnly}
                onMove={(appointment) => setModal({ kind: 'move', appointment })}
                onCancel={(appointment) => setModal({ kind: 'cancel', appointment })}
                onFree={() => setModal({ kind: 'new', date: shownDate })}
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
            <ShareCard url={publicUrl} slug={profile.slug} />
            <UpcomingCard today={today} appointments={upcomingQuery.data?.appointments} schedule={settings?.schedule} rules={settings?.rules} />
            <ReminderNote today={today} appointments={upcomingQuery.data?.appointments} />
            <CalendarSyncCard />
          </div>
        )}
      </div>
      <AppointmentModals state={modal} onClose={() => setModal(null)} />
    </div>
  );
}


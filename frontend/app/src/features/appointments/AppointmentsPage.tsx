import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { addDays, bogotaDate, todayBogota, type ISODate } from '@shared/time';
import type { Appointment } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { EmptyState } from '../../components/ui/EmptyState';
import { LockIcon, PlusIcon, SearchIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { buildDayRows } from '../../lib/agenda';
import { now } from '../../lib/clock';
import { formatDayTitle, normalize, plural } from '../../lib/format';
import { usePro } from '../../lib/pro';
import { useAgendaAppointments } from '../../lib/queries';
import { useMemberTag } from '../team/useMemberTag';
import { AppointmentCard } from './AppointmentCard';
import type { AppointmentModalState } from './AppointmentModals';
import { LazyAppointmentModals as AppointmentModals } from './LazyAppointmentModals';
import { useOutcome } from './useOutcome';
import { WaitlistSection } from './Waitlist';
import { ProSelector } from '../team/ProSelector';

const AHEAD_DAYS = 90;
const BACK_DAYS = 90;
/** Days with appointments rendered at first (and per «Ver más»): keeps long lists light on phones. */
const DAYS_PER_PAGE = 10;
type Tab = 'upcoming' | 'past' | 'waitlist';
const TABS: { key: Tab; label: string }[] = [
  { key: 'upcoming', label: 'Próximas' },
  { key: 'past', label: 'Pasadas' },
  { key: 'waitlist', label: 'Lista de espera' },
];
const NO_SCHEDULE = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

function groupByDay(list: Appointment[]): [ISODate, Appointment[]][] {
  const map = new Map<ISODate, Appointment[]>();
  for (const a of list) {
    const d = bogotaDate(a.start);
    map.set(d, [...(map.get(d) ?? []), a]);
  }
  return [...map.entries()];
}

/** "Citas": upcoming / past appointments with search by client name. */
export function AppointmentsPage() {
  const { readOnly } = usePro();
  const clock = now();
  const today = todayBogota(clock);
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = tabParam === 'past' || tabParam === 'waitlist' ? tabParam : 'upcoming';
  const unmarkedOnly = tab === 'past' && params.get('filter') === 'unmarked';
  const [query, setQuery] = useState('');
  const [shownDays, setShownDays] = useState(DAYS_PER_PAGE);
  const setTab = (next: Tab) => {
    setShownDays(DAYS_PER_PAGE);
    setParams(next === 'upcoming' ? {} : { tab: next }, { replace: true });
  };
  const markOutcome = useOutcome();
  const [modal, setModal] = useState<AppointmentModalState>(null);
  // Team plan: under «Todos», every professional's appointments merged (each card tagged).
  const upcoming = useAgendaAppointments(today, addDays(today, AHEAD_DAYS), tab === 'upcoming');
  const past = useAgendaAppointments(addDays(today, -BACK_DAYS), today, tab === 'past');
  const memberTag = useMemberTag();
  const source = tab === 'upcoming' ? upcoming : past;

  const t = clock.getTime();
  const term = normalize(query);
  const list = (source.data?.appointments ?? [])
    .filter((a) => (tab === 'upcoming' ? new Date(a.end).getTime() >= t : new Date(a.end).getTime() < t))
    .filter((a) => !term || normalize(a.client.name).includes(term))
    .filter((a) => !unmarkedOnly || (a.status === 'confirmed' && !a.outcome));
  const ordered = tab === 'upcoming' ? list : [...list].reverse();
  const groups = groupByDay(ordered);
  const visibleGroups = groups.slice(0, shownDays);
  const hiddenDays = groups.length - visibleGroups.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div className="flex flex-col gap-1">
          <h1 className={ui.h1}>Citas</h1>
          <div className="text-[15px] text-muted">Tus citas próximas y pasadas, en un solo lugar.</div>
        </div>
        <button type="button" disabled={readOnly} onClick={() => setModal({ kind: 'new' })} className={cx(ui.btnPrimary, readOnly && ui.btnLocked)}>
          {readOnly ? <LockIcon size={16} /> : <PlusIcon />}
          Nueva cita
        </button>
      </div>
      <ProSelector variant="inline" allowAll className="hidden lg:flex" />

      <section className={cx(ui.card, 'gap-4')}>
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div className="flex gap-[6px] bg-surface rounded-full p-1 max-w-full overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Mostrar">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cx('hit-44 h-9 px-[14px] rounded-full text-[13px] whitespace-nowrap shrink-0', tab === t.key ? 'bg-white font-bold text-ink' : 'font-semibold text-ink-2')}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab !== 'waitlist' && (
          <label htmlFor="appt-search" className="h-[46px] w-full sm:w-auto sm:min-w-[260px] rounded-full bg-white border-2 border-line-strong flex items-center gap-2 px-[14px] box-border text-muted focus-within:border-primary">
            <SearchIcon />
            <span className="sr-only">Buscar por nombre</span>
            <input
              id="appt-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShownDays(DAYS_PER_PAGE);
              }}
              placeholder="Buscar por nombre"
              className="border-0 outline-none focus-visible:outline-none text-[16px] grow min-w-0 bg-transparent text-ink"
            />
          </label>
          )}
        </div>

        {unmarkedOnly && (
          <div className="bg-accent-soft rounded-[14px] px-4 py-3 text-[14px] flex flex-wrap gap-2 justify-between items-center">
            <span>Mostrando solo las citas sin marcar asistencia.</span>
            <button type="button" className="font-bold text-primary underline underline-offset-2 min-h-11" onClick={() => setTab('past')}>
              Ver todas
            </button>
          </div>
        )}
        {tab === 'waitlist' ? (
          <WaitlistSection
            readOnly={readOnly}
            onSchedule={(entry) => setModal({ kind: 'new', client: entry.client, serviceId: entry.serviceId, date: entry.dates.find((d) => d >= today), proId: entry.proId })}
          />
        ) : !source.data ? (
          <div className="flex flex-col gap-[6px]" aria-busy="true" aria-label="Cargando">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-16 rounded-[16px]" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState title={term ? 'No encontramos citas con ese nombre' : unmarkedOnly ? 'Todo al día' : tab === 'upcoming' ? 'No tienes citas próximas' : 'No hay citas pasadas'}>
            {term ? 'Revisa cómo está escrito o busca solo el nombre.' : unmarkedOnly ? 'Ya marcaste la asistencia de todas tus citas pasadas.' : tab === 'upcoming' ? 'Comparte tu enlace para que te empiecen a reservar.' : `Aquí ves las citas de los últimos ${BACK_DAYS} días.`}
          </EmptyState>
        ) : (
          visibleGroups.map(([date, items]) => (
            <div key={date} className="flex flex-col gap-[6px]">
              <h2 className="m-0 pt-2 pb-1 flex justify-between items-baseline gap-3 text-[15px] font-bold">
                <span>
                  {formatDayTitle(date)}
                  {date === today && <span className="text-primary"> · hoy</span>}
                </span>
                <span className="text-[13px] font-semibold text-muted whitespace-nowrap">{plural(items.filter((a) => a.status === 'confirmed').length, 'cita', 'citas')}</span>
              </h2>
              {buildDayRows(date, items, NO_SCHEDULE, { slotStepMin: 30 }, clock, { includeFree: false }).map((row) => (
                <AppointmentCard
                  key={row.key}
                  row={row}
                  now={clock}
                  readOnly={readOnly}
                  onOutcome={markOutcome}
                  member={memberTag(row.appointment)}
                  actions={tab === 'upcoming'}
                  onMove={(appointment) => setModal({ kind: 'move', appointment })}
                  onCancel={(appointment) => setModal({ kind: 'cancel', appointment })}
                />
              ))}
            </div>
          ))
        )}
        {tab !== 'waitlist' && hiddenDays > 0 && (
          <button type="button" onClick={() => setShownDays((n) => n + DAYS_PER_PAGE)} className={cx(ui.btnOutline, 'self-center mt-1')}>
            {tab === 'past' ? 'Ver citas anteriores' : 'Ver más citas'} · {plural(hiddenDays, 'día más', 'días más')}
          </button>
        )}
      </section>
      <AppointmentModals state={modal} onClose={() => setModal(null)} />
    </div>
  );
}

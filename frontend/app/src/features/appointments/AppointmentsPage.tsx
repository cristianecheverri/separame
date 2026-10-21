import { useState } from 'react';
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
import { useAppointments } from '../../lib/queries';
import { AppointmentCard } from './AppointmentCard';
import type { AppointmentModalState } from './AppointmentModals';
import { LazyAppointmentModals as AppointmentModals } from './LazyAppointmentModals';

const AHEAD_DAYS = 90;
const BACK_DAYS = 90;
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
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<AppointmentModalState>(null);
  const upcoming = useAppointments(today, addDays(today, AHEAD_DAYS), tab === 'upcoming');
  const past = useAppointments(addDays(today, -BACK_DAYS), today, tab === 'past');
  const source = tab === 'upcoming' ? upcoming : past;

  const t = clock.getTime();
  const term = normalize(query);
  const list = (source.data?.appointments ?? [])
    .filter((a) => (tab === 'upcoming' ? new Date(a.end).getTime() >= t : new Date(a.end).getTime() < t))
    .filter((a) => !term || normalize(a.client.name).includes(term));
  const ordered = tab === 'upcoming' ? list : [...list].reverse();
  const groups = groupByDay(ordered);

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

      <section className={cx(ui.card, 'gap-4')}>
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div className="flex gap-[6px] bg-surface rounded-full p-1" role="group" aria-label="Mostrar">
            {(['upcoming', 'past'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={tab === v}
                onClick={() => setTab(v)}
                className={cx('hit-44 h-9 px-[14px] rounded-full text-[13px]', tab === v ? 'bg-white font-bold text-ink' : 'font-semibold text-ink-2')}
              >
                {v === 'upcoming' ? 'Próximas' : 'Pasadas'}
              </button>
            ))}
          </div>
          <label htmlFor="appt-search" className="h-[46px] w-full sm:w-auto sm:min-w-[260px] rounded-full bg-white border-2 border-line-strong flex items-center gap-2 px-[14px] box-border text-muted focus-within:border-primary">
            <SearchIcon />
            <span className="sr-only">Buscar por nombre</span>
            <input id="appt-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre" className="border-0 outline-none focus-visible:outline-none text-[14px] grow min-w-0 bg-transparent text-ink" />
          </label>
        </div>

        {!source.data ? (
          <div className="flex flex-col gap-[6px]" aria-busy="true" aria-label="Cargando">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-16 rounded-[16px]" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState title={term ? 'No encontramos citas con ese nombre' : tab === 'upcoming' ? 'No tienes citas próximas' : 'No hay citas pasadas'}>
            {term ? 'Revisa cómo está escrito o busca solo el nombre.' : tab === 'upcoming' ? 'Comparte tu enlace para que te empiecen a reservar.' : `Aquí ves las citas de los últimos ${BACK_DAYS} días.`}
          </EmptyState>
        ) : (
          groups.map(([date, items]) => (
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
                  readOnly={readOnly}
                  actions={tab === 'upcoming'}
                  onMove={(appointment) => setModal({ kind: 'move', appointment })}
                  onCancel={(appointment) => setModal({ kind: 'cancel', appointment })}
                />
              ))}
            </div>
          ))
        )}
      </section>
      <AppointmentModals state={modal} onClose={() => setModal(null)} />
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import { formatCop } from '@shared/format';
import { todayBogota } from '@shared/time';
import type { ProStats } from '@shared/types';
import { Chip } from '../../components/ui/Chip';
import { cx } from '../../components/ui/cx';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { ui } from '../../components/ui/styles';
import { errorMessage } from '../../lib/api';
import { now } from '../../lib/clock';
import { useStats } from '../../lib/queries';
import { delta, PERIODS, periodRange, type PeriodKey } from './periods';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const WEEKDAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const pct = (ratio: number) => `${Math.round(ratio * 100)} %`;

interface TileProps {
  label: string;
  /** Label on phones, where the tile is half as wide. */
  shortLabel?: string;
  value: string;
  change: ReturnType<typeof delta>;
  goodWhenUp?: boolean;
  tone?: 'primary' | 'accent' | 'white';
  note?: string;
  /** Spans both columns on phones and tablets, with the change beside the label. */
  wide?: boolean;
}

/** KPI tile. Phones: 2 columns and the short change ("+61 %") under one caption (proposal MP-08). */
function Tile({ label, shortLabel, value, change, goodWhenUp = true, tone = 'white', note, wide = false }: TileProps) {
  const dark = tone === 'primary';
  const good = change ? (goodWhenUp ? change.direction > 0 : change.direction < 0) : false;
  const bad = change ? (goodWhenUp ? change.direction < 0 : change.direction > 0) : false;
  const changeColor = good ? (dark ? 'text-mint' : 'text-primary') : bad ? (dark ? 'text-accent' : 'text-warn-ink') : dark ? 'text-mint' : 'text-muted';
  const shortChange = <span className={cx('text-[13px] font-bold', changeColor)}>{change ? change.text : 'Sin datos'}</span>;
  return (
    <div
      className={cx(
        'rounded-[18px] sm:rounded-[20px] p-[14px] sm:p-[18px] flex flex-col gap-2 sm:gap-[10px] min-w-0',
        wide && 'col-span-2 lg:col-span-1',
        tone === 'primary' ? 'bg-primary text-white' : tone === 'accent' ? 'bg-accent-soft' : 'bg-white',
      )}
    >
      <div className="flex justify-between items-baseline gap-2">
        <div className="text-[13px] sm:text-[14px] font-semibold">
          {shortLabel ? (
            <>
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </>
          ) : (
            label
          )}
        </div>
        {wide && <span className="sm:hidden shrink-0">{shortChange}</span>}
      </div>
      <div className={cx('font-display font-extrabold leading-none whitespace-nowrap text-[28px]', value.length > 8 ? 'sm:text-[28px]' : 'sm:text-[36px]')}>{value}</div>
      {!wide && <div className="sm:hidden">{shortChange}</div>}
      <div className={cx('hidden sm:block text-[13px] font-semibold', changeColor)}>{change ? `${change.text} vs. periodo anterior` : 'Sin datos del periodo anterior'}</div>
      {note && <div className={cx('text-[12px] leading-[1.4]', dark ? 'text-mint' : 'text-muted')}>{note}</div>}
    </div>
  );
}

function WeekdayChart({ stats }: { stats: ProStats }) {
  const values = WEEKDAYS.map((_, i) => stats.byWeekday.find((d) => d.weekday === i)?.appointments ?? 0);
  const max = Math.max(1, ...values);
  const label = `Citas por día de la semana: ${values.map((v, i) => `${WEEKDAYS_LONG[i]} ${v}`).join(', ')}.`;
  return (
    <section className={cx(ui.card, 'gap-4')}>
      <h2 className={ui.h2sm}>Días con más citas</h2>
      <div role="img" aria-label={label} className="flex items-end gap-2 sm:gap-3 h-[180px]">
        {values.map((v, i) => (
          <div key={i} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-[6px]" aria-hidden="true">
            <span className="text-[13px] font-bold">{v}</span>
            <div className={cx('w-full max-w-[44px] rounded-t-[10px] rounded-b-[4px]', v === max && v > 0 ? 'bg-primary' : v > 0 ? 'bg-primary-line' : 'bg-line')} style={{ height: `${Math.max(4, (v / max) * 120)}px` }} />
            <span className="text-[12px] font-semibold text-muted">{WEEKDAYS[i]}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Citas por día de la semana</caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <th scope="row">{WEEKDAYS_LONG[i]}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ServiceRanking({ stats }: { stats: ProStats }) {
  const rows = [...stats.byService].sort((a, b) => b.appointments - a.appointments);
  const max = Math.max(1, ...rows.map((r) => r.appointments));
  return (
    <section className={cx(ui.card, 'gap-4')}>
      <h2 className={ui.h2sm}>Servicios más pedidos</h2>
      {rows.length === 0 ? (
        <div className="text-[14px] text-muted">Sin citas en este periodo.</div>
      ) : (
        <ol className="m-0 p-0 list-none flex flex-col gap-3" aria-label="Citas por servicio">
          {rows.map((r) => (
            <li key={r.serviceId} className="flex flex-col gap-[6px]">
              <div className="flex justify-between gap-3 text-[14px]">
                <span className="font-bold [overflow-wrap:anywhere]">{r.serviceName}</span>
                <span className="text-ink-2 whitespace-nowrap">
                  {r.appointments === 1 ? '1 cita' : `${r.appointments} citas`} · {formatCop(r.revenueCop)}
                </span>
              </div>
              <div className="h-[10px] rounded-full bg-surface overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(r.appointments / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="text-[13px] text-muted border-t border-line pt-3">
        Reservadas por tus clientes: <strong className="text-ink">{stats.bySource.client}</strong> · Agendadas por ti: <strong className="text-ink">{stats.bySource.pro}</strong>
      </div>
    </section>
  );
}

/** "Estadísticas": KPIs vs. the previous period, weekday chart and services ranking. */
export function StatsPage() {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const range = periodRange(period, todayBogota(now()));
  const query = useStats(range.from, range.to);
  const data = query.data;
  const s = data?.stats;
  const p = data?.previous;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-1">
        <h1 className={ui.h1}>Estadísticas</h1>
        <div className="text-[15px] text-muted">Cómo va tu agenda: citas, ocupación y asistencia.</div>
      </div>
      <div className="flex flex-nowrap overflow-x-auto [scrollbar-width:none] -mx-4 px-4 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 gap-2" role="group" aria-label="Periodo">
        {PERIODS.map((x) => (
          <Chip key={x.key} selected={period === x.key} onClick={() => setPeriod(x.key)} className="whitespace-nowrap shrink-0">
            {x.label}
          </Chip>
        ))}
      </div>

      {query.isError && <div className={cx(ui.card, 'text-[15px] text-ink-2')}>{errorMessage(query.error)}</div>}
      {!s || !p ? (
        !query.isError && (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
            <div className="grid grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-[14px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-[130px] rounded-[20px]" />
              ))}
            </div>
            <Skeleton className="h-[260px] rounded-[24px]" />
          </div>
        )
      ) : (
        <div className={cx('flex flex-col gap-5 sm:gap-6 transition-opacity', query.isPlaceholderData && 'opacity-60')} aria-busy={query.isPlaceholderData}>
          {s.unmarked > 0 && (
            <div className="bg-accent-soft rounded-[20px] py-[6px] pr-2 pl-4 sm:py-4 sm:px-5 flex sm:flex-wrap gap-[10px] sm:gap-3 items-center justify-between">
              <span className="font-bold text-[14px] leading-[1.3] sm:text-[15px] sm:leading-normal">
                <span className="hidden sm:inline">Tienes </span>
                {s.unmarked === 1 ? '1 cita' : `${s.unmarked} citas`} sin marcar asistencia
              </span>
              <Link to="/appointments?tab=past&filter=unmarked" className="font-bold text-[14px] underline underline-offset-2 min-h-11 px-2 sm:px-0 whitespace-nowrap inline-flex items-center">
                Marcar ahora →
              </Link>
            </div>
          )}
          <div className="flex flex-col gap-2">
          <div className="sm:hidden text-[12px] text-muted">Comparado con el periodo anterior</div>
          <div className="grid grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-[10px] sm:gap-[14px]">
            <Tile label="Citas" value={String(s.appointments)} change={delta(s.appointments, p.appointments, 'count')} tone="primary" />
            <Tile label="Ocupación" value={pct(s.occupancy)} change={delta(s.occupancy, p.occupancy, 'ratio')} tone="accent" />
            <Tile label="Inasistencias" value={pct(s.noShowRate)} change={delta(s.noShowRate, p.noShowRate, 'ratio')} goodWhenUp={false} />
            <Tile label="Clientes nuevos / recurrentes" shortLabel="Nuevos / recurrentes" value={`${s.newClients} / ${s.returningClients}`} change={delta(s.newClients + s.returningClients, p.newClients + p.returningClients, 'count')} />
            <Tile
              label="Ingresos estimados"
              value={formatCop(s.estimatedRevenueCop)}
              change={delta(s.estimatedRevenueCop, p.estimatedRevenueCop, 'count')}
              note="Estimado con tus precios de referencia; Sepárame no cobra a tus clientes."
              wide
            />
          </div>
          </div>
          {s.appointments === 0 ? (
            <div className="bg-white rounded-[24px] p-4">
              <EmptyState title="Aún no hay citas en este periodo">Cuando te reserven, aquí verás qué días y servicios se mueven más.</EmptyState>
            </div>
          ) : (
            <div className="flex flex-wrap gap-6 items-start">
              <div className="flex-[999_1_420px] min-w-0">
                <WeekdayChart stats={s} />
              </div>
              <div className="flex-[1_1_320px] min-w-0">
                <ServiceRanking stats={s} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

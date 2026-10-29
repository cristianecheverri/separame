import { Link } from 'react-router';
import { capitalize, MONTH_NAMES } from '@shared/format';
import { todayBogota } from '@shared/time';
import type { ProStats } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { ShareIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { now } from '../../lib/clock';
import { formatSavedTime } from '../../lib/format';
import { useStats } from '../../lib/queries';
import { periodRange } from '../stats/periods';

const pct = (ratio: number) => `${Math.round(ratio * 100)} %`;

/** "23 citas se reservaron solas" / "1 cita se reservó sola". */
function Headline({ online }: { online: number }) {
  return (
    <>
      <span className="text-accent">{online === 1 ? '1 cita' : `${online} citas`}</span> {online === 1 ? 'se reservó sola' : 'se reservaron solas'}
    </>
  );
}

function figures(s: ProStats) {
  return [
    { value: formatSavedTime(s.value.savedMinutes), short: 'que no gastaste en chats', long: 'Tiempo que no gastaste en chats' },
    { value: s.value.remindersSent > 0 ? pct(s.value.confirmationRate) : '—', short: 'confirmaron asistencia', long: 'Confirmaron asistencia' },
    { value: String(s.value.recovered), short: 'cupos recuperados', long: 'Cupos recuperados (lista de espera)' },
  ];
}

function versusLastMonth(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return 'Igual que el mes pasado';
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} vs. el mes pasado`;
}

/**
 * «Octubre con Sepárame» (proposal value-metrics): this month's online bookings and what they
 * saved. Phones: above the day's appointments; desktop: first side card. A new account sees
 * an invitation to share the link instead.
 */
export function ValueCard({ variant, onShare, className }: { variant: 'phone' | 'desktop'; onShare: () => void; className?: string }) {
  const today = todayBogota(now());
  const range = periodRange('month', today);
  const query = useStats(range.from, range.to, 'value');
  const month = `${capitalize(MONTH_NAMES[Number(today.slice(5, 7)) - 1])} con Sepárame`;
  const s = query.data?.stats;
  const p = query.data?.previous;

  if (!s || !p) return query.isError ? null : <div className={cx('skeleton rounded-[24px]', variant === 'phone' ? 'h-[214px]' : 'h-[300px]', className)} aria-hidden="true" />;

  if (s.value.online === 0) {
    return (
      <section aria-labelledby={`value-empty-${variant}`} className={cx(ui.card, 'gap-[10px]', className)}>
        <span className="text-[13px] font-semibold text-muted">{month}</span>
        <h2 id={`value-empty-${variant}`} className="m-0 font-display font-extrabold text-[20px] leading-[1.2]">
          Aquí verás cuántas citas te llegan solas
        </h2>
        <span className="text-[14px] text-ink-2 leading-[1.4]">
          Cuando tus clientes reserven desde tu enlace, te contamos cuántas fueron, cuántos confirmaron asistencia y el tiempo que te ahorraste.
        </span>
        <button type="button" onClick={onShare} className={cx(ui.btnPrimary, 'self-start h-11 px-[18px]')}>
          <ShareIcon size={16} /> Compartir mi enlace
        </button>
      </section>
    );
  }

  const items = figures(s);
  return (
    <section aria-labelledby={`value-${variant}`} className={cx('bg-primary text-white rounded-[24px] flex flex-col gap-[14px]', variant === 'phone' ? 'p-[18px]' : 'p-5', className)}>
      {variant === 'phone' ? (
        <div className="flex flex-col gap-[6px]">
          <span className="text-[13px] font-semibold text-mint">{month}</span>
          <h2 id={`value-${variant}`} className="m-0 font-display font-extrabold text-[26px] leading-[1.15] tracking-[-0.5px]">
            <Headline online={s.value.online} />
          </h2>
          <span className="text-[14px] text-mint leading-[1.4]">Tus clientes las separaron desde tu enlace, sin llamarte ni escribirte.</span>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center gap-2">
            <span className="text-[13px] font-semibold text-mint">{month}</span>
            <span className="text-[12px] font-bold py-1 px-[10px] rounded-full bg-white/12 whitespace-nowrap">{versusLastMonth(s.value.online, p.value.online)}</span>
          </div>
          <h2 id={`value-${variant}`} className="m-0 font-display font-extrabold text-[26px] leading-[1.15] tracking-[-0.5px]">
            <Headline online={s.value.online} />
          </h2>
        </>
      )}
      {variant === 'phone' ? (
        // Three tiles side by side; under 360 px they would overflow, so each becomes a «label · value» row.
        <div className="grid grid-cols-3 gap-2 max-[359px]:grid-cols-1 max-[359px]:gap-0">
          {items.map((f) => (
            <div
              key={f.long}
              className="bg-white/12 rounded-[16px] p-[10px] flex flex-col gap-1 min-w-0 max-[359px]:bg-transparent max-[359px]:rounded-none max-[359px]:px-0 max-[359px]:py-2 max-[359px]:border-t max-[359px]:border-white/16 max-[359px]:flex-row-reverse max-[359px]:justify-between max-[359px]:items-baseline max-[359px]:gap-3"
            >
              <span className="font-display font-extrabold text-[20px] max-[359px]:text-[16px] leading-none whitespace-nowrap">{f.value}</span>
              <span className="text-[12px] max-[359px]:text-[14px] leading-[1.3] text-mint">
                <span className="max-[359px]:hidden">{f.short}</span>
                <span className="min-[360px]:hidden">{f.long}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-[10px]">
          {items.map((f) => (
            <li key={f.long} className="flex justify-between items-baseline gap-3 text-[14px] border-t border-white/16 pt-[10px]">
              <span className="text-mint">{f.long}</span>
              <strong className="text-[16px] whitespace-nowrap">{f.value}</strong>
            </li>
          ))}
        </ul>
      )}
      <Link to="/stats" className="self-start min-h-11 inline-flex items-center font-bold text-[14px] text-white underline underline-offset-2">
        Ver estadísticas →
      </Link>
    </section>
  );
}

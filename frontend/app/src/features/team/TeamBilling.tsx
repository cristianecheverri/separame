import { Link } from 'react-router';
import type { TeamView } from '@shared/api';
import { formatCop } from '@shared/format';
import type { PriceVersion } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { InfoIcon, PlusIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { minPackageAmount } from '../../lib/plans';
import { plural } from '../../lib/format';

/** The plan's monthly reference: its monthly price, else the cheapest package per month. */
function monthlyPlanCop(price: PriceVersion): number | null {
  if (price.monthlyCop) return price.monthlyCop;
  const cheapest = price.packages.length ? price.packages.reduce((a, b) => (b.amountCop / b.months < a.amountCop / a.months ? b : a)) : null;
  return cheapest ? Math.round(cheapest.amountCop / cheapest.months) : minPackageAmount(price);
}

const additional = (seats: number) => plural(seats, 'profesional adicional', 'profesionales adicionales');

interface Props {
  price: PriceVersion;
  seats: number;
  team: TeamView | null;
  /** A request for more seats is waiting for review. */
  pending: boolean;
}

/** «Tu plan: Fundador + 2 profesionales adicionales» with the monthly breakdown (board team-billing-phone). */
export function TeamPlanCard({ price, seats, team, pending }: Props) {
  const plan = monthlyPlanCop(price);
  const extra = price.extraProfessionalCop ?? 0;
  const used = team ? Math.max(0, team.members.length - 1) : null;
  return (
    <section aria-labelledby="team-plan-title" className={cx(ui.card, 'gap-[14px]')}>
      <div className="flex flex-col gap-1">
        {team && (
          <span className="text-[14px] text-ink-2 [overflow-wrap:anywhere]">
            {team.name} · {plural(team.members.length, 'profesional', 'profesionales')}
          </span>
        )}
        <h2 id="team-plan-title" className={cx(ui.h2, 'leading-[1.25]')}>
          Tu plan: {price.name} + {additional(seats)}
        </h2>
      </div>
      <div className="flex flex-col gap-[10px] text-[14px]">
        <div className="flex justify-between gap-3">
          <span className="text-ink-2">Plan {price.name}</span>
          <strong className="whitespace-nowrap">{plan ? `${formatCop(plan)} al mes` : 'Por definir'}</strong>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-ink-2">{additional(seats)}</span>
          <strong className="whitespace-nowrap">
            {seats} × {formatCop(extra)} al mes
          </strong>
        </div>
        <div className="border-t border-line pt-[10px] flex justify-between items-baseline gap-3">
          <span className="font-bold text-[15px]">Total al mes</span>
          <span className="font-display font-extrabold text-[22px]">{plan ? formatCop(plan + seats * extra) : '—'}</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1">
        {used !== null && (
          <span className="text-[13px] text-muted">
            Usas {used} de {plural(seats, 'cupo adicional', 'cupos adicionales')}
          </span>
        )}
        {pending ? (
          <span className="text-[13px] font-semibold text-ink-2 min-h-11 inline-flex items-center">Tu solicitud de más cupos está en revisión</span>
        ) : (
          <Link to="/team/request" className="min-h-11 inline-flex items-center gap-[6px] font-bold text-[14px] no-underline">
            <PlusIcon size={16} /> Solicitar más cupos
          </Link>
        )}
      </div>
    </section>
  );
}

/** Yellow note: one expiry for the whole team. */
export function TeamSingleExpiryNote() {
  return (
    <div className="bg-accent-soft rounded-[20px] p-4 flex gap-3 items-start">
      <InfoIcon size={20} className="shrink-0 mt-[2px]" />
      <div className="text-[14px] leading-[1.5]">Un solo vencimiento para todo el equipo: si el plan vence, ningún profesional recibe reservas nuevas. Las citas ya agendadas siguen igual.</div>
    </div>
  );
}

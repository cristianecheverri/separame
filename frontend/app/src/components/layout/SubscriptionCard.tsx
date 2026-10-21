import { Link } from 'react-router';
import { formatCop } from '@shared/format';
import { bogotaDate } from '@shared/time';
import type { SubscriptionStatus } from '@shared/types';
import { formatDayMonth } from '../../lib/format';
import { cx } from '../ui/cx';

interface Props {
  subscription: SubscriptionStatus;
  monthlyCop: number | null;
  onNavigate?: () => void;
}

const SHOW_ACTIVE_WITHIN_DAYS = 14;

function daysLeftText(days: number): string {
  if (days <= 0) return 'Hoy es tu último día';
  return days === 1 ? 'Te queda 1 día' : `Te quedan ${days} días`;
}

/** Sidebar card: "Prueba gratis · Te quedan N días · Elegir plan · desde $X/mes". */
export function SubscriptionCard({ subscription: sub, monthlyCop, onNavigate }: Props) {
  if (sub.state === 'expired') return null;
  if (sub.state === 'active' && sub.daysLeft > SHOW_ACTIVE_WITHIN_DAYS) return null;

  const from = monthlyCop ? ` · desde ${formatCop(monthlyCop)}/mes` : '';
  const content =
    sub.state === 'trial'
      ? { kicker: 'Prueba gratis', title: daysLeftText(sub.daysLeft), cta: `Elegir plan${from}`, bg: 'bg-accent' }
      : sub.state === 'active'
        ? { kicker: 'Tu plan', title: daysLeftText(sub.daysLeft), cta: `Renovar${from}`, bg: 'bg-accent' }
        : {
            kicker: 'Periodo de gracia',
            title: `Renueva antes del ${formatDayMonth(bogotaDate(sub.graceUntil))}`,
            cta: `Renovar${from}`,
            bg: 'bg-warn-soft',
          };

  return (
    <div className={cx('text-ink rounded-[18px] p-4 flex flex-col gap-2', content.bg)}>
      <div className="text-[13px] font-bold">{content.kicker}</div>
      <div className="font-display font-extrabold text-[20px] leading-[1.1]">{content.title}</div>
      <Link
        to="/billing"
        onClick={onNavigate}
        className="min-h-11 py-1 px-3 text-center rounded-full bg-ink text-white hover:text-white flex items-center justify-center font-bold text-[14px] no-underline leading-[1.2] focus-visible:outline-ink"
      >
        {content.cta}
      </Link>
    </div>
  );
}

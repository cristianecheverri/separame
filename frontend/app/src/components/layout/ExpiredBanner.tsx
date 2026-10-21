import { Link } from 'react-router';
import { formatCop } from '@shared/format';
import { bogotaDate } from '@shared/time';
import type { SubscriptionStatus } from '@shared/types';
import { formatDayMonth } from '../../lib/format';
import { LockIcon } from '../ui/icons';

interface Props {
  subscription: SubscriptionStatus;
  priceName: string | null;
  minPackageCop: number | null;
}

/** Dark read-only banner (pro-expired-read-only). */
export function ExpiredBanner({ subscription, priceName, minPackageCop }: Props) {
  const priceText = priceName ? `, con tu precio ${priceName.toLowerCase()}` : '';
  return (
    <div role="status" className="bg-ink text-white rounded-[22px] py-5 px-[18px] sm:px-[22px] flex flex-wrap gap-4 items-center justify-between on-dark">
      <div className="flex gap-[14px] items-start flex-[1_1_380px] min-w-0">
        <span className="w-11 h-11 rounded-[14px] bg-accent text-ink flex items-center justify-center shrink-0">
          <LockIcon size={22} />
        </span>
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-display font-extrabold text-[20px] leading-[1.2]">Tu plan venció el {formatDayMonth(bogotaDate(subscription.accessUntil))}</span>
          <span className="text-[14px] text-mint leading-[1.45]">
            Tu página no está recibiendo reservas nuevas. Renueva y todo vuelve a funcionar al instante{priceText}.
          </span>
        </div>
      </div>
      <Link to="/billing" className="h-[50px] px-6 rounded-full bg-accent text-ink hover:text-ink flex items-center font-extrabold text-[15px] no-underline whitespace-nowrap">
        {minPackageCop ? `Renovar desde ${formatCop(minPackageCop)}` : 'Renovar'}
      </Link>
    </div>
  );
}

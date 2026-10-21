import { Link } from 'react-router';
import { cx } from '../../components/ui/cx';
import { CheckIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { ui } from '../../components/ui/styles';
import { GiftIcon } from './icons';
import { useReferrals } from './queries';
import { ReferralLinkBox, ReferralLinkButtons } from './ReferralLinkActions';
import { earnedText } from './referralText';

/** Yellow tile with the gift icon (agenda card and Suscripción section). */
export function GiftTile() {
  return (
    <span className="w-10 h-10 rounded-[12px] bg-accent text-ink flex items-center justify-center shrink-0">
      <GiftIcon size={20} />
    </span>
  );
}

/** "Invita y gana un mes" — agenda side card (proposal referral-agenda-card). */
export function ReferralCard() {
  const referrals = useReferrals();
  const data = referrals.data;
  if (referrals.isError) return null;
  return (
    <section aria-labelledby="ref-title" className={cx(ui.card, 'gap-[14px]')}>
      <div className="flex gap-3 items-start">
        <GiftTile />
        <div className="flex flex-col gap-1 min-w-0">
          <h2 id="ref-title" className={ui.h2sm}>
            Invita y gana un mes
          </h2>
          <span className="text-[14px] text-ink-2 leading-[1.4]">Si un colega se registra con tu enlace y paga su primer mes, te regalamos un mes gratis.</span>
        </div>
      </div>
      {data ? <ReferralLinkBox url={data.url} /> : <Skeleton className="h-[46px] rounded-[14px]" />}
      {data && <ReferralLinkButtons url={data.url} />}
      <div className="flex flex-wrap justify-between items-center gap-2 border-t border-line pt-[10px]">
        {data && data.monthsEarned > 0 ? (
          <span className="inline-flex items-center gap-[6px] text-[13px] font-bold py-[5px] px-3 rounded-full bg-primary-soft text-primary">
            <CheckIcon size={14} strokeWidth={2.6} /> {earnedText(data.monthsEarned)}
          </span>
        ) : (
          <span />
        )}
        <Link to="/billing#referidos" className="min-h-11 inline-flex items-center font-bold text-[14px] underline-offset-2">
          Ver referidos
        </Link>
      </div>
    </section>
  );
}

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { cx } from '../../components/ui/cx';
import { Skeleton } from '../../components/ui/Skeleton';
import { ui } from '../../components/ui/styles';
import type { ReferralsResponse } from '@shared/api';
import { GiftTile } from './ReferralCard';
import { ReferralLinkBox, ReferralLinkButtons } from './ReferralLinkActions';
import { proReferralDetail, PRO_STATE } from './referralText';

function earnedNote(data: ReferralsResponse): string {
  if (data.monthsPending > 0) return `${data.monthsApplied} ${data.monthsApplied === 1 ? 'aplicado' : 'aplicados'} · ${data.monthsPending} ${data.monthsPending === 1 ? 'guardado' : 'guardados'}`;
  if (data.monthsEarned > 0) return 'ya sumados a tu plan';
  return 'por cada colega que pague';
}

/** "Referidos" in Suscripción (proposal referral-billing-section): link, explanation, people and months. */
export function ReferralsSection({ data }: { data: ReferralsResponse | undefined }) {
  const ref = useRef<HTMLElement>(null);
  const { hash } = useLocation();
  // "Ver referidos" (agenda card) links to /billing#referidos: bring the section into view once it has content.
  useEffect(() => {
    if (hash === '#referidos' && data) ref.current?.scrollIntoView?.({ block: 'start' });
  }, [hash, data]);
  return (
    <section ref={ref} id="referidos" aria-labelledby="referidos-title" className={cx(ui.card, 'gap-4 scroll-mt-6')}>
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div className="flex gap-3 items-start min-w-0 flex-[1_1_260px]">
          <GiftTile />
          <div className="flex flex-col gap-1 min-w-0">
            <h2 id="referidos-title" className={ui.h2}>
              Referidos
            </h2>
            <span className="text-[14px] text-ink-2 leading-[1.45]">
              Comparte tu enlace con colegas: cuando alguien se registra con él y paga su primer mes, te sumamos 1 mes gratis al final de tu plan.
            </span>
          </div>
        </div>
        <div className="bg-primary-soft rounded-[18px] py-3 px-4 flex flex-col gap-[2px] shrink-0">
          <span className="text-[13px] font-bold text-primary">Meses ganados</span>
          <span className="font-display font-extrabold text-[30px] leading-[1.1] tracking-[-0.8px] text-primary">{data ? data.monthsEarned : '…'}</span>
          <span className="text-[12px] text-ink-2">{data ? earnedNote(data) : ''}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold">Tu enlace de invitación</span>
        {data ? (
          <>
            <ReferralLinkBox url={data.url} />
            <ReferralLinkButtons url={data.url} />
          </>
        ) : (
          <Skeleton className="h-[46px] rounded-[14px]" />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="m-0 font-bold text-[16px]">Personas que invitaste ({data?.referrals.length ?? 0})</h3>
        {data && data.referrals.length === 0 ? (
          <div className="text-[14px] text-muted py-2">Aún no has invitado a nadie. Cuando un colega se registre con tu enlace, aparece aquí.</div>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col">
            {data?.referrals.map((r, i) => (
              <li key={r.referredProId} className={cx('flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3', i > 0 && 'border-t border-line')}>
                <div className="flex flex-col gap-[2px] min-w-0 flex-[1_1_160px]">
                  <span className="font-bold text-[15px] [overflow-wrap:anywhere]">{r.name}</span>
                  <span className="text-[13px] text-muted">{proReferralDetail(r)}</span>
                </div>
                <span className={PRO_STATE[r.state].className}>{PRO_STATE[r.state].label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-[13px] text-muted leading-[1.5]">
        Un mes por cada cuenta que pague, sin límite. La prueba gratis no cuenta y no vale registrarte tú mismo. Si tu plan está vencido, el mes queda guardado y se aplica en tu próximo pago.
      </div>
    </section>
  );
}

import { Link } from 'react-router';
import type { AdminProDetailResponse } from '@shared/api';
import { formatDateShort } from '@shared/format';
import { referralLinkLabel } from '@shared/referrals';
import { bogotaDate } from '@shared/time';
import { cx } from '../../components/ui/cx';
import { ui } from '../../components/ui/styles';
import { UserPlusIcon } from './icons';
import { adminReferralDetail, ADMIN_STATE, monthsText } from './referralText';

/** "Referido por Dra. Laura Pérez · se registró el 8 jun. 2026" under the admin pro header. */
export function ReferredByLine({ referredBy, registeredAt }: { referredBy: AdminProDetailResponse['referredBy']; registeredAt: string }) {
  if (!referredBy) return null;
  return (
    <div className="flex items-center gap-[6px] text-[14px] text-muted flex-wrap">
      <UserPlusIcon size={15} />
      <span>
        Referido por{' '}
        <Link to={`/admin/pros/${encodeURIComponent(referredBy.proId)}`} className="font-bold">
          {referredBy.name}
        </Link>{' '}
        · se registró el {formatDateShort(bogotaDate(registeredAt))}
      </span>
    </div>
  );
}

/** "Sus referidos" card in the admin pro detail. */
export function AdminReferralsCard({ referrals }: { referrals: AdminProDetailResponse['referrals'] }) {
  return (
    <section aria-label="Sus referidos" className={cx(ui.card, 'gap-[10px]')}>
      <div className="flex justify-between items-baseline gap-2">
        <h2 className={ui.h2sm}>Sus referidos</h2>
        {referrals.monthsEarned > 0 && (
          <span className="text-[13px] font-bold text-primary">
            {monthsText(referrals.monthsEarned)} {referrals.monthsEarned === 1 ? 'ganado' : 'ganados'}
            {referrals.monthsPending > 0 ? ` · ${referrals.monthsPending} ${referrals.monthsPending === 1 ? 'guardado' : 'guardados'}` : ''}
          </span>
        )}
      </div>
      {referrals.url && <div className="text-[13px] text-muted [overflow-wrap:anywhere]">{referralLinkLabel(referrals.url)}</div>}
      {referrals.referrals.length === 0 ? (
        <div className="text-[13px] text-muted py-2 border-t border-line">Todavía nadie se ha registrado con su enlace.</div>
      ) : (
        referrals.referrals.map((r) => (
          <div key={r.referredProId} className="flex justify-between items-center gap-[10px] py-2 border-t border-line">
            <div className="flex flex-col gap-[2px] min-w-0">
              <Link to={`/admin/pros/${encodeURIComponent(r.referredProId)}`} className="font-bold text-[14px] text-ink no-underline hover:underline [overflow-wrap:anywhere]">
                {r.name}
              </Link>
              <span className="text-[12px] text-muted">{adminReferralDetail(r)}</span>
            </div>
            <span className={ADMIN_STATE[r.state].className}>{ADMIN_STATE[r.state].label}</span>
          </div>
        ))
      )}
    </section>
  );
}

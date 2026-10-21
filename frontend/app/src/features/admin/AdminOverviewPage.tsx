import { Link } from 'react-router';
import { formatCop, formatDateShort } from '@shared/format';
import { bogotaDate } from '@shared/time';
import { cx } from '../../components/ui/cx';
import { ui } from '../../components/ui/styles';
import { useAdminStats, useAdminSubscriptions } from '../../lib/queries';
import { lastPaymentText, NoticeBadge, StateBadge, StatTiles } from './adminUi';

/** Resumen: stats, revenue, what needs attention and the latest payments. */
export function AdminOverviewPage() {
  const stats = useAdminStats();
  const subs = useAdminSubscriptions();
  const rows = subs.data?.rows ?? [];
  const attention = rows
    .filter((r) => r.pendingNotice || r.state === 'grace' || r.state === 'trial')
    .sort((a, b) => Number(b.pendingNotice) - Number(a.pendingNotice) || a.accessUntil.localeCompare(b.accessUntil))
    .slice(0, 6);
  const recent = rows
    .filter((r) => r.lastPayment)
    .sort((a, b) => b.lastPayment!.paidAt.localeCompare(a.lastPayment!.paidAt))
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <h1 className={ui.h1}>Resumen</h1>
        <div className="bg-white rounded-full px-5 h-[46px] flex items-center gap-2 text-[14px]">
          <span className="text-muted font-semibold">Ingresos del mes</span>
          <strong className="font-display font-extrabold text-[20px]">{stats.data ? formatCop(stats.data.revenueMonthCop) : '…'}</strong>
        </div>
      </div>
      <StatTiles stats={stats.data} />
      <div className="flex flex-wrap gap-[22px] items-start">
        <section className={cx(ui.card, 'flex-[1_1_380px] min-w-0 gap-3')}>
          <h2 className={ui.h2sm}>Por atender</h2>
          {!subs.data && [0, 1, 2].map((i) => <div key={i} className="skeleton h-12" />)}
          {subs.data && attention.length === 0 && <div className="text-[14px] text-muted">Nada pendiente. Todo al día.</div>}
          <ul className="m-0 p-0 list-none flex flex-col">
            {attention.map((r) => (
              <li key={r.proId} className="border-t border-line first:border-t-0">
                <Link to={`/admin/pros/${encodeURIComponent(r.proId)}`} className="flex items-center justify-between gap-3 py-3 no-underline text-ink hover:text-ink">
                  <span className="flex flex-col min-w-0">
                    <span className="font-bold text-[14px] flex flex-wrap gap-2 items-center">
                      {r.name} {r.pendingNotice && <NoticeBadge />}
                    </span>
                    <span className="text-[13px] text-muted">Vence {formatDateShort(bogotaDate(r.accessUntil))}</span>
                  </span>
                  <StateBadge state={r.state} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className={cx(ui.card, 'flex-[1_1_380px] min-w-0 gap-3')}>
          <h2 className={ui.h2sm}>Últimos pagos</h2>
          {!subs.data && [0, 1, 2].map((i) => <div key={i} className="skeleton h-12" />)}
          {subs.data && recent.length === 0 && <div className="text-[14px] text-muted">Aún no hay pagos.</div>}
          <ul className="m-0 p-0 list-none flex flex-col">
            {recent.map((r) => (
              <li key={r.proId} className="border-t border-line first:border-t-0">
                <Link to={`/admin/pros/${encodeURIComponent(r.proId)}`} className="flex items-center justify-between gap-3 py-3 no-underline text-ink hover:text-ink">
                  <span className="flex flex-col min-w-0">
                    <span className="font-bold text-[14px]">{r.name}</span>
                    <span className="text-[13px] text-muted">{lastPaymentText(r)}</span>
                  </span>
                  <strong className="text-[14px] whitespace-nowrap">{r.lastPayment?.amountCop ? formatCop(r.lastPayment.amountCop) : 'Sin cobro'}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

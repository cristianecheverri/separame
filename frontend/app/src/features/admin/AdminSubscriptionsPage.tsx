import { useState } from 'react';
import { Link } from 'react-router';
import { formatDateShort } from '@shared/format';
import { bogotaDate } from '@shared/time';
import type { SubscriptionState } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { ui } from '../../components/ui/styles';
import { useAdminPrices, useAdminStats, useAdminSubscriptions } from '../../lib/queries';
import { useDebounced } from '../../lib/useDebounced';
import { lastPaymentText, NoticeBadge, SearchBox, StateBadge, StatTiles, tableHead, th, type StatFilter } from './adminUi';
import { monthlyText, packagesLong, STATUS_TAG } from './priceText';

/** admin-subscriptions */
export function AdminSubscriptionsPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatFilter | null>(null);
  const q = useDebounced(query.trim(), 300);
  const state = filter && filter !== 'notices' ? (filter as SubscriptionState) : undefined;
  const stats = useAdminStats();
  const subs = useAdminSubscriptions({ q: q || undefined, state });
  const prices = useAdminPrices();
  const rows = [...(subs.data?.rows ?? [])]
    .filter((r) => filter !== 'notices' || r.pendingNotice)
    .sort((a, b) => Number(b.pendingNotice) - Number(a.pendingNotice));

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <h1 className={ui.h1}>Suscripciones</h1>
        <div className="flex flex-wrap gap-[10px] w-full sm:w-auto">
          <SearchBox id="a-admin-search" value={query} onChange={setQuery} placeholder="Buscar por nombre, correo o enlace" />
        </div>
      </div>

      <StatTiles stats={stats.data} active={filter} onPick={(key) => setFilter(filter === key ? null : key)} />

      <div className="flex flex-wrap gap-[22px] items-start">
        <section className="flex-[999_1_560px] min-w-0 bg-white rounded-[24px] pt-2 px-2 pb-3" aria-label="Suscripciones" aria-busy={subs.isPending}>
          <div className="overflow-x-auto relative">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead>
                <tr className={tableHead}>
                  <th className={cx(th, 'px-[14px]')}>Profesional</th>
                  <th className={cx(th, 'px-[10px]')}>Estado</th>
                  <th className={cx(th, 'px-[10px]')}>Vence</th>
                  <th className={cx(th, 'px-[10px]')}>Precio</th>
                  <th className={cx(th, 'px-[10px]')}>Último pago</th>
                  <th className={cx(th, 'px-[14px]')}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {subs.isPending &&
                  [0, 1, 2, 3, 4].map((i) => (
                    <tr key={i} className="border-t border-line">
                      <td colSpan={6} className="px-[14px] py-3">
                        <div className="skeleton h-9" />
                      </td>
                    </tr>
                  ))}
                {subs.data && rows.length === 0 && (
                  <tr className="border-t border-line">
                    <td colSpan={6} className="px-[14px] py-8 text-center text-muted">
                      No hay profesionales con ese filtro.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.proId} className={cx('border-t border-line', r.pendingNotice && 'bg-accent-soft/60')}>
                    <td className="px-[14px] py-3">
                      <div className="font-bold flex flex-wrap items-center gap-x-2 gap-y-1">
                        {r.name}
                        {r.pendingNotice && <NoticeBadge />}
                      </div>
                      <div className="text-[13px] text-muted">
                        /{r.slug}
                        {r.title ? ` · ${r.title}` : ''}
                      </div>
                    </td>
                    <td className="px-[10px] py-3">
                      <StateBadge state={r.state} />
                    </td>
                    <td className="px-[10px] py-3 whitespace-nowrap">{formatDateShort(bogotaDate(r.accessUntil))}</td>
                    <td className="px-[10px] py-3 whitespace-nowrap">{r.price.name}</td>
                    <td className="px-[10px] py-3 whitespace-nowrap text-ink-2">{lastPaymentText(r)}</td>
                    <td className="px-[14px] py-3 text-right">
                      <Link to={`/admin/pros/${encodeURIComponent(r.proId)}`} className="font-bold text-[14px] inline-flex items-center min-h-11 underline underline-offset-2" aria-label={`Ver ${r.name}`}>
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={cx(ui.card, 'flex-[1_1_300px] min-w-0 gap-[14px]')}>
          <div className="flex justify-between items-center gap-3">
            <h2 className={ui.h2}>Versiones de precio</h2>
            <Link to="/admin/prices?new=1" className="h-10 px-[14px] rounded-full bg-primary text-white hover:text-white hover:bg-primary-dark font-bold text-[13px] flex items-center no-underline whitespace-nowrap hit-44">
              Nueva versión
            </Link>
          </div>
          {!prices.data && [0, 1, 2].map((i) => <div key={i} className="skeleton h-[104px] rounded-[16px]" />)}
          {prices.data?.prices.map((p) => (
            <div
              key={p.id}
              className={cx(
                'rounded-[16px] p-[14px] flex flex-col gap-[6px]',
                p.status === 'draft' ? 'bg-white border-2 border-dashed border-line-strong' : p.isDefault ? 'bg-primary-soft' : 'bg-surface',
              )}
            >
              <div className="flex justify-between items-center gap-2">
                <div className="font-bold text-[15px]">{p.name}</div>
                <span className={cx('text-[11px] font-bold py-1 px-2 rounded-full', STATUS_TAG[p.status].className)}>{STATUS_TAG[p.status].label}</span>
              </div>
              <div className="font-display font-extrabold text-[22px]">{monthlyText(p)}</div>
              <div className="text-[13px] text-ink-2 leading-[1.4]">{packagesLong(p)}</div>
            </div>
          ))}
          <Link to="/admin/prices#migrar" className="h-[46px] rounded-full border-2 border-line-strong flex items-center justify-center font-bold text-[14px] text-ink hover:text-ink no-underline text-center px-3">
            Migrar profesionales a otro precio
          </Link>
          <div className="text-[12px] text-muted leading-[1.4]">Cada precio es inmutable. Al migrar se avisa por correo 30 días antes de la fecha efectiva.</div>
        </section>
      </div>
    </div>
  );
}

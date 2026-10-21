/** Shared admin bits: state badges, stat tiles, payment summaries. */
import { formatDateNoYear } from '@shared/format';
import { bogotaDate } from '@shared/time';
import type { AdminStatsResponse, AdminSubscriptionRow } from '@shared/api';
import type { PaymentMethod, SubscriptionState } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { ui } from '../../components/ui/styles';

export const STATE_BADGE: Record<SubscriptionState, { label: string; className: string }> = {
  trial: { label: 'Prueba', className: 'bg-accent-soft text-accent-ink' },
  active: { label: 'Vigente', className: 'bg-primary-soft text-primary' },
  grace: { label: 'En gracia', className: 'bg-warn-soft text-warn-ink' },
  expired: { label: 'Vencida', className: 'bg-surface text-ink-2' },
};

export function StateBadge({ state }: { state: SubscriptionState }) {
  const b = STATE_BADGE[state];
  return <span className={cx(ui.badge, b.className)}>{b.label}</span>;
}

export function NoticeBadge() {
  return <span className={cx(ui.badge, 'bg-accent text-ink')}>Aviso de pago</span>;
}

const SHORT_METHOD: Record<PaymentMethod, string> = {
  nequi: 'Nequi',
  transfer: 'Transferencia',
  cash: 'Efectivo',
  courtesy: 'Cortesía',
  card: 'Tarjeta',
  pse: 'PSE',
};

/** "Nequi · 14 oct." or "—". */
export function lastPaymentText(row: AdminSubscriptionRow): string {
  const p = row.lastPayment;
  if (!p) return '—';
  return `${SHORT_METHOD[p.method]} · ${formatDateNoYear(bogotaDate(p.paidAt))}`;
}

export type StatFilter = SubscriptionState | 'notices';

export const STAT_TILES: { key: StatFilter; label: string; stat: keyof AdminStatsResponse; className: string }[] = [
  { key: 'trial', label: 'En prueba', stat: 'trial', className: 'bg-accent-soft' },
  { key: 'active', label: 'Vigentes', stat: 'active', className: 'bg-primary text-white' },
  { key: 'grace', label: 'En gracia', stat: 'grace', className: 'bg-warn-soft' },
  { key: 'expired', label: 'Vencidas', stat: 'expired', className: 'bg-white' },
  { key: 'notices', label: 'Avisos por revisar', stat: 'pendingNotices', className: 'bg-accent' },
];

export function StatTiles({ stats, active, onPick }: { stats: AdminStatsResponse | undefined; active?: StatFilter | null; onPick?: (key: StatFilter) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-[14px]">
      {STAT_TILES.map((t) => {
        const content = (
          <>
            <div className="text-[14px] font-semibold">{t.label}</div>
            <div className="font-display font-extrabold text-[36px] leading-none">{stats ? stats[t.stat] : <span className="skeleton inline-block w-12 h-8 align-middle" />}</div>
          </>
        );
        const cls = cx('rounded-[20px] p-[18px] flex flex-col gap-[10px] text-left', t.className, active === t.key && 'outline outline-[3px] outline-ink outline-offset-2');
        return onPick ? (
          <button key={t.key} type="button" aria-pressed={active === t.key} onClick={() => onPick(t.key)} className={cls}>
            {content}
          </button>
        ) : (
          <div key={t.key} className={cls}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder: string; id: string }) {
  return (
    <label htmlFor={id} className="h-[46px] w-full sm:w-auto sm:min-w-[240px] rounded-full bg-white border-2 border-line-strong flex items-center gap-2 px-[14px] box-border text-muted focus-within:border-primary">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <span className="sr-only">{placeholder}</span>
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="border-0 outline-none focus-visible:outline-none text-[14px] grow min-w-0 bg-transparent text-ink" />
    </label>
  );
}

export const th = 'pt-[14px] pb-[10px] font-bold';
export const tableHead = 'text-left text-muted text-[12px] uppercase tracking-[0.4px]';

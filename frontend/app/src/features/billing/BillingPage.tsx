import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type BillingResponse, type PaymentNoticeRequest, type PaymentNoticeResponse, type ReferralsResponse } from '@shared/api';
import { formatCop, formatDateNoYear, formatDateShort, formatDayLong } from '@shared/format';
import { extendPaidUntil, GRACE_DAYS } from '@shared/subscription';
import { addMonths, bogotaDate } from '@shared/time';
import type { Payment, PaymentInstructions, SubscriptionStatus } from '@shared/types';
import { Chip } from '../../components/ui/Chip';
import { cx } from '../../components/ui/cx';
import { CheckIcon, CopyIcon, StarIcon } from '../../components/ui/icons';
import { SectionSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import { now } from '../../lib/clock';
import { formatDateLong, formatDayMonth } from '../../lib/format';
import { buildPlans, defaultPlanIndex, type PlanOption } from '../../lib/plans';
import { keys, useBilling } from '../../lib/queries';
import { useReferrals } from '../referrals/queries';
import { ReferralsSection } from '../referrals/ReferralsSection';
import { isReferralPayment, monthsText, proReferralPaymentRow } from '../referrals/referralText';
import { isPendingNotice, paymentDot, paymentTitle, STATUS_LABEL } from './paymentLabels';

function headline(sub: SubscriptionStatus): string {
  const access = bogotaDate(sub.accessUntil);
  switch (sub.state) {
    case 'trial':
      return `Tu prueba gratis termina el ${formatDayLong(bogotaDate(sub.trialEndsAt))}`;
    case 'active':
      return `Tu plan está activo hasta el ${formatDayLong(access)}`;
    case 'grace':
      return `Tu plan venció el ${formatDayMonth(access)}: tienes gracia hasta el ${formatDayMonth(bogotaDate(sub.graceUntil))}`;
    default:
      return `Tu plan venció el ${formatDayMonth(access)}`;
  }
}

/** "· incluye 2 meses ganados por referidos" / "· tienes 1 mes guardado por referidos" (referral boards). */
function referralNote(sub: SubscriptionStatus, referrals: ReferralsResponse | undefined): string {
  if (!referrals) return '';
  if (referrals.monthsPending > 0 && (sub.state === 'expired' || sub.state === 'grace')) {
    return ` · tienes ${monthsText(referrals.monthsPending)} ${referrals.monthsPending === 1 ? 'guardado' : 'guardados'} por referidos`;
  }
  if (referrals.monthsApplied > 0 && (sub.state === 'active' || sub.state === 'trial')) {
    return ` · incluye ${monthsText(referrals.monthsApplied)} ${referrals.monthsApplied === 1 ? 'ganado' : 'ganados'} por referidos`;
  }
  return '';
}

const planName = (months: number | null) => (months === 1 ? 'mes a mes' : months ? `${months} meses` : '');

/** Yellow card while a "Ya pagué" notice waits for review. */
function PendingNoticeCard({ notice }: { notice: Payment }) {
  return (
    <div role="status" className="bg-accent-soft rounded-[20px] py-4 px-5 flex gap-3 items-start">
      <span className="w-10 h-10 rounded-[12px] bg-accent text-ink flex items-center justify-center shrink-0">
        <span className="w-4 h-4 rounded-full border-[3px] border-ink border-t-transparent animate-spin motion-reduce:animate-none" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-[2px]">
        <span className="font-extrabold text-[16px]">
          Aviso de pago en revisión · plan {planName(notice.months)} · enviado el {formatDateNoYear(bogotaDate(notice.createdAt))}
        </span>
        <span className="text-[14px] text-ink-2">Te confirmamos por correo, normalmente el mismo día. Tu agenda sigue funcionando mientras tanto.</span>
      </div>
    </div>
  );
}

function Instructions({ instructions }: { instructions: PaymentInstructions | null }) {
  const toast = useToast();
  if (!instructions) {
    return (
      <div className="bg-surface rounded-[16px] p-4 text-[14px] text-ink-2 leading-[1.45]">
        Escríbenos y te contamos cómo pagar: <a href="mailto:soporte@separame.app" className="font-bold">soporte@separame.app</a>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {instructions.methods.map((m) => (
        <div key={`${m.kind}-${m.detail}`} className="bg-surface rounded-[16px] py-3 pl-4 pr-2 flex items-center gap-3">
          <div className="flex flex-col gap-[2px] grow min-w-0">
            <span className="text-[13px] font-bold text-muted">{m.label}</span>
            <span className="font-bold text-[17px] [overflow-wrap:anywhere]">{m.detail}</span>
          </div>
          <button
            type="button"
            aria-label={`Copiar ${m.label}: ${m.detail}`}
            className="h-11 px-3 rounded-full flex items-center gap-[6px] text-[13px] font-bold text-primary hover:bg-white shrink-0"
            onClick={async () => ((await copyText(m.detail.replace(/[^\d-]/g, '') || m.detail)) ? toast.success('Copiado.') : toast.error('No pudimos copiar.'))}
          >
            <CopyIcon size={16} /> Copiar
          </button>
        </div>
      ))}
      <div className="text-[14px] text-ink-2">
        A nombre de <strong className="text-ink">{instructions.holderName}</strong>
      </div>
      {instructions.note && <div className="text-[13px] text-muted leading-[1.45]">{instructions.note}</div>}
    </div>
  );
}

function NoticeForm({ plan, instructions, pending }: { plan: PlanOption; instructions: PaymentInstructions | null; pending: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const kinds = Array.from(new Set(instructions?.methods.map((m) => m.kind) ?? ['nequi', 'transfer'])) as ('nequi' | 'transfer')[];
  const [method, setMethod] = useState<'nequi' | 'transfer'>(kinds[0] ?? 'nequi');
  const [reference, setReference] = useState('');
  const [sent, setSent] = useState(false);
  const notice = useMutation({
    mutationFn: (body: PaymentNoticeRequest) => api.post<PaymentNoticeResponse>(apiPaths.paymentNotices(), body),
    onSuccess: () => {
      setSent(true);
      void qc.invalidateQueries({ queryKey: keys.billing });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (sent) {
    return (
      <div role="status" className="bg-primary-soft rounded-[18px] p-4 flex gap-3 items-start">
        <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
          <CheckIcon size={16} />
        </span>
        <div className="text-[15px] leading-[1.45]">
          <strong>Recibimos tu aviso.</strong> Te confirmamos por correo, normalmente el mismo día.
        </div>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    notice.mutate({ months: plan.months, method, reference: reference.trim() });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2" role="group" aria-labelledby="notice-method">
        <div id="notice-method" className={ui.label}>
          ¿Cómo pagaste?
        </div>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <Chip key={k} selected={method === k} onClick={() => setMethod(k)} disabled={pending}>
              {k === 'nequi' ? 'Nequi' : 'Transferencia'}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-[6px]">
        <label htmlFor="notice-ref" className={ui.label}>
          Referencia o comprobante (opcional)
        </label>
        <input id="notice-ref" className={ui.input} value={reference} maxLength={200} disabled={pending} onChange={(e) => setReference(e.target.value)} placeholder="Número de comprobante o referencia" />
      </div>
      <button
        type="submit"
        disabled={pending || notice.isPending}
        className="h-14 rounded-full bg-primary text-white flex items-center justify-center gap-[10px] font-bold text-[17px] hover:bg-primary-dark disabled:bg-disabled disabled:text-muted disabled:cursor-not-allowed"
      >
        <CheckIcon size={18} />
        {notice.isPending ? 'Enviando…' : 'Ya pagué · avisar'}
      </button>
      <div className="text-[13px] text-muted leading-[1.5]">
        {pending
          ? 'Ya tienes un aviso en revisión. Cuando lo confirmemos podrás enviar otro.'
          : `Paga ${formatCop(plan.amountCop)} por Nequi o transferencia y avísanos aquí. Revisamos el pago y activamos tu plan, normalmente el mismo día. Tres días antes de vencer te mandamos un correo para renovar.`}
      </div>
    </form>
  );
}

function PaymentHistory({ payments }: { payments: Payment[] }) {
  return (
    <section className={cx(ui.card, 'gap-3')}>
      <h2 className={ui.h2sm}>Historial de pagos</h2>
      {payments.length === 0 ? (
        <div className="text-[14px] text-muted">Aún no tienes pagos. Cuando pagues, aquí queda el registro.</div>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-3">
          {payments.map((p) =>
            isReferralPayment(p) ? (
              <ReferralHistoryItem key={p.id} payment={p} />
            ) : (
            <li key={p.id} className="flex gap-3 items-start">
              <span className={cx('w-[10px] h-[10px] rounded-full shrink-0 mt-[5px]', paymentDot(p))} aria-hidden="true" />
              <div className="flex flex-col gap-[2px] grow min-w-0">
                <div className="flex justify-between gap-2">
                  <span className="font-bold text-[14px]">
                    {paymentTitle(p)} <span className={cx('font-semibold', p.status === 'rejected' ? 'text-warn-ink' : p.status === 'pending' ? 'text-accent-ink' : 'text-primary')}>· {STATUS_LABEL[p.status]}</span>
                  </span>
                  <span className="font-bold text-[14px] whitespace-nowrap">{p.amountCop ? formatCop(p.amountCop) : 'Sin cobro'}</span>
                </div>
                <span className="text-[13px] text-muted">
                  {formatDateShort(bogotaDate(p.paidAt))}
                  {p.months ? ` · ${p.months} ${p.months === 1 ? 'mes' : 'meses'}` : ''}
                  {p.status === 'approved' && p.until ? ` · hasta ${formatDateShort(bogotaDate(p.until))}` : ''}
                  {p.status === 'rejected' && p.rejectReason ? ` · ${p.rejectReason}` : ''}
                </span>
              </div>
            </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/** "Mes gratis por referido · Nombre" · "+1 mes" (yellow dot). */
function ReferralHistoryItem({ payment }: { payment: Payment }) {
  const row = proReferralPaymentRow(payment);
  return (
    <li className="flex gap-3 items-start">
      <span className="w-[10px] h-[10px] rounded-full shrink-0 mt-[5px] bg-accent" aria-hidden="true" />
      <div className="flex flex-col gap-[2px] grow min-w-0">
        <div className="flex justify-between gap-2">
          <span className="font-bold text-[14px]">{row.title}</span>
          <span className="font-bold text-[14px] whitespace-nowrap">+{monthsText(payment.months ?? 1)}</span>
        </div>
        <span className="text-[13px] text-muted">{row.detail}</span>
      </div>
    </li>
  );
}

function Plans({ data, savedMonths }: { data: BillingResponse; savedMonths: number }) {
  const plans = buildPlans(data.price);
  const [selected, setSelected] = useState(() => defaultPlanIndex(plans));
  const plan = plans[selected];
  const until = plan ? extendPaidUntil(data.subscription, plan.months, now()) : null;
  const pending = data.payments.some(isPendingNotice);

  if (!plan) {
    return <div className={cx(ui.card, 'text-[14px] text-ink-2')}>Tu plan todavía no tiene paquetes. Escríbenos a soporte@separame.app y te ayudamos.</div>;
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[14px]" role="group" aria-label="Paquetes">
        {plans.map((p, i) => {
          const isSelected = i === selected;
          return (
            <button
              key={p.months}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelected(i)}
              className={cx('flex flex-col items-start gap-[6px] p-[18px] rounded-[22px] text-ink text-left border-2 min-h-[150px] box-border transition-colors', isSelected ? 'bg-primary-soft border-primary' : 'bg-white border-white hover:border-line')}
            >
              <span className={cx('text-[12px] font-bold py-1 px-[10px] rounded-full mb-1', p.best ? 'bg-primary text-white' : 'bg-surface text-ink-2')}>{p.tag}</span>
              <span className="font-bold text-[16px]">{p.name}</span>
              <span className="font-display font-extrabold text-[30px] tracking-[-0.8px] leading-[1.15]">{formatCop(p.amountCop)}</span>
              <span className="text-[14px] text-ink-2">{p.monthlyText}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-[22px] items-start">
        <section className={cx(ui.card, 'flex-[999_1_420px] min-w-0 gap-4')} aria-label="Pago">
          <div className="flex flex-wrap justify-between gap-3 items-baseline">
            <div className="flex flex-col gap-1">
              <span className="text-[14px] text-muted">Pagas hoy</span>
              <span className="font-display font-extrabold text-[36px] tracking-[-1px] leading-[1.1]">{formatCop(plan.amountCop)}</span>
            </div>
            <div className="text-[15px] sm:text-right">
              Tu agenda queda activa hasta el
              <br />
              <strong>{until ? formatDateLong(bogotaDate(until)) : ''}</strong>
              {until && savedMonths > 0 && (
                <>
                  {' '}
                  <span className="text-ink-2">
                    (+{monthsText(savedMonths)} {savedMonths === 1 ? 'guardado' : 'guardados'}: {formatDayMonth(bogotaDate(addMonths(until, savedMonths)))})
                  </span>
                </>
              )}
            </div>
          </div>
          <h2 className="m-0 font-bold text-[16px] pt-1">Cómo pagar</h2>
          <Instructions instructions={data.instructions} />
          <NoticeForm key={plan.months} plan={plan} instructions={data.instructions} pending={pending} />
        </section>

        <section className={cx(ui.card, 'flex-[1_1_300px] min-w-0 gap-[14px]')}>
          <h2 className={ui.h2sm}>¿Y si no renuevo a tiempo?</h2>
          <div className="flex flex-col gap-[10px] text-[14px] leading-[1.45] text-ink-2">
            <span>
              Tienes <strong className="text-ink">{GRACE_DAYS} días de gracia</strong> con todo funcionando.
            </span>
            <span>Después, tu página dice «Agenda no disponible temporalmente» y nadie puede reservar.</span>
            <span>Tus citas ya agendadas siguen en pie, con recordatorio. Puedes entrar a verlas cuando quieras.</span>
            <span>Cuando confirmamos tu pago, todo vuelve a funcionar al instante.</span>
          </div>
        </section>
      </div>
    </>
  );
}

/** pro-billing-plans (manual payments: instructions + "Ya pagué" notice). */
export function BillingPage() {
  const billing = useBilling();
  const referrals = useReferrals();
  const data = billing.data;
  const pendingNotice = data?.payments.find(isPendingNotice);

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-[6px]">
        <div className="text-[15px] text-muted font-semibold">{data ? `${headline(data.subscription)}${referralNote(data.subscription, referrals.data)}` : <Skeleton className="h-5 w-72" />}</div>
        <h1 className={ui.h1}>Sigue recibiendo citas sin parar</h1>
      </div>

      {!data ? (
        <>
          <Skeleton className="h-[76px] rounded-[20px]" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[14px]">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[150px] rounded-[22px]" />
            ))}
          </div>
          <SectionSkeleton rows={2} />
        </>
      ) : (
        <>
          {pendingNotice && <PendingNoticeCard notice={pendingNotice} />}
          {data.price.monthlyCop && (
            <div className="bg-accent rounded-[20px] py-4 px-5 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex gap-3 items-center">
                <span className="w-10 h-10 rounded-[12px] bg-ink text-accent flex items-center justify-center shrink-0">
                  <StarIcon size={20} />
                </span>
                <div className="flex flex-col gap-[2px]">
                  <span className="font-extrabold text-[16px]">
                    Precio {data.price.name.toLowerCase()}: {formatCop(data.price.monthlyCop)} al mes
                  </span>
                  <span className="text-[14px]">Lo conservas mientras sigas renovando, aunque el precio suba para los nuevos.</span>
                </div>
              </div>
            </div>
          )}
          <Plans data={data} savedMonths={referrals.data?.monthsPending ?? 0} />
          {!referrals.isError && <ReferralsSection data={referrals.data} />}
          <PaymentHistory payments={data.payments} />
        </>
      )}
    </div>
  );
}

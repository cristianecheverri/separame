import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type AdminProDetailResponse, type ManualPaymentMethod, type ManualPaymentRequest, type ManualPaymentResponse } from '@shared/api';
import { formatCop, formatDateNoYear, formatDateShort, initials } from '@shared/format';
import { manualPaymentSchema, rejectNoticeSchema } from '@shared/schemas';
import { extendPaidUntil } from '@shared/subscription';
import { bogotaDate, todayBogota } from '@shared/time';
import type { Payment, SubscriptionStatus } from '@shared/types';
import { Chip } from '../../components/ui/Chip';
import { cx } from '../../components/ui/cx';
import { Field } from '../../components/ui/Field';
import { CheckIcon, ChevronLeftIcon } from '../../components/ui/icons';
import { Modal } from '../../components/ui/Modal';
import { SectionSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { now } from '../../lib/clock';
import { formatCopInput, formatMonthShortYear, formatPhone, parseCopInput } from '../../lib/format';
import { keys, useAdminPro } from '../../lib/queries';
import { METHOD_LABEL, paymentDot, paymentTitle, STATUS_LABEL } from '../billing/paymentLabels';
import { suggestedAmount } from './priceText';

const METHODS: { value: ManualPaymentMethod; label: string; placeholder: string }[] = [
  { value: 'transfer', label: 'Transferencia', placeholder: 'Ej. Bancolombia, comprobante #482913' },
  { value: 'nequi', label: 'Nequi directo', placeholder: 'Ej. Nequi al 300 000 0000, ref. M12345' },
  { value: 'cash', label: 'Efectivo', placeholder: 'Ej. Recibido en persona en Medellín' },
  { value: 'courtesy', label: 'Cortesía', placeholder: 'Ej. Compensación por falla del 12 oct.' },
];
const PERIODS = [
  { months: 3, label: '+3 meses' },
  { months: 6, label: '+6 meses' },
  { months: 12, label: '+12 meses' },
  { months: 0, label: 'Fecha exacta' },
];

function statusBadge(sub: SubscriptionStatus): { label: string; className: string } {
  const access = bogotaDate(sub.accessUntil);
  switch (sub.state) {
    case 'trial':
      return { label: `En prueba hasta el ${formatDateNoYear(access)}`, className: 'bg-accent-soft text-accent-ink' };
    case 'active':
      return { label: `Vigente hasta ${formatDateShort(access)}`, className: 'bg-primary text-white' };
    case 'grace':
      return { label: `En gracia hasta el ${formatDateNoYear(bogotaDate(sub.graceUntil))}`, className: 'bg-warn-soft text-warn-ink' };
    default:
      return { label: `Vencida desde el ${formatDateNoYear(bogotaDate(sub.graceUntil))}`, className: 'bg-surface text-ink-2' };
  }
}

function defaultExactDate(today: string): string {
  const [y, m] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 2, 0));
  return last.toISOString().slice(0, 10);
}

const isManualMethod = (m: Payment['method']): m is ManualPaymentMethod => m === 'transfer' || m === 'nequi' || m === 'cash' || m === 'courtesy';

function useInvalidateAdmin(proId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.adminPro(proId) });
    void qc.invalidateQueries({ queryKey: keys.adminSubscriptionsAll });
    void qc.invalidateQueries({ queryKey: keys.adminStats });
  };
}

/** admin-pro-detail-manual-payment */
export function AdminProDetailPage() {
  const { proId = '' } = useParams();
  const detail = useAdminPro(proId);
  const data = detail.data;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin" className="self-start flex gap-[6px] items-center min-h-11 font-bold text-[14px] no-underline">
        <ChevronLeftIcon size={16} />
        Suscripciones
      </Link>
      {detail.isError ? (
        <div className={cx(ui.card, 'text-[15px] text-ink-2')}>{errorMessage(detail.error)}</div>
      ) : !data ? (
        <>
          <div className="flex gap-4 items-center">
            <Skeleton className="w-[60px] h-[60px] rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
          <div className="flex flex-wrap gap-[22px] items-start">
            <SectionSkeleton rows={5} className="flex-[999_1_460px] min-w-0" />
            <SectionSkeleton rows={3} className="flex-[1_1_320px] min-w-0" />
          </div>
        </>
      ) : (
        <Detail key={proId} proId={proId} data={data} />
      )}
    </div>
  );
}

function Detail({ proId, data }: { proId: string; data: AdminProDetailResponse }) {
  const toast = useToast();
  const invalidate = useInvalidateAdmin(proId);
  const today = todayBogota(now());
  const [method, setMethod] = useState<ManualPaymentMethod>('transfer');
  const [period, setPeriod] = useState(0);
  const [exactDate, setExactDate] = useState(() => defaultExactDate(today));
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState('');
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ result: ManualPaymentResponse; notify: boolean } | null>(null);
  const [rejecting, setRejecting] = useState<Payment | null>(null);

  const { profile, subscription, price } = data;
  const notice = data.payments.find((p) => p.status === 'pending' && p.source === 'pro_notice');
  const months = PERIODS[period].months;
  const isExact = months === 0;
  const courtesy = method === 'courtesy';
  const suggestion = isExact ? null : suggestedAmount(price, months);
  const untilDate = isExact ? exactDate : bogotaDate(extendPaidUntil(subscription, months, now()));
  const expiredBefore = new Date(subscription.accessUntil).getTime() < now().getTime();
  const badge = statusBadge(done?.result.subscription ?? subscription);
  const priceLine = `${price.name} · ${price.monthlyCop ? `${formatCop(price.monthlyCop)}/mes` : 'por definir'}`;

  const record = useMutation({
    mutationFn: (body: ManualPaymentRequest) => api.post<ManualPaymentResponse>(apiPaths.adminManualPayment(proId), body),
    onSuccess: (result, body) => {
      setDone({ result, notify: body.notify });
      invalidate();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amountCop = courtesy ? null : (parseCopInput(amount) ?? suggestion);
    const body = { method, amountCop, paidAt, period: isExact ? { until: exactDate } : { months }, reference, notify };
    const parsed = manualPaymentSchema.safeParse(body);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revisa los datos.');
    if (isExact && exactDate <= today) return setError('La fecha de vigencia debe ser después de hoy.');
    setError(null);
    record.mutate(parsed.data);
  };

  const approve = (n: Payment) => {
    const body: ManualPaymentRequest = {
      noticeId: n.id,
      method: isManualMethod(n.method) ? n.method : 'transfer',
      amountCop: n.amountCop,
      paidAt: bogotaDate(n.paidAt),
      period: { months: n.months ?? 1 },
      reference: n.reference,
      notify: true,
    };
    record.mutate(body, { onError: (e) => toast.error(errorMessage(e)) });
  };

  const reset = () => {
    setDone(null);
    setMethod('transfer');
    setPeriod(0);
    setAmount('');
    setReference('');
    setNotify(true);
  };

  const doneUntil = done?.result.payment.until ? formatDateShort(bogotaDate(done.result.payment.until)) : '';

  return (
    <>
      <div className="flex flex-wrap gap-4 justify-between items-center">
        <div className="flex gap-4 items-center min-w-0">
          <div className="w-[60px] h-[60px] rounded-full bg-accent flex items-center justify-center font-display font-extrabold text-[22px] shrink-0">{initials(profile.name)}</div>
          <div className="flex flex-col gap-1 min-w-0">
            <h1 className="m-0 font-display font-extrabold text-[26px] sm:text-[32px] leading-[1.15] tracking-[-0.8px] [overflow-wrap:anywhere]">{profile.name}</h1>
            <div className="text-[14px] text-muted [overflow-wrap:anywhere]">
              {[`separame.app/${profile.slug}`, profile.email, formatPhone(profile.phone)].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <span className={cx('text-[13px] font-bold py-2 px-[14px] rounded-full whitespace-nowrap', badge.className)}>{badge.label}</span>
      </div>

      <div className="flex flex-wrap gap-[22px] items-start">
        <div className="flex-[999_1_460px] min-w-0 flex flex-col gap-5">
          {notice && !done && (
            <section aria-label="Aviso de pago" className="bg-accent-soft rounded-[24px] p-5 sm:p-6 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className={cx(ui.badge, 'bg-accent text-ink')}>Aviso de pago</span>
                <span className="text-[13px] text-ink-2">enviado el {formatDateNoYear(bogotaDate(notice.createdAt))}</span>
              </div>
              <div className="font-display font-extrabold text-[20px] leading-[1.25]">
                Dice que pagó {notice.amountCop ? formatCop(notice.amountCop) : '—'} por {METHOD_LABEL[notice.method]} · plan {notice.months} {notice.months === 1 ? 'mes' : 'meses'}
              </div>
              <div className="text-[14px] text-ink-2">{notice.reference ? `Referencia: ${notice.reference}.` : 'Sin referencia.'} Revisa que el dinero haya llegado antes de aprobar.</div>
              <div className="flex flex-wrap gap-[10px] pt-1">
                <button type="button" onClick={() => approve(notice)} disabled={record.isPending} className="h-12 px-6 rounded-full bg-primary text-white font-bold text-[15px] hover:bg-primary-dark grow sm:grow-0">
                  {record.isPending ? 'Aprobando…' : 'Aprobar'}
                </button>
                <button type="button" onClick={() => setRejecting(notice)} className="h-12 px-6 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] grow sm:grow-0">
                  Rechazar
                </button>
              </div>
            </section>
          )}

          <section aria-label="Registrar pago manual" className="bg-white rounded-[24px] p-[18px] sm:p-6 flex flex-col gap-[18px]">
            <div className="flex flex-col gap-1">
              <h2 className="m-0 font-display font-extrabold text-[22px]">Registrar pago manual</h2>
              <div className="text-[14px] text-muted">Para pagos hechos por fuera de la plataforma. Activa la agenda al instante.</div>
            </div>

            {done ? (
              <div className="flex flex-col gap-[14px] items-start" role="status">
                <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-ink">
                  <CheckIcon size={28} strokeWidth={2.6} />
                </div>
                <div className="font-display font-extrabold text-[24px] leading-[1.2]">Pago registrado. Vigente hasta el {doneUntil}.</div>
                <div className="text-[15px] text-ink-2 leading-[1.5]">
                  La página de {profile.name} ya está recibiendo reservas otra vez. {done.notify ? `Le enviamos el comprobante a ${profile.email}.` : 'No se envió correo.'}
                </div>
                <button type="button" onClick={reset} className="h-11 px-[18px] rounded-full border-2 border-line-strong bg-white font-bold text-[14px] text-ink">
                  Registrar otro pago
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-[18px]" noValidate>
                <div className="flex flex-col gap-2" role="group" aria-labelledby="pm-method">
                  <div id="pm-method" className={ui.label}>
                    ¿Cómo pagó?
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {METHODS.map((m) => (
                      <Chip key={m.value} selected={method === m.value} onClick={() => setMethod(m.value)}>
                        {m.label}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2" role="group" aria-labelledby="pm-period">
                  <div id="pm-period" className={ui.label}>
                    Vigencia
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PERIODS.map((p, i) => (
                      <Chip key={p.label} selected={period === i} onClick={() => setPeriod(i)}>
                        {p.label}
                      </Chip>
                    ))}
                  </div>
                  {isExact && (
                    <div className="flex flex-col gap-[6px] pt-1">
                      <label htmlFor="pm-until" className="text-[13px] font-semibold">
                        Vigente hasta
                      </label>
                      <input id="pm-until" type="date" min={today} value={exactDate} onChange={(e) => setExactDate(e.target.value)} className={cx(ui.input, 'max-w-[240px]')} />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
                  <div className="flex flex-col gap-[6px] min-w-0">
                    <label htmlFor="pm-amount" className={ui.label}>
                      Monto recibido
                    </label>
                    <div className="flex gap-2">
                      <div className="h-12 rounded-[14px] bg-surface px-3 flex items-center font-semibold text-[14px] shrink-0" aria-hidden="true">
                        COP $
                      </div>
                      <input
                        id="pm-amount"
                        type="text"
                        inputMode="numeric"
                        disabled={courtesy}
                        value={courtesy ? '' : amount}
                        placeholder={courtesy ? 'Sin cobro' : suggestion ? formatCopInput(String(suggestion)) : 'Monto'}
                        onChange={(e) => setAmount(formatCopInput(e.target.value))}
                        className={cx(ui.input, 'grow')}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-[6px] min-w-0">
                    <label htmlFor="pm-date" className={ui.label}>
                      Fecha del pago
                    </label>
                    <input id="pm-date" type="date" max={today} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={ui.input} />
                  </div>
                </div>

                <Field label="Referencia o nota">
                  {(p) => <textarea {...p} rows={2} maxLength={200} className={ui.textarea} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={METHODS.find((m) => m.value === method)!.placeholder} />}
                </Field>

                <div className="bg-primary-soft rounded-[18px] py-4 px-[18px] flex flex-wrap gap-3 justify-between items-center">
                  <div className="flex flex-col gap-[2px]">
                    <span className="text-[13px] text-ink-2">Queda vigente hasta</span>
                    <span className="font-display font-extrabold text-[24px]">{formatDateShort(untilDate)}</span>
                    <span className="text-[13px] text-ink-2">{isExact ? 'Fecha elegida a mano' : expiredBefore ? 'Se cuenta desde hoy porque el plan ya había vencido' : 'Se suma al final de su periodo actual'}</span>
                  </div>
                  <div className="text-[13px] text-ink-2 sm:text-right">
                    Mantiene su precio
                    <br />
                    <strong className="text-ink">{priceLine}</strong>
                  </div>
                </div>

                <label className="flex gap-3 items-center text-[14px] cursor-pointer min-h-11">
                  <input type="checkbox" checked={notify} onChange={() => setNotify(!notify)} className="w-[22px] h-[22px] m-0 accent-primary shrink-0" />
                  Enviarle un correo con el comprobante y la nueva fecha
                </label>

                {error && (
                  <div role="alert" className="bg-warn-soft text-warn-ink rounded-[14px] px-4 py-3 text-[14px] font-semibold">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={record.isPending} className="h-[54px] rounded-full bg-primary text-white font-bold text-[16px] hover:bg-primary-dark disabled:opacity-70">
                  {record.isPending ? 'Registrando…' : 'Registrar pago y activar agenda'}
                </button>
              </form>
            )}
          </section>
        </div>

        <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-5">
          <section className={cx(ui.card, 'gap-[10px]')}>
            <h2 className={cx(ui.h2sm, 'mb-1')}>Suscripción</h2>
            {(
              [
                ['Precio', priceLine],
                [new Date(subscription.accessUntil).getTime() < now().getTime() ? 'Venció' : 'Vence', formatDateShort(bogotaDate(subscription.accessUntil))],
                ['Gracia hasta', formatDateShort(bogotaDate(subscription.graceUntil))],
                ['Prueba gratis', new Date(subscription.trialEndsAt).getTime() < now().getTime() ? `Usada (${formatMonthShortYear(bogotaDate(data.trialStartedAt))})` : `Hasta ${formatDateShort(bogotaDate(subscription.trialEndsAt))}`],
                ['Citas agendadas', data.upcomingAppointments === 1 ? '1 próxima' : `${data.upcomingAppointments} próximas`],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-[14px]">
                <span className="text-muted">{k}</span>
                <strong className="text-right">{v}</strong>
              </div>
            ))}
          </section>

          <section className={cx(ui.card, 'gap-3')}>
            <h2 className={cx(ui.h2sm, 'mb-1')}>Historial de pagos</h2>
            <ul className="m-0 p-0 list-none flex flex-col gap-3">
              {(done ? [done.result.payment, ...data.payments.filter((p) => p.id !== done.result.payment.id)] : data.payments).map((p) => (
                <HistoryItem key={p.id} payment={p} />
              ))}
              <li className="flex gap-3 items-start">
                <span className="w-[10px] h-[10px] rounded-full shrink-0 mt-[5px] bg-line-strong" aria-hidden="true" />
                <div className="flex flex-col gap-[2px] grow min-w-0">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-[14px]">Prueba gratis</span>
                    <span className="font-bold text-[14px]">—</span>
                  </div>
                  <span className="text-[13px] text-muted">{formatDateShort(bogotaDate(data.trialStartedAt))} · 7 días</span>
                </div>
              </li>
            </ul>
            <div className="text-[12px] text-muted pt-1">Cada registro manual guarda quién lo hizo y cuándo.</div>
          </section>
        </div>
      </div>

      {rejecting && <RejectModal proId={proId} notice={rejecting} onClose={() => setRejecting(null)} onDone={invalidate} />}
    </>
  );
}

function HistoryItem({ payment: p }: { payment: Payment }) {
  const status = p.status === 'approved' ? '' : ` · ${STATUS_LABEL[p.status].toLowerCase()}`;
  const parts = [formatDateShort(bogotaDate(p.paidAt))];
  if (p.months) parts.push(`${p.months} ${p.months === 1 ? 'mes' : 'meses'}`);
  if (p.status === 'approved' && p.until) parts.push(`hasta ${formatDateShort(bogotaDate(p.until))}`);
  if (p.status === 'rejected' && p.rejectReason) parts.push(p.rejectReason.toLowerCase());
  if (p.recordedBy) parts.push(`registrado por ${p.recordedBy.email}`);
  else if (p.reviewedBy && p.status === 'approved') parts.push(`aprobado por ${p.reviewedBy.email}`);
  return (
    <li className="flex gap-3 items-start">
      <span className={cx('w-[10px] h-[10px] rounded-full shrink-0 mt-[5px]', paymentDot(p))} aria-hidden="true" />
      <div className="flex flex-col gap-[2px] grow min-w-0">
        <div className="flex justify-between gap-2">
          <span className="font-bold text-[14px]">
            {paymentTitle(p)}
            {status}
          </span>
          <span className="font-bold text-[14px] whitespace-nowrap">{p.method === 'courtesy' ? 'Sin cobro' : p.amountCop ? formatCop(p.amountCop) : '—'}</span>
        </div>
        <span className="text-[13px] text-muted [overflow-wrap:anywhere]">{parts.join(' · ')}</span>
      </div>
    </li>
  );
}

function RejectModal({ proId, notice, onClose, onDone }: { proId: string; notice: Payment; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reject = useMutation({
    mutationFn: (body: { reason: string }) => api.post(apiPaths.adminRejectNotice(proId, notice.id), body),
    onSuccess: () => {
      toast.success('Aviso rechazado. Le enviamos el motivo por correo.');
      onDone();
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const submit = () => {
    const parsed = rejectNoticeSchema.safeParse({ reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Escribe el motivo');
    reject.mutate(parsed.data);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Rechazar aviso de pago"
      description={`${notice.amountCop ? formatCop(notice.amountCop) : ''} por ${METHOD_LABEL[notice.method].toLowerCase()}. El profesional recibe el motivo por correo.`}
      footer={
        <>
          <button type="button" onClick={submit} disabled={reject.isPending} className="h-12 px-6 rounded-full bg-ink text-white font-bold text-[15px] grow sm:grow-0">
            {reject.isPending ? 'Rechazando…' : 'Rechazar aviso'}
          </button>
          <button type="button" onClick={onClose} className="h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] grow sm:grow-0">
            Volver
          </button>
        </>
      }
    >
      <Field label="Motivo" error={error}>
        {(p) => <textarea {...p} rows={3} maxLength={300} className={ui.textarea} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. No encontramos la transferencia en la cuenta" data-autofocus />}
      </Field>
    </Modal>
  );
}

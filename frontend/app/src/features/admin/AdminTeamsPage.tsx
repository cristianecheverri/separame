import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type AdminTeamRequestRow, type AdminTeamRow } from '@shared/api';
import { formatCop, formatDateNoYear, formatDateShort } from '@shared/format';
import { approveTeamSchema, rejectNoticeSchema, TEAM_MAX_PROFESSIONALS } from '@shared/schemas';
import { bogotaDate } from '@shared/time';
import type { SubscriptionStatus } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { InfoIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { firstName, plural } from '../../lib/format';
import { useAdminTeams } from '../../lib/queries';
import { Stepper } from '../team/Stepper';
import { tableHead, th } from './adminUi';

const seatsLabel = (n: number) => plural(n, 'cupo', 'cupos');

/** «Fundador · Vigente hasta 25 feb. 2027», «Prueba gratis · hasta 28 oct. 2026»… */
function subscriptionBadge(sub: SubscriptionStatus, priceName: string): { text: string; className: string } {
  const until = formatDateShort(bogotaDate(sub.accessUntil));
  switch (sub.state) {
    case 'trial':
      return { text: `Prueba gratis · hasta ${until}`, className: 'bg-accent-soft text-accent-ink' };
    case 'active':
      return { text: `${priceName} · Vigente hasta ${until}`, className: 'bg-primary-soft text-primary' };
    case 'grace':
      return { text: `${priceName} · En gracia hasta ${formatDateShort(bogotaDate(sub.graceUntil))}`, className: 'bg-warn-soft text-warn-ink' };
    default:
      return { text: `${priceName} · Vencida el ${until}`, className: 'bg-surface text-ink-2' };
  }
}

type Decision = { kind: 'approved'; seats: number } | { kind: 'rejected' };

function useReview(ownerId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const onSuccess = () => void qc.invalidateQueries({ queryKey: ['admin'] });
  const onError = (error: Error) => toast.error(errorMessage(error));
  const approve = useMutation({ mutationFn: (seats: number) => api.post(apiPaths.adminApproveTeam(ownerId), { seats }), onSuccess, onError });
  const reject = useMutation({ mutationFn: (reason: string) => api.post(apiPaths.adminRejectTeam(ownerId), { reason }), onSuccess, onError });
  return { approve, reject };
}

/** Right panel of a request: seats stepper + approve, or the rejection with its reason. */
function ReviewPanel({ row, onDone }: { row: AdminTeamRequestRow; onDone: (decision: Decision) => void }) {
  const { approve, reject } = useReview(row.ownerId);
  const [seats, setSeats] = useState(() => Math.min(TEAM_MAX_PROFESSIONALS - 1, Math.max(1, row.request.professionals - 1)));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const labelId = `seats-${row.ownerId}`;
  const reasonId = `reason-${row.ownerId}`;
  const busy = approve.isPending || reject.isPending;

  const doApprove = () => {
    const parsed = approveTeamSchema.safeParse({ seats });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revisa los cupos.');
    approve.mutate(parsed.data.seats, { onSuccess: () => onDone({ kind: 'approved', seats: parsed.data.seats }) });
  };
  const doReject = () => {
    const parsed = rejectNoticeSchema.safeParse({ reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Escribe el motivo.');
    setError(null);
    reject.mutate(parsed.data.reason, { onSuccess: () => onDone({ kind: 'rejected' }) });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-[6px]">
        <span id={labelId} className={ui.label}>
          Cupos adicionales
        </span>
        <Stepper size="compact" value={seats} min={1} max={TEAM_MAX_PROFESSIONALS - 1} onChange={setSeats} labelledBy={labelId} decreaseLabel="Quitar un cupo" increaseLabel="Agregar un cupo" />
        <span className="text-[13px] text-muted">
          {plural(seats + 1, 'profesional', 'profesionales')} en total, contando a {row.ownerName}
        </span>
      </div>
      <button type="button" disabled={busy} onClick={doApprove} className="h-12 rounded-full bg-primary text-white font-bold text-[15px] hover:bg-primary-dark disabled:bg-disabled disabled:text-muted">
        {approve.isPending ? 'Aprobando…' : `Aprobar con ${seatsLabel(seats)}`}
      </button>
      {!rejecting ? (
        <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="h-12 w-full rounded-full border-2 border-line-strong bg-white text-ink font-bold text-[15px] hover:border-ink-2">
          Rechazar
        </button>
      ) : (
        <div className="flex flex-col gap-[10px] pt-1 border-t border-line">
          <label htmlFor={reasonId} className={cx(ui.label, 'pt-[10px]')}>
            Motivo del rechazo
          </label>
          <textarea id={reasonId} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por qué no se aprueba; se envía por correo" className={ui.textarea} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={doReject} className="h-11 px-[18px] rounded-full bg-ink text-white font-bold text-[14px] hover:bg-black">
              {reject.isPending ? 'Enviando…' : 'Enviar rechazo'}
            </button>
            <button type="button" onClick={() => { setRejecting(false); setError(null); }} className="h-11 px-[18px] rounded-full border-2 border-line-strong bg-white text-ink font-bold text-[14px]">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && (
        <div role="alert" className="text-[13px] font-semibold text-warn-ink">
          {error}
        </div>
      )}
    </div>
  );
}

function RequestCard({ row, decision, onDone }: { row: AdminTeamRequestRow; decision: Decision | undefined; onDone: (d: Decision) => void }) {
  const badge = subscriptionBadge(row.subscription, row.priceName);
  const { request } = row;
  return (
    <article aria-label={`Solicitud de ${request.name}`} className="bg-white rounded-[24px] p-[18px] sm:p-6 flex flex-wrap gap-6 items-start">
      <div className="flex-[999_1_420px] min-w-0 flex flex-col gap-[10px]">
        <h3 className="m-0 font-display font-extrabold text-[22px] tracking-[-0.4px] [overflow-wrap:anywhere]">{request.name}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link to={`/admin/pros/${encodeURIComponent(row.ownerId)}`} className="font-bold text-[15px]">
            {row.ownerName}
            {row.ownerTitle && ` · ${row.ownerTitle}`}
          </Link>
          <span className={cx(ui.badge, badge.className)}>{badge.text}</span>
        </div>
        <div className="font-bold text-[15px]">
          Pide {plural(request.professionals, 'profesional', 'profesionales')} ({request.professionals - 1} {request.professionals - 1 === 1 ? 'adicional' : 'adicionales'})
        </div>
        {request.message && <blockquote className="m-0 bg-surface border-l-4 border-accent rounded-[16px] py-[14px] px-4 text-[14px] leading-[1.5] text-ink-2 [overflow-wrap:anywhere]">{request.message}</blockquote>}
        <div className="text-[13px] text-muted">Enviada el {formatDateNoYear(bogotaDate(request.createdAt))}</div>
      </div>
      <div className="flex-[1_1_300px] min-w-0 box-border bg-surface rounded-[20px] p-[18px] flex flex-col gap-3">
        {decision ? (
          <div role="status" className="flex flex-col gap-[10px] items-start">
            <span className={cx(ui.badge, decision.kind === 'approved' ? 'bg-primary text-white' : 'bg-warn-soft text-warn-ink')}>
              {decision.kind === 'approved' ? `Aprobada con ${seatsLabel(decision.seats)}` : 'Rechazada'}
            </span>
            <span className="text-[14px] text-ink-2 leading-[1.45]">
              {decision.kind === 'approved' ? `Le enviamos un correo a ${firstName(row.ownerName)}. Desde hoy ve «Equipo» en su panel.` : `Le enviamos el motivo por correo a ${firstName(row.ownerName)}.`}
            </span>
          </div>
        ) : (
          <ReviewPanel row={row} onDone={onDone} />
        )}
      </div>
    </article>
  );
}

function priceText(t: AdminTeamRow): string {
  return t.extraProfessionalCop === null ? `${t.priceName} · sin valor por profesional` : `${t.priceName} + ${t.seats} × ${formatCop(t.extraProfessionalCop)}`;
}

function ActiveTeams({ teams, loading }: { teams: AdminTeamRow[]; loading: boolean }) {
  return (
    <section aria-labelledby="active-title" className="flex flex-col gap-[14px]">
      <h2 id="active-title" className="m-0 font-display font-extrabold text-[22px]">
        Equipos activos
      </h2>
      <div className="bg-white rounded-[24px] pt-2 px-2 pb-3" aria-busy={loading}>
        {/* `relative`: the sr-only header must not escape the scroller (page overflow on phones). */}
        <div className="overflow-x-auto relative">
          <table className="w-full min-w-[700px] border-collapse text-[14px]">
            <thead>
              <tr className={tableHead}>
                <th className={cx(th, 'px-[14px]')}>Consultorio</th>
                <th className={cx(th, 'px-[10px]')}>Dueño</th>
                <th className={cx(th, 'px-[10px]')}>Cupos (usados / aprobados)</th>
                <th className={cx(th, 'px-[10px]')}>Precio</th>
                <th className={cx(th, 'px-[10px]')}>Vence</th>
                <th className={cx(th, 'px-[14px]')}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="border-t border-line">
                  <td colSpan={6} className="px-[14px] py-3">
                    <div className="skeleton h-9" />
                  </td>
                </tr>
              )}
              {!loading && teams.length === 0 && (
                <tr className="border-t border-line">
                  <td colSpan={6} className="px-[14px] py-4 text-muted">
                    Todavía no hay equipos activos.
                  </td>
                </tr>
              )}
              {teams.map((t) => (
                <tr key={t.ownerId} className="border-t border-line">
                  <td className="px-[14px] py-3">
                    <div className="font-bold">{t.name}</div>
                    <div className="text-[13px] text-muted">separame.app/{t.slug}</div>
                  </td>
                  <td className="px-[10px] py-3">{t.ownerName}</td>
                  <td className="px-[10px] py-3">
                    <span className={cx(ui.badge, t.used >= t.seats ? 'bg-accent-soft text-accent-ink' : 'bg-primary-soft text-primary')}>
                      {t.used} / {t.seats}
                    </span>
                  </td>
                  <td className="px-[10px] py-3 whitespace-nowrap">{priceText(t)}</td>
                  <td className="px-[10px] py-3 whitespace-nowrap">{formatDateShort(bogotaDate(t.accessUntil))}</td>
                  <td className="px-[14px] py-3 text-right">
                    <Link to={`/admin/pros/${encodeURIComponent(t.ownerId)}`} aria-label={`Ver ${t.name}`} className="font-bold text-[14px] min-h-11 inline-flex items-center">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** admin «Equipos» (board team-admin-requests-desktop): pending requests and active teams. */
export function AdminTeamsPage() {
  const teams = useAdminTeams();
  /** Requests reviewed on this visit: they stay with their result until the page is left. */
  const [decided, setDecided] = useState<{ row: AdminTeamRequestRow; decision: Decision }[]>([]);
  const pending = teams.data?.requests ?? [];
  const rows = [...pending.filter((r) => !decided.some((d) => d.row.ownerId === r.ownerId)).map((row) => ({ row, decision: undefined as Decision | undefined })), ...decided];
  const pendingCount = rows.filter((r) => !r.decision).length;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-1">
        <h1 className={ui.h1}>Equipos</h1>
        <div className="text-[15px] text-muted">Solicitudes de plan para equipos y consultorios activos.</div>
      </div>

      <section aria-labelledby="pending-title" className="flex flex-col gap-[14px]">
        <h2 id="pending-title" className="m-0 font-display font-extrabold text-[22px]">
          Por revisar{teams.data ? ` (${pendingCount})` : ''}
        </h2>
        {teams.isPending && <div className="skeleton h-48 rounded-[24px]" />}
        {teams.isError && <div className={cx(ui.card, 'text-[14px] text-ink-2')}>{errorMessage(teams.error)}</div>}
        {teams.data && rows.length === 0 && <div className={cx(ui.card, 'text-[14px] text-muted')}>No hay solicitudes por revisar.</div>}
        {rows.map(({ row, decision }) => (
          <RequestCard key={row.ownerId} row={row} decision={decision} onDone={(d) => setDecided((list) => [...list, { row, decision: d }])} />
        ))}
        <div className="bg-primary-soft rounded-[18px] py-[14px] px-[18px] flex gap-3 items-start">
          <InfoIcon size={20} className="shrink-0 mt-[1px] text-primary" />
          <div className="text-[14px] leading-[1.5]">
            Al aprobar, el dueño ve «Equipo» en su panel y el valor por profesional se suma a su próxima renovación, congelado con su versión de precio. Le avisamos por correo.
          </div>
        </div>
      </section>

      <ActiveTeams teams={teams.data?.teams ?? []} loading={teams.isPending} />
    </div>
  );
}

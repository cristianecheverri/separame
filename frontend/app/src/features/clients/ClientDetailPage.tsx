import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type ClientDetailResponse } from '@shared/api';
import { formatDateNoYear, formatDateShort, formatInstantTime, initials } from '@shared/format';
import { updateClientNotesSchema } from '@shared/schemas';
import { bogotaDate } from '@shared/time';
import type { ClientRecord } from '@shared/types';
import { ContactActions } from '../../components/ContactActions';
import { cx } from '../../components/ui/cx';
import { EmptyState } from '../../components/ui/EmptyState';
import { AlertIcon, ChevronLeftIcon, LockIcon, PlusIcon } from '../../components/ui/icons';
import { Modal } from '../../components/ui/Modal';
import { SectionSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError, errorMessage } from '../../lib/api';
import { buildDayRows } from '../../lib/agenda';
import { now } from '../../lib/clock';
import { formatPhone } from '../../lib/format';
import { usePro } from '../../lib/pro';
import { keys, useClient } from '../../lib/queries';
import { AppointmentCard } from '../appointments/AppointmentCard';
import type { AppointmentModalState } from '../appointments/AppointmentModals';
import { LazyAppointmentModals } from '../appointments/LazyAppointmentModals';
import { useOutcome } from '../appointments/useOutcome';

const NO_SCHEDULE = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

/** Client detail: contact, totals, notes and appointment history. */
export function ClientDetailPage() {
  const { clientKey = '' } = useParams();
  const detail = useClient(clientKey);
  return (
    <div className="flex flex-col gap-5">
      <Link to="/clients" className="self-start flex gap-[6px] items-center min-h-11 font-bold text-[14px] no-underline">
        <ChevronLeftIcon size={16} />
        Clientes
      </Link>
      {detail.isError ? (
        <div className={cx(ui.card, 'text-[15px] text-ink-2')}>{errorMessage(detail.error)}</div>
      ) : !detail.data ? (
        <>
          <div className="flex gap-4 items-center">
            <Skeleton className="w-[60px] h-[60px] rounded-full" />
            <Skeleton className="h-8 w-56" />
          </div>
          <SectionSkeleton rows={4} />
        </>
      ) : (
        <Detail data={detail.data} />
      )}
    </div>
  );
}

function Detail({ data }: { data: ClientDetailResponse }) {
  const { client, appointments } = data;
  const { readOnly } = usePro();
  const [modal, setModal] = useState<AppointmentModalState>(null);
  const [deleting, setDeleting] = useState(false);
  const markOutcome = useOutcome();
  const clock = now();
  const year = String(clock.getUTCFullYear());

  const tiles = [
    ['Citas', client.totals.appointments, 'bg-white'],
    ['Asistió', client.totals.attended, 'bg-primary-soft'],
    ['No asistió', client.totals.noShows, client.totals.noShows ? 'bg-warn-soft' : 'bg-white'],
    ['Canceladas', client.totals.cancelled, 'bg-white'],
  ] as const;

  return (
    <>
      <div className="flex flex-wrap gap-4 justify-between items-center">
        <div className="flex gap-4 items-center min-w-0">
          <div className="w-[60px] h-[60px] rounded-full bg-accent flex items-center justify-center font-display font-extrabold text-[22px] shrink-0">{initials(client.name)}</div>
          <div className="flex flex-col gap-1 min-w-0">
            <h1 className="m-0 font-display font-extrabold text-[26px] sm:text-[32px] leading-[1.15] tracking-[-0.8px] [overflow-wrap:anywhere]">{client.name}</h1>
            {(client.phone || client.email) && <div className="text-[14px] text-muted [overflow-wrap:anywhere]">{[formatPhone(client.phone), client.email].filter(Boolean).join(' · ')}</div>}
          </div>
        </div>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setModal({ kind: 'new', client: { name: client.name, email: client.email, phone: client.phone } })}
          className={cx(ui.btnPrimary, readOnly && ui.btnLocked)}
        >
          {readOnly ? <LockIcon size={16} /> : <PlusIcon />}
          Nueva cita
        </button>
      </div>

      <ContactActions client={client} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-[14px]">
        {tiles.map(([label, value, bg]) => (
          <div key={label} className={cx('rounded-[20px] p-[18px] flex flex-col gap-[10px]', bg)}>
            <div className="text-[14px] font-semibold">{label}</div>
            <div className="font-display font-extrabold text-[36px] leading-none">{value}</div>
          </div>
        ))}
      </div>

      {/* Notes come before the history when stacked (phones), and sit on the right when there's room. */}
      <div className="@container">
        <div className="grid gap-x-6 gap-y-5 items-start @min-[804px]:grid-cols-[minmax(0,1fr)_320px] @min-[804px]:grid-rows-[auto_1fr]">
          <div className="min-w-0 @min-[804px]:col-start-2 @min-[804px]:row-start-1">
            <NotesCard key={client.updatedAt} client={client} readOnly={readOnly} />
          </div>
          <section className={cx(ui.card, 'min-w-0 gap-[6px] @min-[804px]:col-start-1 @min-[804px]:row-start-1 @min-[804px]:row-span-2')}>
            <h2 className={cx(ui.h2, 'pb-[10px]')}>Historial de citas</h2>
            {appointments.length === 0 ? (
              <EmptyState title="Sin citas todavía" />
            ) : (
              appointments.map((a) => {
                const date = bogotaDate(a.start);
                const row = buildDayRows(date, [a], NO_SCHEDULE, { slotStepMin: 30 }, clock, { includeFree: false })[0];
                return (
                  <AppointmentCard
                    key={a.id}
                    row={row}
                    now={clock}
                    readOnly={readOnly}
                    title="service"
                    onOutcome={markOutcome}
                    onMove={(appointment) => setModal({ kind: 'move', appointment })}
                    onCancel={(appointment) => setModal({ kind: 'cancel', appointment })}
                    timeLabel={
                      <span className="flex sm:flex-col gap-x-2">
                        <span>{date.startsWith(year) ? formatDateNoYear(date) : formatDateShort(date)}</span>
                        <span className="font-semibold text-muted sm:text-[13px]">{formatInstantTime(a.start)}</span>
                      </span>
                    }
                  />
                );
              })
            )}
          </section>

          <section className={cx(ui.card, 'min-w-0 gap-3 @min-[804px]:col-start-2 @min-[804px]:row-start-2')}>
            <h2 className={ui.h2sm}>Datos del cliente</h2>
            <div className="text-[14px] text-ink-2">Cliente desde el {formatDateShort(bogotaDate(client.firstSeenAt))}.</div>
            <button type="button" disabled={readOnly} onClick={() => setDeleting(true)} className="self-start min-h-11 font-bold text-[14px] text-warn-ink underline underline-offset-2 disabled:text-muted disabled:cursor-not-allowed">
              Eliminar cliente
            </button>
          </section>
        </div>
      </div>

      <LazyAppointmentModals state={modal} onClose={() => setModal(null)} />
      {deleting && <DeleteClientModal client={client} onClose={() => setDeleting(false)} />}
    </>
  );
}

function NotesCard({ client, readOnly }: { client: ClientRecord; readOnly: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [notes, setNotes] = useState(client.notes);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: { notes: string }) => api.put(apiPaths.clientNotes(client.key), body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.client(client.key) });
      toast.success('Notas guardadas.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submit = () => {
    const parsed = updateClientNotesSchema.safeParse({ notes });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revisa las notas.');
    setError(null);
    save.mutate(parsed.data);
  };
  return (
    <section className={cx(ui.card, 'gap-3')}>
      <h2 className={ui.h2sm}>Notas</h2>
      <div className="bg-warn-soft text-warn-ink rounded-[14px] px-[14px] py-3 text-[13px] font-semibold leading-[1.4] flex gap-2 items-start" id="notes-warning">
        <AlertIcon size={16} className="shrink-0 mt-[1px]" />
        <span>No escribas información de salud ni datos sensibles (Ley 1581).</span>
      </div>
      <label htmlFor="client-notes" className="sr-only">
        Notas sobre {client.name}
      </label>
      <textarea
        id="client-notes"
        rows={5}
        maxLength={1000}
        disabled={readOnly}
        aria-describedby="notes-warning"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notas privadas sobre este cliente"
        className={ui.textarea}
      />
      <div className="flex justify-between items-center gap-3">
        <span className="text-[12px] text-muted">{notes.length}/1.000</span>
        <button type="button" onClick={submit} disabled={readOnly || save.isPending || notes === client.notes} className={cx(ui.btnPrimary, 'h-11')}>
          {save.isPending ? 'Guardando…' : 'Guardar notas'}
        </button>
      </div>
      {error && <div className="text-[13px] font-semibold text-warn-ink">{error}</div>}
    </section>
  );
}

function DeleteClientModal({ client, onClose }: { client: ClientRecord; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () => api.del(apiPaths.client(client.key)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.clientsAll });
      toast.success(`Eliminaste los datos de ${client.name}.`);
      navigate('/clients', { replace: true });
    },
    onError: (e) =>
      setError(e instanceof ApiError && e.status === 409 ? e.message || 'Tiene citas próximas. Cancélalas antes de eliminar este cliente.' : errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`¿Eliminar a ${client.name}?`}
      description="Se borran su nombre, correo, celular y notas, también de sus citas pasadas (quedan como «Cliente eliminado»). Esto no se puede deshacer."
      footer={
        <>
          <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending} className="h-12 px-6 rounded-full bg-ink text-white font-bold text-[15px] grow sm:grow-0">
            {remove.isPending ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
          <button type="button" onClick={onClose} className="h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] grow sm:grow-0" data-autofocus>
            Volver
          </button>
        </>
      }
    >
      {error ? (
        <div role="alert" className="bg-warn-soft text-warn-ink rounded-[14px] px-4 py-3 text-[14px] font-semibold">
          {error}
        </div>
      ) : (
        <span className="sr-only">Confirmación</span>
      )}
    </Modal>
  );
}

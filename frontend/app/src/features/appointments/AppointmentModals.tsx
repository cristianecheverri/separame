import { useState, type FormEvent } from 'react';
import { createAppointmentSchema } from '@shared/schemas';
import { formatCop, formatDuration, formatWhen } from '@shared/format';
import type { ISODate } from '@shared/time';
import type { Appointment } from '@shared/types';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { cx } from '../../components/ui/cx';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { useServices } from '../../lib/queries';
import { useCancelAppointment, useCreateAppointment, useMoveAppointment } from './mutations';
import { SlotPicker } from './SlotPicker';

export type AppointmentModalState =
  | { kind: 'new'; date?: ISODate }
  | { kind: 'move'; appointment: Appointment }
  | { kind: 'cancel'; appointment: Appointment }
  | null;

const submitClass = 'h-12 px-6 rounded-full bg-primary text-white font-bold text-[15px] hover:bg-primary-dark disabled:bg-disabled disabled:text-muted disabled:cursor-not-allowed grow sm:grow-0';
const backClass = 'h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] text-ink grow sm:grow-0';

export function NewAppointmentModal({ date, onClose }: { date?: ISODate; onClose: () => void }) {
  const services = useServices();
  const create = useCreateAppointment();
  const toast = useToast();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slotKey, setSlotKey] = useState(0);

  const list = services.data?.services ?? [];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!serviceId || !start) {
      setErrors({ start: 'Elige el servicio, el día y la hora.' });
      return;
    }
    const parsed = createAppointmentSchema.safeParse({ serviceId, start, client: { name, email, phone } });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[issue.path.length - 1])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(`Cita agendada: ${parsed.data.client.name}, ${formatWhen(parsed.data.start)}.`);
        onClose();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'slot_taken') {
          setStart(null);
          setSlotKey((k) => k + 1);
          setErrors({ start: errorMessage(error) });
        } else toast.error(errorMessage(error));
      },
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Nueva cita"
      description="Agéndala tú mismo: la persona recibe la confirmación si escribes su correo."
      footer={
        <>
          <button type="submit" form="new-appointment" className={submitClass} disabled={create.isPending}>
            {create.isPending ? 'Agendando…' : 'Agendar cita'}
          </button>
          <button type="button" onClick={onClose} className={backClass}>
            Volver
          </button>
        </>
      }
    >
      <form id="new-appointment" onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
          <legend className={cx(ui.label, 'mb-2')}>Servicio</legend>
          {services.isPending && <div className="skeleton h-14" />}
          {list.length === 0 && !services.isPending && <div className="text-[14px] text-muted">Primero crea un servicio en «Servicios».</div>}
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((s) => {
              const selected = s.id === serviceId;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setServiceId(s.id);
                    setStart(null);
                    setSlotKey((k) => k + 1);
                  }}
                  className={cx('flex items-center gap-3 rounded-[16px] border-2 px-[14px] py-3 text-left min-h-14', selected ? 'border-primary bg-primary-soft' : 'border-line bg-white hover:border-line-strong')}
                >
                  <span className={cx('w-[22px] h-[22px] rounded-full shrink-0 box-border bg-white', selected ? 'border-[7px] border-primary' : 'border-2 border-radio')} />
                  <span className="flex flex-col min-w-0">
                    <span className="font-bold text-[15px]">{s.name}</span>
                    <span className="text-[13px] text-muted">
                      {formatDuration(s.durationMin)} · {formatCop(s.priceCop)}
                      {!s.visible && ' · oculto'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2">
          <div className={ui.label}>Día y hora</div>
          <SlotPicker key={slotKey} serviceId={serviceId} value={start} onChange={setStart} initialDate={date} />
          {errors.start && <div className="text-[13px] font-semibold text-warn-ink" role="alert">{errors.start}</div>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" error={errors.name} className="sm:col-span-2">
            {(p) => <input {...p} className={ui.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
          </Field>
          <Field label="Celular" error={errors.phone}>
            {(p) => <input {...p} className={ui.input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="300 123 4567" />}
          </Field>
          <Field label="Correo (opcional)" error={errors.email} help="Sin correo no se envían confirmación ni recordatorio.">
            {(p) => <input {...p} type="email" className={ui.input} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoCapitalize="none" />}
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export function MoveAppointmentModal({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const move = useMoveAppointment();
  const toast = useToast();
  const [start, setStart] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  const submit = () => {
    if (!start) return;
    move.mutate(
      { appointment, start },
      {
        onSuccess: () => {
          toast.success(`Cita movida al ${formatWhen(start)}.`);
          onClose();
        },
        onError: (error) => {
          toast.error(errorMessage(error));
          if (error instanceof ApiError && error.code === 'slot_taken') {
            setStart(null);
            setKey((k) => k + 1);
          } else onClose();
        },
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Mover cita"
      description={
        <>
          {appointment.client.name} · {appointment.serviceName}. Ahora: {formatWhen(appointment.start)}.
        </>
      }
      footer={
        <>
          <button type="button" onClick={submit} disabled={!start || move.isPending} className={submitClass}>
            {move.isPending ? 'Moviendo…' : 'Mover cita'}
          </button>
          <button type="button" onClick={onClose} className={backClass}>
            Volver
          </button>
        </>
      }
    >
      <SlotPicker key={key} serviceId={appointment.serviceId} value={start} onChange={setStart} exclude={appointment.start} />
      {appointment.client.email && <div className="text-[13px] text-muted">Le avisamos por correo a {appointment.client.email}.</div>}
    </Modal>
  );
}

export function CancelAppointmentModal({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const cancel = useCancelAppointment();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const submit = () => {
    onClose();
    cancel.mutate(
      { appointment, reason: reason.trim() || undefined },
      {
        onSuccess: () => toast.success(`Cancelaste la cita de ${appointment.client.name}.`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`¿Cancelar la cita de ${appointment.client.name}?`}
      description={`${appointment.serviceName} · ${formatWhen(appointment.start)}`}
      footer={
        <>
          <button type="button" onClick={submit} className="h-12 px-6 rounded-full bg-ink text-white font-bold text-[15px] grow sm:grow-0 hover:bg-black">
            Sí, cancelar cita
          </button>
          <button type="button" onClick={onClose} className={backClass} data-autofocus>
            Volver
          </button>
        </>
      }
    >
      <Field label="Motivo (opcional)" help={appointment.client.email ? `Le enviamos un correo a ${appointment.client.email} avisando.` : 'Esta persona no tiene correo: avísale tú.'}>
        {(p) => <textarea {...p} rows={2} maxLength={300} className={ui.textarea} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Tuve una urgencia" />}
      </Field>
    </Modal>
  );
}

/** Renders the open appointment modal, if any. */
export function AppointmentModals({ state, onClose }: { state: AppointmentModalState; onClose: () => void }) {
  if (!state) return null;
  if (state.kind === 'new') return <NewAppointmentModal date={state.date} onClose={onClose} />;
  if (state.kind === 'move') return <MoveAppointmentModal appointment={state.appointment} onClose={onClose} />;
  return <CancelAppointmentModal appointment={state.appointment} onClose={onClose} />;
}

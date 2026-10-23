import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createAppointmentSchema } from '@shared/schemas';
import { capitalize, formatDayLong, formatDuration } from '@shared/format';
import { addMinutes, bogotaDate, todayBogota, type ISODate } from '@shared/time';
import type { Appointment, ClientContact, ClientRecord, Service } from '@shared/types';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { cx } from '../../components/ui/cx';
import { CalendarIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { focusFirstError } from '../../lib/focusError';
import { endSentence, formatPhone, formatWhenInline } from '../../lib/format';
import { telHref } from '../../components/ContactActions';
import { now } from '../../lib/clock';
import { ActingScope } from '../../lib/actingPro';
import { useActing, useAvailability, useServices, useSlots } from '../../lib/queries';
import { PickProModal } from '../team/PickProModal';
import { ClientNameField } from './ClientNameField';
import { useCancelAppointment, useCreateAppointment, useMoveAppointment } from './mutations';
import { SlotPicker, SLOT_PICKER_DAYS } from './SlotPicker';
import { formatTimeRange } from './slotFormat';

export type AppointmentModalState =
  /** `start` preselects the time (an agenda gap of `freeMinutes`); `serviceId` the service (waitlist). */
  /** `proId` (team plan): whose agenda; under «Todos» without it, the modal asks first. */
  | { kind: 'new'; date?: ISODate; client?: ClientContact; start?: string; freeMinutes?: number; serviceId?: string; proId?: string }
  | { kind: 'move'; appointment: Appointment }
  | { kind: 'cancel'; appointment: Appointment }
  | null;

const submitClass = 'h-12 px-6 rounded-full bg-primary text-white font-bold text-[15px] hover:bg-primary-dark disabled:bg-disabled disabled:text-muted disabled:cursor-not-allowed grow sm:grow-0';
const backClass = 'h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] text-ink grow sm:grow-0';

interface NewAppointmentProps {
  date?: ISODate;
  client?: ClientContact;
  start?: string;
  freeMinutes?: number;
  serviceId?: string;
  onClose: () => void;
}

/**
 * The only service, the only one that fits the free gap (with the margin between appointments),
 * or the only visible one that fills it exactly.
 */
function pickService(services: Service[], freeMinutes: number | undefined, bufferMin: number): string | null {
  if (services.length === 1) return services[0].id;
  if (freeMinutes === undefined) return null;
  const fitting = services.filter((s) => s.durationMin + bufferMin <= freeMinutes);
  const visible = fitting.filter((s) => s.visible);
  if (fitting.length === 1) return fitting[0].id;
  if (visible.length === 1) return visible[0].id;
  const exact = visible.filter((s) => s.durationMin + bufferMin === freeMinutes);
  return exact.length === 1 ? exact[0].id : null;
}

export function NewAppointmentModal({ date, client, start: initialStart, freeMinutes, serviceId: initialServiceId, onClose }: NewAppointmentProps) {
  const services = useServices();
  const create = useCreateAppointment();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [pickedServiceId, setServiceId] = useState<string | null>(initialServiceId ?? null);
  const [start, setStart] = useState<string | null>(initialStart ?? null);
  /** Time to keep when the service changes (the tapped gap, or the last time picked). */
  const preferredStart = useRef<string | null>(initialStart ?? null);
  /** A preselected time shows as a summary with «Cambiar»; the day grid otherwise. */
  const [changingTime, setChangingTime] = useState(!initialStart);
  const [name, setName] = useState(client?.name ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [pickedClient, setPickedClient] = useState<ClientRecord | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slotKey, setSlotKey] = useState(0);

  const list = services.data?.services ?? [];
  const bufferMin = useAvailability().data?.settings.rules.bufferMin ?? 0;
  const autoServiceId = pickService(list, freeMinutes, bufferMin);
  const serviceId = (pickedServiceId && list.some((s) => s.id === pickedServiceId) ? pickedServiceId : null) ?? autoServiceId;
  const service = list.find((s) => s.id === serviceId);
  const chipsRef = useRef<HTMLDivElement>(null);
  // A preselected service may sit off-screen in the chip row on phones: bring it into view.
  useEffect(() => {
    chipsRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [serviceId]);
  // The summary only while the preselected time is still free for this service (else the grid drops it).
  const slots = useSlots(changingTime ? null : serviceId, todayBogota(now()), SLOT_PICKER_DAYS);
  const startFits = !slots.data || !start || slots.data.days.some((d) => d.slots.includes(start));
  const showSummary = !changingTime && !!start && !!service && startFits;

  const showErrors = (next: Record<string, string>) => {
    setErrors(next);
    focusFirstError(formRef.current);
  };
  const pickStart = (value: string | null) => {
    if (value) preferredStart.current = value;
    setStart(value);
  };
  const pickClient = (c: ClientRecord) => {
    setPickedClient(c);
    setName(c.name);
    setPhone(c.phone.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3'));
    setEmail(c.email);
  };
  const clearClient = () => {
    setPickedClient(null);
    setName('');
    setPhone('');
    setEmail('');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!serviceId || !start) next.start = 'Elige el servicio, el día y la hora.';
    const parsed = createAppointmentSchema.safeParse({ serviceId: serviceId ?? '', start: start ?? '', client: { name, email: email.trim(), phone: phone.trim() } });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[issue.path.length - 1]);
        if (field !== 'serviceId' && field !== 'start') next[field] ??= issue.message;
      }
    }
    if (Object.keys(next).length > 0 || !parsed.success) {
      if (next.start) setChangingTime(true);
      return showErrors(next);
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(endSentence(`Cita agendada: ${parsed.data.client.name}, ${formatWhenInline(parsed.data.start)}`));
        onClose();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'slot_taken') {
          setStart(null);
          preferredStart.current = null;
          setChangingTime(true);
          setSlotKey((k) => k + 1);
          showErrors({ start: errorMessage(error) });
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
      <form id="new-appointment" ref={formRef} onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label="Nombre" error={errors.name}>
          {(p) => (
            <ClientNameField
              id={p.id}
              describedBy={p['aria-describedby']}
              invalid={p['aria-invalid']}
              value={name}
              onChange={(value) => {
                setName(value);
                if (pickedClient) setPickedClient(null);
              }}
              onPick={pickClient}
              onClear={clearClient}
              picked={pickedClient}
              startClosed={!!client}
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-2 border-0 p-0 m-0 min-w-0">
          <legend className={cx(ui.label, 'mb-2')}>Servicio</legend>
          {services.isPending && <div className="skeleton h-11" />}
          {list.length === 0 && !services.isPending && <div className="text-[14px] text-muted">Primero crea un servicio en «Servicios».</div>}
          {list.length > 0 && (
            <div ref={chipsRef} className="flex gap-2 overflow-x-auto scroll-px-5 -mx-5 px-5 pb-[2px] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0">
              {list.map((s) => {
                const selected = s.id === serviceId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      if (s.id === serviceId) return;
                      setServiceId(s.id);
                      setStart(preferredStart.current);
                      setSlotKey((k) => k + 1);
                    }}
                    className={cx(ui.chip, 'whitespace-nowrap shrink-0', selected ? ui.chipOn : ui.chipOff)}
                  >
                    {s.name} · {formatDuration(s.durationMin)}
                    {!s.visible && ' · oculto'}
                  </button>
                );
              })}
            </div>
          )}
          {!pickedServiceId && freeMinutes !== undefined && service && list.length > 1 && <div className={ui.help}>Preseleccionado: cabe en el espacio libre de {formatDuration(freeMinutes)}.</div>}
        </fieldset>
        <div className="flex flex-col gap-2">
          <div className={ui.label}>Día y hora</div>
          {showSummary ? (
            <div className="bg-primary-soft rounded-[18px] py-3 pr-2 pl-4 flex items-center gap-3">
              <CalendarIcon size={22} className="shrink-0 text-primary" />
              <div className="flex flex-col gap-[2px] grow min-w-0">
                <span className="font-bold text-[15px]">{capitalize(formatDayLong(bogotaDate(start)))}</span>
                <span className="text-[13px] text-ink-2">
                  {formatTimeRange(start, addMinutes(start, service.durationMin))}
                  {start === initialStart && freeMinutes !== undefined && ' · del espacio libre'}
                </span>
              </div>
              <button type="button" onClick={() => setChangingTime(true)} className="h-11 px-3 font-bold text-[14px] text-primary hover:text-primary-dark shrink-0">
                Cambiar
              </button>
            </div>
          ) : (
            <SlotPicker key={slotKey} serviceId={serviceId} value={start} onChange={pickStart} initialDate={start ? bogotaDate(start) : date} />
          )}
          {errors.start && <div className="text-[13px] font-semibold text-warn-ink" role="alert">{errors.start}</div>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Celular (opcional)" error={errors.phone}>
            {(p) => <input {...p} type="tel" className={ui.input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" placeholder="Número de celular" />}
          </Field>
          <Field label="Correo (opcional)" error={errors.email} help="Sin correo no se envían confirmación ni recordatorio.">
            {(p) => <input {...p} type="email" className={ui.input} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoCapitalize="none" autoComplete="off" placeholder="Correo del cliente" />}
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
          toast.success(endSentence(`Cita movida al ${formatWhenInline(start)}`));
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
          {appointment.client.name} · {appointment.serviceName}. Ahora: {endSentence(formatWhenInline(appointment.start))}
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
      <SlotPicker key={key} serviceId={appointment.serviceId} value={start} onChange={setStart} exclude={appointment.start} excludeAppointmentId={appointment.id} />
      <div className="text-[13px] text-muted [overflow-wrap:anywhere]">
        <NoticeText client={appointment.client} sent="Le avisamos por correo a" />
      </div>
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
      description={`${appointment.serviceName} · ${formatWhenInline(appointment.start)}`}
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
      <Field label="Motivo (opcional)" help={<NoticeText client={appointment.client} sent="Le enviamos un correo avisando a" />}>
        {(p) => <textarea {...p} rows={2} maxLength={300} className={ui.textarea} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de la cancelación" />}
      </Field>
    </Modal>
  );
}

/** Who tells the client about the change: our email, or the pro (call them) when they left no email. */
function NoticeText({ client, sent }: { client: ClientContact; sent: string }) {
  if (client.email) return <>{`${sent} ${client.email}.`}</>;
  if (client.phone) {
    return (
      <>
        Este cliente no dejó correo: llámalo al{' '}
        <a href={telHref(client.phone)} className="font-bold whitespace-nowrap">
          {formatPhone(client.phone)}
        </a>{' '}
        para avisarle.
      </>
    );
  }
  return <>Este cliente no dejó correo ni celular: avísale tú.</>;
}

type NewState = Extract<AppointmentModalState, { kind: 'new' }>;

/** «Nueva cita»; under «Todos» (team plan) it first asks with whom, then books on that agenda. */
function NewAppointmentFlow({ state, onClose }: { state: NewState; onClose: () => void }) {
  const { isAll } = useActing();
  const [picked, setPicked] = useState<string | null>(null);
  const proId = state.proId ?? picked;
  const modal = <NewAppointmentModal date={state.date} client={state.client} start={state.start} freeMinutes={state.freeMinutes} serviceId={state.serviceId} onClose={onClose} />;
  if (proId) return <ActingScope proId={proId}>{modal}</ActingScope>;
  return isAll ? <PickProModal onPick={setPicked} onClose={onClose} /> : modal;
}

/** Renders the open appointment modal, if any (moving or cancelling acts on the appointment's own professional). */
export function AppointmentModals({ state, onClose }: { state: AppointmentModalState; onClose: () => void }) {
  if (!state) return null;
  if (state.kind === 'new') return <NewAppointmentFlow state={state} onClose={onClose} />;
  return (
    <ActingScope proId={state.appointment.proId}>
      {state.kind === 'move' ? <MoveAppointmentModal appointment={state.appointment} onClose={onClose} /> : <CancelAppointmentModal appointment={state.appointment} onClose={onClose} />}
    </ActingScope>
  );
}

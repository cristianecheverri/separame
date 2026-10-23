import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { formatCop } from '@shared/format';
import { TEAM_MAX_PROFESSIONALS, teamRequestSchema } from '@shared/schemas';
import { cx } from '../../components/ui/cx';
import { Field } from '../../components/ui/Field';
import { CheckIcon, ChevronLeftIcon, InfoIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { errorMessage } from '../../lib/api';
import { focusFirstError } from '../../lib/focusError';
import { plural } from '../../lib/format';
import { usePro } from '../../lib/pro';
import { useBilling } from '../../lib/queries';
import { useSendTeamRequest } from './mutations';
import { Stepper } from './Stepper';

const MIN_PROFESSIONALS = 2;

/** «Tú y 2 profesionales más». */
const othersText = (count: number) => `Tú y ${plural(count - 1, 'profesional más', 'profesionales más')}`;

function SentView({ email, name, professionals, again }: { email: string; name: string; professionals: number; again: boolean }) {
  return (
    <div className="max-w-[560px] w-full self-center flex flex-col items-center gap-4 text-center pt-6 sm:pt-10">
      <span className="w-[72px] h-[72px] rounded-full bg-primary-soft text-primary flex items-center justify-center">
        <CheckIcon size={36} strokeWidth={2.4} />
      </span>
      <div role="status">
        <h1 className="m-0 font-display font-extrabold text-[28px] leading-[1.15] tracking-[-0.8px]">{again ? 'Tu solicitud está en revisión' : 'Recibimos tu solicitud'}</h1>
      </div>
      <p className="m-0 text-[15px] text-ink-2 leading-[1.5]">
        Te escribimos a <strong className="font-bold text-ink [overflow-wrap:anywhere]">{email}</strong> cuando la revisemos. Mientras tanto, tu agenda sigue igual.
      </p>
      <div className="self-stretch bg-white rounded-[20px] py-[14px] px-4 flex flex-col gap-[2px] text-left">
        <span className="font-bold text-[15px] [overflow-wrap:anywhere]">{name}</span>
        <span className="text-[14px] text-muted">{plural(professionals, 'profesional', 'profesionales')}, contándote</span>
      </div>
      <Link to="/" className="self-stretch h-[52px] mt-2 rounded-full bg-primary text-white hover:text-white hover:bg-primary-dark flex items-center justify-center font-bold text-[16px] no-underline">
        Volver a mi agenda
      </Link>
    </div>
  );
}

/** Team plan request (board team-request-form-phone); with a team, it asks for more seats. */
export function TeamRequestPage() {
  const { me } = usePro();
  const team = me.team;
  const previous = me.teamRequest;
  const billing = useBilling();
  const send = useSendTeamRequest();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const min = Math.max(MIN_PROFESSIONALS, (team?.members.length ?? 1) + (team ? 1 : 0));
  const [name, setName] = useState(team?.name ?? (previous?.status === 'rejected' ? previous.name : ''));
  const [count, setCount] = useState(() => Math.min(TEAM_MAX_PROFESSIONALS, Math.max(min, previous?.status === 'rejected' ? previous.professionals : 3)));
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<{ name: string; professionals: number } | null>(null);

  if (sent || previous?.status === 'pending') {
    const shown = sent ?? { name: previous!.name, professionals: previous!.professionals };
    return <SentView email={me.email} name={shown.name} professionals={shown.professionals} again={!sent} />;
  }

  const extra = billing.data?.price.extraProfessionalCop;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = teamRequestSchema.safeParse({ name, professionals: count, message });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      focusFirstError(formRef.current);
      return;
    }
    setErrors({});
    send.mutate(parsed.data, {
      onSuccess: () => setSent({ name: parsed.data.name, professionals: parsed.data.professionals }),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <div className="max-w-[560px] w-full flex flex-col gap-5">
      <Link to={team ? '/team' : '/'} className="self-start flex gap-[6px] items-center min-h-11 -mb-2 font-bold text-[14px] no-underline">
        <ChevronLeftIcon size={16} />
        {team ? 'Equipo' : 'Agenda'}
      </Link>
      <div className="flex flex-col gap-[6px]">
        <h1 className="m-0 font-display font-extrabold text-[28px] leading-[1.15] tracking-[-0.8px] sm:text-[34px]">{team ? 'Más cupos para tu equipo' : 'Plan para equipos'}</h1>
        <div className="text-[15px] text-ink-2 leading-[1.45]">
          {team ? 'Cuéntanos cuántos profesionales son ahora y te habilitamos los cupos.' : 'Cuéntanos de tu consultorio y te habilitamos los cupos.'}
        </div>
      </div>

      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <section aria-label="Solicitud" className={cx(ui.card, 'gap-[18px]')}>
          <Field label="Nombre del consultorio o estudio" error={errors.name}>
            {(p) => <input {...p} type="text" className={ui.input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="organization" placeholder="Nombre del consultorio" />}
          </Field>
          <div className="flex flex-col gap-2">
            <div id="team-count-label" className={ui.label}>
              ¿Cuántos profesionales son, contándote?
            </div>
            <Stepper
              value={count}
              min={min}
              max={TEAM_MAX_PROFESSIONALS}
              onChange={setCount}
              labelledBy="team-count-label"
              describedBy="team-count-help"
              decreaseLabel="Quitar un profesional"
              increaseLabel="Agregar un profesional"
            />
            <div id="team-count-help" className="text-[13px] text-muted">
              {othersText(count)}
            </div>
            {errors.professionals && <div className="text-[13px] font-semibold text-warn-ink" role="alert">{errors.professionals}</div>}
          </div>
          <Field label="Mensaje (opcional)" error={errors.message}>
            {(p) => <textarea {...p} rows={3} maxLength={500} className={ui.textarea} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Cuéntanos cómo trabajan" />}
          </Field>
        </section>

        <div className="bg-accent-soft rounded-[20px] py-[14px] px-4 flex gap-3 items-start text-[14px] leading-[1.5]">
          <InfoIcon size={20} className="shrink-0 mt-[1px]" />
          <span>
            <strong className="font-bold">Precio:</strong> tu plan + {extra ? <strong className="font-bold">{formatCop(extra)}</strong> : 'un valor'} al mes por cada profesional adicional. Un solo pago y un solo vencimiento para todo el equipo.
          </span>
        </div>

        <button type="submit" disabled={send.isPending} className="w-full h-[52px] rounded-full bg-primary text-white font-bold text-[16px] hover:bg-primary-dark disabled:bg-disabled disabled:text-muted">
          {send.isPending ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  );
}

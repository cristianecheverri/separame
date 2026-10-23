import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import type { TeamMemberView, TeamView } from '@shared/api';
import { initials } from '@shared/format';
import { teamMemberSchema, updateTeamSchema } from '@shared/schemas';
import type { Service, AvailabilitySettings } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { Field } from '../../components/ui/Field';
import { CopyIcon, ExternalIcon, InfoIcon, LockIcon, PlusIcon, UsersIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { focusFirstError } from '../../lib/focusError';
import { firstName, linkLabel, plural } from '../../lib/format';
import { usePro } from '../../lib/pro';
import { useTeamMemberSettings } from '../../lib/queries';
import { copyLink } from '../../lib/share';
import { SlugField, slugReady, useSlugCheck } from '../profile/SlugField';
import { memberColor } from './memberColors';
import { useSaveMember, useUpdateTeam } from './mutations';
import { CopyTeamLinkButton } from './TeamCards';
import { scheduleSummary, seatsText } from './teamText';

type Editing = string | 'new' | null;

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

/** «3 servicios · Lun a vie, 8:00 a. m. – 5:00 p. m.». */
function memberSummary(data: { services?: Service[]; settings?: AvailabilitySettings } | undefined): string | null {
  if (!data?.services || !data.settings) return null;
  const services = data.services.length ? plural(data.services.length, 'servicio', 'servicios') : 'Sin servicios';
  return `${services} · ${scheduleSummary(data.settings.schedule)}`;
}

interface MemberCardProps {
  member: TeamMemberView;
  index: number;
  selected: boolean;
  summary: string | null;
  onPick: () => void;
}

function MemberCard({ member, index, selected, summary, onPick }: MemberCardProps) {
  const toast = useToast();
  const color = memberColor(index);
  const details = (
    <>
      <span aria-hidden="true" className="w-[52px] h-[52px] rounded-full flex items-center justify-center shrink-0 font-display font-extrabold text-[18px]" style={{ background: color.bg, color: color.fg }}>
        {initials(member.name)}
      </span>
      <span className="flex flex-col gap-[3px] min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-[6px]">
          <span className="font-bold text-[16px] [overflow-wrap:anywhere]">{member.name}</span>
          {member.isOwner && <span className="text-[12px] font-bold py-[3px] px-[10px] rounded-full bg-primary-soft text-primary whitespace-nowrap">Tú · cuenta principal</span>}
        </span>
        <span className="text-[14px] text-ink-2 [overflow-wrap:anywhere]">
          {member.title} · {linkLabel(member.publicUrl)}
        </span>
        <span className="text-[13px] text-muted min-h-[18px]">{summary ?? <span className="skeleton inline-block h-4 w-48 align-middle" />}</span>
      </span>
    </>
  );
  return (
    <div className={cx('flex flex-wrap items-center gap-x-4 gap-y-3 p-4 rounded-[20px] bg-white border-2', selected ? 'border-primary' : 'border-white')}>
      {member.isOwner ? (
        <div className="flex items-center gap-4 min-w-0 min-h-11">{details}</div>
      ) : (
        <button type="button" onClick={onPick} aria-pressed={selected} aria-label={`Elegir a ${member.name}`} className="flex items-center gap-4 min-w-0 min-h-11 text-left text-inherit">
          {details}
        </button>
      )}
      <div className="flex flex-wrap gap-2 ml-auto">
        {member.isOwner ? (
          <Link to="/profile" aria-label="Editar tu perfil público" className={cx(ui.btnOutline, 'h-11 px-4 no-underline text-ink hover:text-ink')}>
            Editar
          </Link>
        ) : (
          <button type="button" onClick={onPick} aria-label={`Editar a ${member.name}`} className={cx(ui.btnOutline, 'h-11 px-4')}>
            Editar
          </button>
        )}
        <button
          type="button"
          aria-label={`Copiar el enlace de ${member.name}`}
          className={cx(ui.btnOutline, 'h-11 px-4')}
          onClick={async () => ((await copyLink(member.publicUrl, 'booking_link')) ? toast.success('Enlace copiado.') : toast.error('No pudimos copiar el enlace.'))}
        >
          <CopyIcon size={16} /> Copiar enlace
        </button>
      </div>
    </div>
  );
}

interface MemberFormProps {
  member: TeamMemberView | null;
  host: string;
  readOnly: boolean;
  /** Receives the saved professional's id (a new one stays selected). */
  onSaved: (proId: string | null) => void;
}

/** «Editar profesional» / «Agregar profesional»: name, title and own link (with the live slug check). */
function MemberForm({ member, host, readOnly, onSaved }: MemberFormProps) {
  const toast = useToast();
  const save = useSaveMember();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(member?.name ?? '');
  const [title, setTitle] = useState(member?.title ?? '');
  const [slug, setSlug] = useState(member?.slug ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { profile } = usePro();
  const check = useSlugCheck(slug, member?.slug ?? null, profile?.slug ?? null);
  const isNew = !member;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = teamMemberSchema.safeParse({ name, title, slug });
    const next = parsed.success ? {} : fieldErrors(parsed.error.issues);
    if (parsed.success && !slugReady(check.status)) next.slug = check.message ?? 'Espera a que revisemos el enlace.';
    if (!parsed.success || Object.keys(next).length) {
      setErrors(next);
      focusFirstError(formRef.current);
      return;
    }
    setErrors({});
    save.mutate(
      { proId: member?.proId ?? null, body: parsed.data },
      {
        onSuccess: (res) => {
          toast.success(isNew ? `Listo, agregaste a ${firstName(parsed.data.name)}. Agrega sus servicios en «Servicios».` : 'Cambios guardados. Su página se actualiza en unos segundos.');
          onSaved(res.team?.members.find((m) => m.slug === parsed.data.slug)?.proId ?? null);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.fields) setErrors(error.fields);
          toast.error(errorMessage(error));
        },
      },
    );
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate aria-labelledby="member-form-title" className={cx(ui.card, 'gap-4 sm:p-6')}>
      <h2 id="member-form-title" className={ui.h2}>
        {isNew ? 'Agregar profesional' : 'Editar profesional'}
      </h2>
      <Field label="Nombre" error={errors.name}>
        {(p) => <input {...p} className={ui.input} value={name} maxLength={80} disabled={readOnly} onChange={(e) => setName(e.target.value)} placeholder="Nombre del profesional" />}
      </Field>
      <Field label="Profesión" error={errors.title}>
        {(p) => <input {...p} className={ui.input} value={title} maxLength={60} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} placeholder="Profesión o especialidad" />}
      </Field>
      <SlugField label="Enlace propio" currentText="Es su enlace actual." value={slug} onChange={setSlug} check={check} host={host} disabled={readOnly} />
      {errors.slug && check.status !== 'taken' && check.status !== 'invalid' && <div className="text-[13px] font-semibold text-warn-ink -mt-3">{errors.slug}</div>}
      <div className="bg-surface rounded-[16px] py-3 px-[14px] text-[13px] text-ink-2 leading-[1.5]">
        {isNew
          ? 'Empieza con tu dirección y tu horario. Sus servicios los agregas en Servicios eligiéndolo en el selector.'
          : `Sus servicios y su horario se editan en Servicios y Disponibilidad eligiendo a ${firstName(member.name)} en el selector.`}
      </div>
      <button type="submit" disabled={readOnly || save.isPending} className={cx(ui.btnPrimary, 'h-12 text-[15px]', readOnly && ui.btnLocked)}>
        {readOnly && <LockIcon size={16} />}
        {save.isPending ? 'Guardando…' : isNew ? 'Agregar profesional' : 'Guardar cambios'}
      </button>
    </form>
  );
}

/** «Página del consultorio»: link, copy, view, and renaming the team or its link (PUT /me/team). */
function TeamPageCard({ team, host, readOnly }: { team: TeamView; host: string; readOnly: boolean }) {
  const toast = useToast();
  const update = useUpdateTeam();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [slug, setSlug] = useState(team.slug);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { profile } = usePro();
  const check = useSlugCheck(slug, team.slug, profile?.slug ?? null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = updateTeamSchema.safeParse({ name, slug });
    const next = parsed.success ? {} : fieldErrors(parsed.error.issues);
    if (parsed.success && !slugReady(check.status)) next.slug = check.message ?? 'Espera a que revisemos el enlace.';
    if (!parsed.success || Object.keys(next).length) return setErrors(next);
    setErrors({});
    update.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('Listo. La página del consultorio se actualiza en unos segundos.');
        setEditing(false);
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <section aria-labelledby="clinic-title" className={cx(ui.card, 'gap-[14px]')}>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-bold text-muted">Página del consultorio</span>
        <h2 id="clinic-title" className={cx(ui.h2, '[overflow-wrap:anywhere]')}>
          {team.name}
        </h2>
      </div>
      <div className="bg-surface rounded-[14px] py-3 px-[14px] font-bold text-[15px] [overflow-wrap:anywhere]">{linkLabel(team.publicUrl)}</div>
      <span className="text-[14px] text-ink-2 leading-[1.45]">Tus clientes eligen con quién y ven las horas libres de todos.</span>
      <div className="flex flex-wrap gap-2">
        <CopyTeamLinkButton url={team.publicUrl} />
        <a href={team.publicUrl} target="_blank" rel="noreferrer" className={cx(ui.btnPrimary, 'h-11 px-[18px] no-underline text-white hover:text-white')}>
          <ExternalIcon size={16} /> Ver página
        </a>
      </div>
      {editing ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 border-t border-line pt-4">
          <Field label="Nombre del consultorio" error={errors.name}>
            {(p) => <input {...p} className={ui.input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Nombre del consultorio" />}
          </Field>
          <SlugField label="Enlace del consultorio" currentText="Es su enlace actual." value={slug} onChange={setSlug} check={check} host={host} />
          {errors.slug && check.status !== 'taken' && check.status !== 'invalid' && <div className="text-[13px] font-semibold text-warn-ink -mt-3">{errors.slug}</div>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={update.isPending} className={cx(ui.btnPrimary, 'h-11')}>
              {update.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className={cx(ui.btnOutline, 'h-11')} onClick={() => { setEditing(false); setName(team.name); setSlug(team.slug); setErrors({}); }}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        !readOnly && (
          <button type="button" className={cx(ui.linkBtn, 'self-start min-h-11 text-[14px] underline underline-offset-2')} onClick={() => setEditing(true)}>
            Cambiar nombre o enlace
          </button>
        )
      )}
    </section>
  );
}

/** «Agregar profesional» (dashed card): enabled while seats are left, else «Solicitar más cupos». */
function AddMemberCard({ team, pending, readOnly, onAdd }: { team: TeamView; pending: boolean; readOnly: boolean; onAdd: () => void }) {
  const free = team.seats - (team.members.length - 1);
  const full = free <= 0;
  const disabled = full || readOnly;
  return (
    <div className="bg-white rounded-[20px] border-2 border-dashed border-line-strong p-4 flex flex-wrap items-center gap-x-4 gap-y-3">
      <button type="button" disabled={disabled} aria-describedby="seats-note" onClick={onAdd} className={cx(ui.btnPrimary, disabled && ui.btnLocked)}>
        {readOnly ? <LockIcon size={16} /> : <PlusIcon />}
        Agregar profesional
      </button>
      <span id="seats-note" className="text-[14px] text-ink-2 leading-[1.45] flex-[1_1_240px]">
        {readOnly ? (
          'Renueva tu plan para agregar o editar profesionales.'
        ) : full ? (
          pending ? (
            'Usaste todos tus cupos. Tu solicitud de más cupos está en revisión.'
          ) : (
            <>
              Usaste todos tus cupos. ¿Necesitas más?{' '}
              <Link to="/team/request" className="font-bold underline-offset-2">
                Solicitar más cupos
              </Link>
            </>
          )
        ) : (
          `Te ${free === 1 ? 'queda 1 cupo' : `quedan ${free} cupos`} para agregar profesionales.`
        )}
      </span>
    </div>
  );
}

/** Team plan, «Equipo» (board team-members-desktop): the owner manages every member's agenda. */
export function TeamPage() {
  const { me, readOnly, publicUrl } = usePro();
  const team = me.team;
  const settings = useTeamMemberSettings(team?.members ?? []);
  const others = team?.members.filter((m) => !m.isOwner) ?? [];
  const [editing, setEditing] = useState<Editing>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const host = linkLabel(publicUrl).split('/')[0] || 'separame.app';

  if (!team) return <Navigate to="/" replace />;
  const seatsLeft = team.seats - others.length > 0;
  const current: Editing = editing ?? others[0]?.proId ?? (seatsLeft && !readOnly ? 'new' : null);
  const member = current && current !== 'new' ? (others.find((m) => m.proId === current) ?? null) : null;
  const showForm = current === 'new' || !!member;

  const pick = (next: Editing) => {
    setEditing(next);
    // Phones and tablets: the form sits below the list, bring it into view.
    if (window.matchMedia?.('(max-width: 1023px)').matches) requestAnimationFrame(() => formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div className="flex flex-col gap-1">
          <h1 className={ui.h1}>Equipo</h1>
          <div className="text-[15px] text-muted">Las agendas que manejas desde tu cuenta.</div>
        </div>
        <span className="inline-flex items-center gap-[6px] h-9 px-[14px] rounded-full bg-primary-soft text-primary font-bold text-[14px]">
          <UsersIcon size={16} /> {seatsText(team)}
        </span>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <section aria-label="Profesionales del equipo" className="flex-[999_1_420px] min-w-0 flex flex-col gap-3">
          {team.members.map((m, i) => (
            <MemberCard key={m.proId} member={m} index={i} selected={!m.isOwner && current === m.proId} summary={memberSummary(settings.get(m.proId))} onPick={() => pick(m.proId)} />
          ))}
          <AddMemberCard team={team} pending={me.teamRequest?.status === 'pending'} readOnly={readOnly} onAdd={() => pick('new')} />
          <div className="bg-accent-soft rounded-[20px] py-[14px] px-4 flex gap-3 items-start text-[14px] leading-[1.5]">
            <InfoIcon size={20} className="shrink-0 mt-[1px]" />
            <span>Los profesionales del equipo no tienen usuario: tú administras sus agendas. Si tu plan vence, nadie del equipo recibe reservas nuevas.</span>
          </div>
        </section>

        <div ref={formRef} className="flex-[1_1_340px] min-w-0 flex flex-col gap-5 scroll-mt-20">
          <TeamPageCard team={team} host={host} readOnly={readOnly} />
          {showForm && <MemberForm key={current ?? ''} member={member} host={host} readOnly={readOnly} onSaved={(proId) => setEditing(proId)} />}
        </div>
      </div>
    </div>
  );
}

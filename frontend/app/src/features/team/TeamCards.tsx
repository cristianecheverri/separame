import { Link } from 'react-router';
import type { TeamView } from '@shared/api';
import { formatDateNoYear } from '@shared/format';
import { addDays, bogotaDate, todayBogota } from '@shared/time';
import type { TeamRequest } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { ClockIcon, CopyIcon, InfoIcon, UsersIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { now } from '../../lib/clock';
import { linkLabel, plural } from '../../lib/format';
import { copyLink } from '../../lib/share';
import { teamSummary } from './teamText';

const tile = 'w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0';
const linkClass = 'self-start min-h-11 inline-flex items-center font-bold text-[14px] underline underline-offset-2';

/** «enviada hoy» / «enviada ayer» / «enviada el 18 oct.». */
function sentText(createdAt: string): string {
  const day = bogotaDate(createdAt);
  const today = todayBogota(now());
  if (day === today) return 'enviada hoy';
  if (day === addDays(today, -1)) return 'enviada ayer';
  return `enviada el ${formatDateNoYear(day)}`;
}

/**
 * Agenda side card «¿Trabajas con más profesionales?» (board team-request-card-desktop):
 * none → ask; pending → in review; rejected → the reason and «Enviar otra solicitud».
 * Nothing once the team exists.
 */
export function TeamRequestCard({ team, request }: { team: TeamView | null; request: TeamRequest | null }) {
  if (team || request?.status === 'approved') return null;
  if (request?.status === 'pending') {
    return (
      <section aria-labelledby="team-title" className="bg-accent-soft rounded-[24px] p-[18px] sm:p-[22px] flex flex-col gap-[14px]">
        <div role="status" className="flex gap-3 items-start">
          <span className={cx(tile, 'bg-white text-ink')}>
            <ClockIcon size={20} />
          </span>
          <div className="flex flex-col gap-1 min-w-0">
            <h2 id="team-title" className={ui.h2sm}>
              Solicitud en revisión
            </h2>
            <span className="text-[14px] text-ink-2 leading-[1.4]">Te avisamos por correo cuando la revisemos.</span>
            <span className="text-[13px] text-ink-2 font-semibold pt-[2px] [overflow-wrap:anywhere]">
              {request.name} · {plural(request.professionals, 'profesional', 'profesionales')} · {sentText(request.createdAt)}
            </span>
          </div>
        </div>
      </section>
    );
  }
  if (request?.status === 'rejected') {
    return (
      <section aria-labelledby="team-title" className={cx(ui.card, 'gap-[14px]')}>
        <div className="flex gap-3 items-start">
          <span className={cx(tile, 'bg-surface text-ink-2')}>
            <InfoIcon size={20} />
          </span>
          <div className="flex flex-col gap-1 min-w-0">
            <h2 id="team-title" className={ui.h2sm}>
              No pudimos aprobar tu solicitud
            </h2>
            <span className="text-[14px] text-ink-2 leading-[1.4]">Este es el motivo que nos dejó el equipo de Sepárame:</span>
          </div>
        </div>
        {request.rejectReason && (
          <blockquote className="m-0 bg-surface border-l-4 border-line-strong rounded-[4px_14px_14px_4px] py-3 px-[14px] text-[14px] text-ink-2 leading-[1.45]">«{request.rejectReason}»</blockquote>
        )}
        <Link to="/team/request" className={linkClass}>
          Enviar otra solicitud
        </Link>
      </section>
    );
  }
  return (
    <section aria-labelledby="team-title" className={cx(ui.card, 'gap-[14px]')}>
      <div className="flex gap-3 items-start">
        <span className={cx(tile, 'bg-primary-soft text-primary')}>
          <UsersIcon size={20} />
        </span>
        <div className="flex flex-col gap-1 min-w-0">
          <h2 id="team-title" className={ui.h2sm}>
            ¿Trabajas con más profesionales?
          </h2>
          <span className="text-[14px] text-ink-2 leading-[1.4]">Maneja la agenda de todo tu consultorio desde tu cuenta: cada profesional con su enlace y una página para el consultorio.</span>
        </div>
      </div>
      <Link to="/team/request" className={cx(ui.btnOutline, 'self-start h-11 no-underline text-ink hover:text-ink')}>
        Solicitar plan para equipos
      </Link>
    </section>
  );
}

/** «Copiar enlace» of the team page, with the toast the rest of the panel uses. */
export function CopyTeamLinkButton({ url, label = 'Copiar el enlace del consultorio' }: { url: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(ui.btnOutline, 'h-11')}
      onClick={async () => ((await copyLink(url, 'booking_link')) ? toast.success('Enlace copiado.') : toast.error('No pudimos copiar el enlace.'))}
    >
      <CopyIcon size={16} /> Copiar enlace
    </button>
  );
}

/** Agenda side card of an approved team: its page link and the seats (boards team-owner-agenda). */
export function TeamCard({ team }: { team: TeamView }) {
  return (
    <section aria-labelledby="clinic-title" className={cx(ui.card, 'gap-[14px]')}>
      <div className="flex gap-3 items-start">
        <span className={cx(tile, 'bg-primary-soft text-primary')}>
          <UsersIcon size={20} />
        </span>
        <div className="flex flex-col gap-1 min-w-0">
          <h2 id="clinic-title" className={cx(ui.h2sm, '[overflow-wrap:anywhere]')}>
            {team.name}
          </h2>
          <span className="sm:hidden text-[13px] font-semibold text-ink-2">{teamSummary(team)}</span>
          <span className="hidden sm:block text-[14px] text-ink-2 leading-[1.4]">Tus clientes eligen con quién y ven las horas libres de todos.</span>
        </div>
      </div>
      <div className="bg-surface rounded-[14px] py-3 px-[14px] font-bold text-[15px] [overflow-wrap:anywhere]">{linkLabel(team.publicUrl)}</div>
      <div className="flex flex-wrap gap-2 items-center">
        <CopyTeamLinkButton url={team.publicUrl} />
        <Link to="/team" className="min-h-11 inline-flex items-center px-1 font-bold text-[14px] underline-offset-2">
          Ver equipo
        </Link>
      </div>
      <div className="hidden sm:block border-t border-line pt-[10px] text-[13px] font-semibold text-ink-2">{teamSummary(team)}</div>
    </section>
  );
}

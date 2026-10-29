import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, FEEDBACK_KINDS, type FeedbackEntry, type FeedbackStatus } from '@shared/api';
import { formatDateShort, formatInstantTime } from '@shared/format';
import { bogotaDate } from '@shared/time';
import { Chip } from '../../components/ui/Chip';
import { cx } from '../../components/ui/cx';
import { EmptyState } from '../../components/ui/EmptyState';
import { CheckIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { keys, useAdminFeedback } from '../../lib/queries';

const KIND_STYLE: Record<FeedbackEntry['kind'], string> = {
  idea: 'bg-primary-soft text-primary',
  question: 'bg-accent-soft text-accent-ink',
  problem: 'bg-warn-soft text-warn-ink',
};
const kindLabel = (kind: FeedbackEntry['kind']) => FEEDBACK_KINDS.find((k) => k.kind === kind)?.label ?? kind;

/** «Responder» opens the mail app addressed to the professional, the message quoted. */
function replyHref(e: FeedbackEntry): string {
  const subject = `Re: ${kindLabel(e.kind)} · Sepárame`;
  const body = `\n\n—\nEl ${formatDateShort(bogotaDate(e.createdAt))} escribiste:\n${e.message}`;
  return `mailto:${encodeURIComponent(e.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function FeedbackCard({ entry }: { entry: FeedbackEntry }) {
  const qc = useQueryClient();
  const toast = useToast();
  const update = useMutation({
    mutationFn: (status: FeedbackStatus) => api.post(apiPaths.adminFeedbackStatus(), { proId: entry.proId, createdAt: entry.createdAt, status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.adminFeedback }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const answered = entry.status === 'answered';
  return (
    <article aria-label={`Mensaje de ${entry.name}`} className={cx(ui.card, 'gap-3', answered && 'opacity-80')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx(ui.badge, KIND_STYLE[entry.kind])}>{kindLabel(entry.kind)}</span>
        {answered ? (
          <span className={cx(ui.badge, 'bg-surface text-ink-2 inline-flex items-center gap-1')}>
            <CheckIcon size={12} strokeWidth={2.6} /> Respondido
          </span>
        ) : (
          <span className={cx(ui.badge, 'bg-accent text-ink')}>Nuevo</span>
        )}
        <span className="text-[13px] text-muted ml-auto">
          {formatDateShort(bogotaDate(entry.createdAt))} · {formatInstantTime(entry.createdAt)}
        </span>
      </div>
      <p className="m-0 text-[15px] leading-[1.5] whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.message}</p>
      <div className="text-[13px] text-ink-2 [overflow-wrap:anywhere]">
        <strong className="text-ink">{entry.name}</strong> · {entry.email}
        {entry.slug && <> · separame.app/{entry.slug}</>}
        {entry.page && <> · estaba en {entry.page}</>}
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={replyHref(entry)} className={cx(ui.btnPrimary, 'h-11 no-underline text-white hover:text-white')}>
          Responder
        </a>
        <button
          type="button"
          disabled={update.isPending}
          onClick={() => update.mutate(answered ? 'new' : 'answered')}
          className={cx(ui.btnOutline, 'h-11')}
        >
          {answered ? 'Marcar como nuevo' : 'Marcar como respondido'}
        </button>
      </div>
    </article>
  );
}

/** Admin · «Mensajes»: what professionals send from «Ayúdanos a mejorar», newest first. */
export function AdminFeedbackPage() {
  const query = useAdminFeedback();
  const [onlyNew, setOnlyNew] = useState(true);
  const entries = (query.data?.entries ?? []).filter((e) => !onlyNew || e.status === 'new');
  return (
    <div className="flex flex-col gap-6 max-w-[820px]">
      <div className="flex flex-col gap-1">
        <h1 className={ui.h1}>Mensajes</h1>
        <div className="text-[15px] text-muted">Ideas, dudas y problemas que llegan desde «Ayúdanos a mejorar». También te llegan al correo.</div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro">
        <Chip selected={onlyNew} onClick={() => setOnlyNew(true)}>
          Nuevos{query.data ? ` (${query.data.newCount})` : ''}
        </Chip>
        <Chip selected={!onlyNew} onClick={() => setOnlyNew(false)}>
          Todos
        </Chip>
      </div>
      {query.isError ? (
        <div className={cx(ui.card, 'text-[15px] text-ink-2')}>{errorMessage(query.error)}</div>
      ) : !query.data ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[150px] rounded-[24px]" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-[24px] p-4">
          <EmptyState title={onlyNew ? 'Estás al día' : 'Aún no hay mensajes'}>
            {onlyNew ? 'No hay mensajes nuevos por responder.' : 'Cuando un profesional escriba desde «Ayúdanos a mejorar», aparece aquí.'}
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((e) => (
            <FeedbackCard key={`${e.proId}-${e.createdAt}`} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

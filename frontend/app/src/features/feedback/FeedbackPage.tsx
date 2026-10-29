import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiPaths, FEEDBACK_KINDS, type FeedbackKind, type FeedbackRequest } from '@shared/api';
import { FEEDBACK_MESSAGE_MAX, feedbackSchema } from '@shared/schemas';
import { Chip } from '../../components/ui/Chip';
import { cx } from '../../components/ui/cx';
import { Field } from '../../components/ui/Field';
import { CheckIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { api, errorMessage } from '../../lib/api';
import { usePro } from '../../lib/pro';

const PLACEHOLDERS: Record<FeedbackKind, string> = {
  idea: 'Qué te gustaría que Sepárame hiciera por ti',
  question: 'Qué quieres saber',
  problem: 'Qué pasó y dónde (paso, pantalla o botón)',
};

/**
 * «Ayúdanos a mejorar»: an idea, a question or a problem, straight to the team's
 * inbox (they answer by replying, to the professional's login email). Also on an
 * expired plan: the panel is read-only, but asking must still work.
 */
export function FeedbackPage() {
  const { me } = usePro();
  const [kind, setKind] = useState<FeedbackKind>('idea');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = useMutation({
    mutationFn: (body: FeedbackRequest) => api.post(apiPaths.feedback(), body, { actingProId: null }),
    onSuccess: () => {
      setSent(true);
      setMessage('');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = feedbackSchema.safeParse({ kind, message });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revisa el mensaje.');
    setError(null);
    send.mutate(parsed.data);
  };

  return (
    <div className="flex flex-col gap-6 max-w-[640px]">
      <div className="flex flex-col gap-1">
        <h1 className={ui.h1}>Ayúdanos a mejorar</h1>
        <div className="text-[15px] text-muted leading-[1.45]">
          Una idea, una duda o algo que no funciona: lo leemos todo y te respondemos a <strong className="text-ink [overflow-wrap:anywhere]">{me.email}</strong>.
        </div>
      </div>

      {sent ? (
        <section className={cx(ui.card, 'gap-3 items-start')} role="status">
          <span className="w-11 h-11 rounded-full bg-primary-soft text-primary flex items-center justify-center">
            <CheckIcon size={22} strokeWidth={2.6} />
          </span>
          <h2 className={ui.h2}>¡Gracias! Ya nos llegó.</h2>
          <p className="m-0 text-[15px] text-ink-2 leading-[1.45]">Si necesita respuesta, te escribimos a tu correo. Así vamos haciendo Sepárame a tu medida.</p>
          <button type="button" className={cx(ui.btnOutline, 'h-11')} onClick={() => setSent(false)}>
            Enviar otro mensaje
          </button>
        </section>
      ) : (
        <form onSubmit={submit} noValidate className={cx(ui.card, 'gap-5')}>
          <div className="flex flex-col gap-2">
            <div id="feedback-kind" className={ui.label}>¿Qué nos quieres contar?</div>
            <div role="group" aria-labelledby="feedback-kind" className="flex flex-wrap gap-2">
              {FEEDBACK_KINDS.map((k) => (
                <Chip key={k.kind} selected={kind === k.kind} onClick={() => setKind(k.kind)}>
                  {k.label}
                </Chip>
              ))}
            </div>
          </div>
          <Field label="Tu mensaje" help={`${message.trim().length} / ${FEEDBACK_MESSAGE_MAX}`} error={error ?? undefined}>
            {(p) => (
              <textarea
                {...p}
                rows={6}
                maxLength={FEEDBACK_MESSAGE_MAX}
                className={ui.textarea}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={PLACEHOLDERS[kind]}
              />
            )}
          </Field>
          <div>
            <button type="submit" disabled={send.isPending} className={cx(ui.btnPrimary, 'h-12 px-6 text-[15px]')}>
              {send.isPending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

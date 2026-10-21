import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type CalendarSyncResponse, type UpdateCalendarSyncRequest } from '@shared/api';
import { cx } from '../../components/ui/cx';
import { AlertIcon, CopyIcon } from '../../components/ui/icons';
import { Modal } from '../../components/ui/Modal';
import { SectionSkeleton } from '../../components/ui/Skeleton';
import { ui } from '../../components/ui/styles';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import { keys, useCalendarSync } from '../../lib/queries';
import { AppleCalendarLogo, GoogleCalendarLogo, OutlookLogo } from './CalendarLogos';
import { PushCard } from './PushCard';

const badge = 'text-[12px] font-bold py-[5px] px-[10px] rounded-full whitespace-nowrap';

function CardHeader({ title, tag, tagClass }: { title: string; tag: string; tagClass: string }) {
  return (
    <div className="flex flex-wrap justify-between items-center gap-3">
      <h2 className={ui.h2}>{title}</h2>
      <span className={cx(badge, tagClass)}>{tag}</span>
    </div>
  );
}

function InvitesCard({ sync }: { sync: CalendarSyncResponse }) {
  const qc = useQueryClient();
  const toast = useToast();
  const update = useMutation({
    mutationFn: (body: UpdateCalendarSyncRequest) => api.put<CalendarSyncResponse>(apiPaths.calendarSync(), body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: keys.calendarSync });
      const previous = qc.getQueryData<CalendarSyncResponse>(keys.calendarSync);
      if (previous) qc.setQueryData<CalendarSyncResponse>(keys.calendarSync, { ...previous, invitesEnabled: body.invitesEnabled });
      return { previous };
    },
    onSuccess: (res) => {
      qc.setQueryData(keys.calendarSync, res);
      toast.success(res.invitesEnabled ? 'Listo: te llegarán las invitaciones.' : 'Ya no te enviaremos invitaciones.');
    },
    onError: (error, _b, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.calendarSync, ctx.previous);
      toast.error(errorMessage(error));
    },
  });
  return (
    <section className={cx(ui.card, 'gap-4')}>
      <CardHeader title="Invitaciones por correo" tag="Al instante" tagClass="bg-accent text-ink" />
      <div className="flex gap-4 items-start justify-between">
        <p className="m-0 text-[14px] text-ink-2 leading-[1.45]">Cada cita nueva, movida o cancelada te llega como invitación y se agrega sola a tu calendario principal.</p>
        <Switch on={sync.invitesEnabled} label="Recibir invitaciones por correo" onToggle={() => update.mutate({ invitesEnabled: !sync.invitesEnabled })} />
      </div>
      <div className="text-[13px] text-muted leading-[1.45]">La primera vez, Gmail puede pedirte que confirmes la invitación.</div>
    </section>
  );
}

function FeedCard({ sync }: { sync: CalendarSyncResponse }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const rotate = useMutation({
    mutationFn: () => api.post<CalendarSyncResponse>(apiPaths.calendarSyncRotate()),
    onSuccess: (res) => {
      qc.setQueryData(keys.calendarSync, res);
      setConfirming(false);
      toast.success('Listo, tu enlace cambió. Vuelve a agregarlo en tu calendario.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const apps = [
    { label: 'Google Calendar', href: sync.googleUrl, Logo: GoogleCalendarLogo },
    { label: 'Outlook', href: sync.outlookUrl, Logo: OutlookLogo },
    { label: 'Apple / iPhone', href: sync.webcalUrl, Logo: AppleCalendarLogo },
  ];
  return (
    <section className={cx(ui.card, 'flex-[1_1_340px] min-w-0 gap-4')}>
      <CardHeader title="Calendario suscrito" tag="Todas tus citas" tagClass="bg-primary-soft text-primary" />
      <p className="m-0 text-[14px] text-ink-2 leading-[1.45]">Agrégalo una vez y verás todas tus citas, también las que ya tenías, en un calendario aparte.</p>
      <div className="flex flex-wrap gap-2">
        {apps.map(({ label, href, Logo }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="h-[46px] pl-3 pr-[18px] rounded-full border-2 border-line-strong bg-white text-ink hover:text-ink hover:border-ink-2 inline-flex items-center gap-[10px] font-bold text-[14px] no-underline transition-colors"
          >
            <Logo size={22} />
            {label}
          </a>
        ))}
      </div>
      <div className="flex flex-col gap-[6px]">
        <label htmlFor="feed-url" className={ui.label}>
          Enlace de tu calendario
        </label>
        <div className="flex gap-2">
          <input id="feed-url" readOnly value={sync.feedUrl} onFocus={(e) => e.currentTarget.select()} className={cx(ui.input, 'grow text-ink-2')} />
          <button
            type="button"
            className={cx(ui.btnOutline, 'h-12 shrink-0')}
            onClick={async () => ((await copyText(sync.feedUrl)) ? toast.success('Enlace copiado') : toast.error('No pudimos copiar el enlace.'))}
          >
            <CopyIcon size={16} /> Copiar
          </button>
        </div>
        <div className={ui.help}>Google lo actualiza cada pocas horas; Apple y Outlook, más seguido.</div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted -mt-2">
        <span>Es privado: no lo compartas.</span>
        <button type="button" onClick={() => setConfirming(true)} className="min-h-11 font-bold text-primary hover:text-primary-dark underline underline-offset-2">
          Cambiar enlace
        </button>
      </div>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="¿Cambiar el enlace?"
        description="El enlace actual dejará de funcionar y tendrás que volver a agregarlo en tu calendario."
        footer={
          <>
            <button type="button" onClick={() => rotate.mutate()} disabled={rotate.isPending} className="h-12 px-6 rounded-full bg-ink text-white font-bold text-[15px] grow sm:grow-0">
              {rotate.isPending ? 'Cambiando…' : 'Sí, cambiar enlace'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] grow sm:grow-0" data-autofocus>
              Volver
            </button>
          </>
        }
      >
        <span className="sr-only">Confirmación</span>
      </Modal>
    </section>
  );
}

/** "Tu calendario": calendar invitations and the subscribed .ics feed (no OAuth). */
export function CalendarSyncPage() {
  const sync = useCalendarSync();
  const location = useLocation();
  useEffect(() => {
    if (location.hash === '#avisos') document.getElementById('avisos')?.scrollIntoView({ block: 'start' });
  }, [location.hash, sync.data]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className={ui.h1}>Ve tus citas en tu calendario</h1>
        <div className="text-[15px] text-muted">Elige cómo quieres que tus citas lleguen a Google Calendar, Outlook o tu iPhone.</div>
      </div>
      {sync.isError ? (
        <div className={cx(ui.card, 'text-[15px] text-ink-2')}>{errorMessage(sync.error)}</div>
      ) : !sync.data ? (
        <div className="flex flex-wrap gap-6 items-start">
          <SectionSkeleton rows={2} className="flex-[1_1_340px] min-w-0" />
          <SectionSkeleton rows={3} className="flex-[1_1_340px] min-w-0" />
        </div>
      ) : (
        <>
          {/* Phone avisos sit right under the email invitations (both are "how you hear about a booking"). */}
          <div className="flex flex-wrap gap-6 items-start">
            <div className="flex-[1_1_340px] min-w-0 flex flex-col gap-6">
              <InvitesCard sync={sync.data} />
              <PushCard />
            </div>
            <FeedCard sync={sync.data} />
          </div>
          <section className="bg-accent-soft rounded-[24px] py-[18px] px-[18px] sm:px-[22px] flex gap-3 items-start text-[14px] leading-[1.45]">
            <AlertIcon size={20} className="shrink-0 mt-[1px]" />
            <span>Si usas las dos opciones verás cada cita dos veces (una en tu calendario principal y otra en el suscrito). Puedes ocultar uno de los dos en tu calendario.</span>
          </section>
        </>
      )}
    </div>
  );
}

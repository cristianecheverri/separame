import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths } from '@shared/api';
import { formatDayShort } from '@shared/format';
import type { WaitlistEntry } from '@shared/types';
import { ContactActions } from '../../components/ContactActions';
import { cx } from '../../components/ui/cx';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { keys, useWaitlist } from '../../lib/queries';

const waiting = (entries: WaitlistEntry[] | undefined) => (entries ?? []).filter((e) => e.status === 'waiting');
const datesText = (e: WaitlistEntry) => e.dates.map(formatDayShort).join(' · ');

/** Agenda right column: "Lista de espera (N)". */
export function WaitlistCard() {
  const list = useWaitlist();
  const entries = waiting(list.data?.entries);
  return (
    <section className={cx(ui.card, 'gap-3')} aria-busy={list.isPending}>
      <div className="flex justify-between items-center gap-3">
        <h2 className={ui.h2sm}>Lista de espera{list.data ? ` (${entries.length})` : ''}</h2>
        {entries.length > 0 && (
          <Link to="/appointments?tab=waitlist" className="font-bold text-[14px] underline underline-offset-2 min-h-11 inline-flex items-center">
            Ver todas
          </Link>
        )}
      </div>
      {list.isPending && <div className="skeleton h-12" />}
      {list.data && entries.length === 0 && <div className="text-[14px] text-muted leading-[1.45]">Nadie está esperando. Si tu agenda se llena, tus clientes pueden anotarse para que les avisemos si se libera un espacio.</div>}
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {entries.slice(0, 3).map((e) => (
          <li key={e.id} className="bg-surface rounded-[16px] py-[10px] px-[14px] flex flex-col gap-[2px]">
            <span className="font-bold text-[14px]">{e.client.name}</span>
            <span className="text-[13px] text-ink-2">
              {e.serviceName} · {datesText(e)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Full list in "Citas → Lista de espera". */
export function WaitlistSection() {
  const list = useWaitlist();
  const qc = useQueryClient();
  const toast = useToast();
  const [removing, setRemoving] = useState<WaitlistEntry | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.del(apiPaths.waitlistEntry(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.waitlist });
      toast.success('Lo quitaste de la lista de espera.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const entries = waiting(list.data?.entries);

  if (list.isPending) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-24 rounded-[16px]" />
        ))}
      </div>
    );
  }
  if (entries.length === 0) {
    return <EmptyState title="Nadie en lista de espera">Cuando un día esté lleno, tus clientes pueden anotarse desde tu página. Si alguien cancela, les avisamos por correo en orden de llegada.</EmptyState>;
  }
  return (
    <>
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {entries.map((e) => (
          <li key={e.id} className="bg-surface rounded-[16px] p-[14px] flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-col gap-[2px] min-w-0 grow basis-[220px]">
              <span className="font-bold text-[15px]">{e.client.name}</span>
              <span className="text-[13px] text-ink-2">
                {e.serviceName} · {datesText(e)}
              </span>
              {e.notifiedCount > 0 && <span className="text-[12px] text-muted">Le avisamos {e.notifiedCount === 1 ? '1 vez' : `${e.notifiedCount} veces`}</span>}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <ContactActions client={e.client} size="sm" />
              <button type="button" onClick={() => setRemoving(e)} className="hit-44 h-9 px-3 rounded-full text-[13px] font-bold text-ink-2 hover:bg-white">
                Quitar
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`¿Quitar a ${removing?.client.name ?? ''} de la lista?`}
        description="Ya no le avisaremos si se libera un espacio."
        footer={
          <>
            <button
              type="button"
              className="h-12 px-6 rounded-full bg-ink text-white font-bold text-[15px] grow sm:grow-0"
              onClick={() => {
                if (removing) remove.mutate(removing.id);
                setRemoving(null);
              }}
            >
              Sí, quitar
            </button>
            <button type="button" className="h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] grow sm:grow-0" onClick={() => setRemoving(null)} data-autofocus>
              Volver
            </button>
          </>
        }
      >
        <span className="sr-only">Confirmación</span>
      </Modal>
    </>
  );
}

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths } from '@shared/api';
import { formatDayShort } from '@shared/format';
import type { WaitlistEntry } from '@shared/types';
import { telHref, whatsappHref } from '../../components/ContactActions';
import { cx } from '../../components/ui/cx';
import { EmptyState } from '../../components/ui/EmptyState';
import { DotsIcon } from '../../components/ui/icons';
import { Modal } from '../../components/ui/Modal';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { actingHeaderFor } from '../../lib/actingPro';
import { keys, useActing, useWaitlist } from '../../lib/queries';

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

const menuItem = 'min-h-11 flex items-center gap-3 px-3 rounded-[12px] font-semibold text-[15px] no-underline text-ink hover:text-ink hover:bg-surface focus-visible:bg-surface';

function MenuIconPath({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={d} />
    </svg>
  );
}
const PHONE = 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2';
const CHAT = 'M4 20l1.4-4.2A8 8 0 1 1 8.6 19z';
const MAIL = 'M3 7l9 6 9-6M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z';
const TRASH = 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13';

/** "⋯" on a waitlist row: Llamar / WhatsApp / Correo (only with data) and Quitar de la lista. */
function EntryMenu({ entry, onRemove }: { entry: WaitlistEntry; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const phone = entry.client.phone?.trim();
  const email = entry.client.email?.trim();
  const label = `Más acciones para ${entry.client.name}`;

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const toggle = () => {
    if (!open) {
      const rect = buttonRef.current?.getBoundingClientRect();
      // Opens upward when it wouldn't fit above the tab bar.
      setUpward(!!rect && window.innerHeight - rect.bottom < 280);
    }
    setOpen(!open);
  };
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    } else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={rootRef} className="shrink-0" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={cx('w-11 h-11 rounded-full flex items-center justify-center text-ink transition-colors', open ? 'bg-white' : 'hover:bg-white')}
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className={cx(
            'absolute right-2 z-10 w-[210px] max-w-[calc(100%-16px)] bg-white rounded-[18px] border border-line shadow-[0_14px_32px_rgba(21,36,29,0.18)] p-[6px] flex flex-col',
            upward ? 'bottom-[calc(100%-6px)]' : 'top-[calc(100%-6px)]',
          )}
        >
          {phone && (
            <>
              <a role="menuitem" href={telHref(phone)} className={menuItem} onClick={() => setOpen(false)}>
                <MenuIconPath d={PHONE} />
                Llamar
              </a>
              <a role="menuitem" href={whatsappHref(phone)} target="_blank" rel="noreferrer" className={menuItem} onClick={() => setOpen(false)}>
                <MenuIconPath d={CHAT} />
                WhatsApp
              </a>
            </>
          )}
          {email && (
            <a role="menuitem" href={`mailto:${email}`} className={menuItem} onClick={() => setOpen(false)}>
              <MenuIconPath d={MAIL} />
              Correo
            </a>
          )}
          {(phone || email) && <div aria-hidden="true" className="h-px bg-line my-1 mx-[6px]" />}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
            className="min-h-11 flex items-center gap-3 px-3 rounded-[12px] text-left font-bold text-[15px] text-warn-ink hover:bg-warn-soft/50 focus-visible:bg-warn-soft/50"
          >
            <MenuIconPath d={TRASH} />
            Quitar de la lista
          </button>
        </div>
      )}
    </div>
  );
}

/** Full list in "Citas → Lista de espera": «Agendar» opens Nueva cita prefilled (proposal MP-06). */
export function WaitlistSection({ onSchedule, readOnly = false }: { onSchedule?: (entry: WaitlistEntry) => void; readOnly?: boolean }) {
  const list = useWaitlist();
  const qc = useQueryClient();
  const toast = useToast();
  const { ownerId } = useActing();
  const [removing, setRemoving] = useState<WaitlistEntry | null>(null);
  const remove = useMutation({
    // Team plan: removed from its own professional's list (also under «Todos»).
    mutationFn: (entry: WaitlistEntry) => api.del(apiPaths.waitlistEntry(entry.id), { actingProId: actingHeaderFor(entry.proId, ownerId) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.waitlistAll });
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
          <li key={e.id} className="relative bg-surface rounded-[16px] py-3 pr-2 pl-[14px] flex gap-[6px] items-center min-h-16 has-[[aria-expanded=true]]:z-[5]">
            <div className="flex flex-col gap-[2px] min-w-0 grow basis-0">
              <span className="font-bold text-[15px] [overflow-wrap:anywhere]">{e.client.name}</span>
              <span className="text-[13px] text-ink-2 leading-[1.35]">
                {e.serviceName} · {datesText(e)}
              </span>
              {e.notifiedCount > 0 && <span className="text-[12px] text-muted">Le avisamos {e.notifiedCount === 1 ? '1 vez' : `${e.notifiedCount} veces`}</span>}
            </div>
            {onSchedule && !readOnly && (
              <button type="button" onClick={() => onSchedule(e)} aria-label={`Agendar una cita a ${e.client.name}`} className="h-11 px-[14px] rounded-full bg-primary text-white font-bold text-[14px] shrink-0 hover:bg-primary-dark transition-colors">
                Agendar
              </button>
            )}
            <EntryMenu entry={e} onRemove={() => setRemoving(e)} />
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
                if (removing) remove.mutate(removing);
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

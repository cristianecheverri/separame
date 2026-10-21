import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type ServiceResponse, type ServicesResponse, type UpsertServiceRequest } from '@shared/api';
import { priceDisplayOf } from '@shared/format';
import { upsertServiceSchema } from '@shared/schemas';
import type { PriceDisplay, Service } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { LockIcon, PlusIcon, TrashIcon } from '../../components/ui/icons';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { ui } from '../../components/ui/styles';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { formatCopInput, parseCopInput } from '../../lib/format';
import { listPriceText, PriceDisplayField } from './PriceDisplayField';
import { usePro } from '../../lib/pro';
import { keys, useServices } from '../../lib/queries';

import { durationProblem } from './durations';
import { DurationPicker } from './DurationPicker';
import { focusFirstError } from '../../lib/focusError';

interface FormState {
  name: string;
  durationMin: number;
  priceDisplay: PriceDisplay;
  price: string;
  description: string;
}

const EMPTY: FormState = { name: '', durationMin: 30, priceDisplay: 'fixed', price: '', description: '' };
const toForm = (s: Service): FormState => ({
  name: s.name,
  durationMin: s.durationMin,
  priceDisplay: priceDisplayOf(s),
  price: s.priceCop ? formatCopInput(String(s.priceCop)) : '',
  description: s.description,
});

function useServiceMutations() {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: UpsertServiceRequest }) =>
      id ? api.put<ServiceResponse>(apiPaths.service(id), body) : api.post<ServiceResponse>(apiPaths.services(), body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.services }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(apiPaths.service(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.services }),
  });
  const toggle = useMutation({
    mutationFn: (service: Service) =>
      api.put<ServiceResponse>(apiPaths.service(service.id), {
        name: service.name, durationMin: service.durationMin, priceCop: service.priceCop, priceDisplay: priceDisplayOf(service), description: service.description, visible: !service.visible,
      }),
    onMutate: async (service) => {
      await qc.cancelQueries({ queryKey: keys.services });
      const previous = qc.getQueryData<ServicesResponse>(keys.services);
      if (previous) qc.setQueryData<ServicesResponse>(keys.services, { services: previous.services.map((s) => (s.id === service.id ? { ...s, visible: !s.visible } : s)) });
      return { previous };
    },
    onError: (_e, _s, ctx) => ctx?.previous && qc.setQueryData(keys.services, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.services }),
  });
  return { save, remove, toggle };
}

/** pro-services */
export function ServicesPage() {
  const { readOnly } = usePro();
  const services = useServices();
  const toast = useToast();
  const { save, remove, toggle } = useServiceMutations();
  const list = services.data?.services ?? [];
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const effectiveId = selectedId ?? (services.data ? (list[0]?.id ?? 'new') : null);
  const selected = list.find((s) => s.id === effectiveId) ?? null;
  const isNew = effectiveId === 'new' || (effectiveId !== null && !selected);

  const pick = (id: string | 'new') => {
    setSelectedId(id);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div className="flex flex-col gap-1">
          <h1 className={ui.h1}>Servicios</h1>
          <div className="text-[15px] text-muted">Lo que tus clientes pueden reservar desde tu página.</div>
        </div>
        <button type="button" disabled={readOnly} onClick={() => pick('new')} className={cx(ui.btnPrimary, readOnly && ui.btnLocked)}>
          {readOnly ? <LockIcon size={16} /> : <PlusIcon />}
          Nuevo servicio
        </button>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <section aria-label="Lista de servicios" className="flex-[999_1_420px] min-w-0 flex flex-col gap-3">
          {services.isPending &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-[20px] p-[14px] flex gap-4 items-center" aria-busy="true">
                <Skeleton className="w-[52px] h-[52px] rounded-[16px]" />
                <div className="grow flex flex-col gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            ))}
          {services.data && list.length === 0 && (
            <div className="bg-white rounded-[20px] p-4">
              <EmptyState title="Aún no tienes servicios">Crea el primero a la derecha: nombre, duración y precio de referencia. Así tus clientes ya pueden reservarte.</EmptyState>
            </div>
          )}
          {list.map((s) => {
            const isSelected = s.id === effectiveId;
            const note = s.visible ? s.description : 'Oculto en la página';
            return (
              <div key={s.id} className={cx('flex items-center gap-4 py-[14px] pr-4 pl-[14px] rounded-[20px] bg-white border-2', isSelected ? 'border-primary' : 'border-white')}>
                <button type="button" onClick={() => pick(s.id)} aria-label={`Editar ${s.name}`} aria-current={isSelected || undefined} className="flex items-center gap-4 grow min-w-0 text-left min-h-11 rounded-[14px]">
                  <span className="w-[52px] h-[52px] rounded-[16px] bg-accent-soft flex flex-col items-center justify-center shrink-0 leading-none">
                    <span className="font-display font-extrabold text-[18px]">{s.durationMin}</span>
                    <span className="text-[11px] font-semibold text-ink-2">min</span>
                  </span>
                  <span className="flex flex-col gap-[3px] min-w-0">
                    <span className={cx('font-bold text-[16px] [overflow-wrap:anywhere]', !s.visible && 'text-muted')}>{s.name}</span>
                    <span className="text-[14px] text-muted">
                      {listPriceText(s)}
                      {note && ` · ${note}`}
                    </span>
                  </span>
                </button>
                <Switch
                  on={s.visible}
                  label={`Mostrar ${s.name} en mi página`}
                  disabled={readOnly}
                  onToggle={() => toggle.mutate(s, { onError: (error) => toast.error(errorMessage(error)) })}
                />
              </div>
            );
          })}
          <div className="text-[13px] text-muted pt-1 px-1">Los servicios ocultos no aparecen en tu página, pero puedes agendarlos tú desde el panel.</div>
        </section>

        <section ref={panelRef} aria-label={isNew ? 'Nuevo servicio' : 'Editar servicio'} className="flex-[1_1_340px] min-w-0 bg-white rounded-[24px] p-[18px] sm:p-6 flex flex-col gap-4 scroll-mt-20">
          <h2 className={cx(ui.h2, '[overflow-wrap:anywhere]')}>{isNew ? 'Nuevo servicio' : `Editar «${selected?.name ?? ''}»`}</h2>
          {effectiveId === null ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-12" />
              <Skeleton className="h-11" />
              <Skeleton className="h-12" />
            </div>
          ) : (
            <ServiceEditor
              key={effectiveId}
              service={isNew ? null : selected}
              readOnly={readOnly}
              saving={save.isPending}
              onSave={(id, body, isCreate) =>
                save.mutate(
                  { id, body },
                  {
                    onSuccess: (res) => {
                      toast.success(isCreate ? `Creaste «${res.service.name}».` : 'Cambios guardados.');
                      setSelectedId(res.service.id);
                    },
                    onError: (error) => toast.error(errorMessage(error)),
                  },
                )
              }
              onDelete={() => setConfirmDelete(true)}
            />
          )}
        </section>
      </div>

      <Modal
        open={confirmDelete && !!selected}
        onClose={() => setConfirmDelete(false)}
        title={`¿Eliminar «${selected?.name ?? ''}»?`}
        description="Deja de aparecer en tu página. Las citas ya agendadas con este servicio no cambian."
        footer={
          <>
            <button
              type="button"
              className="h-12 px-6 rounded-full bg-ink text-white font-bold text-[15px] grow sm:grow-0"
              onClick={() => {
                const target = selected!;
                setConfirmDelete(false);
                remove.mutate(target.id, {
                  onSuccess: () => {
                    toast.success(`Eliminaste «${target.name}».`);
                    setSelectedId(null);
                  },
                  onError: (error) => toast.error(errorMessage(error)),
                });
              }}
            >
              Sí, eliminar
            </button>
            <button type="button" className="h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] grow sm:grow-0" onClick={() => setConfirmDelete(false)} data-autofocus>
              Volver
            </button>
          </>
        }
      >
        <span className="sr-only">Confirmación</span>
      </Modal>
    </div>
  );
}

interface EditorProps {
  service: Service | null;
  readOnly: boolean;
  saving: boolean;
  onSave: (id: string | null, body: UpsertServiceRequest, isCreate: boolean) => void;
  onDelete: () => void;
}

/** Edit panel form; keyed by service id so it resets when another service is picked. */
function ServiceEditor({ service, readOnly, saving, onSave, onDelete }: EditorProps) {
  const [form, setForm] = useState<FormState>(() => (service ? toForm(service) : EMPTY));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isNew = !service;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLFormElement;
    const durationError = durationProblem(form.durationMin);
    const parsed = upsertServiceSchema.safeParse({
      name: form.name,
      durationMin: form.durationMin,
      priceCop: form.priceDisplay === 'fixed' ? parseCopInput(form.price) : null,
      priceDisplay: form.priceDisplay,
      description: form.description,
      visible: service?.visible ?? true,
    });
    if (!parsed.success || durationError) {
      const next: Record<string, string> = {};
      if (durationError) next.durationMin = durationError;
      for (const issue of parsed.success ? [] : parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      focusFirstError(target);
      return;
    }
    setErrors({});
    onSave(service?.id ?? null, parsed.data, isNew);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <fieldset disabled={readOnly} className="contents">
        <Field label="Nombre" error={errors.name}>
          {(p) => <input {...p} type="text" className={ui.input} value={form.name} placeholder="Nombre del servicio" onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <DurationPicker value={form.durationMin} onChange={(durationMin) => setForm({ ...form, durationMin })} error={errors.durationMin} disabled={readOnly} />
        <PriceDisplayField
          display={form.priceDisplay}
          price={form.price}
          onChange={({ display, price }) => setForm({ ...form, priceDisplay: display, price })}
          error={errors.priceCop}
          disabled={readOnly}
          preview={{ name: form.name, durationMin: form.durationMin, description: form.description }}
        />
        <Field label="Descripción corta (opcional)" error={errors.description}>
          {(p) => (
            <textarea {...p} rows={2} maxLength={200} className={ui.textarea} placeholder="Descripción del servicio" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          )}
        </Field>
      </fieldset>
      <div className="flex gap-[10px] pt-1">
        <button type="submit" disabled={readOnly || saving} className={cx('grow h-12 rounded-full bg-primary text-white font-bold text-[15px] hover:bg-primary-dark inline-flex items-center justify-center gap-2', readOnly && ui.btnLocked)}>
          {readOnly && <LockIcon size={16} />}
          {saving ? 'Guardando…' : isNew ? 'Crear servicio' : 'Guardar cambios'}
        </button>
        {!isNew && (
          <button type="button" aria-label="Eliminar servicio" disabled={readOnly} onClick={onDelete} className="w-12 h-12 rounded-full border-2 border-line bg-white text-ink-2 flex items-center justify-center hover:border-line-strong disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
            <TrashIcon />
          </button>
        )}
      </div>
    </form>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type CreateMigrationRequest, type CreatePriceRequest, type PriceWithUsage, type UpdatePriceRequest } from '@shared/api';
import { formatCop, formatDateNoYear, formatDateShort } from '@shared/format';
import { createMigrationSchema, createPriceSchema } from '@shared/schemas';
import { slugify } from '@shared/slug';
import { MIGRATION_NOTICE_DAYS } from '@shared/subscription';
import { addDays, bogotaDate, todayBogota } from '@shared/time';
import type { PriceMigration } from '@shared/types';
import { Chip } from '../../components/ui/Chip';
import { cx } from '../../components/ui/cx';
import { Field } from '../../components/ui/Field';
import { CloseIcon, PlusIcon } from '../../components/ui/icons';
import { Modal } from '../../components/ui/Modal';
import { PillSelect } from '../../components/ui/PillSelect';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { now } from '../../lib/clock';
import { firstName, formatCopInput, formatDayMonth, parseCopInput, plural } from '../../lib/format';
import { keys, useAdminMigrations, useAdminPrices, useAdminSubscriptions } from '../../lib/queries';
import { tableHead, th } from './adminUi';
import { monthlyText, packagesShort, STATUS_TAG } from './priceText';

type TargetKind = 'group' | 'pros' | 'version';
const TARGETS: { kind: TargetKind; label: string }[] = [
  { kind: 'group', label: 'Un grupo' },
  { kind: 'pros', label: 'Profesionales elegidos' },
  { kind: 'version', label: 'Todos los de una versión' },
];

const priceOption = (p: PriceWithUsage) => ({ value: p.id, label: `${p.name} · ${p.monthlyCop ? formatCop(p.monthlyCop) : 'por definir'}` });

function firstOfNextMonth(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (d === 1) return date;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/** admin-prices */
export function AdminPricesPage() {
  const prices = useAdminPrices();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const creating = params.get('new') === '1';
  const setCreating = (open: boolean) => setParams(open ? { new: '1' } : {}, { replace: true });

  useEffect(() => {
    if (location.hash === '#migrar') document.getElementById('migrar')?.scrollIntoView({ block: 'start' });
  }, [location.hash, prices.data]);

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePriceRequest }) => api.patch(apiPaths.adminPrice(id), body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.adminPrices });
      toast.success('Versión actualizada.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const list = prices.data?.prices ?? [];

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div className="flex flex-col gap-1">
          <h1 className={ui.h1}>Precios</h1>
          <div className="text-[15px] text-muted">Cada versión es inmutable. Cambiar un precio es crear una versión nueva.</div>
        </div>
        <button type="button" onClick={() => setCreating(true)} className={ui.btnPrimary}>
          + Nueva versión
        </button>
      </div>

      <section className="bg-white rounded-[24px] pt-2 px-2 pb-3" aria-label="Versiones de precio" aria-busy={prices.isPending}>
        <div className="overflow-x-auto relative">
          <table className="w-full min-w-[760px] border-collapse text-[14px]">
            <thead>
              <tr className={tableHead}>
                <th className={cx(th, 'px-[14px]')}>Versión</th>
                <th className={cx(th, 'px-[10px]')}>Precio</th>
                <th className={cx(th, 'px-[10px]')}>Paquetes</th>
                <th className={cx(th, 'px-[10px]')}>Estado</th>
                <th className={cx(th, 'px-[10px]')}>Suscripciones</th>
                <th className={cx(th, 'px-[10px]')}>Creada</th>
                <th className={cx(th, 'px-[14px]')}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {prices.isPending &&
                [0, 1, 2].map((i) => (
                  <tr key={i} className="border-t border-line">
                    <td colSpan={7} className="px-[14px] py-3">
                      <div className="skeleton h-9" />
                    </td>
                  </tr>
                ))}
              {list.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-[14px] py-3">
                    <div className="font-bold">{p.name}</div>
                    <div className="text-[12px] text-muted whitespace-nowrap">{p.code}</div>
                  </td>
                  <td className="px-[10px] py-3 whitespace-nowrap font-bold">{monthlyText(p)}</td>
                  <td className="px-[10px] py-3 text-ink-2">{packagesShort(p)}</td>
                  <td className="px-[10px] py-3">
                    <span className={cx(ui.badge, STATUS_TAG[p.status].className)}>{STATUS_TAG[p.status].label}</span>
                  </td>
                  <td className="px-[10px] py-3">{p.subscriptions}</td>
                  <td className="px-[10px] py-3 whitespace-nowrap text-ink-2">{formatDateShort(bogotaDate(p.createdAt))}</td>
                  <td className="px-[14px] py-3 text-right whitespace-nowrap">
                    {p.isDefault ? (
                      <span className="text-[13px] font-semibold text-muted">Predeterminada</span>
                    ) : p.status === 'draft' ? (
                      <button type="button" className={cx(ui.linkBtn, 'text-[14px] min-h-11 disabled:text-muted')} disabled={!p.monthlyCop || p.packages.length === 0} title={!p.monthlyCop ? 'Define el precio antes de activarla' : undefined} onClick={() => update.mutate({ id: p.id, body: { status: 'active' } })}>
                        Activar
                      </button>
                    ) : p.status === 'active' ? (
                      <span className="inline-flex gap-4">
                        <button type="button" className={cx(ui.linkBtn, 'text-[14px] min-h-11')} onClick={() => update.mutate({ id: p.id, body: { isDefault: true } })}>
                          Predeterminar
                        </button>
                        <button type="button" className="font-bold text-[14px] min-h-11 text-ink-2 hover:text-ink" onClick={() => update.mutate({ id: p.id, body: { status: 'inactive' } })}>
                          Desactivar
                        </button>
                      </span>
                    ) : (
                      <button type="button" className={cx(ui.linkBtn, 'text-[14px] min-h-11')} onClick={() => update.mutate({ id: p.id, body: { status: 'active' } })}>
                        Reactivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {prices.data && <MigrationSection prices={list} />}
      {creating && <NewPriceModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function MigrationSection({ prices }: { prices: PriceWithUsage[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const today = todayBogota(now());
  const minDate = addDays(today, MIGRATION_NOTICE_DAYS);
  const migrations = useAdminMigrations();
  const subs = useAdminSubscriptions();
  const usable = prices.filter((p) => p.status !== 'inactive');
  const defaultFrom = usable.find((p) => p.subscriptions > 0 && !p.isDefault) ?? usable[0];
  const defaultTo = usable.find((p) => p.id !== defaultFrom?.id && p.status === 'draft') ?? usable.find((p) => p.id !== defaultFrom?.id) ?? usable[0];
  const [target, setTarget] = useState<TargetKind>('group');
  const [group, setGroup] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [fromId, setFromId] = useState(defaultFrom?.id ?? '');
  const [toId, setToId] = useState(defaultTo?.id ?? '');
  const [effective, setEffective] = useState(() => firstOfNextMonth(minDate));
  const [error, setError] = useState<string | null>(null);

  const from = prices.find((p) => p.id === fromId);
  const to = prices.find((p) => p.id === toId);
  const candidates = (subs.data?.rows ?? []).filter((r) => r.price.id === fromId);
  const count = target === 'version' ? plural(from?.subscriptions ?? 0, 'profesional', 'profesionales') : target === 'pros' ? (chosen.length ? plural(chosen.length, 'profesional', 'profesionales') : 'los elegidos') : null;
  const help =
    target === 'group'
      ? `Escribe el nombre del grupo. Solo se migran los que hoy están en ${from?.name ?? 'esa versión'}.`
      : target === 'pros'
        ? `Elige a quiénes, entre los que hoy están en ${from?.name ?? 'esa versión'}.`
        : `Las ${from?.subscriptions ?? 0} suscripciones que hoy están en ${from?.name ?? 'esa versión'}.`;
  const firstPerson = (target === 'pros' ? candidates.find((r) => chosen.includes(r.proId)) : candidates[0])?.name;

  const create = useMutation({
    mutationFn: (body: CreateMigrationRequest) => api.post(apiPaths.adminMigrations(), body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.adminMigrations });
      toast.success('Migración programada. El aviso sale por correo hoy.');
      setChosen([]);
      setGroup('');
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(apiPaths.adminCancelMigration(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.adminMigrations });
      toast.success('Migración cancelada.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (fromId === toId) return setError('Elige dos versiones distintas.');
    if (effective < minDate) return setError(`La fecha efectiva debe ser desde el ${formatDayMonth(minDate)} (30 días de aviso).`);
    const body = {
      fromPriceVersionId: fromId,
      toPriceVersionId: toId,
      effectiveDate: effective,
      target: target === 'group' ? { kind: 'group' as const, group } : target === 'pros' ? { kind: 'pros' as const, proIds: chosen } : { kind: 'version' as const },
    };
    const parsed = createMigrationSchema.safeParse(body);
    if (!parsed.success) return setError(target === 'group' ? 'Escribe el nombre del grupo.' : target === 'pros' ? 'Elige al menos un profesional.' : (parsed.error.issues[0]?.message ?? 'Revisa los datos.'));
    setError(null);
    create.mutate(parsed.data);
  };

  const scheduled = (migrations.data?.migrations ?? []).filter((m) => m.status === 'scheduled');
  const priceName = (id: string) => prices.find((p) => p.id === id)?.name ?? '—';
  const targetLabel = (m: PriceMigration) => (m.target.kind === 'group' ? m.target.group : m.target.kind === 'pros' ? 'Elegidos' : 'Todos');
  const toAmount = to?.monthlyCop ? formatCop(to.monthlyCop) : 'el nuevo precio';
  const effectiveText = formatDayMonth(effective);

  return (
    <div className="flex flex-wrap gap-[22px] items-start" id="migrar">
      <form onSubmit={submit} noValidate className={cx(ui.card, 'flex-[999_1_460px] min-w-0 gap-4 scroll-mt-20')}>
        <h2 className={ui.h2}>Migrar profesionales a otro precio</h2>
        <div className="flex flex-col gap-2" role="group" aria-labelledby="mig-target">
          <div id="mig-target" className={ui.label}>
            ¿A quiénes?
          </div>
          <div className="flex flex-wrap gap-2">
            {TARGETS.map((t) => (
              <Chip key={t.kind} selected={target === t.kind} onClick={() => setTarget(t.kind)}>
                {t.label}
              </Chip>
            ))}
          </div>
          <div className="text-[13px] text-muted">{help}</div>
          {target === 'group' && <input aria-label="Nombre del grupo" className={ui.input} value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Nombre del grupo" />}
          {target === 'pros' && (
            <div className="rounded-[14px] border-2 border-line max-h-[220px] overflow-y-auto p-1">
              {candidates.length === 0 && <div className="text-[13px] text-muted p-3">No hay profesionales en esa versión.</div>}
              {candidates.map((r) => (
                <label key={r.proId} className="flex gap-3 items-center min-h-11 px-3 rounded-[10px] hover:bg-surface cursor-pointer text-[14px]">
                  <input type="checkbox" className="w-5 h-5 m-0 accent-primary" checked={chosen.includes(r.proId)} onChange={(e) => setChosen(e.target.checked ? [...chosen, r.proId] : chosen.filter((id) => id !== r.proId))} />
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-muted text-[13px] truncate">/{r.slug}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
          <div className="flex flex-col gap-[6px] min-w-0">
            <span className={ui.label}>Desde</span>
            <PillSelect variant="field" label="Desde" value={fromId} options={usable.map(priceOption)} onChange={(v) => { setFromId(v); setChosen([]); }} />
          </div>
          <div className="flex flex-col gap-[6px] min-w-0">
            <span className={ui.label}>Hacia</span>
            <PillSelect variant="fieldSelected" label="Hacia" value={toId} options={usable.map(priceOption)} onChange={setToId} />
          </div>
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="mig-date" className={ui.label}>
            Fecha efectiva
          </label>
          <input id="mig-date" type="date" min={minDate} value={effective} onChange={(e) => setEffective(e.target.value)} className={ui.input} />
          <div className="text-[13px] text-muted leading-[1.45]">
            Mínimo 30 días después del aviso. Si avisas hoy, la primera fecha posible es el {formatDayMonth(minDate)}. El cambio aplica en la siguiente renovación.
          </div>
        </div>
        {error && (
          <div role="alert" className="bg-warn-soft text-warn-ink rounded-[14px] px-4 py-3 text-[14px] font-semibold">
            {error}
          </div>
        )}
        <button type="submit" disabled={create.isPending} className="h-[52px] rounded-full bg-primary text-white font-bold text-[15px] hover:bg-primary-dark px-4">
          {create.isPending ? 'Programando…' : count ? `Programar y enviar aviso a ${count}` : 'Programar y enviar aviso al grupo'}
        </button>
      </form>

      <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-5">
        <section className={cx(ui.card, 'gap-[10px]')}>
          <div className="text-[12px] font-bold uppercase tracking-[0.4px] text-muted">Vista previa del aviso</div>
          <div className="bg-surface rounded-[16px] p-4 flex flex-col gap-2 text-[14px] leading-[1.5]">
            <strong className="text-[15px]">Tu precio en Sepárame cambia el {effectiveText}</strong>
            <span className="text-ink-2">
              Hola{firstPerson ? `, ${firstName(firstPerson)}` : ''}. Desde tu renovación del {effectiveText}, tu plan pasa de {from?.monthlyCop ? formatCop(from.monthlyCop) : 'tu precio actual'} a {toAmount} al mes. Hasta esa fecha todo sigue igual. Si tienes dudas,
              responde este correo.
            </span>
          </div>
        </section>

        <section className={cx(ui.card, 'gap-[10px]')}>
          <h2 className={ui.h2sm}>Programadas</h2>
          {migrations.isPending && <div className="skeleton h-16 rounded-[16px]" />}
          {migrations.data && scheduled.length === 0 && <div className="text-[13px] text-muted">No hay migraciones programadas.</div>}
          {scheduled.map((m) => (
            <div key={m.id} className="bg-accent-soft rounded-[16px] py-3 pl-[14px] pr-2 flex items-center gap-2">
              <div className="flex flex-col gap-[2px] grow min-w-0">
                <span className="font-bold text-[14px]">
                  {targetLabel(m)} ({m.affectedCount}) · {priceName(m.fromPriceVersionId)} → {priceName(m.toPriceVersionId)}
                </span>
                <span className="text-[13px] text-ink-2">
                  {m.noticeSentAt ? `Aviso enviado ${formatDateNoYear(bogotaDate(m.noticeSentAt))}` : 'Aviso pendiente'} · efectiva {formatDateNoYear(m.effectiveDate)}
                </span>
              </div>
              <button type="button" aria-label={`Cancelar migración ${targetLabel(m)}`} onClick={() => cancel.mutate(m.id)} className={ui.iconBtn}>
                <CloseIcon size={16} />
              </button>
            </div>
          ))}
          <div className="text-[13px] text-muted">Los precios fundador no se migran salvo que tú lo decidas.</div>
        </section>
      </div>
    </div>
  );
}

interface PackageDraft {
  months: number;
  amount: string;
}

function NewPriceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [monthly, setMonthly] = useState('');
  const [packages, setPackages] = useState<PackageDraft[]>([
    { months: 3, amount: '' },
    { months: 6, amount: '' },
    { months: 12, amount: '' },
  ]);
  const [status, setStatus] = useState<'active' | 'draft'>('draft');
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveCode = codeTouched ? code : name ? `${slugify(name)}-v1` : '';

  const create = useMutation({
    mutationFn: (body: CreatePriceRequest) => api.post(apiPaths.adminPrices(), body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.adminPrices });
      toast.success('Versión creada.');
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = {
      code: effectiveCode,
      name,
      monthlyCop: parseCopInput(monthly),
      packages: packages.filter((p) => p.amount).map((p) => ({ months: p.months, amountCop: parseCopInput(p.amount) ?? 0 })),
      status,
      isDefault: status === 'active' && isDefault,
    };
    const parsed = createPriceSchema.safeParse(body);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revisa los datos.');
    setError(null);
    create.mutate(parsed.data);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Nueva versión de precio"
      description="Una vez la usen suscripciones, sus montos no se pueden cambiar."
      footer={
        <>
          <button type="submit" form="new-price" disabled={create.isPending} className="h-12 px-6 rounded-full bg-primary text-white font-bold text-[15px] grow sm:grow-0 hover:bg-primary-dark">
            {create.isPending ? 'Creando…' : 'Crear versión'}
          </button>
          <button type="button" onClick={onClose} className="h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] grow sm:grow-0">
            Volver
          </button>
        </>
      }
    >
      <form id="new-price" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre">{(p) => <input {...p} className={ui.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del precio" />}</Field>
          <Field label="Código" help="Minúsculas, números y guiones.">
            {(p) => (
              <input
                {...p}
                className={ui.input}
                value={effectiveCode}
                onChange={(e) => {
                  setCodeTouched(true);
                  setCode(e.target.value.toLowerCase());
                }}
                placeholder="Código del precio"
              />
            )}
          </Field>
        </div>
        <Field label="Precio mensual de referencia" help="El «desde $X/mes» que ven los profesionales.">
          {(p) => (
            <div className="flex gap-2">
              <div className={ui.prefix} aria-hidden="true">
                COP $
              </div>
              <input {...p} inputMode="numeric" className={cx(ui.input, 'grow')} value={monthly} onChange={(e) => setMonthly(formatCopInput(e.target.value))} placeholder="Valor mensual" />
            </div>
          )}
        </Field>
        <div className="flex flex-col gap-2">
          <div className={ui.label}>Paquetes</div>
          {packages.map((pkg, i) => (
            <div key={i} className="flex gap-2 items-center">
              <PillSelect
                variant="field"
                label={`Meses del paquete ${i + 1}`}
                value={pkg.months}
                options={[1, 3, 6, 12].map((m) => ({ value: m, label: m === 1 ? '1 mes' : `${m} meses` }))}
                onChange={(months) => setPackages(packages.map((p, j) => (j === i ? { ...p, months } : p)))}
                className="w-[130px] shrink-0"
              />
              <input aria-label={`Monto del paquete ${i + 1}`} inputMode="numeric" className={cx(ui.input, 'grow')} value={pkg.amount} placeholder="Monto" onChange={(e) => setPackages(packages.map((p, j) => (j === i ? { ...p, amount: formatCopInput(e.target.value) } : p)))} />
              <button type="button" aria-label={`Quitar paquete ${i + 1}`} onClick={() => setPackages(packages.filter((_, j) => j !== i))} className={ui.iconBtn}>
                <CloseIcon size={16} />
              </button>
            </div>
          ))}
          {packages.length < 6 && (
            <button type="button" onClick={() => setPackages([...packages, { months: 1, amount: '' }])} className={cx(ui.linkBtn, 'text-[14px] min-h-11 self-start inline-flex items-center gap-1')}>
              <PlusIcon size={14} /> Agregar paquete
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2" role="group" aria-labelledby="np-status">
          <div id="np-status" className={ui.label}>
            Estado
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip selected={status === 'draft'} onClick={() => setStatus('draft')}>
              Borrador
            </Chip>
            <Chip selected={status === 'active'} onClick={() => setStatus('active')}>
              Activa
            </Chip>
          </div>
        </div>
        {status === 'active' && (
          <label className="flex gap-3 items-center text-[14px] min-h-11 cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="w-[22px] h-[22px] m-0 accent-primary shrink-0" />
            Ofrecerla a los nuevos profesionales (predeterminada)
          </label>
        )}
        {error && (
          <div role="alert" className="bg-warn-soft text-warn-ink rounded-[14px] px-4 py-3 text-[14px] font-semibold">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}

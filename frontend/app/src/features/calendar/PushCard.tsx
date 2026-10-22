import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pushDeviceKey, usePushDevice } from '../../lib/usePushDevice';
import { apiPaths } from '@shared/api';
import { formatDateShort } from '@shared/format';
import { bogotaDate } from '@shared/time';
import { cx } from '../../components/ui/cx';
import { BellIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { ui } from '../../components/ui/styles';
import { useState } from 'react';
import { IosInstallSheet } from '../../components/install/IosInstallSheet';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { track } from '../../lib/analytics';
import { api, errorMessage } from '../../lib/api';
import { endpointHash, isIos, isStandalone, push, PushError } from '../../lib/push';
import { keys, usePushConfig } from '../../lib/queries';

function pushErrorMessage(error: unknown): string {
  if (error instanceof PushError) {
    if (error.reason === 'denied') return 'No diste permiso para los avisos. Puedes activarlo en la configuración del navegador.';
    if (error.reason === 'no_worker') return 'Recarga la página e inténtalo de nuevo.';
    return 'No pudimos activar los avisos en este celular. Inténtalo de nuevo.';
  }
  return errorMessage(error);
}

/** "Avisos en este celular": web push for new, moved and cancelled appointments. */
export function PushCard() {
  const config = usePushConfig();
  const device = usePushDevice();
  const qc = useQueryClient();
  const toast = useToast();
  const adapter = push.get();
  const endpoint = device.data ?? null;
  const [installSheet, setInstallSheet] = useState(false);
  const ownHash = useQuery({ queryKey: ['push-hash', endpoint], queryFn: () => endpointHash(endpoint!), enabled: !!endpoint });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.pushConfig });
    void qc.invalidateQueries({ queryKey: pushDeviceKey });
  };
  const enable = useMutation({
    mutationFn: async () => {
      const subscription = await adapter.subscribe(config.data!.vapidPublicKey!);
      await api.post(apiPaths.pushSubscriptions(), subscription);
    },
    onSuccess: () => {
      track('push_enabled', {});
      refresh();
      toast.success('Listo: te avisaremos en este celular.');
    },
    onError: (e) => {
      refresh();
      toast.error(pushErrorMessage(e));
    },
  });
  const disable = useMutation({
    mutationFn: async () => {
      const removed = await adapter.unsubscribe();
      if (removed) await api.post(apiPaths.removePushSubscription(), { endpoint: removed });
    },
    onSuccess: () => {
      refresh();
      toast.success('Desactivaste los avisos en este celular.');
    },
    onError: (e) => toast.error(pushErrorMessage(e)),
  });
  const test = useMutation({
    mutationFn: () => api.post(apiPaths.testPush()),
    onSuccess: () => toast.success('Te enviamos un aviso de prueba.'),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (config.isPending) {
    return (
      <section className={cx(ui.card, 'gap-3')} aria-busy="true" aria-label="Cargando">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-12" />
      </section>
    );
  }
  if (!config.data?.vapidPublicKey) return null;

  const supported = adapter.supported();
  const permission = adapter.permission();
  const subscribed = !!endpoint;
  const busy = enable.isPending || disable.isPending;
  const devices = config.data.devices;

  return (
    <section id="avisos" className={cx(ui.card, 'gap-4 scroll-mt-20')}>
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className={ui.h2}>Avisos en este celular</h2>
        <span className="text-[12px] font-bold py-[5px] px-[10px] rounded-full whitespace-nowrap bg-accent text-ink">Al instante</span>
      </div>
      <div className="flex gap-4 items-start justify-between">
        <p className="m-0 text-[14px] text-ink-2 leading-[1.45]">Recibe un aviso en este celular cuando te separen, muevan o cancelen una cita, aunque no tengas Sepárame abierto.</p>
        {supported && permission !== 'denied' && (
          <Switch on={subscribed} disabled={busy || device.isPending} label="Avisos en este celular" onToggle={() => (subscribed ? disable.mutate() : enable.mutate())} />
        )}
      </div>

      {!supported && isIos() && !isStandalone() && (
        <div className="bg-accent-soft rounded-[14px] px-4 py-3 text-[14px] leading-[1.45] flex flex-wrap gap-x-3 gap-y-1 items-center justify-between">
          <span>En iPhone, primero agrega Sepárame a tu pantalla de inicio (Compartir → Agregar a inicio).</span>
          <button type="button" onClick={() => setInstallSheet(true)} className="min-h-11 font-bold text-primary underline underline-offset-2">
            Cómo instalarla
          </button>
          <IosInstallSheet open={installSheet} onClose={() => setInstallSheet(false)} otherBrowser={/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)} />
        </div>
      )}
      {!supported && !(isIos() && !isStandalone()) && (
        <div className="bg-surface rounded-[14px] px-4 py-3 text-[14px] text-ink-2 leading-[1.45]">Este navegador no permite avisos. Prueba con Chrome, Edge o Safari actualizado.</div>
      )}
      {supported && permission === 'denied' && (
        <div className="bg-warn-soft text-warn-ink rounded-[14px] px-4 py-3 text-[14px] font-semibold leading-[1.45]">
          Bloqueaste los avisos de Sepárame. Actívalos en la configuración del navegador (el ícono junto a la dirección de la página) y recarga.
        </div>
      )}
      {supported && subscribed && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => test.mutate()} disabled={test.isPending} className={ui.btnOutline}>
            <BellIcon size={16} /> {test.isPending ? 'Enviando…' : 'Probar aviso'}
          </button>
          <button type="button" onClick={() => disable.mutate()} disabled={busy} className="min-h-11 px-2 font-bold text-[14px] text-ink-2 underline underline-offset-2 hover:text-ink">
            Desactivar en este celular
          </button>
        </div>
      )}

      {devices.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <div className="text-[13px] font-bold text-muted">Tus dispositivos con avisos</div>
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {devices.map((d) => (
              <li key={d.endpointHash} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[14px]">
                <span className="font-semibold flex items-center gap-2">
                  {d.deviceLabel || 'Dispositivo'}
                  {ownHash.data === d.endpointHash && <span className="text-[11px] font-bold py-[2px] px-2 rounded-full bg-primary-soft text-primary">Este celular</span>}
                </span>
                <span className="text-muted text-[13px]">{d.lastSuccessAt ? `Último aviso: ${formatDateShort(bogotaDate(d.lastSuccessAt))}` : `Agregado el ${formatDateShort(bogotaDate(d.createdAt))}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

import { useEffect, useRef } from 'react';
import { track } from '../../lib/analytics';
import { useInstall } from '../../lib/install';
import { useToast } from '../ui/Toast';

/** One toast per `appinstalled` (mounted once in the shell). */
export function InstallListener() {
  const { installedTick } = useInstall();
  const toast = useToast();
  const seen = useRef(installedTick);
  useEffect(() => {
    if (installedTick > seen.current) {
      track('app_installed', {});
      toast.success('¡Listo! Ya tienes Sepárame en tu pantalla de inicio.');
    }
    seen.current = installedTick;
  }, [installedTick, toast]);
  return null;
}

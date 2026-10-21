import { useState } from 'react';
import { dismissInstall, installStore, isDismissed, useInstall } from '../../lib/install';
import { cx } from '../ui/cx';
import { ui } from '../ui/styles';
import { useToast } from '../ui/Toast';
import { IosInstallSheet } from './IosInstallSheet';

function AppIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="16" fill="#0B6E4F" />
      <path d="M40.5 22.5c-1.9-2.6-5-4-8.7-4-5.4 0-9.1 2.9-9.1 7.1 0 4.1 3.2 5.8 8.2 6.9 4 .9 5.3 1.6 5.3 3.2 0 1.7-1.7 2.8-4.4 2.8-3 0-5.3-1.3-6.8-3.6l-4.5 3.3c2.3 3.5 6.2 5.4 11.1 5.4 6.2 0 10.4-3.1 10.4-7.8 0-4.3-3.1-6-8.6-7.2-3.6-.8-4.8-1.4-4.8-2.8 0-1.3 1.4-2.2 3.5-2.2 2.2 0 3.9.9 5 2.5z" fill="#fff" />
      <circle cx="46" cy="44" r="4.2" fill="#FFC93C" />
    </svg>
  );
}

/** "Instala Sepárame en tu celular": native prompt on Chromium, steps on iOS, hidden otherwise. */
export function InstallCard({ className }: { className?: string }) {
  const { variant, mobile } = useInstall();
  const toast = useToast();
  const [hidden, setHidden] = useState(() => isDismissed());
  const [sheet, setSheet] = useState(false);
  if (hidden || variant === 'installed' || variant === 'none') return null;

  const install = async () => {
    if (variant !== 'prompt') return setSheet(true);
    const outcome = await installStore.prompt();
    if (outcome === 'dismissed') toast.show('Cuando quieras, la instalas desde el menú del navegador.');
  };

  return (
    <section aria-label="Instalar la app" className={cx('bg-white rounded-[24px] p-[18px] flex flex-wrap gap-x-[14px] gap-y-3 items-center', className)}>
      <AppIcon />
      <div className="flex flex-col gap-[2px] min-w-0 grow basis-[180px]">
        <span className="font-bold text-[16px]">{mobile ? 'Instala Sepárame en tu celular' : 'Instala Sepárame en este computador'}</span>
        <span className="text-[14px] text-muted leading-[1.4]">Ábrela como una app, con su ícono, y recibe avisos de tus citas.</span>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={() => {
            dismissInstall();
            setHidden(true);
          }}
          className="hit-44 h-9 px-3 rounded-full text-[14px] font-bold text-ink-2 hover:bg-surface"
        >
          Ahora no
        </button>
        <button type="button" onClick={() => void install()} className={cx(ui.btnPrimary, 'h-11')}>
          Instalar
        </button>
      </div>
      <IosInstallSheet open={sheet} onClose={() => setSheet(false)} otherBrowser={variant === 'ios-other'} />
    </section>
  );
}

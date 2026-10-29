import { useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { LogoResponse } from '@shared/api';
import { api, errorMessage } from '../lib/api';
import { ImageError, LOGO_ACCEPT, shrinkImage } from '../lib/image';
import { cx } from './ui/cx';
import { ui } from './ui/styles';
import { useToast } from './ui/Toast';

interface Props {
  /** Current logo (site path) or none. */
  logo?: string;
  /** Shown in the circle when there is no logo, as on the booking page. */
  initials: string;
  /** `PUT`/`DELETE` path (apiPaths.profileLogo() / teamLogo()). */
  path: string;
  /** Whose logo (team member) — the `x-separame-pro` header; null = the owner. */
  actingProId?: string | null;
  title: string;
  hint: string;
  disabled?: boolean;
  onChanged: () => void;
}

/** «Logo o foto»: preview in the booking page's circle, upload (shrunk in the browser), change, remove. */
export function LogoPicker({ logo, initials, path, actingProId, title, hint, disabled, onChanged }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [preparing, setPreparing] = useState(false);
  const options = actingProId !== undefined ? { actingProId } : undefined;

  const upload = useMutation({
    mutationFn: (image: string) => api.put<LogoResponse>(path, { image }, options),
    onSuccess: () => {
      onChanged();
      toast.success('Listo. Tu página de citas se actualiza en unos segundos.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api.del<LogoResponse>(path, options),
    onSuccess: () => {
      onChanged();
      toast.success('Quitamos la imagen. Se ven las iniciales otra vez.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    try {
      upload.mutate(await shrinkImage(file));
    } catch (error) {
      toast.error(error instanceof ImageError ? error.message : 'No pudimos leer esa imagen.');
    } finally {
      setPreparing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  const busy = preparing || upload.isPending || remove.isPending;

  return (
    <div className="flex flex-wrap items-center gap-4">
      {logo ? (
        <img src={logo} alt="" width={64} height={64} className="w-16 h-16 rounded-full object-cover bg-white border-2 border-line shrink-0" />
      ) : (
        <span aria-hidden="true" className="w-16 h-16 rounded-full bg-accent text-ink font-display font-extrabold text-[24px] flex items-center justify-center shrink-0">
          {initials}
        </span>
      )}
      <div className="flex flex-col gap-2 min-w-0 flex-[1_1_180px]">
        <label htmlFor={inputId} className={ui.label}>
          {title}
        </label>
        <span className="text-[13px] text-muted leading-[1.4]">{hint}</span>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={LOGO_ACCEPT}
            disabled={disabled || busy}
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <button type="button" disabled={disabled || busy} onClick={() => inputRef.current?.click()} className={cx(ui.btnOutline, 'h-11 px-4')} aria-busy={busy}>
            {busy && !remove.isPending ? 'Subiendo…' : logo ? 'Cambiar imagen' : 'Subir imagen'}
          </button>
          {logo && (
            <button type="button" disabled={disabled || busy} onClick={() => remove.mutate()} className={cx(ui.linkBtn, 'min-h-11 px-2 text-[14px] underline underline-offset-2')}>
              Quitar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

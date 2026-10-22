import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type ProfileResponse, type UpdateProfileRequest } from '@shared/api';
import { downloadQr, QrTile } from '../../components/ShareQr';
import { cx } from '../../components/ui/cx';
import { CopyIcon, ExternalIcon, LockIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { api, ApiError, errorMessage } from '../../lib/api';
import { auth } from '../../lib/auth';
import { copyLink } from '../../lib/share';
import { linkLabel } from '../../lib/format';
import { usePro } from '../../lib/pro';
import { keys } from '../../lib/queries';
import { parseProfile, ProfileFields, type ProfileForm } from './ProfileFields';
import { SlugField, slugReady, useSlugCheck } from './SlugField';

/** Perfil público (no mockup — line A forms). */
export function ProfilePage() {
  const { profile, publicUrl, readOnly, me } = usePro();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<ProfileForm>({ ...profile, phone: profile.phone ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const check = useSlugCheck(form.slug, profile.slug);
  const host = linkLabel(publicUrl).split('/')[0] || 'separame.app';

  const save = useMutation({
    mutationFn: (body: UpdateProfileRequest) => api.put<ProfileResponse>(apiPaths.profile(), body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.me });
      toast.success('Tu perfil quedó guardado. Tu página se actualiza en unos segundos.');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) setErrors(error.fields);
      toast.error(errorMessage(error));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = parseProfile(form);
    if ('errors' in result) return setErrors(result.errors);
    if (!slugReady(check.status)) return setErrors({ slug: check.message ?? 'Espera a que revisemos tu enlace.' });
    setErrors({});
    save.mutate(result.data);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className={ui.h1}>Perfil público</h1>
        <div className="text-[15px] text-muted">Así te ven tus clientes en tu página de reservas.</div>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <form onSubmit={submit} noValidate className={cx(ui.card, 'flex-[999_1_460px] min-w-0 gap-5')}>
          <h2 className={ui.h2}>Tus datos</h2>
          <ProfileFields value={form} onChange={setForm} errors={errors} disabled={readOnly} />
          <SlugField value={form.slug} onChange={(slug) => setForm({ ...form, slug })} check={check} host={host} disabled={readOnly} />
          {errors.slug && check.status !== 'taken' && check.status !== 'invalid' && <div className="text-[13px] font-semibold text-warn-ink -mt-3">{errors.slug}</div>}
          {form.slug !== profile.slug && slugReady(check.status) && (
            <div className="bg-accent-soft rounded-[14px] px-4 py-3 text-[13px] leading-[1.45] -mt-2">
              Ojo: tu enlace anterior deja de funcionar. Actualízalo en tu WhatsApp, Instagram y donde lo hayas compartido.
            </div>
          )}
          <div>
            <button type="submit" disabled={readOnly || save.isPending} className={cx(ui.btnPrimary, 'h-12 px-6 text-[15px]', readOnly && ui.btnLocked)}>
              {readOnly && <LockIcon size={16} />}
              {save.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>

        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-5">
          <section className={cx(ui.card, 'gap-[14px]')}>
            <h2 className={ui.h2sm}>Tu enlace</h2>
            <div className="font-bold text-[15px] text-primary [overflow-wrap:anywhere]">{linkLabel(publicUrl)}</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={ui.btnOutline} onClick={async () => ((await copyLink(publicUrl, 'booking_link')) ? toast.success('Enlace copiado.') : toast.error('No pudimos copiar el enlace.'))}>
                <CopyIcon size={16} /> Copiar enlace
              </button>
              <a href={publicUrl} target="_blank" rel="noreferrer" className={cx(ui.btnOutline, 'no-underline text-ink hover:text-ink')}>
                <ExternalIcon size={16} /> Abrir mi página
              </a>
            </div>
            <div className="flex gap-[14px] items-center pt-1">
              <QrTile url={publicUrl} />
              <div className="flex flex-col gap-2 text-[14px] text-ink-2 leading-[1.4]">
                Imprímelo o ponlo en tus redes: lleva directo a tu agenda.
                <button type="button" className={cx(ui.linkBtn, 'self-start hit-44')} onClick={() => void downloadQr(publicUrl, profile.slug)}>
                  Descargar QR
                </button>
              </div>
            </div>
          </section>
          <section className={cx(ui.card, 'gap-3')}>
            <h2 className={ui.h2sm}>Tu cuenta</h2>
            <div className="text-[14px] text-ink-2 [overflow-wrap:anywhere]">
              Entras con <strong className="text-ink">{me.email}</strong>
            </div>
            <div>
              <button type="button" className={ui.btnOutline} onClick={() => void auth.signOut()}>
                Cerrar sesión
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

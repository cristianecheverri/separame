import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { apiPaths, type ProfileResponse, type UpsertServiceRequest } from '@shared/api';
import { TRIAL_DAYS } from '@shared/subscription';
import { DEFAULT_RULES, DEFAULT_SCHEDULE } from '@shared/availability';
import { formatDuration } from '@shared/format';
import { onboardingSchema, upsertServiceSchema } from '@shared/schemas';
import { clearReferralCode, storedReferralCode } from '../referrals/storedCode';
import { slugify } from '@shared/slug';
import { Wordmark } from '../../components/layout/Wordmark';
import { downloadQr, QrTile } from '../../components/ShareQr';
import { cx } from '../../components/ui/cx';
import { Field } from '../../components/ui/Field';
import { CloseIcon, CopyIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { auth } from '../../lib/auth';
import { copyText } from '../../lib/clipboard';
import { formatCopInput, linkLabel, parseCopInput } from '../../lib/format';
import { keys, useMe } from '../../lib/queries';
import { session } from '../../lib/storage';
import { toDraft, toSchedule, scheduleErrors } from '../availability/scheduleModel';
import { WeeklyScheduleEditor } from '../availability/WeeklyScheduleEditor';
import { emptyProfile, ProfileFields, type ProfileForm } from '../profile/ProfileFields';
import { SlugField, slugReady, useSlugCheck } from '../profile/SlugField';
import { durationProblem } from '../services/durations';
import { DurationPicker } from '../services/DurationPicker';
import { listPriceText } from '../services/PriceDisplayField';

const STEP_KEY = 'separame:onboarding-step';
const TOTAL = 5;
const STEPS = [
  ['Tu perfil', 'Así te verán tus clientes cuando reserven.'],
  ['Tu enlace', 'Es la dirección de tu página de reservas. Puedes cambiarla después.'],
  ['Tus servicios', 'Agrega al menos uno. El precio es solo de referencia: no se cobra en línea.'],
  ['Tu horario', 'Empezamos con un horario típico. Ajústalo ahora o después en «Disponibilidad».'],
  ['¡Listo!', 'Tu agenda ya está en línea. Compártela para que te empiecen a reservar.'],
] as const;

const profileOnly = onboardingSchema.omit({ slug: true });

function Shell({ step, children }: { step: number; children: ReactNode }) {
  const [title, subtitle] = STEPS[step - 1];
  return (
    <div className="min-h-dvh bg-surface flex flex-col items-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-[640px] flex items-center justify-between gap-4 mb-6">
        <Wordmark size={26} className="text-primary" />
        <button type="button" onClick={() => void auth.signOut()} className="min-h-11 text-[14px] font-semibold text-ink-2 hover:text-ink">
          Cerrar sesión
        </button>
      </div>
      <main className="w-full max-w-[640px] bg-white rounded-[24px] p-5 sm:p-8 flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex gap-[6px]" aria-hidden="true">
            {Array.from({ length: TOTAL }, (_, i) => (
              <span key={i} className={cx('h-[6px] grow rounded-full', i < step ? 'bg-primary' : 'bg-line')} />
            ))}
          </div>
          <div className="text-[13px] font-bold text-muted">
            Paso {step} de {TOTAL}
          </div>
          <h1 className="m-0 font-display font-extrabold text-[28px] sm:text-[32px] leading-[1.15] tracking-[-0.8px]">{title}</h1>
          <p className="m-0 text-[15px] text-muted leading-[1.45]">{subtitle}</p>
        </div>
        {children}
      </main>
    </div>
  );
}

function Actions({ busy, onBack, label = 'Continuar' }: { busy?: boolean; onBack?: () => void; label?: string }) {
  return (
    <div className="flex flex-wrap gap-[10px] pt-2">
      <button type="submit" disabled={busy} className="h-[52px] px-8 rounded-full bg-primary text-white font-bold text-[16px] hover:bg-primary-dark grow sm:grow-0 disabled:opacity-70">
        {busy ? 'Un momento…' : label}
      </button>
      {onBack && (
        <button type="button" onClick={onBack} className="h-[52px] px-6 rounded-full border-2 border-line-strong bg-white font-bold text-[16px] grow sm:grow-0">
          Atrás
        </button>
      )}
    </div>
  );
}

interface DraftService {
  name: string;
  durationMin: number;
  priceCop: number | null;
}

export function OnboardingPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(() => Number(session.get(STEP_KEY)) || 1);
  const [form, setForm] = useState<ProfileForm>(emptyProfile);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [services, setServices] = useState<DraftService[]>([]);
  const [svc, setSvc] = useState({ name: '', durationMin: 30, price: '' });
  const [schedule, setSchedule] = useState(() => toDraft(DEFAULT_SCHEDULE));
  const [publicUrl, setPublicUrl] = useState<string | null>(me?.publicUrl ?? null);
  const check = useSlugCheck(form.slug, null);

  const go = (next: number) => {
    setStep(next);
    if (next >= 3) session.set(STEP_KEY, String(next));
    window.scrollTo({ top: 0 });
  };

  if (me?.profile && !session.get(STEP_KEY)) return <Navigate to="/" replace />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitProfile = (e: FormEvent) => {
    e.preventDefault();
    const parsed = profileOnly.safeParse({ ...form, phone: form.phone.trim() ? form.phone : null });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      return setErrors(next);
    }
    setErrors({});
    if (!form.slug) setForm({ ...form, slug: slugify(form.name) });
    go(2);
  };

  const submitSlug = (e: FormEvent) => {
    e.preventDefault();
    if (!slugReady(check.status)) return setErrors({ slug: check.message ?? 'Espera a que revisemos tu enlace.' });
    const parsed = onboardingSchema.safeParse({ ...form, phone: form.phone.trim() ? form.phone : null });
    if (!parsed.success) return setErrors({ slug: parsed.error.issues[0]?.message ?? 'Revisa tus datos.' });
    void run(async () => {
      // Referral attribution (features/referrals/storedCode.ts): the server ignores bad or own codes.
      const res = await api.post<ProfileResponse>(apiPaths.onboarding(), { ...parsed.data, referralCode: storedReferralCode() ?? undefined });
      clearReferralCode();
      session.set(STEP_KEY, '3');
      setPublicUrl(res.publicUrl);
      await qc.invalidateQueries({ queryKey: keys.me });
      go(3);
    });
  };

  const addService = () => {
    const durationError = durationProblem(svc.durationMin);
    if (durationError) return setErrors({ service: durationError });
    const parsed = upsertServiceSchema.safeParse({ name: svc.name, durationMin: svc.durationMin, priceCop: parseCopInput(svc.price), description: '', visible: true });
    if (!parsed.success) return setErrors({ service: parsed.error.issues[0]?.message ?? 'Revisa el servicio.' });
    setErrors({});
    setServices([...services, { name: parsed.data.name, durationMin: parsed.data.durationMin, priceCop: parsed.data.priceCop }]);
    setSvc({ name: '', durationMin: 30, price: '' });
  };

  const submitServices = (e: FormEvent) => {
    e.preventDefault();
    const durationError = svc.name.trim() ? durationProblem(svc.durationMin) : null;
    if (durationError) return setErrors({ service: durationError });
    const pending = svc.name.trim() ? [...services, { name: svc.name.trim(), durationMin: svc.durationMin, priceCop: parseCopInput(svc.price) }] : services;
    if (pending.length === 0) return setErrors({ service: 'Agrega al menos un servicio.' });
    void run(async () => {
      for (const s of pending) {
        const body: UpsertServiceRequest = { ...s, description: '', visible: true };
        await api.post(apiPaths.services(), body);
      }
      setServices([]);
      setSvc({ name: '', durationMin: 30, price: '' });
      void qc.invalidateQueries({ queryKey: keys.services });
      go(4);
    });
  };

  const submitSchedule = (e: FormEvent) => {
    e.preventDefault();
    if (Object.keys(scheduleErrors(schedule)).length) return setErrors({ schedule: 'Revisa el horario: hay franjas que se cruzan.' });
    void run(async () => {
      await api.put(apiPaths.availability(), { schedule: toSchedule(schedule), rules: DEFAULT_RULES });
      void qc.invalidateQueries({ queryKey: keys.availability });
      go(5);
    });
  };

  const finish = () => {
    session.remove(STEP_KEY);
    navigate('/', { replace: true });
  };

  const url = publicUrl ?? me?.publicUrl ?? '';
  const host = linkLabel(url).split('/')[0] || 'separame.app';

  return (
    <Shell step={step}>
      {step === 1 && (
        <form onSubmit={submitProfile} className="flex flex-col gap-5" noValidate>
          <ProfileFields value={form} onChange={setForm} errors={errors} />
          <Actions />
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitSlug} className="flex flex-col gap-5" noValidate>
          <SlugField value={form.slug} onChange={(slug) => setForm({ ...form, slug })} check={check} host={host} />
          {errors.slug && check.status !== 'taken' && check.status !== 'invalid' && <div className="text-[13px] font-semibold text-warn-ink -mt-3">{errors.slug}</div>}
          <div className="bg-surface rounded-[16px] p-4 text-[14px] text-ink-2 leading-[1.45]">
            Así se verá: <strong className="text-ink [overflow-wrap:anywhere]">{host}/{form.slug || 'tu-nombre'}</strong>. Úsalo en tu WhatsApp, Instagram y tarjetas.
          </div>
          <Actions busy={busy} onBack={() => go(1)} label="Crear mi página" />
        </form>
      )}

      {step === 3 && (
        <form onSubmit={submitServices} className="flex flex-col gap-5" noValidate>
          {services.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {services.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex items-center gap-3 bg-surface rounded-[16px] py-2 pl-3 pr-1">
                  <span className="w-11 h-11 rounded-[14px] bg-accent-soft flex flex-col items-center justify-center shrink-0 leading-none">
                    <span className="font-display font-extrabold text-[15px]">{s.durationMin}</span>
                    <span className="text-[10px] font-semibold text-ink-2">min</span>
                  </span>
                  <span className="flex flex-col grow min-w-0">
                    <span className="font-bold text-[15px]">{s.name}</span>
                    <span className="text-[13px] text-muted">
                      {formatDuration(s.durationMin)} · {listPriceText(s)}
                    </span>
                  </span>
                  <button type="button" aria-label={`Quitar ${s.name}`} onClick={() => setServices(services.filter((_, j) => j !== i))} className={ui.iconBtn}>
                    <CloseIcon size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-[18px] border-2 border-dashed border-line-strong p-4 flex flex-col gap-4">
            <Field label="Nombre del servicio">{(p) => <input {...p} className={ui.input} value={svc.name} onChange={(e) => setSvc({ ...svc, name: e.target.value })} placeholder="Nombre del servicio" />}</Field>
            <DurationPicker key={services.length} value={svc.durationMin} onChange={(durationMin) => setSvc({ ...svc, durationMin })} />
            <Field label="Precio de referencia" help="Déjalo vacío para mostrar «Sin costo».">
              {(p) => (
                <div className="flex gap-2">
                  <div className={ui.prefix} aria-hidden="true">
                    COP $
                  </div>
                  <input {...p} inputMode="numeric" className={cx(ui.input, 'grow')} value={svc.price} onChange={(e) => setSvc({ ...svc, price: formatCopInput(e.target.value) })} placeholder="Sin costo" />
                </div>
              )}
            </Field>
            <button type="button" onClick={addService} className={cx(ui.btnOutline, 'self-start')}>
              + Agregar servicio
            </button>
          </div>
          {errors.service && (
            <div className="text-[13px] font-semibold text-warn-ink" role="alert">
              {errors.service}
            </div>
          )}
          <Actions busy={busy} />
        </form>
      )}

      {step === 4 && (
        <form onSubmit={submitSchedule} className="flex flex-col gap-3" noValidate>
          <div>
            <WeeklyScheduleEditor value={schedule} onChange={setSchedule} errors={scheduleErrors(schedule)} />
          </div>
          {errors.schedule && <div className="text-[13px] font-semibold text-warn-ink">{errors.schedule}</div>}
          <Actions busy={busy} />
        </form>
      )}

      {step === 5 && (
        <div className="flex flex-col gap-5">
          <div className="bg-primary-soft rounded-[18px] p-4 flex flex-wrap gap-4 items-center">
            <QrTile url={url} className="bg-white" />
            <div className="flex flex-col gap-2 min-w-0 grow">
              <span className="font-bold text-[17px] text-primary [overflow-wrap:anywhere]">{linkLabel(url)}</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={ui.btnOutline} onClick={async () => ((await copyText(url)) ? toast.success('Enlace copiado.') : toast.error('No pudimos copiar el enlace.'))}>
                  <CopyIcon size={16} /> Copiar enlace
                </button>
                <button type="button" className={ui.btnOutline} onClick={() => void downloadQr(url, form.slug || me?.profile?.slug || 'separame')}>
                  Descargar QR
                </button>
              </div>
            </div>
          </div>
          <div className="text-[14px] text-ink-2 leading-[1.45]">Tienes {TRIAL_DAYS} días de prueba gratis con todo funcionando. Después eliges un plan desde «Suscripción».</div>
          <div>
            <button type="button" onClick={finish} className="h-[52px] px-8 rounded-full bg-primary text-white font-bold text-[16px] hover:bg-primary-dark w-full sm:w-auto">
              Ir a mi agenda
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

import type { OnboardingRequest } from '@shared/api';
import { onboardingSchema } from '@shared/schemas';
import { Field } from '../../components/ui/Field';
import { ui } from '../../components/ui/styles';

export type ProfileForm = Omit<OnboardingRequest, 'phone'> & { phone: string };

export const emptyProfile: ProfileForm = { name: '', title: '', city: '', neighborhood: '', address: '', phone: '', slug: '' };

/** Validates with the shared schema; returns the request or per-field Spanish errors. */
export function parseProfile(form: ProfileForm): { data: OnboardingRequest } | { errors: Record<string, string> } {
  const parsed = onboardingSchema.safeParse({ ...form, phone: form.phone.trim() ? form.phone : null });
  if (parsed.success) return { data: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
  return { errors };
}

interface Props {
  value: ProfileForm;
  onChange: (next: ProfileForm) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}

export function ProfileFields({ value, onChange, errors, disabled }: Props) {
  const set = (key: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Tu nombre, como te verán tus clientes" error={errors.name} className="sm:col-span-2">
        {(p) => <input {...p} className={ui.input} value={value.name} onChange={set('name')} placeholder="Tu nombre y título" autoComplete="name" disabled={disabled} />}
      </Field>
      <Field label="Profesión o especialidad" error={errors.title}>
        {(p) => <input {...p} className={ui.input} value={value.title} onChange={set('title')} placeholder="Tu profesión o especialidad" disabled={disabled} />}
      </Field>
      <Field label="Ciudad" error={errors.city}>
        {(p) => <input {...p} className={ui.input} value={value.city} onChange={set('city')} placeholder="Ciudad donde atiendes" autoComplete="address-level2" disabled={disabled} />}
      </Field>
      <Field label="Barrio (opcional)" error={errors.neighborhood}>
        {(p) => <input {...p} className={ui.input} value={value.neighborhood} onChange={set('neighborhood')} placeholder="Barrio del consultorio" disabled={disabled} />}
      </Field>
      <Field label="Celular (opcional)" error={errors.phone} help="Aparece si tu agenda no está disponible.">
        {(p) => <input {...p} className={ui.input} value={value.phone} onChange={set('phone')} inputMode="tel" placeholder="Número de celular" autoComplete="tel-national" disabled={disabled} />}
      </Field>
      <Field label="Dirección (opcional)" error={errors.address} help="Déjala vacía si atiendes en línea." className="sm:col-span-2">
        {(p) => <input {...p} className={ui.input} value={value.address} onChange={set('address')} placeholder="Dirección del consultorio" autoComplete="street-address" disabled={disabled} />}
      </Field>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { emailSchema } from '@shared/schemas';
import { track } from '../../lib/analytics';
import { auth } from '../../lib/auth';
import { authErrorMessage, passwordOk, type SignInStep } from '../../lib/authClient';
import { AuthHeading, AuthLayout, CodeInput, EmailField, FormError, FormNotice, PasswordField, ResendButton, SubmitButton } from './parts';
import { TRIAL_DAYS } from '@shared/subscription';
import { InvitedBy } from '../referrals/InvitedBy';
import { captureReferralCode } from '../referrals/storedCode';

const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

/** Code step shared by sign-up and "unconfirmed account" sign-in. */
function ConfirmEmailStep({ email, onConfirmed, onBack }: { email: string; onConfirmed: (autoSignIn: boolean) => Promise<void>; onBack: () => void }) {
  const [code, setCode] = useState('');
  const { busy, error, run } = useBusy();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => onConfirmed(await auth.client.confirmSignUp(email, code)));
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <AuthHeading title="Confirma tu correo">
        Te enviamos un código de 6 dígitos a <strong className="text-ink">{email}</strong>. Revisa también la carpeta de spam.
      </AuthHeading>
      <CodeInput value={code} onChange={setCode} />
      <FormError message={error} />
      <SubmitButton busy={busy} disabled={code.length !== 6}>
        Confirmar y entrar
      </SubmitButton>
      <div className="flex flex-wrap justify-between gap-2">
        <ResendButton onResend={() => auth.client.resendSignUpCode(email)} />
        <button type="button" onClick={onBack} className="min-h-11 font-bold text-[14px] text-ink-2 hover:text-ink">
          Cambiar correo
        </button>
      </div>
    </form>
  );
}

function NewPasswordStep() {
  const [password, setPassword] = useState('');
  const { busy, error, setError, run } = useBusy();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!passwordOk(password)) return setError('La contraseña no cumple las reglas.');
    void run(async () => {
      const step = await auth.client.completeNewPassword(password);
      if (step !== 'done') throw Object.assign(new Error(step), { name: 'UnsupportedStep' });
      await auth.refresh();
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <AuthHeading title="Crea tu contraseña">Es tu primera vez entrando. Elige una contraseña nueva para tu cuenta.</AuthHeading>
      <PasswordField label="Contraseña nueva" value={password} onChange={setPassword} autoComplete="new-password" showRules />
      <FormError message={error} />
      <SubmitButton busy={busy}>Guardar y entrar</SubmitButton>
    </form>
  );
}

export function LoginPage() {
  const location = useLocation();
  const navState = (location.state ?? {}) as { reset?: boolean; email?: string };
  const [email, setEmail] = useState(navState.email ?? '');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'credentials' | SignInStep>('credentials');
  const { busy, error, setError, run } = useBusy();

  const signIn = async () => {
    const next = await auth.client.signIn(normalizeEmail(email), password);
    if (next === 'done') {
      track('login', { method: 'email' });
      return auth.refresh();
    }
    if (next === 'confirmSignUp') await auth.client.resendSignUpCode(normalizeEmail(email));
    if (next === 'resetPassword') throw Object.assign(new Error('reset'), { name: 'PasswordResetRequiredException' });
    setStep(next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!emailSchema.safeParse(email).success) return setError('Escribe un correo válido.');
    if (!password) return setError('Escribe tu contraseña.');
    void run(signIn);
  };

  if (step === 'newPassword') {
    return (
      <AuthLayout>
        <NewPasswordStep />
      </AuthLayout>
    );
  }
  if (step === 'confirmSignUp') {
    return (
      <AuthLayout>
        <ConfirmEmailStep email={normalizeEmail(email)} onBack={() => setStep('credentials')} onConfirmed={signIn} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      footer={
        <>
          ¿Nuevo en Sepárame? <Link to="/signup" className="font-bold hit-44 inline-block">Crea tu cuenta</Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <AuthHeading title="Entra a tu agenda">Con tu correo y tu contraseña.</AuthHeading>
        {navState.reset && <FormNotice>Listo, ya puedes entrar con tu contraseña nueva.</FormNotice>}
        <EmailField value={email} onChange={setEmail} autoFocus={!navState.email} />
        <PasswordField
          label="Contraseña"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          labelAside={
            <Link to="/forgot-password" state={{ email }} className="text-[14px] font-bold min-h-11 flex items-center">
              ¿Olvidaste tu contraseña?
            </Link>
          }
        />
        <FormError message={error} />
        <SubmitButton busy={busy}>Entrar</SubmitButton>
      </form>
    </AuthLayout>
  );
}

export function SignupPage() {
  const location = useLocation();
  // /r/<code> lands here as ?ref=<code>: kept in localStorage for onboarding and sent to Cognito.
  const [referralCode] = useState(() => captureReferralCode(location.search));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const { busy, error, setError, run } = useBusy();
  const navigate = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!emailSchema.safeParse(email).success) return setError('Escribe un correo válido.');
    if (!passwordOk(password)) return setError('La contraseña no cumple las reglas.');
    void run(async () => {
      const result = await auth.client.signUp(normalizeEmail(email), password, { referralCode });
      if (result === 'confirm') setConfirming(true);
      else await finish(false);
    });
  };

  /** Runs once the account exists and its email is confirmed. */
  const finish = async (canAutoSignIn: boolean) => {
    track('sign_up', { method: 'email', referred: referralCode ? 'yes' : 'no' });
    const step = canAutoSignIn ? await auth.client.autoSignIn() : await auth.client.signIn(normalizeEmail(email), password);
    if (step !== 'done') {
      navigate('/login', { state: { email: normalizeEmail(email) } });
      return;
    }
    await auth.refresh();
  };

  if (confirming) {
    return (
      <AuthLayout>
        <ConfirmEmailStep email={normalizeEmail(email)} onBack={() => setConfirming(false)} onConfirmed={finish} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      footer={
        <>
          ¿Ya tienes cuenta? <Link to="/login" className="font-bold hit-44 inline-block">Entra</Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <InvitedBy code={referralCode} />
        <AuthHeading title="Crea tu cuenta">{TRIAL_DAYS} días gratis. Sin tarjeta.</AuthHeading>
        <EmailField value={email} onChange={setEmail} autoFocus />
        <PasswordField label="Contraseña" value={password} onChange={setPassword} autoComplete="new-password" showRules />
        <FormError message={error} />
        <SubmitButton busy={busy}>Crear cuenta</SubmitButton>
        <p className="m-0 text-[12px] text-muted leading-[1.45]">
          Al crear tu cuenta aceptas los términos del servicio y la política de tratamiento de datos (Ley 1581 de 2012).
        </p>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const location = useLocation();
  const [email, setEmail] = useState(((location.state ?? {}) as { email?: string }).email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, setError, run } = useBusy();
  const navigate = useNavigate();

  const requestCode = (e: FormEvent) => {
    e.preventDefault();
    if (!emailSchema.safeParse(email).success) return setError('Escribe un correo válido.');
    void run(async () => {
      await auth.client.resetPassword(normalizeEmail(email));
      setSent(true);
    });
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setError('Escribe el código de 6 dígitos.');
    if (!passwordOk(password)) return setError('La contraseña no cumple las reglas.');
    void run(async () => {
      await auth.client.confirmResetPassword(normalizeEmail(email), code, password);
      navigate('/login', { state: { reset: true, email: normalizeEmail(email) } });
    });
  };

  return (
    <AuthLayout
      footer={
        <Link to="/login" className="font-bold hit-44 inline-block">
          Volver a entrar
        </Link>
      }
    >
      {!sent ? (
        <form onSubmit={requestCode} className="flex flex-col gap-5" noValidate>
          <AuthHeading title="Recupera tu contraseña">Te enviamos un código a tu correo para que crees una nueva.</AuthHeading>
          <EmailField value={email} onChange={setEmail} autoFocus />
          <FormError message={error} />
          <SubmitButton busy={busy}>Enviarme el código</SubmitButton>
        </form>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-5" noValidate>
          <AuthHeading title="Crea una contraseña nueva">
            Si tu correo está registrado, te enviamos un código a <strong className="text-ink">{normalizeEmail(email)}</strong>.
          </AuthHeading>
          <CodeInput value={code} onChange={setCode} />
          <PasswordField label="Contraseña nueva" value={password} onChange={setPassword} autoComplete="new-password" showRules />
          <FormError message={error} />
          <SubmitButton busy={busy}>Guardar contraseña</SubmitButton>
          <ResendButton onResend={() => auth.client.resetPassword(normalizeEmail(email))} />
        </form>
      )}
    </AuthLayout>
  );
}

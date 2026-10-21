import { Wordmark } from '../components/layout/Wordmark';

/** Full-screen loading state while the session or /me loads. */
export function Splash() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface text-primary" aria-busy="true" aria-label="Cargando">
      <Wordmark size={30} className="animate-pulse" />
    </div>
  );
}

export function FatalError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface px-4">
      <div className="bg-white rounded-[24px] p-7 max-w-[420px] w-full flex flex-col gap-4 items-start">
        <Wordmark size={26} className="text-primary" />
        <h1 className="m-0 font-display font-extrabold text-[24px] leading-[1.2]">Algo no salió bien</h1>
        <p className="m-0 text-[15px] text-ink-2 leading-[1.45]">{message}</p>
        <button type="button" onClick={onRetry ?? (() => window.location.reload())} className="h-12 px-6 rounded-full bg-primary text-white font-bold text-[15px] hover:bg-primary-dark">
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}

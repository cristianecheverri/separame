/** /w/<token>: one tap from the offer email takes the client off the waitlist. */
import { useEffect, useState } from 'preact/hooks';
import type { LeaveWaitlistResponse } from '@shared/api';
import { Check } from '../components/icons';
import { Frame, LegalLinks, PageScroll, Wordmark } from '../components/ui';
import { MissingScreen } from '../booking/Unavailable';
import { ApiError, errorMessage, type ApiClient } from '../lib/api';

type State = 'loading' | 'done' | 'not_found' | 'error';

export function LeaveWaitlist({ token, api }: { token: string; api: ApiClient }) {
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');
  const [pro, setPro] = useState<LeaveWaitlistResponse['pro'] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .leaveWaitlist(token)
      .then((res) => {
        if (cancelled) return;
        setPro(res?.pro ?? null);
        setState('done');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.code === 'not_found') return setState('not_found');
        setMessage(errorMessage(error));
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [api, token]);

  if (state === 'not_found') {
    return (
      <MissingScreen
        title="Este enlace no es válido"
        text="Puede que esté incompleto o que ya no estés en la lista de espera. No tienes que hacer nada más."
      />
    );
  }
  if (state === 'error') {
    return <MissingScreen title="No pudimos sacarte de la lista" text={message} actionLabel="Reintentar" actionHref={location.href} />;
  }

  return (
    <Frame label="Lista de espera">
      <PageScroll class="pt-7 px-5 pb-6 gap-[18px]">
        <Wordmark />
        {state === 'loading' ? (
          <>
            <div class="skeleton w-14 h-14 rounded-full mt-2" aria-hidden="true" />
            <div class="skeleton h-8 w-4/5 rounded-full" aria-hidden="true" />
            <span class="sr-only" role="status">Sacándote de la lista de espera…</span>
          </>
        ) : (
          <div class="flex flex-col gap-3.5 grow fade-in">
            <div class="w-14 h-14 rounded-full bg-accent flex items-center justify-center mt-2">
              <Check size={28} strokeWidth={2.6} stroke="#15241D" />
            </div>
            <h1 class="m-0 font-display font-extrabold text-[28px] leading-[1.1] tracking-[-0.6px]">Listo, ya no estás en la lista de espera.</h1>
            <p class="m-0 text-[15px] text-ink-2 leading-[1.45]">
              No te enviaremos más avisos de cupos. Si más adelante necesitas una cita, puedes separarla desde el enlace de tu profesional.
            </p>
            <div class="mt-auto flex flex-col gap-2 items-center">
              {pro ? (
                <a href={`/${encodeURIComponent(pro.slug)}`} class="font-bold text-[15px] text-center">
                  Separar una cita con {pro.name}
                </a>
              ) : (
                <a href="/" class="font-bold text-[15px]">Ir a sepárame.app</a>
              )}
              <LegalLinks />
            </div>
          </div>
        )}
      </PageScroll>
    </Frame>
  );
}

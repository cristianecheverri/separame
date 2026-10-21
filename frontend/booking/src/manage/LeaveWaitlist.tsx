/**
 * /w/<token>: the link in the offer emails. Leaving takes one tap on
 * "Sí, sácame de la lista" — never on page load, so link scanners that run
 * JavaScript can't take the client off the waitlist.
 */
import { useState } from 'preact/hooks';
import type { LeaveWaitlistResponse } from '@shared/api';
import { Bell, Check } from '../components/icons';
import { Frame, LegalLinks, Notice, PageScroll, PRIMARY_BUTTON, Wordmark } from '../components/ui';
import { MissingScreen } from '../booking/Unavailable';
import { ApiError, errorMessage, type ApiClient } from '../lib/api';

type State = 'ask' | 'leaving' | 'done' | 'not_found';

const H1 = 'm-0 font-display font-extrabold text-[28px] leading-[1.1] tracking-[-0.6px]';

export function LeaveWaitlist({ token, api }: { token: string; api: ApiClient }) {
  const [state, setState] = useState<State>('ask');
  const [error, setError] = useState<string | null>(null);
  const [pro, setPro] = useState<LeaveWaitlistResponse['pro'] | null>(null);

  const leave = async () => {
    if (state === 'leaving') return;
    setState('leaving');
    setError(null);
    try {
      const res = await api.leaveWaitlist(token);
      setPro(res?.pro ?? null);
      setState('done');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_found') return setState('not_found');
      setError(errorMessage(e));
      setState('ask');
    }
  };

  if (state === 'not_found') {
    return (
      <MissingScreen
        title="Este enlace no es válido"
        text="Puede que esté incompleto o que ya no estés en la lista de espera. No tienes que hacer nada más."
      />
    );
  }

  return (
    <Frame label="Lista de espera">
      <PageScroll class="pt-7 px-5 pb-6 gap-[18px]">
        <Wordmark />
        {state === 'done' ? (
          <div class="flex flex-col gap-3.5 grow fade-in">
            <div class="w-14 h-14 rounded-full bg-accent flex items-center justify-center mt-2">
              <Check size={28} strokeWidth={2.6} stroke="#15241D" />
            </div>
            <h1 class={H1} tabIndex={-1}>Listo, ya no estás en la lista de espera.</h1>
            <p class="m-0 text-[15px] text-ink-2 leading-[1.45]">
              No te enviaremos más avisos de cupos. Si más adelante necesitas una cita, puedes separarla desde el enlace de tu profesional.
            </p>
            <div class="mt-auto flex flex-col gap-2 items-center">
              {pro ? (
                <a href={`/${encodeURIComponent(pro.slug)}`} class="inline-flex items-center min-h-11 px-3 -my-[13px] font-bold text-[15px] text-center">
                  Separar una cita con {pro.name}
                </a>
              ) : (
                <a href="/" class="inline-flex items-center min-h-11 px-3 -my-[13px] font-bold text-[15px]">Ir a sepárame.app</a>
              )}
              <LegalLinks />
            </div>
          </div>
        ) : (
          <div class="flex flex-col gap-3.5 grow fade-in">
            <div class="w-14 h-14 rounded-[18px] bg-accent-soft flex items-center justify-center mt-2">
              <Bell size={28} stroke="#15241D" />
            </div>
            <h1 class={H1}>¿Quieres salir de la lista de espera?</h1>
            <p class="m-0 text-[15px] text-ink-2 leading-[1.45]">
              Si sales, no te enviaremos más avisos cuando se libere un cupo. Tus citas separadas no cambian.
            </p>
            {error && <Notice>{error}</Notice>}
            <div class="mt-auto flex flex-col gap-4 items-stretch">
              <button
                type="button"
                onClick={leave}
                aria-busy={state === 'leaving'}
                class={`${PRIMARY_BUTTON} ${state === 'leaving' ? 'opacity-80 cursor-progress' : ''}`}
              >
                {state === 'leaving' ? 'Sacándote de la lista…' : 'Sí, sácame de la lista'}
              </button>
              <LegalLinks />
            </div>
          </div>
        )}
      </PageScroll>
    </Frame>
  );
}

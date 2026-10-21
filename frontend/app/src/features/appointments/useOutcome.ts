import type { Appointment, AppointmentOutcome } from '@shared/types';
import { useToast } from '../../components/ui/Toast';
import { errorMessage } from '../../lib/api';
import { useSetOutcome } from './mutations';

/** Marks attendance optimistically and offers "Deshacer" in the toast. */
export function useOutcome() {
  const setOutcome = useSetOutcome();
  const toast = useToast();
  return (appointment: Appointment, outcome: AppointmentOutcome | null) => {
    const previous = appointment.outcome ?? null;
    setOutcome.mutate(
      { appointment, outcome },
      {
        onSuccess: () => {
          if (!outcome) return;
          const text = outcome === 'attended' ? `Marcaste que ${appointment.client.name} asistió.` : `Marcaste que ${appointment.client.name} no asistió.`;
          toast.show(text, 'success', {
            label: 'Deshacer',
            onClick: () => setOutcome.mutate({ appointment: { ...appointment, outcome: outcome }, outcome: previous }, { onError: (e) => toast.error(errorMessage(e)) }),
          });
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };
}

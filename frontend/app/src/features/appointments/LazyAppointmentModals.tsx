import { lazy, Suspense } from 'react';
import type { AppointmentModalState } from './AppointmentModals';

const Modals = lazy(() => import('./AppointmentModals').then((m) => ({ default: m.AppointmentModals })));

/** Loads the appointment modals (and zod) only when one is opened. */
export function LazyAppointmentModals({ state, onClose }: { state: AppointmentModalState; onClose: () => void }) {
  if (!state) return null;
  return (
    <Suspense fallback={null}>
      <Modals state={state} onClose={onClose} />
    </Suspense>
  );
}

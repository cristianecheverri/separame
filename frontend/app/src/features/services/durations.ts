/** Duration chips offered for a service (minutes). Any other 5–480 value goes through «Otra». */
export const DURATIONS = [15, 20, 30, 45, 50, 60, 90, 120, 180, 240];

export const MIN_DURATION = 5;
export const MAX_DURATION = 480;

/** Spanish problem with a duration in minutes, or null when it's valid (same rule as upsertServiceSchema). */
export function durationProblem(minutes: number): string | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'Escribe la duración en minutos.';
  if (!Number.isInteger(minutes) || minutes < MIN_DURATION || minutes > MAX_DURATION) return `La duración va de ${MIN_DURATION} a ${MAX_DURATION} minutos (8 horas).`;
  if (minutes % 5 !== 0) return 'La duración va en múltiplos de 5 minutos.';
  return null;
}

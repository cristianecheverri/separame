/**
 * The app's notion of "now". Production uses the real clock; mock mode pins it
 * to the mockups' day (Tue 20 Oct 2026, 9:25 a. m. Bogotá) so fixtures line up.
 */
let offsetMs = 0;

export function now(): Date {
  return new Date(Date.now() + offsetMs);
}

/** Pins `now()` to `instant` (time keeps flowing from there). Mock mode and tests only. */
export function pinClock(instant: string | null): void {
  offsetMs = instant ? new Date(instant).getTime() - Date.now() : 0;
}

/** Team plan copy helpers (Spanish UI text, tuteo). */
import type { TeamMemberView, TeamView } from '@shared/api';
import { DAY_SHORT, formatTime } from '@shared/format';
import type { WeeklySchedule } from '@shared/types';
import { firstName, plural } from '../../lib/format';

/** Selector chip: «Laura (tú)» for the owner, the first name for the others. */
export const memberChipLabel = (m: Pick<TeamMemberView, 'name' | 'isOwner'>) => (m.isOwner ? `${firstName(m.name)} (tú)` : firstName(m.name));

/** Additional professionals used and approved: «2 de 2 cupos adicionales usados». */
export function seatsText(team: Pick<TeamView, 'seats' | 'members'>): string {
  const used = Math.max(0, team.members.length - 1);
  return `${used} de ${plural(team.seats, 'cupo adicional', 'cupos adicionales')} ${team.seats === 1 ? 'usado' : 'usados'}`;
}

/** «3 profesionales · 2 de 2 cupos adicionales usados». */
export const teamSummary = (team: Pick<TeamView, 'seats' | 'members'>) => `${plural(team.members.length, 'profesional', 'profesionales')} · ${seatsText(team)}`;

const ORDER: (keyof WeeklySchedule)[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SHORT: Record<keyof WeeklySchedule, string> = {
  mon: DAY_SHORT[1], tue: DAY_SHORT[2], wed: DAY_SHORT[3], thu: DAY_SHORT[4], fri: DAY_SHORT[5], sat: DAY_SHORT[6], sun: DAY_SHORT[0],
};

function joinDays(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** «Lun a vie, 8:00 a. m. – 5:00 p. m.», «Mar y jue, 8:00 a. m. – 4:00 p. m.» or «Sin horario». */
export function scheduleSummary(schedule: WeeklySchedule): string {
  const open = ORDER.map((d, i) => ({ d, i, ranges: schedule[d] ?? [] })).filter((x) => x.ranges.length > 0);
  if (open.length === 0) return 'Sin horario';
  const consecutive = open.every((x, k) => k === 0 || x.i === open[k - 1].i + 1);
  const label = (d: keyof WeeklySchedule, lower: boolean) => (lower ? SHORT[d].toLowerCase() : SHORT[d]);
  const days = consecutive && open.length >= 3
    ? `${label(open[0].d, false)} a ${label(open[open.length - 1].d, true)}`
    : joinDays(open.map((x, k) => label(x.d, k > 0)));
  const ranges = open.flatMap((x) => x.ranges);
  const start = ranges.reduce((min, r) => (r.start < min ? r.start : min), ranges[0].start);
  const end = ranges.reduce((max, r) => (r.end > max ? r.end : max), ranges[0].end);
  return `${days}, ${formatTime(start)} – ${formatTime(end)}`;
}

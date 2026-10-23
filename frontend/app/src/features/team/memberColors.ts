/**
 * Team plan: each professional's color in the selector, the «Todos» tags and the
 * avatars, by position in the team (owner first). Every pair passes WCAG AA
 * for its text (contrast ≥ 4.5:1); the dot keeps an inset ring so light colors
 * still read on white.
 */
import type { TeamMemberView } from '@shared/api';

export interface MemberColor {
  bg: string;
  fg: string;
}

export const MEMBER_PALETTE: readonly MemberColor[] = [
  { bg: '#0B6E4F', fg: '#FFFFFF' },
  { bg: '#FFC93C', fg: '#15241D' },
  { bg: '#15241D', fg: '#FFFFFF' },
  { bg: '#B4451F', fg: '#FFFFFF' },
  { bg: '#2F5DA8', fg: '#FFFFFF' },
  { bg: '#7A3E8E', fg: '#FFFFFF' },
  { bg: '#F6B8A8', fg: '#15241D' },
];

export const memberColor = (index: number): MemberColor => MEMBER_PALETTE[((index % MEMBER_PALETTE.length) + MEMBER_PALETTE.length) % MEMBER_PALETTE.length];

/** proId → color, following the team's order. */
export function memberColors(members: Pick<TeamMemberView, 'proId'>[]): Map<string, MemberColor> {
  return new Map(members.map((m, i) => [m.proId, memberColor(i)]));
}

/** The «Todos» dot: a pie with every professional's color. */
export function allDotBackground(count: number): string {
  const n = Math.max(1, count);
  const stops = Array.from({ length: n }, (_, i) => `${memberColor(i).bg} ${(i * 100) / n}% ${((i + 1) * 100) / n}%`);
  return `conic-gradient(${stops.join(', ')})`;
}

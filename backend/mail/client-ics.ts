import { ROOT_DOMAIN, SITE_PATHS } from '../../shared/infra';
import type { Appointment, ProProfile } from '../../shared/types';
import { env } from '../lib/env';
import type { CalendarEvent } from './calendar-links';
import { buildIcs } from './ics';
import { whereText } from './templates/common';

/**
 * The client's calendar event and .ics file — the same content in the
 * confirmation/change emails (attachment) and behind the confirmation
 * screen's download link (GET /public/appointments/{token}/ics).
 */

/** The client's /c/<token> page. */
export const manageUrl = (token: string) => `${env.siteUrl()}${SITE_PATHS.manage}${token}`;

export function clientCalendarEvent(appt: Appointment, pro: ProProfile, manageLink: string): CalendarEvent {
  return {
    title: `${appt.serviceName} con ${pro.name}`,
    start: appt.start,
    end: appt.end,
    details: `Cita separada en Sepárame.\nPara cambiarla o cancelarla: ${manageLink}`,
    location: whereText(pro),
  };
}

export interface ClientIcsFile {
  filename: string;
  content: string;
}

export function clientIcsFile(appt: Appointment, pro: ProProfile, manageLink: string): ClientIcsFile {
  const event = clientCalendarEvent(appt, pro, manageLink);
  return {
    filename: `cita-${pro.slug}.ics`,
    content: buildIcs({
      uid: `${appt.id}@${ROOT_DOMAIN}`,
      start: appt.start,
      end: appt.end,
      summary: event.title,
      description: event.details,
      location: event.location,
      sequence: Math.floor(new Date(appt.updatedAt).getTime() / 1000),
      url: manageLink,
    }),
  };
}

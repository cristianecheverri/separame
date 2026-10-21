import { Link } from 'react-router';
import { DAY_NAMES } from '@shared/format';
import { addDays, jsWeekday, type ISODate } from '@shared/time';
import type { Appointment, BookingRules, WeeklySchedule } from '@shared/types';
import { downloadQr, QrTile } from '../../components/ShareQr';
import { cx } from '../../components/ui/cx';
import { BellIcon, CheckIcon, CloseIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';
import { Skeleton } from '../../components/ui/Skeleton';
import { activeAppointments, upcomingDays } from '../../lib/agenda';
import { formatWeekdayDay, plural } from '../../lib/format';
import { bogotaDate } from '@shared/time';

export function ShareCard({ url, slug }: { url: string; slug: string }) {
  return (
    <section className={cx(ui.card, 'gap-[14px]')}>
      <h2 className={ui.h2sm}>Comparte tu agenda</h2>
      <div className="flex gap-[14px] items-center">
        <QrTile url={url} />
        <div className="flex flex-col gap-2 text-[14px] text-ink-2 leading-[1.4]">
          Ponlo en tu WhatsApp, Instagram o en la puerta del consultorio.
          <button type="button" className={cx(ui.linkBtn, 'self-start hit-44 underline underline-offset-2')} onClick={() => void downloadQr(url, slug)}>
            Descargar QR
          </button>
        </div>
      </div>
    </section>
  );
}

interface UpcomingProps {
  today: ISODate;
  appointments: Appointment[] | undefined;
  schedule: WeeklySchedule | undefined;
  rules: BookingRules | undefined;
}

const pill = 'font-bold py-1 px-[10px] rounded-full whitespace-nowrap';

export function UpcomingCard({ today, appointments, schedule, rules }: UpcomingProps) {
  const days = appointments && schedule && rules ? upcomingDays(today, appointments, schedule, rules.closedOnHolidays) : null;
  return (
    <section className={cx(ui.card, 'gap-3')}>
      <h2 className={ui.h2sm}>Próximos días</h2>
      {!days ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <div className="text-[14px] text-muted">No tienes días de atención en las próximas semanas.</div>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-3">
          {days.map((d) => (
            <li key={d.date} className="flex justify-between items-center gap-3 text-[14px] py-[6px]">
              <span className="font-semibold">{formatWeekdayDay(d.date, today)}</span>
              {d.count === null ? (
                <span className={cx(pill, 'bg-accent-soft text-ink')} title={d.holidayName}>
                  Festivo
                </span>
              ) : (
                <span className={cx(pill, d.count ? 'bg-primary-soft text-primary' : 'bg-surface text-ink-2')}>{d.count ? plural(d.count, 'cita', 'citas') : 'Sin citas'}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "Mañana sale el recordatorio por correo a tus 5 pacientes del miércoles." */
export function ReminderNote({ today, appointments }: { today: ISODate; appointments: Appointment[] | undefined }) {
  if (!appointments) return null;
  const tomorrow = addDays(today, 1);
  const count = activeAppointments(appointments).filter((a) => bogotaDate(a.start) === tomorrow && a.client.email).length;
  const weekday = DAY_NAMES[jsWeekday(tomorrow)];
  const text =
    count === 0
      ? 'Los recordatorios salen solos por correo 24 horas antes de cada cita.'
      : count === 1
        ? `Mañana sale el recordatorio por correo a tu paciente del ${weekday}.`
        : `Mañana sale el recordatorio por correo a tus ${count} pacientes del ${weekday}.`;
  return (
    <section className="bg-accent-soft rounded-[24px] py-[18px] px-[18px] sm:px-[22px] flex gap-3 items-start text-[14px] leading-[1.45]">
      <BellIcon size={20} className="shrink-0 mt-[1px]" />
      <span>{text}</span>
    </section>
  );
}

const RULES: [boolean, string][] = [
  [true, 'Ver tus citas y los datos de tus clientes'],
  [true, 'Recordatorios de las citas ya agendadas'],
  [true, 'Tus clientes pueden cancelar desde su correo'],
  [false, 'Recibir reservas nuevas en tu página'],
  [false, 'Crear, mover o cancelar citas desde el panel'],
  [false, 'Cambiar servicios u horario'],
];

export function ReadOnlyChecklist() {
  return (
    <section className={cx(ui.card, 'gap-3')}>
      <h2 className={ui.h2sm}>Mientras renuevas</h2>
      <ul className="m-0 p-0 list-none flex flex-col gap-3">
        {RULES.map(([ok, text]) => (
          <li key={text} className="flex gap-[10px] items-start text-[14px] leading-[1.4]">
            <span className={cx('w-6 h-6 rounded-full flex items-center justify-center shrink-0', ok ? 'bg-primary text-white' : 'bg-surface text-ink-2')}>
              {ok ? <CheckIcon size={14} /> : <CloseIcon size={14} strokeWidth={3} />}
            </span>
            <span>
              <span className="sr-only">{ok ? 'Sí: ' : 'No: '}</span>
              {text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Compact link to "Tu calendario". */
export function CalendarSyncCard() {
  return (
    <section className={cx(ui.card, 'gap-2')}>
      <h2 className={ui.h2sm}>¿Ves tus citas en Google Calendar?</h2>
      <Link to="/calendar-sync" className="self-start font-bold text-[14px] underline underline-offset-2 min-h-11 inline-flex items-center">
        Sincroniza tu calendario →
      </Link>
    </section>
  );
}

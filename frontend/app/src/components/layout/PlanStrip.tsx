import { Link } from 'react-router';
import { formatDateNoYear } from '@shared/format';
import { bogotaDate } from '@shared/time';
import type { SubscriptionStatus } from '@shared/types';
import { endSentence } from '../../lib/format';
import { cx } from '../ui/cx';
import { ChevronRightIcon } from '../ui/icons';

/** Trial days left at which phones start showing the strip. */
const TRIAL_WARN_DAYS = 3;

function stripContent(sub: SubscriptionStatus): { text: string; cta: string; className: string } | null {
  if (sub.state === 'grace') {
    return { text: `Renueva antes del ${formatDateNoYear(bogotaDate(sub.graceUntil))}`, cta: 'Renovar', className: 'bg-warn-soft' };
  }
  if (sub.state === 'trial' && sub.daysLeft <= TRIAL_WARN_DAYS) {
    const text = sub.daysLeft <= 0 ? 'Hoy termina tu prueba gratis' : sub.daysLeft === 1 ? 'Te queda 1 día de prueba' : `Te quedan ${sub.daysLeft} días de prueba`;
    return { text, cta: 'Elegir plan', className: 'bg-accent' };
  }
  return null;
}

/**
 * Phones/tablets (< 1024 px): one-line plan notice at the top of the content, because the
 * sidebar's SubscriptionCard only lives in the "Más" sheet there. Grace, or trial with ≤ 3 days left.
 */
export function PlanStrip({ subscription }: { subscription: SubscriptionStatus }) {
  const content = stripContent(subscription);
  if (!content) return null;
  return (
    <Link
      to="/billing"
      aria-label={`${endSentence(content.text)} ${content.cta}`}
      className={cx(
        'lg:hidden -mb-2 min-h-11 rounded-[14px] px-4 py-2 flex items-center gap-3 text-ink hover:text-ink no-underline text-[14px] leading-[1.25]',
        content.className,
      )}
    >
      <span className="grow min-w-0 truncate font-semibold">{content.text}</span>
      <span className="shrink-0 inline-flex items-center gap-1 font-bold underline underline-offset-2">
        {content.cta}
        <ChevronRightIcon size={14} />
      </span>
    </Link>
  );
}

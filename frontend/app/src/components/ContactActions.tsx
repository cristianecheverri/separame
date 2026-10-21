import type { ClientContact } from '@shared/types';
import { cx } from './ui/cx';

const digits = (phone: string) => phone.replace(/\D/g, '').replace(/^57(?=\d{10}$)/, '');

export const telHref = (phone: string) => `tel:+57${digits(phone)}`;
export const whatsappHref = (phone: string) => `https://wa.me/57${digits(phone)}`;

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l1.4-4.2A8 8 0 1 1 8.6 19z" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

/**
 * Llamar / WhatsApp / Correo pill links for a client (only the ones it has data for).
 * `compact` (inside an `@container`) shows icon-only circles while that container is narrower than 380 px.
 */
export function ContactActions({ client, size = 'md', compact = false }: { client: Pick<ClientContact, 'name' | 'email' | 'phone'>; size?: 'sm' | 'md'; compact?: boolean }) {
  const phone = client.phone?.trim();
  const email = client.email?.trim();
  if (!phone && !email) return null;
  const cls = cx(
    'rounded-full border-2 border-line-strong bg-white text-ink hover:text-ink hover:border-ink-2 inline-flex items-center justify-center gap-2 font-bold no-underline transition-colors shrink-0',
    size === 'sm' ? 'h-9 px-3 text-[13px] hit-44' : 'h-[46px] px-[18px] text-[14px]',
    compact && (size === 'sm' ? 'w-9 px-0 gap-0 @min-[380px]:w-auto @min-[380px]:px-3 @min-[380px]:gap-2' : 'w-[46px] px-0 gap-0 @min-[380px]:w-auto @min-[380px]:px-[18px] @min-[380px]:gap-2'),
    '[&>svg]:shrink-0',
  );
  const label = (text: string) => <span className={compact ? 'sr-only @min-[380px]:not-sr-only' : undefined}>{text}</span>;
  return (
    <div className={cx('flex gap-2', compact ? 'flex-nowrap' : 'flex-wrap')}>
      {phone && (
        <>
          <a className={cls} href={telHref(phone)} aria-label={`Llamar a ${client.name}`}>
            <PhoneIcon /> {label('Llamar')}
          </a>
          <a className={cls} href={whatsappHref(phone)} target="_blank" rel="noreferrer" aria-label={`Escribir a ${client.name} por WhatsApp`}>
            <ChatIcon /> {label('WhatsApp')}
          </a>
        </>
      )}
      {email && (
        <a className={cls} href={`mailto:${email}`} aria-label={`Escribir un correo a ${client.name}`}>
          <MailIcon /> {label('Correo')}
        </a>
      )}
    </div>
  );
}

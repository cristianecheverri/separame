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

/** Llamar / WhatsApp / Correo pill links for a client. */
export function ContactActions({ client, size = 'md' }: { client: Pick<ClientContact, 'name' | 'email' | 'phone'>; size?: 'sm' | 'md' }) {
  const cls = cx(
    'rounded-full border-2 border-line-strong bg-white text-ink hover:text-ink hover:border-ink-2 inline-flex items-center gap-2 font-bold no-underline transition-colors',
    size === 'sm' ? 'h-9 px-3 text-[13px] hit-44' : 'h-[46px] px-[18px] text-[14px]',
  );
  return (
    <div className="flex flex-wrap gap-2">
      {client.phone && (
        <>
          <a className={cls} href={telHref(client.phone)} aria-label={`Llamar a ${client.name}`}>
            <PhoneIcon /> Llamar
          </a>
          <a className={cls} href={whatsappHref(client.phone)} target="_blank" rel="noreferrer" aria-label={`Escribir a ${client.name} por WhatsApp`}>
            <ChatIcon /> WhatsApp
          </a>
        </>
      )}
      {client.email && (
        <a className={cls} href={`mailto:${client.email}`} aria-label={`Escribir un correo a ${client.name}`}>
          <MailIcon /> Correo
        </a>
      )}
    </div>
  );
}

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatDateNoYear, initials } from '@shared/format';
import { bogotaDate } from '@shared/time';
import type { ClientRecord } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { CheckIcon, CloseIcon, PlusIcon, SearchIcon } from '../../components/ui/icons';
import { formatPhone, normalize, plural } from '../../lib/format';
import { useClients } from '../../lib/queries';

/** Letters typed before suggestions show up. */
const MIN_QUERY = 2;
const MAX_SUGGESTIONS = 4;

const digitsOf = (text: string) => text.replace(/\D/g, '');

/** The pro's clients whose name (or phone, when typing digits) matches, most recent first. */
export function matchClients(clients: ClientRecord[], query: string): ClientRecord[] {
  const term = normalize(query);
  if (term.length < MIN_QUERY) return [];
  const digits = digitsOf(query);
  return clients
    .filter((c) => normalize(c.name).includes(term) || (digits.length >= MIN_QUERY && digitsOf(c.phone).includes(digits)))
    .slice(0, MAX_SUGGESTIONS);
}

/** The name with the typed part in bold (accents and case ignored). */
function highlight(name: string, query: string): ReactNode {
  const term = normalize(query);
  const plain = normalize(name);
  const at = plain.indexOf(term);
  if (at < 0 || plain.length !== name.trim().toLowerCase().length) return name;
  const offset = name.length - name.trimStart().length;
  const from = at + offset;
  return (
    <>
      {name.slice(0, from)}
      <strong>{name.slice(from, from + term.length)}</strong>
      {name.slice(from + term.length)}
    </>
  );
}

/** "Cliente frecuente · 6 citas · última el 8 oct." */
export function clientSummary(c: ClientRecord): string {
  const count = c.totals.appointments;
  const parts = [count >= 2 ? 'Cliente frecuente' : 'Ya te reservó', plural(count, 'cita', 'citas')];
  if (c.lastAppointmentAt) parts.push(`última el ${formatDateNoYear(bogotaDate(c.lastAppointmentAt))}`);
  return parts.join(' · ');
}

interface Props {
  id: string;
  value: string;
  onChange: (name: string) => void;
  /** A client was picked from the suggestions: fill in their phone and email. */
  onPick: (client: ClientRecord) => void;
  onClear: () => void;
  picked: ClientRecord | null;
  invalid?: boolean;
  describedBy?: string;
  /** Don't suggest until the name is edited (it came prefilled). */
  startClosed?: boolean;
}

/**
 * "Nombre" in Nueva cita: type the name, or pick one of the pro's clients after 2 letters
 * (proposal MP-05). An ARIA combobox: ↑/↓ to move, Enter to pick, Esc to close the list.
 */
export function ClientNameField({ id, value, onChange, onPick, onClear, picked, invalid, describedBy, startClosed = false }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const clients = useClients('');
  const [closed, setClosed] = useState(startClosed);
  const [active, setActive] = useState(0);
  const suggestions = useMemo(() => (picked ? [] : matchClients(clients.data?.clients ?? [], value)), [clients.data, value, picked]);
  const open = !closed && suggestions.length > 0;
  /** Options: the matching clients, then "Cliente nuevo: «…»". */
  const optionCount = suggestions.length + 1;
  const optionId = (index: number) => `${listId}-${index}`;

  const choose = (index: number) => {
    if (index < suggestions.length) onPick(suggestions[index]);
    setClosed(true);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : optionCount - 1)) % optionCount);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setClosed(true);
    }
  };

  return (
    <>
      <div
        className={cx(
          'h-12 w-full min-w-0 rounded-[14px] border-2 bg-white px-[14px] flex items-center gap-[10px] transition-shadow',
          'border-line focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(11,110,79,0.15)]',
        )}
      >
        <SearchIcon className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? optionId(active) : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          autoCapitalize="words"
          placeholder="Busca o escribe el nombre"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setClosed(false);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="border-0 outline-none focus-visible:outline-none bg-transparent grow min-w-0 h-full text-[16px] text-ink"
        />
        {picked && (
          <button
            type="button"
            aria-label="Quitar cliente"
            onClick={() => {
              onClear();
              setClosed(false);
              inputRef.current?.focus();
            }}
            className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-ink-2 hover:bg-surface shrink-0"
          >
            <CloseIcon size={16} strokeWidth={2.2} />
          </button>
        )}
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label="Clientes que coinciden" className="m-0 mt-[2px] p-[6px] list-none rounded-[18px] border-2 border-line bg-white shadow-[0_10px_24px_rgba(21,36,29,0.10)] flex flex-col gap-[2px]">
          {suggestions.map((c, i) => (
            <li
              key={c.key}
              id={optionId(i)}
              role="option"
              aria-selected={active === i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              onMouseEnter={() => setActive(i)}
              className={cx('min-h-[52px] flex items-center gap-3 py-[6px] px-[10px] rounded-[12px] cursor-pointer', active === i ? 'bg-surface' : 'bg-transparent')}
            >
              <span aria-hidden="true" className="w-9 h-9 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-[13px] shrink-0">
                {initials(c.name)}
              </span>
              <span className="flex flex-col gap-[1px] min-w-0 grow">
                <span className="text-[15px] [overflow-wrap:anywhere]">{highlight(c.name, value)}</span>
                <span className="text-[13px] text-muted">
                  {[formatPhone(c.phone) || c.email, plural(c.totals.appointments, 'cita', 'citas')].filter(Boolean).join(' · ')}
                </span>
              </span>
            </li>
          ))}
          <li
            id={optionId(suggestions.length)}
            role="option"
            aria-selected={active === suggestions.length}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(suggestions.length)}
            onMouseEnter={() => setActive(suggestions.length)}
            className={cx(
              'border-t border-line mt-1 pt-1 min-h-12 flex items-center gap-3 py-[6px] px-[10px] rounded-b-[12px] cursor-pointer text-[14px] font-bold text-primary',
              active === suggestions.length && 'bg-surface',
            )}
          >
            <span aria-hidden="true" className="w-9 h-9 rounded-full border-2 border-dashed border-primary-line flex items-center justify-center shrink-0">
              <PlusIcon size={16} />
            </span>
            <span className="[overflow-wrap:anywhere]">Cliente nuevo: «{value.trim()}»</span>
          </li>
        </ul>
      )}
      {picked && (
        <div className="flex gap-2 items-center text-[13px] text-primary font-semibold">
          <CheckIcon size={16} strokeWidth={2.4} />
          {clientSummary(picked)}
        </div>
      )}
    </>
  );
}

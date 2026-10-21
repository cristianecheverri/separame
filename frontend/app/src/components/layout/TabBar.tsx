import type { ComponentType } from 'react';
import { NavLink, useLocation } from 'react-router';
import { cx } from '../ui/cx';
import { CalendarIcon, ListIcon, MoreIcon, UsersIcon } from '../ui/icons';

export type TabKey = 'agenda' | 'appointments' | 'clients' | 'more';

interface Tab {
  key: Exclude<TabKey, 'more'>;
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

const TABS: Tab[] = [
  { key: 'agenda', to: '/', label: 'Agenda', icon: CalendarIcon },
  { key: 'appointments', to: '/appointments', label: 'Citas', icon: ListIcon },
  { key: 'clients', to: '/clients', label: 'Clientes', icon: UsersIcon },
];

/** Tab of the current route: everything that isn't Agenda, Citas or Clientes lives under "Más". */
export function tabOf(pathname: string): TabKey {
  if (pathname === '/') return 'agenda';
  if (pathname === '/appointments' || pathname.startsWith('/appointments/')) return 'appointments';
  if (pathname === '/clients' || pathname.startsWith('/clients/')) return 'clients';
  return 'more';
}

const item = 'min-h-14 flex flex-col items-center justify-center gap-[3px] no-underline';
const pill = (active: boolean) => cx('w-14 h-[30px] rounded-full flex items-center justify-center transition-colors', active ? 'bg-primary-soft text-primary' : 'text-muted');
const label = (active: boolean) => cx('text-[12px]', active ? 'text-primary font-bold' : 'text-muted font-semibold');

interface Props {
  moreOpen: boolean;
  onMore: () => void;
  onNavigate: () => void;
}

/** Phones and tablets (< 1024 px): Agenda · Citas · Clientes · Más, fixed at the bottom (proposal MP-01). */
export function TabBar({ moreOpen, onMore, onNavigate }: Props) {
  const { pathname } = useLocation();
  const active = moreOpen ? 'more' : tabOf(pathname);
  return (
    <nav
      data-tab-bar
      aria-label="Navegación principal"
      className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-white border-t border-line h-[calc(68px+env(safe-area-inset-bottom))] px-2 pt-1 pb-[calc(4px+env(safe-area-inset-bottom))] grid grid-cols-4 items-center"
    >
      {TABS.map(({ key, to, label: text, icon: Icon }) => (
        <NavLink key={key} to={to} end={key === 'agenda'} onClick={onNavigate} className={item}>
          <span className={pill(active === key)}>
            <Icon size={22} />
          </span>
          <span className={label(active === key)}>{text}</span>
        </NavLink>
      ))}
      <button type="button" onClick={onMore} aria-haspopup="dialog" aria-expanded={moreOpen} aria-current={active === 'more' ? 'page' : undefined} className={item}>
        <span className={pill(active === 'more')}>
          <MoreIcon size={22} />
        </span>
        <span className={label(active === 'more')}>Más</span>
      </button>
    </nav>
  );
}

import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { auth } from '../../lib/auth';
import { usePriceHeadline, usePro } from '../../lib/pro';
import { ProSelector, selectorFor } from '../../features/team/ProSelector';
import { cx } from '../ui/cx';
import { CloseIcon } from '../ui/icons';
import { InstallListener } from '../install/InstallListener';
import { Drawer } from './Drawer';
import { ExpiredBanner } from './ExpiredBanner';
import { PlanStrip } from './PlanStrip';
import { SubscriptionCard } from './SubscriptionCard';
import { TabBar } from './TabBar';
import { Wordmark } from './Wordmark';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

/** On phones and tablets the first three are tabs of the TabBar; the rest live in the "Más" sheet. */
const TAB_NAV: NavItem[] = [
  { to: '/', label: 'Agenda', end: true },
  { to: '/appointments', label: 'Citas' },
  { to: '/clients', label: 'Clientes' },
];

/** «Equipo» (team plan) goes right after «Perfil público», only once the admin approved the team. */
function moreNav(hasTeam: boolean): NavItem[] {
  return [
    { to: '/stats', label: 'Estadísticas' },
    { to: '/services', label: 'Servicios' },
    { to: '/availability', label: 'Disponibilidad' },
    { to: '/calendar-sync', label: 'Tu calendario' },
    { to: '/profile', label: 'Perfil público' },
    ...(hasTeam ? [{ to: '/team', label: 'Equipo' }] : []),
    { to: '/billing', label: 'Suscripción' },
  ];
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'flex items-center min-h-11 px-3 rounded-[12px] font-semibold text-[15px] no-underline transition-colors',
    isActive ? 'bg-white text-primary hover:text-primary' : 'text-white hover:text-white hover:bg-white/10',
  );

/** Sidebar (desktop) and "Más" sheet (phones: `more` leaves out the tab bar's destinations). */
function SidebarContent({ onNavigate, more = false }: { onNavigate?: () => void; more?: boolean }) {
  const { me, subscription } = usePro();
  const { monthlyCop } = usePriceHeadline();
  const nav = more ? moreNav(!!me.team) : [...TAB_NAV, ...moreNav(!!me.team)];
  const items = me.isAdmin ? [...nav, { to: '/admin', label: 'Administración' }] : nav;
  return (
    <>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={navLink} onClick={onNavigate}>
          {item.label}
        </NavLink>
      ))}
      <div className={cx('flex flex-col gap-2', more ? 'pt-[10px]' : 'mt-auto pt-4')}>
        {subscription && <SubscriptionCard subscription={subscription} monthlyCop={monthlyCop} onNavigate={onNavigate} />}
        <button type="button" onClick={() => void auth.signOut()} className="min-h-11 px-3 rounded-[12px] text-left text-[14px] font-semibold text-white/80 hover:text-white hover:bg-white/10">
          Cerrar sesión
        </button>
      </div>
    </>
  );
}

/** Professional panel layout: sidebar ≥ 1024 px; below, a top bar with the wordmark and the bottom TabBar. */
export function ProShell() {
  const { subscription, readOnly, me } = usePro();
  const { price, minPackageCop } = usePriceHeadline();
  const location = useLocation();
  /** Path where the "Más" sheet was opened: navigating anywhere closes it. */
  const [moreOpenAt, setMoreOpenAt] = useState<string | null>(null);
  const moreOpen = moreOpenAt === location.pathname;
  const closeMore = () => setMoreOpenAt(null);
  const onBilling = location.pathname === '/billing';
  const showBanner = readOnly && subscription && !onBilling;
  const selector = selectorFor(location.pathname);

  return (
    <div className="min-h-dvh bg-surface lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:bg-white focus:px-4 focus:py-3 focus:rounded-[12px] font-bold">
        Saltar al contenido
      </a>
      <nav aria-label="Menú principal" className="on-dark hidden lg:block w-[220px] shrink-0 bg-primary text-white">
        <div className="sticky top-0 h-dvh overflow-y-auto px-4 py-6 flex flex-col gap-[6px]">
        <div className="px-3 pb-5">
          <Wordmark />
        </div>
        <SidebarContent />
        </div>
      </nav>

      <header className="on-dark lg:hidden sticky top-0 z-30 h-[60px] bg-primary text-white px-4 flex items-center justify-between gap-3">
        <Wordmark size={22} />
        {me.team && <span className="text-[13px] font-semibold text-white/90 whitespace-nowrap overflow-hidden text-ellipsis min-w-0">{me.team.name}</span>}
      </header>
      {/* Team plan, phones and tablets: the professional selector right under the header (board team-owner-agenda-phone). */}
      {selector && <ProSelector variant="bar" allowAll={selector.allowAll} className="lg:hidden" />}
      <Drawer open={moreOpen} onClose={closeMore} label="Más opciones" placement="bottom" className="bg-primary text-white px-4 pt-[10px] pb-[18px] flex flex-col gap-[6px]">
        <span aria-hidden="true" className="self-center w-10 h-1 rounded-full bg-white/40 shrink-0" />
        <div className="flex items-center justify-between pt-1 pb-[6px] pl-3">
          <h2 className="m-0 font-display font-extrabold text-[20px]">Más</h2>
          <button type="button" onClick={closeMore} aria-label="Cerrar" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10">
            <CloseIcon size={18} />
          </button>
        </div>
        <SidebarContent more onNavigate={closeMore} />
      </Drawer>

      <main id="main" tabIndex={-1} className="flex-1 min-w-0 px-4 pt-5 pb-[calc(var(--bottom-nav)+28px)] sm:px-6 sm:pt-6 lg:px-8 lg:py-7 flex flex-col gap-[22px] outline-none">
        {!readOnly && subscription && !onBilling && <PlanStrip subscription={subscription} />}
        {showBanner && <ExpiredBanner subscription={subscription} priceName={price?.name ?? null} minPackageCop={minPackageCop} />}
        <Outlet />
      </main>
      <TabBar moreOpen={moreOpen} onMore={() => setMoreOpenAt(moreOpen ? null : location.pathname)} onNavigate={closeMore} />
      <InstallListener />
    </div>
  );
}

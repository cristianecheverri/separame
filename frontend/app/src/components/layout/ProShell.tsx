import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { auth } from '../../lib/auth';
import { usePriceHeadline, usePro } from '../../lib/pro';
import { cx } from '../ui/cx';
import { CloseIcon, MenuIcon } from '../ui/icons';
import { Drawer } from './Drawer';
import { ExpiredBanner } from './ExpiredBanner';
import { SubscriptionCard } from './SubscriptionCard';
import { Wordmark } from './Wordmark';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Agenda', end: true },
  { to: '/appointments', label: 'Citas' },
  { to: '/services', label: 'Servicios' },
  { to: '/availability', label: 'Disponibilidad' },
  { to: '/profile', label: 'Perfil público' },
  { to: '/billing', label: 'Suscripción' },
];

const navLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'flex items-center min-h-11 px-3 rounded-[12px] font-semibold text-[15px] no-underline transition-colors',
    isActive ? 'bg-white text-primary hover:text-primary' : 'text-white hover:text-white hover:bg-white/10',
  );

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { me, subscription } = usePro();
  const { monthlyCop } = usePriceHeadline();
  const items = me.isAdmin ? [...NAV, { to: '/admin', label: 'Administración' }] : NAV;
  return (
    <>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={navLink} onClick={onNavigate}>
          {item.label}
        </NavLink>
      ))}
      <div className="mt-auto pt-4 flex flex-col gap-2">
        {subscription && <SubscriptionCard subscription={subscription} monthlyCop={monthlyCop} onNavigate={onNavigate} />}
        <button type="button" onClick={() => void auth.signOut()} className="min-h-11 px-3 rounded-[12px] text-left text-[14px] font-semibold text-white/80 hover:text-white hover:bg-white/10">
          Cerrar sesión
        </button>
      </div>
    </>
  );
}

/** Professional panel layout: sidebar ≥ 1024 px, sticky top bar + drawer below. */
export function ProShell() {
  const { subscription, readOnly } = usePro();
  const { price, minPackageCop } = usePriceHeadline();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const showBanner = readOnly && subscription && location.pathname !== '/billing';

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

      <header className="on-dark lg:hidden sticky top-0 z-30 h-[60px] bg-primary text-white px-4 flex items-center justify-between">
        <Wordmark size={22} />
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú" aria-expanded={menuOpen} className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center hover:bg-white/10">
          <MenuIcon size={22} />
        </button>
      </header>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} label="Menú principal" className="bg-primary text-white px-4 py-5 flex flex-col gap-[6px]">
        <div className="flex items-center justify-between pl-3 pb-4">
          <Wordmark size={22} />
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10">
            <CloseIcon size={20} />
          </button>
        </div>
        <SidebarContent onNavigate={() => setMenuOpen(false)} />
      </Drawer>

      <main id="main" tabIndex={-1} className="flex-1 min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7 flex flex-col gap-[22px] outline-none">
        {showBanner && <ExpiredBanner subscription={subscription} priceName={price?.name ?? null} minPackageCop={minPackageCop} />}
        <Outlet />
      </main>
    </div>
  );
}

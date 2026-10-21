import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { auth } from '../../lib/auth';
import { useMe } from '../../lib/queries';
import { cx } from '../ui/cx';
import { CloseIcon, MenuIcon } from '../ui/icons';
import { Drawer } from './Drawer';
import { Wordmark } from './Wordmark';

function AdminBrand({ size = 24 }: { size?: number }) {
  return (
    <span className="flex items-center gap-[10px]">
      <Wordmark size={size} />
      <span className="text-[11px] font-bold bg-accent text-ink py-[3px] px-2 rounded-full">ADMIN</span>
    </span>
  );
}

const linkClass = (active: boolean) =>
  cx(
    'flex items-center min-h-11 px-3 rounded-[12px] font-semibold text-[15px] no-underline transition-colors',
    active ? 'bg-accent text-ink hover:text-ink' : 'text-white hover:text-white hover:bg-white/10',
  );

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { data: me } = useMe();
  const subsActive = pathname === '/admin' || pathname.startsWith('/admin/pros');
  return (
    <>
      <NavLink to="/admin/overview" className={({ isActive }) => linkClass(isActive)} onClick={onNavigate}>
        Resumen
      </NavLink>
      <NavLink to="/admin" end className={() => linkClass(subsActive)} aria-current={subsActive ? 'page' : undefined} onClick={onNavigate}>
        Suscripciones
      </NavLink>
      <NavLink to="/admin/prices" className={({ isActive }) => linkClass(isActive)} onClick={onNavigate}>
        Precios
      </NavLink>
      <div className="mt-auto pt-4 flex flex-col gap-1">
        {me?.profile && (
          <NavLink to="/" className={() => linkClass(false)} onClick={onNavigate}>
            Mi agenda
          </NavLink>
        )}
        <button type="button" onClick={() => void auth.signOut()} className="min-h-11 px-3 rounded-[12px] text-left text-[14px] font-semibold text-white/80 hover:text-white hover:bg-white/10">
          Cerrar sesión
        </button>
      </div>
    </>
  );
}

/** Admin layout: dark sidebar ≥ 1024 px, top bar + drawer below. */
export function AdminShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-surface lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:bg-white focus:px-4 focus:py-3 focus:rounded-[12px] font-bold">
        Saltar al contenido
      </a>
      <nav aria-label="Menú de administración" className="on-dark hidden lg:block w-[220px] shrink-0 bg-ink text-white">
        <div className="sticky top-0 h-dvh overflow-y-auto px-4 py-6 flex flex-col gap-[6px]">
        <div className="px-3 pb-5">
          <AdminBrand />
        </div>
        <AdminNav />
        </div>
      </nav>
      <header className="on-dark lg:hidden sticky top-0 z-30 h-[60px] bg-ink text-white px-4 flex items-center justify-between">
        <AdminBrand size={22} />
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú" aria-expanded={menuOpen} className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center hover:bg-white/10">
          <MenuIcon size={22} />
        </button>
      </header>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} label="Menú de administración" className="bg-ink text-white px-4 pt-[max(20px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))] flex flex-col gap-[6px]">
        <div className="flex items-center justify-between pl-3 pb-4">
          <AdminBrand size={22} />
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10">
            <CloseIcon size={20} />
          </button>
        </div>
        <AdminNav onNavigate={() => setMenuOpen(false)} />
      </Drawer>
      <main id="main" tabIndex={-1} className="flex-1 min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7 flex flex-col gap-[22px] outline-none">
        <Outlet />
      </main>
    </div>
  );
}

import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { useMe } from '../lib/queries';
import { FatalError, Splash } from './Splash';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'signedOut') {
    const next = location.pathname + location.search;
    return <Navigate to={next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />;
  }
  return <Outlet />;
}

export function GuestOnly() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'signedIn') {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
  return <Outlet />;
}

/** Loads /me once for everything below. */
export function MeGate() {
  const me = useMe();
  if (me.isPending) return <Splash />;
  if (me.isError) return <FatalError message={errorMessage(me.error)} onRetry={() => void me.refetch()} />;
  return <Outlet />;
}

export function RequireProfile() {
  const { data } = useMe();
  if (!data?.profile) return <Navigate to={data?.isAdmin ? '/admin' : '/onboarding'} replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { data } = useMe();
  if (!data?.isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

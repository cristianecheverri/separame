import { createBrowserRouter, type RouteObject } from 'react-router';
import { AdminShell } from '../components/layout/AdminShell';
import { ProShell } from '../components/layout/ProShell';
import { AgendaPage } from '../features/agenda/AgendaPage';
import { NotFoundPage, RouteError } from './RouteError';
import { GuestOnly, MeGate, RequireAdmin, RequireAuth, RequireProfile } from './guards';

const page = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) => async () => {
  const mod = await load();
  return { Component: mod[name] as React.ComponentType };
};

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: 'login', lazy: page(() => import('../features/auth/AuthPages'), 'LoginPage') },
          { path: 'signup', lazy: page(() => import('../features/auth/AuthPages'), 'SignupPage') },
          { path: 'forgot-password', lazy: page(() => import('../features/auth/AuthPages'), 'ForgotPasswordPage') },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <MeGate />,
            children: [
              { path: 'onboarding', lazy: page(() => import('../features/onboarding/OnboardingPage'), 'OnboardingPage') },
              {
                element: <RequireProfile />,
                children: [
                  {
                    element: <ProShell />,
                    children: [
                      { index: true, element: <AgendaPage /> },
                      { path: 'appointments', lazy: page(() => import('../features/appointments/AppointmentsPage'), 'AppointmentsPage') },
                      { path: 'clients', lazy: page(() => import('../features/clients/ClientsPage'), 'ClientsPage') },
                      { path: 'clients/:clientKey', lazy: page(() => import('../features/clients/ClientDetailPage'), 'ClientDetailPage') },
                      { path: 'stats', lazy: page(() => import('../features/stats/StatsPage'), 'StatsPage') },
                      { path: 'services', lazy: page(() => import('../features/services/ServicesPage'), 'ServicesPage') },
                      { path: 'availability', lazy: page(() => import('../features/availability/AvailabilityPage'), 'AvailabilityPage') },
                      { path: 'calendar-sync', lazy: page(() => import('../features/calendar/CalendarSyncPage'), 'CalendarSyncPage') },
                      { path: 'billing', lazy: page(() => import('../features/billing/BillingPage'), 'BillingPage') },
                      { path: 'profile', lazy: page(() => import('../features/profile/ProfilePage'), 'ProfilePage') },
                      { path: 'team', lazy: page(() => import('../features/team/TeamPage'), 'TeamPage') },
                      { path: 'team/request', lazy: page(() => import('../features/team/TeamRequestPage'), 'TeamRequestPage') },
                    ],
                  },
                ],
              },
              {
                path: 'admin',
                element: <RequireAdmin />,
                children: [
                  {
                    element: <AdminShell />,
                    children: [
                      { index: true, lazy: page(() => import('../features/admin/AdminSubscriptionsPage'), 'AdminSubscriptionsPage') },
                      { path: 'overview', lazy: page(() => import('../features/admin/AdminOverviewPage'), 'AdminOverviewPage') },
                      { path: 'pros/:proId', lazy: page(() => import('../features/admin/AdminProDetailPage'), 'AdminProDetailPage') },
                      { path: 'prices', lazy: page(() => import('../features/admin/AdminPricesPage'), 'AdminPricesPage') },
                      { path: 'teams', lazy: page(() => import('../features/admin/AdminTeamsPage'), 'AdminTeamsPage') },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes, { basename: '/app' });

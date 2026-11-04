import { hasRouteAccess, inheritedAccessRoutes } from '@/auth/accessControl';
import {
  getGrantedPageRoutes,
  getPermissions,
  hasPerm,
  isAdmin,
  ROUTES,
} from '@/auth/authService';
import { MOVED_ROUTES } from '@/routes/movedRoutes';
import { Button, Center, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { useLocation, useMatches } from 'react-router';
import { normalizeRoute } from '@/routes/migrated';
import { AppLink } from '@/shell/AppLink';
import { useAuth } from './AuthProvider';

/**
 * Set on a route's `handle` to pick its access rule. 'page' (the default) needs
 * a grant for the route itself; 'hub' is for section landing pages, which open
 * for anyone who can open some page under them (their cards filter themselves).
 */
export interface RouteAccessHandle {
  access?: 'page' | 'hub';
}

// Same order as getDefaultRedirectForUser() in apis/routeProtection.js: the
// first page this user can open.
const FALLBACK_ROUTES = [
  '/management/dashboard',
  '/manufacturing/machining/dashboard',
  '/planning/cnc-cutting/dashboard',
  '/manufacturing/maintenance/fault-requests',
  '/manufacturing/welding',
  '/procurement/purchase-requests',
  '/planning/projects',
  '/finance/purchase-orders',
  '/it/inventory',
  '/quality-control',
  '/general',
  '/projects',
];

export function defaultRouteForUser(): string {
  if (isAdmin()) return ROUTES.HOME;
  const found = FALLBACK_ROUTES.find((route) => hasRouteAccess(route));
  if (found) return found;
  return hasPerm('access_general') ? '/general' : ROUTES.HOME;
}

export function hasHubAccess(path: string): boolean {
  const route = normalizeRoute(path);
  // The plain grant lists first: most hubs open through a page under them.
  for (const granted of getGrantedPageRoutes()) {
    if (granted.startsWith(route + '/')) return true;
  }
  if (hasRouteAccess(route)) return true;
  // A merged report opens through its old pages' grants, which sit elsewhere
  // (/manufacturing/reports/finished-timers follows the CNC and machining ones).
  for (const inherited of inheritedAccessRoutes()) {
    if (inherited.startsWith(route + '/') && hasRouteAccess(inherited)) return true;
  }
  // A moved hub, or a hub that moved pages now sit under, opens for whoever
  // could open their old routes (/planning/cnc-cutting follows /manufacturing/cnc-cutting).
  for (const [oldRoute, newRoute] of Object.entries(MOVED_ROUTES)) {
    if ((newRoute === route || newRoute.startsWith(route + '/')) && hasHubAccess(oldRoute)) return true;
  }
  // Older payloads only carry boolean access_* codenames
  // (/sales/customers -> access_sales_customers).
  const prefix = `access_${route.split('/').filter(Boolean).join('_').replace(/-/g, '_')}_`;
  return Object.keys(getPermissions()).some((code) => code.startsWith(prefix) && hasPerm(code));
}

/**
 * Route-level permission check for every React page. Legacy pages showed an
 * alert() and redirected; here the page explains itself and offers a way out.
 */
export function RequireRoute({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const matches = useMatches();
  // Re-evaluated on every permission refresh through the context value.
  useAuth();

  const handle = matches.at(-1)?.handle as RouteAccessHandle | undefined;
  const allowed = handle?.access === 'hub' ? hasHubAccess(pathname) : hasRouteAccess(pathname);
  if (allowed) return <>{children}</>;

  return (
    <Center mih="60vh">
      <Stack align="center" gap="xs">
        <Title order={2}>Erişim yetkiniz yok</Title>
        <Text c="dimmed">Bu sayfaya erişim yetkiniz bulunmamaktadır: {pathname}</Text>
        <Button component={AppLink} to={defaultRouteForUser()} mt="md">
          Devam et
        </Button>
      </Stack>
    </Center>
  );
}

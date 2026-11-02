import {
  ensurePermissions,
  getUser,
  isAdmin,
  isImpersonating,
  isLoggedIn,
  mustResetPassword,
  navigateTo,
  PERMISSIONS_REFRESHED_EVENT,
  refreshPermissions,
  rememberReturnUrl,
  ROUTES,
  type LegacyUser,
} from '@legacy/authService.js';
import { Center, Loader } from '@mantine/core';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface AuthState {
  user: LegacyUser;
  isAdmin: boolean;
  isImpersonating: boolean;
  /** Bumped whenever the permission payload changes, so access checks re-run. */
  permissionsVersion: number;
}

const AuthContext = createContext<AuthState | null>(null);

// Same checks as the legacy guardRoute(): not signed in -> login (remembering
// where we were), forced password reset -> reset page. Returns false when it
// has started a redirect.
function passesSessionGuard() {
  if (!isLoggedIn()) {
    rememberReturnUrl();
    navigateTo(ROUTES.LOGIN);
    return false;
  }
  if (mustResetPassword()) {
    navigateTo(ROUTES.RESET_PASSWORD);
    return false;
  }
  return true;
}

/**
 * Session and permissions for the React pages. The session itself is the legacy
 * one (tokens, user and permissions in localStorage), so signing in, signing out
 * and impersonation work the same on both sides.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LegacyUser | null>(null);
  const [permissionsVersion, setPermissionsVersion] = useState(0);

  useEffect(() => {
    if (!passesSessionGuard()) return;
    let cancelled = false;
    (async () => {
      // A direct load (F5, deep link) may have no cached permissions yet, and
      // every route check depends on them.
      const [, loadedUser] = await Promise.all([ensurePermissions(), getUser()]);
      if (cancelled) return;
      if (!loadedUser) {
        navigateTo(ROUTES.LOGIN);
        return;
      }
      localStorage.setItem('user', JSON.stringify(loadedUser));
      setUser(loadedUser);
      // Pick up grants changed since the cache was written (throttled to 1/min).
      void refreshPermissions();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onRefreshed = (event: Event) => {
      if ((event as CustomEvent<{ changed?: boolean }>).detail?.changed) {
        setPermissionsVersion((v) => v + 1);
      }
    };
    window.addEventListener(PERMISSIONS_REFRESHED_EVENT, onRefreshed);
    return () => window.removeEventListener(PERMISSIONS_REFRESHED_EVENT, onRefreshed);
  }, []);

  if (!user) {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  }

  const value: AuthState = {
    user,
    isAdmin: Boolean(isAdmin()),
    isImpersonating: isImpersonating(),
    permissionsVersion,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

export function displayName(user: LegacyUser): string {
  if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
  return user.username || user.email || 'Kullanıcı';
}

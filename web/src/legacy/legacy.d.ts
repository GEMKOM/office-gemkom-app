// Types for the legacy modules the React app imports as-is through the
// `@legacy` alias (see vite.config.ts). They describe the parts we use, not
// everything those files export. When a module moves into web/src as
// TypeScript (Phase 6), delete its block here.

declare module '@legacy/base.js' {
  export const backendBase: string;
  export const proxyBase: string;
  export const jiraBase: string;
}

declare module '@legacy/authService.js' {
  export interface LegacyUser {
    id: number;
    username: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    is_superuser?: boolean;
    is_admin?: boolean;
    is_lead?: boolean;
    must_reset_password?: boolean;
    department_code?: string | null;
    position?: { department_code?: string | null; [key: string]: unknown } | null;
    [key: string]: unknown;
  }

  export type PermissionValue = boolean | { granted: boolean; name?: string };
  export type PermissionMap = Record<string, PermissionValue>;

  export const ROUTES: {
    LOGIN: string;
    RESET_PASSWORD: string;
    HOME: string;
    [key: string]: string;
  };
  export const PERMISSIONS_REFRESHED_EVENT: 'permissions:refreshed';

  export function getUser(): Promise<LegacyUser | null>;
  /** Normalized routes (no trailing slash) granted by "Page: /route/" permissions. */
  export function getPermissions(): PermissionMap;
  export function getGrantedPageRoutes(): Set<string>;
  export function hasPerm(codename: string): boolean;
  export function ensurePermissions(): Promise<void>;
  export function refreshPermissions(options?: {
    maxAgeMs?: number;
  }): Promise<{ refreshed: boolean; changed: boolean }>;
  export function logout(options?: { rememberReturn?: boolean }): void;
  export function isLoggedIn(): boolean;
  export function mustResetPassword(): boolean;
  export function isAdmin(): boolean;
  export function isSuperuser(): boolean;
  export function isLead(): boolean;
  export function isImpersonating(): boolean;
  export function impersonateUser(userId: number): Promise<void>;
  export function stopImpersonation(): Promise<void>;
  export function navigateTo(path: string): void;
  export function rememberReturnUrl(url?: string): void;
  /** Adds the Bearer token, refreshes once on 401. Returns the raw Response. */
  export function authedFetch(url: string, options?: RequestInit): Promise<Response>;
}

declare module '@legacy/apis/accessControl.js' {
  import type { NavTree } from '@legacy/navigationStructure.js';

  export function hasRouteAccess(route: string): boolean;
  export function hasSectionAccess(section: string): boolean;
  export function filterNavigationByAccess(tree: NavTree): NavTree;
}

declare module '@legacy/navigationStructure.js' {
  export interface NavItem {
    label: string;
    /** Font Awesome classes, e.g. "fas fa-home". */
    icon: string;
    children: NavTree;
  }
  export type NavTree = Record<string, NavItem>;

  export const NAVIGATION_STRUCTURE: NavTree;
}

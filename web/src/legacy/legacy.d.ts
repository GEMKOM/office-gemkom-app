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
  /** Signs in; throws Error('FORBIDDEN') for accounts without office_access. */
  export function login(username: string, password: string): Promise<unknown>;
  export function shouldBeOnLoginPage(): boolean;
  export function shouldBeOnResetPasswordPage(): boolean;
  /** Where a fresh login lands for this user's department. */
  export function teamLandingRoute(): string;
  export function rememberReturnUrl(url?: string): void;
  /** Read-and-clear the URL parked before the login redirect (same-origin paths only). */
  export function takeReturnUrl(): string | null;
  /** Adds the Bearer token, refreshes once on 401. Returns the raw Response. */
  export function authedFetch(url: string, options?: RequestInit): Promise<Response>;
}

declare module '@legacy/apis/users.js' {
  /** Unauthenticated; the raw Response. */
  export function forgotPassword(username: string): Promise<Response>;
  /** Sets the signed-in user's new password; the raw Response. */
  export function resetPassword(newPassword: string): Promise<Response>;
}

declare module '@legacy/apis/accessControl.js' {
  import type { NavTree } from '@legacy/navigationStructure.js';

  export function hasRouteAccess(route: string): boolean;
  export function hasSectionAccess(section: string): boolean;
  export function filterNavigationByAccess(tree: NavTree): NavTree;
  export function inheritedAccessRoutes(): string[];
  /** Moved pages, old route -> new route. */
  export const MOVED_ROUTES: Record<string, string>;
  /** The old route of a moved page, or undefined. */
  export function movedFrom(route: string): string | undefined;
}

declare module '@legacy/reportCatalog.js' {
  export const REPORT_TOPICS: Record<string, string>;
  export const REPORT_DEPARTMENTS: Record<string, string>;

  export interface ReportView {
    /** Query preset of the department's view, e.g. "module=machining". */
    query: string;
    /** The old page whose grant opens this view. */
    route: string;
  }

  export interface ReportEntry {
    route: string;
    title: string;
    question: string;
    topic: string;
    icon: string;
    departments: string[];
    views?: Record<string, ReportView>;
    keywords?: string[];
  }

  export const REPORT_CATALOG: ReportEntry[];

  export interface ReportHub {
    title: string;
    departments: string[];
    backTo: string;
  }

  export const REPORT_HUBS: Record<string, ReportHub>;
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

// No React equivalent yet: İmalat Planlama's PDF and Sunum Modu's modal PDF use
// it as is (html2canvas + jsPDF from the CDN, loaded on first use).
declare module '@legacy/utils/pdfExport.js' {
  export interface ExportElementOptions {
    fileName?: string;
    orientation?: 'portrait' | 'landscape';
    captureWidth?: number;
    marginMm?: number;
    captureClass?: string;
    stageClass?: string;
    /** ASCII only (jsPDF core fonts). */
    footerText?: string;
    prepare?: (clone: HTMLElement) => void;
  }
  /** Clones `element` off-screen, unclipped, and downloads it as a PDF. */
  export function exportElementToPdf(
    element: HTMLElement,
    options?: ExportElementOptions,
  ): Promise<void>;

  /** Captures pre-built page elements (html2canvas + jsPDF from the CDN). */
  export function exportPagesToPdf(
    pages: HTMLElement[],
    options: {
      fileName: string;
      orientation?: 'landscape' | 'portrait';
      format?: string;
      marginMm?: number;
      /** ASCII only: jsPDF's core fonts cannot encode ı/ş/ğ. */
      footerText?: string;
      onProgress?: (done: number, total: number) => void;
    },
  ): Promise<void>;
}

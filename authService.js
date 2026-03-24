import { backendBase } from './base.js';

const API_URL = backendBase;

let accessToken = localStorage.getItem('accessToken');
let refreshToken = localStorage.getItem('refreshToken');

// Cached permissions dictionary for the current user
let cachedPermissions = null;
let cachedGrantedPageRoutes = null; // Set<string> of normalized routes

function hasPermissionInPayload(perms, codename) {
    if (!codename) return true;
    if (!perms) return false;
    if (Array.isArray(perms)) return perms.includes(codename);
    if (typeof perms === 'object') {
        const v = perms[codename];
        if (v === true) return true;
        if (v && typeof v === 'object' && v.granted === true) return true;
        return false;
    }
    return false;
}

// Centralized routing to prevent infinite redirects
export const ROUTES = {
    LOGIN: '/login/',
    RESET_PASSWORD: '/login/reset-password/',
    HOME: '/',
    ADMIN: '/admin/',
    MACHINING: '/manufacturing/machining/',
    MACHINING_TASKS: '/manufacturing/machining/tasks/',
    MAINTENANCE: '/manufacturing/maintenance/',
    MANUFACTURING: '/manufacturing/',
    MANUFACTURING_WELDED: '/manufacturing/welded/'
};

// Track if we're currently redirecting to prevent loops
let isRedirecting = false;

// Track if this is a fresh login to prevent redirects on manual navigation
// This flag is set to true only when a user successfully logs in
// and is reset to false after the first team-based navigation
let isFreshLogin = false;

export async function getUser() {
    // Try to get user data from localStorage first
    const cachedUser = localStorage.getItem('user');
    if (cachedUser) {
        try {
            const userData = JSON.parse(cachedUser);
            return userData;
        } catch (error) {
            console.warn('Failed to parse cached user data, falling back to API');
            localStorage.removeItem('user'); // Remove corrupted data
        }
    }
    
    // If not in localStorage, fetch from API
    try {
        const user_data = await authedFetch(`${backendBase}/users/me/`);
        const userData = await user_data.json();
        
        // Store in localStorage for future use
        localStorage.setItem('user', JSON.stringify(userData));
        
        return userData;
    } catch (error) {
        console.error('Failed to fetch user data from API:', error);
        throw error;
    }
}

// --- Permissions helpers ----------------------------------------------------

/**
 * Fetch current user's permissions from backend and cache them.
 * Called on login and can be used to refresh permissions after admin changes.
 */
export async function fetchAndStorePermissions() {
    try {
        const response = await authedFetch(`${backendBase}/users/me/permissions/`);
        if (!response.ok) {
            console.error('Failed to fetch permissions, status:', response.status);
            return null;
        }
        const perms = await response.json();
        cachedPermissions = perms;
        cachedGrantedPageRoutes = null; // recompute lazily
        localStorage.setItem('permissions', JSON.stringify(perms));
        return perms;
    } catch (error) {
        console.error('Failed to fetch permissions from API:', error);
        return null;
    }
}

/**
 * Get permissions from memory/localStorage without doing a network call.
 */
export function getPermissions() {
    if (cachedPermissions) {
        return cachedPermissions;
    }
    try {
        const stored = localStorage.getItem('permissions');
        if (!stored) return {};
        const perms = JSON.parse(stored);
        cachedPermissions = perms;
        cachedGrantedPageRoutes = null; // recompute lazily
        return perms;
    } catch (error) {
        console.warn('Failed to parse cached permissions, clearing them');
        localStorage.removeItem('permissions');
        cachedPermissions = null;
        cachedGrantedPageRoutes = null;
        return {};
    }
}

function normalizeRouteForPermission(route) {
    if (!route) return null;
    const noQuery = String(route).split('?')[0].split('#')[0].trim();
    if (!noQuery.startsWith('/')) return null;
    if (noQuery.length > 1 && noQuery.endsWith('/')) return noQuery.slice(0, -1);
    return noQuery || '/';
}

function extractPageRouteFromName(name) {
    if (!name || typeof name !== 'string') return null;
    const idx = name.indexOf('Page:');
    if (idx === -1) return null;
    const after = name.slice(idx + 'Page:'.length).trim();
    if (!after) return null;
    // "Page: /planning/" -> "/planning/"
    // Also tolerate extra text after the path.
    const firstToken = after.split(/\s+/)[0].trim();
    return normalizeRouteForPermission(firstToken);
}

/**
 * Return a Set of normalized routes granted by "Page:" permissions.
 * Example permission entry:
 *  { granted: true, name: "Page: /planning/" }
 */
export function getGrantedPageRoutes() {
    if (cachedGrantedPageRoutes instanceof Set) return cachedGrantedPageRoutes;
    const perms = getPermissions();
    const routes = new Set();

    for (const v of Object.values(perms || {})) {
        if (v === true) continue; // legacy boolean-only permissions don't encode routes
        if (!v || typeof v !== 'object') continue;
        if (v.granted !== true) continue;
        const route = extractPageRouteFromName(v.name);
        if (route) routes.add(route);
    }

    cachedGrantedPageRoutes = routes;
    return routes;
}

/**
 * Simple helper to check if current user has a given permission codename.
 */
export function hasPerm(codename) {
    if (!codename) return true;
    const perms = getPermissions();
    const v = perms[codename];
    if (v === true) return true;
    if (v && typeof v === 'object') return v.granted === true;
    return false;
}

/**
 * Ensure permissions are present in localStorage; if missing, fetch them.
 * Useful for direct URL access / F5 on protected pages.
 */
export async function ensurePermissions() {
    if (!isLoggedIn()) {
        return;
    }
    if (!localStorage.getItem('permissions')) {
        await fetchAndStorePermissions();
    }
}

// Helper function to clear cached user data (useful for logout)
export function clearCachedUser() {
    localStorage.removeItem('user');
    localStorage.removeItem('userTeam');
    localStorage.removeItem('permissions');
    cachedPermissions = null;
    cachedGrantedPageRoutes = null;
    localStorage.removeItem('purchaseRequestDraft');
    console.log('Cached user data cleared');
}

// Helper function to get user team specifically
export async function getUserTeam() {
    try {
        const userData = await getUser();
        return userData.team || 'other';
    } catch (error) {
        console.error('Failed to get user team:', error);
        return 'other';
    }
}

function setTokens(newAccessToken, newRefreshToken) {
    accessToken = newAccessToken;
    refreshToken = newRefreshToken;
    localStorage.setItem('accessToken', newAccessToken);
    if (newRefreshToken) {
        localStorage.setItem('refreshToken', newRefreshToken);
    }
}

function clearTokens() {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
}

export async function login(username, password) {
    // Always force a fresh permission fetch for each new login.
    localStorage.removeItem('permissions');
    cachedPermissions = null;
    cachedGrantedPageRoutes = null;

    const response = await fetch(`${API_URL}/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' ,
            'X-Subdomain': "ofis.gemcore.com.tr"
        },
        body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
        if (response.status === 403) {
            throw new Error('FORBIDDEN');
        }
        throw new Error('Login failed');
    }

    const data = await response.json();
    setTokens(data.access, data.refresh);

    // Fetch user and permissions in parallel after we have tokens
    const [userData, initialPerms] = await Promise.all([
        getUser(),
        fetchAndStorePermissions()
    ]);
    const perms = initialPerms || await fetchAndStorePermissions();

    // Block non-office users from logging in
    // If permissions endpoint is temporarily unavailable, do not force logout loop.
    // Enforce office_access only when permission payload is available.
    if (perms && !hasPermissionInPayload(perms, 'office_access')) {
        // Clear tokens and cached data to ensure user is fully logged out
        logout();
        throw new Error('FORBIDDEN');
    }

    // Ensure user is stored (getUser already stores it, but keep explicit)
    if (userData) {
        localStorage.setItem('user', JSON.stringify(userData));
    }
    
    // Mark this as a fresh login
    isFreshLogin = true;
    
    return data;
}

export function logout() {
    clearTokens();
    clearCachedUser();
    // Ensure in-memory permission caches are also dropped immediately.
    cachedPermissions = null;
    cachedGrantedPageRoutes = null;
    navigateTo(ROUTES.LOGIN);
}

export function isLoggedIn() {
    return !!localStorage.getItem('refreshToken');
}

export function mustResetPassword() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return user.must_reset_password === true;
    } catch (error) {
        console.warn('Failed to parse user data for mustResetPassword check:', error);
        return false;
    }
}

export function isAdmin() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return user?.is_superuser || user?.is_admin;
    } catch (error) {
        console.warn('Failed to parse user data for isAdmin check:', error);
        return false;
    }
}

/** Maliyet tab / cost table: only management, superusers, or (planning + occupation manager) */
export function canViewCostTab() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (isAdmin()) return true;
        if (user.team === 'management') return true;
        if (user.team === 'planning' && (user.occupation === 'manager' || user.occupation === 'Manager')) return true;
        return false;
    } catch (error) {
        console.warn('Failed to parse user data for cost tab check:', error);
        return false;
    }
}

export function isLead() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return user?.is_lead;
    } catch (error) {
        console.warn('Failed to parse user data for isLead check:', error);
        return false;
    }
}

// Enhanced navigation with optional soft reload
export function navigateTo(path, options = {}) {
    if (isRedirecting) return; // Prevent multiple simultaneous redirects
    
    isRedirecting = true;
    window.location.href = path;
    
    // Reset redirecting flag after a short delay
    setTimeout(() => {
        isRedirecting = false;
    }, 100);
}

export function navigateByTeam() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        if (isAdmin() || user.team === null){
            navigateTo(ROUTES.HOME);
            return;
        }
        if (user.team === 'machining') {
            navigateTo(ROUTES.MACHINING);
        } else if (user.team === 'maintenance') {
            navigateTo(ROUTES.MAINTENANCE);
        } else if (user.team === 'manufacturing') {
            navigateTo(ROUTES.MANUFACTURING);
        } else if (user.team === 'planning') {
            navigateTo('/manufacturing/machining/capacity/planning');
        } else if (user.team === 'procurement') {
            navigateTo('/procurement/purchase-requests');
        } else if (user.team === 'finance') {
            navigateTo('/finance/purchase-orders');
        } else if (user.team === 'human_resources') {
            navigateTo('/human_resources/wages');
        } else if (user.team === 'human_resouces') {
            navigateTo('/human_resources/wages');
        } else {
            // Fallback: redirect all other teams to home page
            navigateTo(ROUTES.HOME);
        }
    } catch (error) {
        console.warn('Failed to parse user data for team navigation:', error);
        navigateTo(ROUTES.HOME);
    }
}

// New function to handle team-based navigation only on fresh logins
// This prevents unwanted redirects when users manually navigate to pages
export function navigateByTeamIfFreshLogin() {
    if (isFreshLogin) {
        isFreshLogin = false; // Reset the flag
        navigateByTeam();
    }
}

// Route guard functions
export function shouldBeOnLoginPage() {
    return !isLoggedIn();
}

export function shouldBeOnResetPasswordPage() {
    if (!isLoggedIn()) {
        return false;
    }
    
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.must_reset_password === true;
}

export function shouldBeOnMainPage() {
    return isLoggedIn() && !mustResetPassword();
}

// Route guard utility for pages
export function guardRoute() {
    const currentPath = window.location.pathname;
    
    // If we're already redirecting, don't do anything
    if (isRedirecting) {
        return false;
    }
    
    // If not logged in, should be on login page
    if (!isLoggedIn()) {
        if (currentPath !== ROUTES.LOGIN) {
            navigateTo(ROUTES.LOGIN);
            return false;
        }
        return true;
    }
    
    // If logged in but must reset password, should be on reset password page
    if (mustResetPassword()) {
        if (currentPath !== ROUTES.RESET_PASSWORD) {
            navigateTo(ROUTES.RESET_PASSWORD);
            return false;
        }
        return true;
    }
    
    // If logged in and doesn't need password reset, should be on main page
    // (not on login or reset password pages)
    if (currentPath === ROUTES.LOGIN || currentPath === ROUTES.RESET_PASSWORD) {
        navigateTo(ROUTES.HOME);
        return false;
    }
    
    // If we get here, user is authenticated and on the right page
    document.body.classList.remove('pre-auth');
    return true;
}

// Enhanced enforceAuth with better logic
export function enforceAuth() {
    return guardRoute();
}

async function refreshAccessToken() {
    if (!refreshToken) {
        logout();
        throw new Error('No refresh token available');
    }

    try {
        const response = await fetch(`${API_URL}/token/refresh/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' ,
                'X-Subdomain': "ofis.gemcore.com.tr"
            },
            body: JSON.stringify({ refresh: refreshToken }),
        });

        if (!response.ok) {
           throw new Error('Failed to refresh token');
        }

        const data = await response.json();
        setTokens(data.access, refreshToken); // Keep the same refresh token
        return accessToken;
    } catch(e) {
        logout();
        throw e;
    }
}

export async function authedFetch(url, options = {}) {
    if (!accessToken) {
       logout();
       throw new Error('Not authenticated');
    }

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`,
        'X-Subdomain': "ofis.gemcore.com.tr"
    };
    
    // Only set Content-Type if not already provided and not using FormData
    if (!options.headers['Content-Type'] && !(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
    }

    let response = await fetch(url, options);

    if (response.status === 401) {
        await refreshAccessToken();
        options.headers['Authorization'] = `Bearer ${accessToken}`;
        response = await fetch(url, options); // Retry the request with the new token
    }

    return response;
}

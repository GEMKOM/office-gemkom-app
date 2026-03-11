import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

/**
 * Notifications API Service
 * Handles notification route management (admin-only)
 */

const NOTIFICATIONS_BASE = `${backendBase}/notifications`;

/**
 * Notification type choices - matching backend
 */
export const NOTIFICATION_TYPES = [
    { value: 'sales_converted', label: 'Teklif İş Emrine Dönüştürüldü' },
    { value: 'sales_consultation', label: 'Departman Görüşü Gönderildi' },
    { value: 'job_on_hold', label: 'İş Emri Beklemeye Alındı' },
    { value: 'job_resumed', label: 'İş Emri Devam Ettirildi' },
    { value: 'drawing_released', label: 'Çizim Yayınlandı' },
    { value: 'revision_requested', label: 'Revizyon Talebi Oluşturuldu' },
    { value: 'revision_approved', label: 'Revizyon Onaylandı' },
    { value: 'revision_completed', label: 'Revizyon Tamamlandı' },
    { value: 'revision_rejected', label: 'Revizyon Reddedildi' }
];

/**
 * Get all notification routes
 * @returns {Promise<Array>} Array of notification route objects
 */
export async function listNotificationRoutes() {
    const url = `${NOTIFICATIONS_BASE}/routes/`;
    const response = await authedFetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch notification routes: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Get a single notification route by type
 * @param {string} notificationType - Notification type (e.g., 'sales_converted')
 * @returns {Promise<Object>} Notification route object
 */
export async function getNotificationRoute(notificationType) {
    const url = `${NOTIFICATIONS_BASE}/routes/${notificationType}/`;
    const response = await authedFetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch notification route: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Update a notification route
 * @param {string} notificationType - Notification type (e.g., 'sales_converted')
 * @param {Object} data - Update data: { user_ids: [1, 5, 12], enabled: true }
 * @returns {Promise<Object>} Updated notification route object
 */
export async function updateNotificationRoute(notificationType, data) {
    const url = `${NOTIFICATIONS_BASE}/routes/${notificationType}/`;
    const response = await authedFetch(url, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `Failed to update notification route: ${response.status}`);
    }
    
    return await response.json();
}

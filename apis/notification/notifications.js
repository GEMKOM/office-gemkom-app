import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

/**
 * Notifications API Service
 * Handles all notification-related API requests for the notification bell
 */

const NOTIFICATIONS_BASE = `${backendBase}/notifications`;

/**
 * Get paginated list of notifications
 * @param {Object} filters - Filter parameters
 * @param {boolean} filters.is_read - Filter by read status
 * @param {string} filters.ordering - Ordering field (e.g., '-created_at')
 * @param {number} filters.page - Page number for pagination
 * @param {number} filters.page_size - Page size for pagination
 * @returns {Promise<Object>} Response with notifications and pagination info
 */
export async function getNotifications(filters = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${NOTIFICATIONS_BASE}/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Bildirimler yüklenirken hata oluştu' }));
            throw new Error(errorData.detail || errorData.error || 'Bildirimler yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching notifications:', error);
        throw error;
    }
}

/**
 * Get unread notifications count
 * @returns {Promise<number>} Unread count
 */
export async function getUnreadCount() {
    try {
        const url = `${NOTIFICATIONS_BASE}/unread_count/`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Okunmamış bildirim sayısı alınırken hata oluştu' }));
            throw new Error(errorData.detail || errorData.error || 'Okunmamış bildirim sayısı alınırken hata oluştu');
        }

        const data = await response.json();
        return data.count || 0;
    } catch (error) {
        console.error('Error fetching unread count:', error);
        throw error;
    }
}

/**
 * Mark a notification as read
 * @param {number} notificationId - Notification ID
 * @returns {Promise<Object>} Updated notification object
 */
export async function markNotificationRead(notificationId) {
    try {
        const url = `${NOTIFICATIONS_BASE}/${notificationId}/mark_read/`;
        const response = await authedFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Bildirim okundu olarak işaretlenirken hata oluştu' }));
            throw new Error(errorData.detail || errorData.error || 'Bildirim okundu olarak işaretlenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error marking notification as read:', error);
        throw error;
    }
}

/**
 * Mark all notifications as read
 * @returns {Promise<Object>} Response object
 */
export async function markAllNotificationsRead() {
    try {
        const url = `${NOTIFICATIONS_BASE}/mark_all_read/`;
        const response = await authedFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Tüm bildirimler okundu olarak işaretlenirken hata oluştu' }));
            throw new Error(errorData.detail || errorData.error || 'Tüm bildirimler okundu olarak işaretlenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        throw error;
    }
}

/**
 * Get user's notification preferences
 * @returns {Promise<Array>} Array of notification preference objects
 */
export async function getNotificationPreferences() {
    try {
        const url = `${NOTIFICATIONS_BASE}/preferences/`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Bildirim tercihleri yüklenirken hata oluştu' }));
            throw new Error(errorData.detail || errorData.error || 'Bildirim tercihleri yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching notification preferences:', error);
        throw error;
    }
}

/**
 * Update a notification preference
 * @param {number} preferenceId - Preference ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated preference object
 */
export async function updateNotificationPreference(preferenceId, data) {
    try {
        const url = `${NOTIFICATIONS_BASE}/preferences/${preferenceId}/`;
        const response = await authedFetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Bildirim tercihi güncellenirken hata oluştu' }));
            throw new Error(errorData.detail || errorData.error || 'Bildirim tercihi güncellenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating notification preference:', error);
        throw error;
    }
}

/**
 * Reset notification preferences to defaults
 * @returns {Promise<Object>} Response object
 */
export async function resetNotificationPreferences() {
    try {
        const url = `${NOTIFICATIONS_BASE}/preferences/reset/`;
        const response = await authedFetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Bildirim tercihleri sıfırlanırken hata oluştu' }));
            throw new Error(errorData.detail || errorData.error || 'Bildirim tercihleri sıfırlanırken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error resetting notification preferences:', error);
        throw error;
    }
}

/**
 * Notification Bell Component
 * Displays a bell icon with unread count badge and dropdown with notifications
 */

import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from '../../apis/notification/notifications.js';
import { navigateTo } from '../../authService.js';

export class NotificationBell {
    constructor(container) {
        this.container = container;
        this.unreadCount = 0;
        this.pollInterval = null;
        this.isDropdownOpen = false;
        
        this.init();
    }

    async init() {
        await this.updateUnreadCount();
        this.startPolling();
        this.setupEventListeners();
    }

    /**
     * Update the unread count badge
     */
    async updateUnreadCount() {
        try {
            this.unreadCount = await getUnreadCount();
            this.updateBadge();
        } catch (error) {
            console.error('Failed to update unread count:', error);
            // Don't show error to user, just log it
        }
    }

    /**
     * Update the badge display
     */
    updateBadge() {
        const badge = this.container.querySelector('.notification-badge');
        if (badge) {
            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    /**
     * Start polling for unread count updates
     */
    startPolling() {
        // Poll every 45 seconds
        this.pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.updateUnreadCount();
            }
        }, 45000);
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const bellButton = this.container.querySelector('.notification-bell-button');
        const dropdown = this.container.querySelector('.notification-dropdown');

        if (bellButton) {
            bellButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleDropdown();
            });
        }

        // Handle mark all read button (delegated event)
        if (dropdown) {
            dropdown.addEventListener('click', async (e) => {
                if (e.target.classList.contains('mark-all-read-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    await this.handleMarkAllRead();
                    return;
                }
                
                const notificationItem = e.target.closest('.notification-item');
                if (notificationItem) {
                    const notificationId = notificationItem.dataset.notificationId;
                    const link = notificationItem.dataset.link;
                    if (notificationId && link) {
                        this.handleNotificationClick(notificationId, link);
                    }
                }
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isDropdownOpen && !this.container.contains(e.target)) {
                this.closeDropdown();
            }
        });
        
        // Reposition dropdown on scroll/resize
        window.addEventListener('scroll', () => {
            if (this.isDropdownOpen) {
                this.positionDropdown();
            }
        });
        
        window.addEventListener('resize', () => {
            if (this.isDropdownOpen) {
                this.positionDropdown();
            }
        });
    }

    /**
     * Toggle dropdown visibility
     */
    async toggleDropdown() {
        if (this.isDropdownOpen) {
            this.closeDropdown();
        } else {
            await this.openDropdown();
        }
    }

    /**
     * Open dropdown and load notifications
     */
    async openDropdown() {
        this.isDropdownOpen = true;
        const dropdown = this.container.querySelector('.notification-dropdown');
        if (dropdown) {
            // Position dropdown relative to bell button
            this.positionDropdown();
            dropdown.classList.add('show');
            // Show mark all read button
            const markAllReadBtn = this.container.querySelector('.mark-all-read-btn');
            if (markAllReadBtn) {
                markAllReadBtn.style.display = 'block';
            }
            await this.loadNotifications();
        }
    }
    
    /**
     * Position dropdown relative to bell button
     */
    positionDropdown() {
        const dropdown = this.container.querySelector('.notification-dropdown');
        const bellButton = this.container.querySelector('.notification-bell-button');
        if (!dropdown || !bellButton) return;
        
        const rect = bellButton.getBoundingClientRect();
        const dropdownWidth = 400; // Match CSS width
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Calculate right position (distance from right edge)
        let rightPos = viewportWidth - rect.right;
        
        // Ensure dropdown doesn't go off-screen on the right
        if (rightPos < 20) {
            rightPos = 20;
        }
        
        // Ensure dropdown doesn't go off-screen on the left (mobile)
        if (viewportWidth - rightPos - dropdownWidth < 20) {
            rightPos = viewportWidth - dropdownWidth - 20;
        }
        
        // Calculate top position
        let topPos = rect.bottom + 8;
        
        // If dropdown would go below viewport, position it above the bell
        const dropdownHeight = 600; // max-height
        if (topPos + dropdownHeight > viewportHeight - 20) {
            topPos = rect.top - dropdownHeight - 8;
            // Ensure it doesn't go above viewport
            if (topPos < 20) {
                topPos = 20;
                // Adjust max-height if needed
                dropdown.style.maxHeight = `${viewportHeight - topPos - 20}px`;
            }
        }
        
        dropdown.style.top = `${topPos}px`;
        dropdown.style.right = `${rightPos}px`;
        dropdown.style.left = 'auto';
    }

    /**
     * Close dropdown
     */
    closeDropdown() {
        this.isDropdownOpen = false;
        const dropdown = this.container.querySelector('.notification-dropdown');
        if (dropdown) {
            dropdown.classList.remove('show');
        }
        // Hide mark all read button
        const markAllReadBtn = this.container.querySelector('.mark-all-read-btn');
        if (markAllReadBtn) {
            markAllReadBtn.style.display = 'none';
        }
    }

    /**
     * Load and display notifications
     */
    async loadNotifications() {
        const dropdown = this.container.querySelector('.notification-dropdown');
        const listContainer = dropdown?.querySelector('.notification-list');
        
        if (!listContainer) return;

        // Show loading state
        listContainer.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm" role="status"></div></div>';

        try {
            const response = await getNotifications({
                page_size: 20
            });

            // Handle both paginated and non-paginated responses
            const notifications = Array.isArray(response) ? response : (response.results || []);
            this.renderNotifications(listContainer, notifications);
        } catch (error) {
            console.error('Failed to load notifications:', error);
            listContainer.innerHTML = `
                <div class="text-center p-3 text-muted">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Bildirimler yüklenirken hata oluştu.
                </div>
            `;
        }
    }

    /**
     * Render notifications list
     */
    renderNotifications(container, notifications) {
        if (!notifications || notifications.length === 0) {
            container.innerHTML = `
                <div class="notification-empty">
                    <i class="fas fa-bell-slash"></i>
                    <div class="notification-empty-text">Okunmamış bildirim yok</div>
                </div>
            `;
            return;
        }

        const notificationsHTML = notifications.map(notification => {
            const timeAgo = this.formatTimeAgo(notification.created_at);
            const isReadClass = notification.is_read ? 'read' : '';
            
            return `
                <div class="notification-item ${isReadClass}" 
                     data-notification-id="${notification.id}" 
                     data-link="${notification.link || '#'}">
                    <div class="notification-unread-indicator"></div>
                    <div class="notification-content">
                        <div class="notification-title">${this.escapeHtml(notification.title || '-')}</div>
                        <div class="notification-body">${this.escapeHtml(notification.body || '-')}</div>
                        <div class="notification-meta">
                            <span class="notification-type">${this.escapeHtml(notification.notification_type_display || '-')}</span>
                            <span class="notification-time">${timeAgo}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = notificationsHTML;
    }

    /**
     * Handle notification click
     */
    async handleNotificationClick(notificationId, link) {
        try {
            // Mark as read
            await markNotificationRead(notificationId);
            
            // Update UI
            const notificationItem = this.container.querySelector(`[data-notification-id="${notificationId}"]`);
            if (notificationItem) {
                notificationItem.classList.add('read');
            }

            // Update count
            await this.updateUnreadCount();
            
            // Navigate to link
            if (link && link !== '#') {
                this.closeDropdown();
                navigateTo(link);
            }
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
            // Still navigate even if marking as read fails
            if (link && link !== '#') {
                this.closeDropdown();
                navigateTo(link);
            }
        }
    }

    /**
     * Handle mark all as read
     */
    async handleMarkAllRead() {
        try {
            await markAllNotificationsRead();
            await this.updateUnreadCount();
            await this.loadNotifications();
        } catch (error) {
            console.error('Failed to mark all notifications as read:', error);
            alert('Tüm bildirimler okundu olarak işaretlenirken hata oluştu.');
        }
    }

    /**
     * Format time ago
     */
    formatTimeAgo(dateString) {
        if (!dateString) return '-';
        
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Az önce';
        if (diffMins < 60) return `${diffMins} dakika önce`;
        if (diffHours < 24) return `${diffHours} saat önce`;
        if (diffDays < 7) return `${diffDays} gün önce`;
        
        // Format as date if older than a week
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stopPolling();
    }
}

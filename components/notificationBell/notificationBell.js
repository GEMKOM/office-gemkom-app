/**
 * Notification Bell Component
 * Displays a bell icon with unread count badge and dropdown with notifications
 */

import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from '../../apis/notification/notifications.js';
import { navigateTo } from '../../authService.js';
import { categoryIconHtml } from './notificationCategories.js';

export class NotificationBell {
    constructor(container) {
        this.container = container;
        this.unreadCount = 0;
        this.pollInterval = null;
        this.isDropdownOpen = false;
        this.dropdown = this.portalDropdown();

        this.init();
    }

    /**
     * Move the panel to <body>.
     *
     * It is position:fixed, and under 992px the collapsed .navbar-collapse
     * carries a backdrop-filter — which makes it the containing block for
     * fixed descendants. Left inside the navbar the panel measured its
     * coordinates against the menu instead of the viewport and hung off the
     * bottom of the screen on phones.
     */
    portalDropdown() {
        const dropdown = this.container.querySelector('.notification-dropdown');
        if (!dropdown) return null;

        // A re-rendered navbar builds a fresh bell; drop the orphan first.
        document.querySelectorAll('body > .notification-dropdown')
            .forEach(stale => stale.remove());
        document.body.appendChild(dropdown);
        return dropdown;
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

        // The header pill repeats the count inside the open panel, where the
        // badge behind it is covered up.
        const headerCount = this.dropdown?.querySelector('.notification-header-count');
        if (headerCount) {
            headerCount.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            headerCount.style.display = this.unreadCount > 0 ? 'inline-block' : 'none';
        }

        // Nothing to mark when nothing is unread.
        const markAllReadBtn = this.dropdown?.querySelector('.mark-all-read-btn');
        if (markAllReadBtn && this.isDropdownOpen) {
            markAllReadBtn.style.display = this.unreadCount > 0 ? 'block' : 'none';
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
        const dropdown = this.dropdown;

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
            const outside = !this.container.contains(e.target)
                && !(this.dropdown && this.dropdown.contains(e.target));
            if (this.isDropdownOpen && outside) {
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
        const dropdown = this.dropdown;
        if (dropdown) {
            // Position dropdown relative to bell button
            this.positionDropdown();
            dropdown.classList.add('show');
            this.container.querySelector('.notification-bell-button')?.classList.add('is-open');
            // Show mark all read button
            const markAllReadBtn = this.dropdown?.querySelector('.mark-all-read-btn');
            if (markAllReadBtn) {
                markAllReadBtn.style.display = this.unreadCount > 0 ? 'block' : 'none';
            }
            await this.loadNotifications();
        }
    }
    
    /**
     * Position dropdown relative to bell button
     */
    positionDropdown() {
        const dropdown = this.dropdown;
        const bellButton = this.container.querySelector('.notification-bell-button');
        if (!dropdown || !bellButton) return;
        
        const rect = bellButton.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 12;
        // Measure rather than assume: on a narrow phone the panel is capped by
        // max-width, and a hardcoded width used to push it off the right edge.
        const dropdownWidth = Math.min(dropdown.offsetWidth || 420, viewportWidth - margin * 2);

        // Right-align to the bell, then keep the whole panel on screen.
        let rightPos = viewportWidth - rect.right;
        rightPos = Math.max(margin, Math.min(rightPos, viewportWidth - dropdownWidth - margin));
        
        // Hang below the bell when there is room, otherwise flip above it —
        // on a phone the bell sits inside the expanded menu, halfway down the
        // screen, and a panel below it would run off the bottom.
        const spaceBelow = viewportHeight - (rect.bottom + 8) - margin;
        const spaceAbove = rect.top - 8 - margin;
        const below = spaceBelow >= 320 || spaceBelow >= spaceAbove;

        let height = Math.min(600, below ? spaceBelow : spaceAbove);
        height = Math.max(240, height);
        let topPos = below ? rect.bottom + 8 : rect.top - 8 - height;
        topPos = Math.max(margin, Math.min(topPos, viewportHeight - height - margin));

        dropdown.style.maxHeight = `${height}px`;
        
        dropdown.style.top = `${topPos}px`;
        dropdown.style.right = `${rightPos}px`;
        dropdown.style.left = 'auto';
    }

    /**
     * Close dropdown
     */
    closeDropdown() {
        this.isDropdownOpen = false;
        const dropdown = this.dropdown;
        if (dropdown) {
            dropdown.classList.remove('show');
        }
        this.container.querySelector('.notification-bell-button')?.classList.remove('is-open');
        // Hide mark all read button
        const markAllReadBtn = this.dropdown?.querySelector('.mark-all-read-btn');
        if (markAllReadBtn) {
            markAllReadBtn.style.display = 'none';
        }
    }

    /**
     * Load and display notifications
     */
    async loadNotifications() {
        const dropdown = this.dropdown;
        const listContainer = dropdown?.querySelector('.notification-list');
        
        if (!listContainer) return;

        // Show loading state
        listContainer.innerHTML = '<div class="notification-loading"><div class="spinner-border spinner-border-sm" role="status"></div></div>';

        try {
            const response = await getNotifications({
                page_size: 20,
                // Unread first, newest first inside each group, so what is still
                // waiting never sits below what the user has already read.
                ordering: 'is_read,-created_at'
            });

            // Handle both paginated and non-paginated responses
            const notifications = Array.isArray(response) ? response : (response.results || []);
            this.renderNotifications(listContainer, this.sortUnreadFirst(notifications));
        } catch (error) {
            console.error('Failed to load notifications:', error);
            listContainer.innerHTML = `
                <div class="notification-empty">
                    <i class="fas fa-triangle-exclamation"></i>
                    <div class="notification-empty-text">Bildirimler yüklenirken hata oluştu.</div>
                </div>
            `;
        }
    }

    /**
     * Unread before read, newest first within each group.
     *
     * The server is asked for this ordering too; repeating it here keeps the
     * panel right even if the API ignores the ordering parameter.
     */
    sortUnreadFirst(notifications) {
        return (notifications || []).slice().sort((a, b) => {
            if (!!a.is_read !== !!b.is_read) return a.is_read ? 1 : -1;
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
    }

    /**
     * Render notifications list
     */
    renderNotifications(container, notifications) {
        if (!notifications || notifications.length === 0) {
            container.innerHTML = `
                <div class="notification-empty">
                    <i class="fas fa-bell-slash"></i>
                    <div class="notification-empty-text">Henüz bildiriminiz yok</div>
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
                     data-link="${notification.link || '#'}"
                     title="${this.escapeHtml(notification.title || '')}">
                    ${categoryIconHtml(notification.category)}
                    <div class="notification-content">
                        <div class="notification-title">${this.escapeHtml(notification.title || '-')}</div>
                        <div class="notification-body">${this.escapeHtml(notification.body || '-')}</div>
                        <div class="notification-meta">
                            <span class="notification-type">${this.escapeHtml(notification.notification_type_display || '-')}</span>
                            <span class="notification-time">${timeAgo}</span>
                            <span class="notification-unread-indicator"></span>
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
            const notificationItem = this.dropdown?.querySelector(`[data-notification-id="${notificationId}"]`);
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
        this.dropdown?.remove();
        this.dropdown = null;
    }
}

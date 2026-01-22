/**
 * Notification Component
 * A reusable notification system for displaying alerts across the application
 */

export class Notification {
    /**
     * Show a notification
     * @param {string} message - The message to display
     * @param {string} type - The notification type: 'info', 'success', 'warning', 'error'
     * @param {number} timeout - Auto-dismiss timeout in milliseconds (default: 5000)
     * @param {object} options - Additional options
     * @param {boolean} options.removeExisting - Remove existing notifications before showing new one (default: false)
     */
    static show(message, type = 'info', timeout = 5000, options = {}) {
        const { removeExisting = false } = options;
        
        // Remove existing notifications if requested
        if (removeExisting) {
            const existingNotifications = document.querySelectorAll('.app-notification');
            existingNotifications.forEach(notification => notification.remove());
        }
        
        // Map error to danger for Bootstrap
        const alertType = type === 'error' ? 'danger' : type;
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `app-notification alert alert-${alertType} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px; max-width: 500px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        // Append to body
        document.body.appendChild(notification);
        
        // Auto-dismiss after timeout
        if (timeout > 0) {
            setTimeout(() => {
                if (notification.parentNode) {
                    // Use Bootstrap's dismiss method if available
                    const bsAlert = bootstrap.Alert.getOrCreateInstance(notification);
                    bsAlert.close();
                    
                    // Fallback: remove after fade animation
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.remove();
                        }
                    }, 150);
                }
            }, timeout);
        }
        
        return notification;
    }
    
    /**
     * Show info notification
     */
    static info(message, timeout = 5000) {
        return this.show(message, 'info', timeout);
    }
    
    /**
     * Show success notification
     */
    static success(message, timeout = 5000) {
        return this.show(message, 'success', timeout);
    }
    
    /**
     * Show warning notification
     */
    static warning(message, timeout = 5000) {
        return this.show(message, 'warning', timeout);
    }
    
    /**
     * Show error notification
     */
    static error(message, timeout = 5000) {
        return this.show(message, 'error', timeout);
    }
    
    /**
     * Remove all notifications
     */
    static removeAll() {
        const notifications = document.querySelectorAll('.app-notification');
        notifications.forEach(notification => {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(notification);
            bsAlert.close();
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 150);
        });
    }
}

// Global function for backward compatibility and convenience
export function showNotification(message, type = 'info', timeout = 5000) {
    return Notification.show(message, type, timeout);
}

// Make it available globally
window.showNotification = showNotification;

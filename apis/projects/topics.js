import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

/**
 * Discussion Topics API Service
 * Handles all discussion topic related API requests
 * Base URL: /projects/discussion-topics/
 */

/**
 * List discussion topics with optional filters
 * @param {Object} options - Query parameters
 * @param {string} options.job_order - Filter by job order number
 * @param {string} options.priority - Filter by priority: low, normal, high, urgent
 * @param {string} options.priority__in - Filter multiple: high,urgent
 * @param {number} options.created_by - Filter by creator user ID
 * @param {string} options.search - Search in title, content, job_no, job_order title
 * @param {string} options.ordering - Sort by: created_at, -created_at, priority, updated_at
 * @returns {Promise<Array>} Array of topic objects
 */
export async function listTopics(options = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        if (options.job_order) {
            queryParams.append('job_order', options.job_order);
        }
        if (options.priority) {
            queryParams.append('priority', options.priority);
        }
        if (options.priority__in) {
            queryParams.append('priority__in', options.priority__in);
        }
        if (options.created_by) {
            queryParams.append('created_by', options.created_by.toString());
        }
        if (options.search) {
            queryParams.append('search', options.search);
        }
        if (options.ordering) {
            queryParams.append('ordering', options.ordering);
        }

        const url = `${backendBase}/projects/discussion-topics/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error listing topics:', error);
        throw error;
    }
}

/**
 * Get topic detail by ID
 * @param {number} topicId - Topic ID
 * @returns {Promise<Object>} Topic detail object
 */
export async function getTopic(topicId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/discussion-topics/${topicId}/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching topic ${topicId}:`, error);
        throw error;
    }
}

/**
 * Create a new discussion topic
 * @param {Object} topicData - Topic data
 * @param {string} topicData.job_order - Job order number
 * @param {string} topicData.title - Topic title
 * @param {string} topicData.content - Topic content (supports @mentions)
 * @param {string} topicData.priority - Priority: low, normal, high, urgent (optional)
 * @returns {Promise<Object>} Created topic object
 */
export async function createTopic(topicData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/discussion-topics/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(topicData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating topic:', error);
        throw error;
    }
}

/**
 * Update a discussion topic (owner only)
 * @param {number} topicId - Topic ID
 * @param {Object} topicData - Updated topic data
 * @param {string} topicData.title - Topic title (optional)
 * @param {string} topicData.content - Topic content (optional)
 * @param {string} topicData.priority - Priority (optional)
 * @returns {Promise<Object>} Updated topic object
 */
export async function updateTopic(topicId, topicData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/discussion-topics/${topicId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(topicData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error updating topic ${topicId}:`, error);
        throw error;
    }
}

/**
 * Delete a discussion topic (soft delete, owner only)
 * @param {number} topicId - Topic ID
 * @returns {Promise<void>}
 */
export async function deleteTopic(topicId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/discussion-topics/${topicId}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.error(`Error deleting topic ${topicId}:`, error);
        throw error;
    }
}

/**
 * Get comments for a topic
 * @param {number} topicId - Topic ID
 * @returns {Promise<Array>} Array of comment objects
 */
export async function getTopicComments(topicId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/discussion-topics/${topicId}/comments/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching comments for topic ${topicId}:`, error);
        throw error;
    }
}

/**
 * Upload attachment to a topic
 * @param {number} topicId - Topic ID
 * @param {File} file - File to upload
 * @returns {Promise<Object>} Attachment object
 */
export async function uploadTopicAttachment(topicId, file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await authedFetch(`${backendBase}/projects/discussion-topics/${topicId}/upload_attachment/`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error uploading attachment to topic ${topicId}:`, error);
        throw error;
    }
}

/**
 * Discussion Comments API Service
 * Base URL: /projects/discussion-comments/
 */

/**
 * List discussion comments
 * @param {Object} options - Query parameters
 * @param {number} options.topic - Filter by topic ID (required for listing)
 * @param {number} options.created_by - Filter by author
 * @param {string} options.search - Search in content
 * @param {string} options.ordering - Sort by: created_at, -created_at
 * @returns {Promise<Array>} Array of comment objects
 */
export async function listComments(options = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        if (options.topic) {
            queryParams.append('topic', options.topic.toString());
        }
        if (options.created_by) {
            queryParams.append('created_by', options.created_by.toString());
        }
        if (options.search) {
            queryParams.append('search', options.search);
        }
        if (options.ordering) {
            queryParams.append('ordering', options.ordering);
        }

        const url = `${backendBase}/projects/discussion-comments/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error listing comments:', error);
        throw error;
    }
}

/**
 * Create a new comment
 * @param {Object} commentData - Comment data
 * @param {number} commentData.topic - Topic ID
 * @param {string} commentData.content - Comment content (supports @mentions)
 * @returns {Promise<Object>} Created comment object
 */
export async function createComment(commentData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/discussion-comments/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(commentData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating comment:', error);
        throw error;
    }
}

/**
 * Update a comment (author only)
 * @param {number} commentId - Comment ID
 * @param {Object} commentData - Updated comment data
 * @param {string} commentData.content - Comment content
 * @returns {Promise<Object>} Updated comment object
 */
export async function updateComment(commentId, commentData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/discussion-comments/${commentId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(commentData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error updating comment ${commentId}:`, error);
        throw error;
    }
}

/**
 * Delete a comment (soft delete, author only)
 * @param {number} commentId - Comment ID
 * @returns {Promise<void>}
 */
export async function deleteComment(commentId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/discussion-comments/${commentId}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.error(`Error deleting comment ${commentId}:`, error);
        throw error;
    }
}

/**
 * Upload attachment to a comment
 * @param {number} commentId - Comment ID
 * @param {File} file - File to upload
 * @returns {Promise<Object>} Attachment object
 */
export async function uploadCommentAttachment(commentId, file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await authedFetch(`${backendBase}/projects/discussion-comments/${commentId}/upload_attachment/`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error uploading attachment to comment ${commentId}:`, error);
        throw error;
    }
}

/**
 * Discussion Notifications API Service
 * Base URL: /projects/discussion-notifications/
 */

/**
 * List notifications for current user
 * @param {Object} options - Query parameters
 * @param {boolean} options.is_read - Filter: true or false
 * @param {string} options.notification_type - Filter: topic_mention, comment_mention, new_comment
 * @returns {Promise<Array>} Array of notification objects
 */
export async function listNotifications(options = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        if (options.is_read !== undefined && options.is_read !== null) {
            queryParams.append('is_read', options.is_read.toString());
        }
        if (options.notification_type) {
            queryParams.append('notification_type', options.notification_type);
        }

        const url = `${backendBase}/projects/discussion-notifications/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error listing notifications:', error);
        throw error;
    }
}

/**
 * Get unread notification count
 * @returns {Promise<Object>} Object with count property
 */
export async function getUnreadNotificationCount() {
    try {
        const response = await authedFetch(`${backendBase}/projects/discussion-notifications/unread_count/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching unread notification count:', error);
        throw error;
    }
}

/**
 * Mark a single notification as read
 * @param {number} notificationId - Notification ID
 * @returns {Promise<Object>} Updated notification object
 */
export async function markNotificationAsRead(notificationId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/discussion-notifications/${notificationId}/mark_read/`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error marking notification ${notificationId} as read:`, error);
        throw error;
    }
}

/**
 * Mark all notifications as read
 * @returns {Promise<Object>} Response object with status and message
 */
export async function markAllNotificationsAsRead() {
    try {
        const response = await authedFetch(`${backendBase}/projects/discussion-notifications/mark_all_read/`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        throw error;
    }
}

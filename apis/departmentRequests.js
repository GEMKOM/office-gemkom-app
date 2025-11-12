import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

// Department Request API Functions
export async function createDepartmentRequest(requestData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/department-requests/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Sunucu hatas1');
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating department request:', error);
        throw error;
    }
}

export async function updateDepartmentRequest(requestId, requestData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/department-requests/${requestId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Sunucu hatas1');
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating department request:', error);
        throw error;
    }
}

export async function approveDepartmentRequest(requestId, comment = '') {
    try {
        const response = await authedFetch(`${backendBase}/procurement/department-requests/${requestId}/approve/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                comment: comment
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Talep onaylan1rken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error approving department request:', error);
        throw error;
    }
}

export async function rejectDepartmentRequest(requestId, comment = '') {
    try {
        const response = await authedFetch(`${backendBase}/procurement/department-requests/${requestId}/reject/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                comment: comment
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Talep reddedilirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error rejecting department request:', error);
        throw error;
    }
}

export async function getDepartmentRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();

        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${backendBase}/procurement/department-requests/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talepler y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching department requests:', error);
        throw error;
    }
}

export async function getMyDepartmentRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();

        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${backendBase}/procurement/department-requests/my_requests/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Taleplerim y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching my department requests:', error);
        throw error;
    }
}

export async function getPendingApprovalDepartmentRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();

        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${backendBase}/procurement/department-requests/pending_approval/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Onay bekleyen talepler y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching pending approval department requests:', error);
        throw error;
    }
}

export async function getApprovedDepartmentRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();

        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${backendBase}/procurement/department-requests/approved_requests/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Onaylanan talepler y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching approved department requests:', error);
        throw error;
    }
}

export async function getCompletedDepartmentRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();

        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${backendBase}/procurement/department-requests/completed_requests/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Tamamlanan talepler y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching completed department requests:', error);
        throw error;
    }
}

export async function getDepartmentRequest(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/department-requests/${requestId}/`);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talep y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching department request:', error);
        throw error;
    }
}

export async function markDepartmentRequestTransferred(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/department-requests/${requestId}/mark_transferred/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Talep transfer edilirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error marking department request as transferred:', error);
        throw error;
    }
}

export async function deleteDepartmentRequest(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/department-requests/${requestId}/`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talep silinirken hata olu_tu');
        }

        return true; // Successfully deleted
    } catch (error) {
        console.error('Error deleting department request:', error);
        throw error;
    }
}

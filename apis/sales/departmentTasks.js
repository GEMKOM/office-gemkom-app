import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const BASE = `${backendBase}/department-tasks`;

export const TASK_FILE_TYPE_OPTIONS = [
    { value: 'drawing', label: 'Çizim' },
    { value: 'specification', label: 'Şartname' },
    { value: 'report', label: 'Rapor' },
    { value: 'photo', label: 'Fotoğraf' },
    { value: 'other', label: 'Diğer' }
];

export async function listConsultationTasks(options = {}) {
    const params = new URLSearchParams();
    if (options.department) params.append('department', options.department);
    if (options.status) params.append('status', options.status);
    if (options.status__in) params.append('status__in', options.status__in);
    if (options.search) params.append('search', options.search);
    if (options.ordering) params.append('ordering', options.ordering);
    if (options.page) params.append('page', options.page);
    if (options.page_size) params.append('page_size', options.page_size);

    const qs = params.toString();
    const response = await authedFetch(`${BASE}/${qs ? '?' + qs : ''}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function getConsultationTask(id) {
    const response = await authedFetch(`${BASE}/${id}/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function startTask(id) {
    const response = await authedFetch(`${BASE}/${id}/start/`, {
        method: 'POST'
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
    }
    return response.json();
}

export async function completeTask(id, notes = '') {
    const response = await authedFetch(`${BASE}/${id}/complete/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
    }
    return response.json();
}

export async function uploadTaskFile(taskId, file, fileType, name = '', description = '') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);
    if (name) formData.append('name', name);
    if (description) formData.append('description', description);

    const response = await authedFetch(`${BASE}/${taskId}/upload-file/`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

export async function deleteTaskFile(taskId, fileId) {
    const response = await authedFetch(`${BASE}/${taskId}/files/${fileId}/`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

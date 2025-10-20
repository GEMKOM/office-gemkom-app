import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const CNC_CUTTING_BASE_URL = `${backendBase}/cnc_cutting`;

/**
 * CNC Files API Operations
 * Handles file management for CNC tasks
 */

/**
 * Delete a file from a CNC task
 * @param {number} fileId - The file ID to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteCncFile(fileId) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/files/${fileId}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete CNC file: ${response.statusText}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting CNC file:', error);
        throw error;
    }
}

/**
 * Add files to an existing CNC task
 * @param {number} taskId - The CNC task ID
 * @param {FileList|Array<File>} files - Files to upload
 * @returns {Promise<Object>} Response with uploaded file information
 */
export async function addFilesToCncTask(taskId, files) {
    try {
        // Create FormData for file upload
        const formData = new FormData();
        
        // Handle both FileList and Array
        const fileArray = Array.isArray(files) ? files : Array.from(files);
        
        // Add each file to FormData
        fileArray.forEach(file => {
            formData.append('files', file);
        });
        
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/${taskId}/add-file/`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to add files to CNC task: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error adding files to CNC task:', error);
        throw error;
    }
}

/**
 * Get file information by ID
 * @param {number} fileId - The file ID
 * @returns {Promise<Object>} File information
 */
export async function getCncFile(fileId) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/files/${fileId}/`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch CNC file: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching CNC file:', error);
        throw error;
    }
}

/**
 * Get all files for a specific CNC task
 * @param {number} taskId - The CNC task ID
 * @returns {Promise<Array>} Array of file information
 */
export async function getCncTaskFiles(taskId) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/${taskId}/files/`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch CNC task files: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Handle both direct array response and paginated response
        if (data.results && Array.isArray(data.results)) {
            return data; // Return the full paginated response
        } else if (Array.isArray(data)) {
            return data; // Return the direct array
        } else {
            throw new Error('Unexpected response format');
        }
    } catch (error) {
        console.error('Error fetching CNC task files:', error);
        throw error;
    }
}

/**
 * Download a file from a CNC task
 * @param {number} fileId - The file ID to download
 * @param {string} [filename] - Optional filename for download
 * @returns {Promise<Blob>} File blob for download
 */
export async function downloadCncFile(fileId, filename = null) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/files/${fileId}/download/`);
        
        if (!response.ok) {
            throw new Error(`Failed to download CNC file: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        
        // Create download link if filename is provided
        if (filename) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
        
        return blob;
    } catch (error) {
        console.error('Error downloading CNC file:', error);
        throw error;
    }
}

/**
 * Utility function to validate file upload
 * @param {FileList|Array<File>} files - Files to validate
 * @param {Object} [options] - Validation options
 * @param {number} [options.maxSize] - Maximum file size in bytes
 * @param {Array<string>} [options.allowedTypes] - Allowed MIME types
 * @param {number} [options.maxFiles] - Maximum number of files
 * @returns {Object} Validation result with isValid and errors
 */
export function validateFileUpload(files, options = {}) {
    const errors = [];
    const {
        maxSize = 10 * 1024 * 1024, // 10MB default
        allowedTypes = ['image/*', 'application/pdf', 'text/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        maxFiles = 10
    } = options;
    
    const fileArray = Array.isArray(files) ? files : Array.from(files);
    
    if (fileArray.length === 0) {
        errors.push('No files selected');
        return { isValid: false, errors };
    }
    
    if (fileArray.length > maxFiles) {
        errors.push(`Maximum ${maxFiles} files allowed`);
    }
    
    fileArray.forEach((file, index) => {
        // Check file size
        if (file.size > maxSize) {
            errors.push(`File ${index + 1} (${file.name}) exceeds maximum size of ${Math.round(maxSize / 1024 / 1024)}MB`);
        }
        
        // Check file type
        const isAllowedType = allowedTypes.some(type => {
            if (type.endsWith('/*')) {
                return file.type.startsWith(type.slice(0, -1));
            }
            return file.type === type;
        });
        
        if (!isAllowedType) {
            errors.push(`File ${index + 1} (${file.name}) has unsupported file type: ${file.type}`);
        }
    });
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Utility function to format file data for display
 * @param {Object} file - File object
 * @returns {Object} Formatted file data
 */
export function formatCncFileForDisplay(file) {
    return {
        id: file.id,
        filename: file.filename,
        originalName: file.original_name,
        fileSize: file.file_size,
        mimeType: file.mime_type,
        uploadDate: file.uploaded_at,
        taskId: file.task_id,
        downloadUrl: file.download_url,
        previewUrl: file.preview_url
    };
}

/**
 * Utility function to get file icon based on MIME type
 * @param {string} mimeType - File MIME type
 * @returns {string} FontAwesome icon class
 */
export function getFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) {
        return 'fas fa-image';
    } else if (mimeType === 'application/pdf') {
        return 'fas fa-file-pdf';
    } else if (mimeType.startsWith('text/')) {
        return 'fas fa-file-alt';
    } else if (mimeType.includes('word') || mimeType.includes('document')) {
        return 'fas fa-file-word';
    } else if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
        return 'fas fa-file-excel';
    } else if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) {
        return 'fas fa-file-powerpoint';
    } else if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) {
        return 'fas fa-file-archive';
    } else {
        return 'fas fa-file';
    }
}

/**
 * Utility function to format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

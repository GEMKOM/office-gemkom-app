// File Attachments Component
export class FileAttachments {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container with id "${containerId}" not found`);
        }
        
        this.options = {
            title: 'Ekler',
            titleIcon: 'fas fa-paperclip',
            titleIconColor: 'text-muted',
            showTitle: true,
            layout: 'grid', // 'grid' or 'list'
            maxThumbnailSize: 80,
            onFileClick: null, // Callback for file click
            onDownloadClick: null, // Callback for download click
            ...options
        };
        
        this.files = [];
        this.onFileClick = this.options.onFileClick;
        this.onDownloadClick = this.options.onDownloadClick;
    }
    
    /**
     * Set files data and render
     * @param {Array} files - Array of file objects
     */
    setFiles(files) {
        this.files = files || [];
        this.render();
    }
    
    /**
     * Add a single file
     * @param {Object} file - File object
     */
    addFile(file) {
        this.files.push(file);
        this.render();
    }
    
    /**
     * Remove a file by index
     * @param {number} index - File index to remove
     */
    removeFile(index) {
        if (index >= 0 && index < this.files.length) {
            this.files.splice(index, 1);
            this.render();
        }
    }
    
    /**
     * Clear all files
     */
    clearFiles() {
        this.files = [];
        this.render();
    }
    
    /**
     * Render the file attachments
     */
    render() {
        if (!this.files || this.files.length === 0) {
            this.container.innerHTML = '';
            return;
        }
        
        const titleHtml = this.options.showTitle ? `
            <h6 class="mb-3">
                <i class="${this.options.titleIcon} me-2 ${this.options.titleIconColor}"></i>${this.options.title} (${this.files.length})
            </h6>
        ` : '';
        
        const filesHtml = this.files.map((file, index) => {
            return this.createFileHtml(file, index);
        }).join('');
        
        const layoutClass = this.options.layout === 'list' ? 'file-attachments-list' : 'file-attachments-grid';
        
        this.container.innerHTML = `
            <div class="file-attachments-container">
                ${titleHtml}
                <div class="${layoutClass}">
                    ${filesHtml}
                </div>
            </div>
        `;
        
        // Bind click events
        this.bindEvents();
    }
    
    /**
     * Create HTML for a single file
     */
    createFileHtml(file, index) {
        const fileName = this.getFileName(file);
        const fileExtension = this.getFileExtension(fileName);
        const isImage = this.isImageFile(fileExtension);
        const isPdf = fileExtension === 'pdf';
        
        // Format date
        const uploadDate = file.uploaded_at ? new Date(file.uploaded_at) : new Date();
        const formattedDate = uploadDate.toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
        const formattedTime = uploadDate.toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        // Create thumbnail
        const thumbnailHtml = this.createThumbnailHtml(file, fileName, fileExtension, isImage, isPdf);
        
        // Create file info
        const fileInfoHtml = this.createFileInfoHtml(file, fileName, formattedDate, formattedTime);
        
        // Create actions
        const actionsHtml = this.createActionsHtml(file, fileName, fileExtension);
        
        if (this.options.layout === 'list') {
            return `
                <div class="file-attachment-item d-flex align-items-start gap-3 p-3 border rounded mb-2" data-file-index="${index}">
                    ${thumbnailHtml}
                    <div class="file-details flex-grow-1">
                        ${fileInfoHtml}
                        ${actionsHtml}
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="file-attachment-item d-flex align-items-start gap-3 p-3 border rounded" data-file-index="${index}" style="min-width: 300px; max-width: 400px; background: white;">
                    ${thumbnailHtml}
                    <div class="file-details flex-grow-1">
                        ${fileInfoHtml}
                        ${actionsHtml}
                    </div>
                </div>
            `;
        }
    }
    
    /**
     * Create thumbnail HTML
     */
    createThumbnailHtml(file, fileName, fileExtension, isImage, isPdf) {
        const thumbnailSize = this.options.maxThumbnailSize;
        
        if (isImage) {
            return `
                <div class="file-thumbnail-image" 
                     style="width: ${thumbnailSize}px; height: ${thumbnailSize}px; 
                            background-image: url('${file.file_url}'); 
                            background-size: cover; background-position: center; 
                            border-radius: 6px; cursor: pointer; 
                            border: 1px solid #e1e5e9;" 
                     data-file-index="${this.files.indexOf(file)}">
                </div>
            `;
        } else if (isPdf) {
            return `
                <div class="file-thumbnail-icon d-flex align-items-center justify-content-center" 
                     style="width: ${thumbnailSize}px; height: ${thumbnailSize}px; 
                            background: #f8f9fa; border: 1px solid #e1e5e9; 
                            border-radius: 6px; cursor: pointer;" 
                     data-file-index="${this.files.indexOf(file)}">
                    <div class="text-center">
                        <i class="fas fa-file-pdf text-danger fa-2x"></i>
                    </div>
                </div>
            `;
        } else {
            const iconClass = this.getFileIconClass(fileExtension);
            return `
                <div class="file-thumbnail-icon d-flex align-items-center justify-content-center" 
                     style="width: ${thumbnailSize}px; height: ${thumbnailSize}px; 
                            background: #f8f9fa; border: 1px solid #e1e5e9; 
                            border-radius: 6px; cursor: pointer;" 
                     data-file-index="${this.files.indexOf(file)}">
                    <div class="text-center">
                        <i class="${iconClass} fa-2x"></i>
                    </div>
                </div>
            `;
        }
    }
    
    /**
     * Create file info HTML
     */
    createFileInfoHtml(file, fileName, formattedDate, formattedTime) {
        const uploader = file.uploaded_by_username || 'Bilinmeyen';
        
        return `
            <div class="file-name fw-medium mb-1" style="color: #172b4d; font-size: 14px;">${fileName}</div>
            <div class="file-meta text-muted" style="font-size: 12px;">
                ${uploader} • ${formattedDate}, ${formattedTime}
            </div>
        `;
    }
    
    /**
     * Create actions HTML
     */
    createActionsHtml(file, fileName, fileExtension) {
        return `
            <div class="file-actions mt-2">
                <button class="btn btn-sm btn-outline-primary me-2 preview-btn" 
                        data-file-url="${file.file_url}" 
                        data-file-name="${fileName}" 
                        data-file-extension="${fileExtension}" 
                        style="font-size: 12px;">
                    <i class="fas fa-eye me-1"></i>Önizle
                </button>
                <button class="btn btn-sm btn-outline-secondary download-btn" 
                        data-file-url="${file.file_url}" 
                        data-file-name="${fileName}" 
                        style="font-size: 12px;">
                    <i class="fas fa-download me-1"></i>İndir
                </button>
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Thumbnail clicks
        this.container.querySelectorAll('.file-thumbnail-image, .file-thumbnail-icon').forEach(thumbnail => {
            thumbnail.addEventListener('click', (e) => {
                const fileIndex = parseInt(e.currentTarget.dataset.fileIndex);
                const file = this.files[fileIndex];
                if (file && this.onFileClick) {
                    this.onFileClick(file, fileIndex);
                }
            });
        });
        
        // Preview button clicks
        this.container.querySelectorAll('.preview-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileUrl = e.currentTarget.dataset.fileUrl;
                const fileName = e.currentTarget.dataset.fileName;
                const fileExtension = e.currentTarget.dataset.fileExtension;
                
                if (this.onFileClick) {
                    this.onFileClick({
                        file_url: fileUrl,
                        file_name: fileName,
                        file_extension: fileExtension
                    });
                }
            });
        });
        
        // Download button clicks
        this.container.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileUrl = e.currentTarget.dataset.fileUrl;
                const fileName = e.currentTarget.dataset.fileName;
                
                if (this.onDownloadClick) {
                    this.onDownloadClick(fileUrl, fileName);
                } else {
                    // Default download behavior - force download
                    this.forceDownload(fileUrl, fileName);
                }
            });
        });
    }
    
    /**
     * Get file name from file object
     */
    getFileName(file) {
        if (file.file_name) {
            return file.file_name.split('/').pop();
        } else if (file.name) {
            return file.name;
        } else if (file.filename) {
            return file.filename;
        }
        return 'Dosya';
    }
    
    /**
     * Get file extension from file name
     */
    getFileExtension(fileName) {
        return fileName.split('.').pop().toLowerCase();
    }
    
    /**
     * Check if file is an image
     */
    isImageFile(fileExtension) {
        return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension);
    }
    
    /**
     * Get icon class for file type
     */
    getFileIconClass(fileExtension) {
        const ext = fileExtension.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
            return 'fas fa-image text-success';
        } else if (ext === 'pdf') {
            return 'fas fa-file-pdf text-danger';
        } else if (['mp4', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) {
            return 'fas fa-video text-info';
        } else if (['doc', 'docx'].includes(ext)) {
            return 'fas fa-file-word text-primary';
        } else if (['xls', 'xlsx'].includes(ext)) {
            return 'fas fa-file-excel text-success';
        } else if (['ppt', 'pptx'].includes(ext)) {
            return 'fas fa-file-powerpoint text-warning';
        } else {
            return 'fas fa-file text-muted';
        }
    }
    
    /**
     * Set file click callback
     */
    setOnFileClick(callback) {
        this.onFileClick = callback;
    }
    
    /**
     * Set download click callback
     */
    setOnDownloadClick(callback) {
        this.onDownloadClick = callback;
    }
    
    /**
     * Update options
     */
    updateOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
        this.render();
    }
    
    /**
     * Force download a file by creating a blob
     */
    forceDownload(fileUrl, fileName) {
        fetch(fileUrl)
            .then(response => response.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            })
            .catch(error => {
                console.error('Download failed:', error);
                // Fallback to direct link
                const link = document.createElement('a');
                link.href = fileUrl;
                link.download = fileName;
                link.target = '_blank';
                link.click();
            });
    }
}

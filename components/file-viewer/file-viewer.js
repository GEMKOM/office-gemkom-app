// File Viewer Component
export class FileViewer {
    constructor() {
        this.currentPageContent = null;
        this.currentPageTitle = null;
        this.zoomLevel = 100;
        this.currentFileUrl = null;
        this.currentFileName = null;
    }
    
    /**
     * Open file in full-page viewer
     * @param {string} fileUrl - URL of the file to display
     * @param {string} fileName - Name of the file
     * @param {string} fileExtension - File extension
     */
    openFile(fileUrl, fileName, fileExtension) {
        // Store current file info for download
        this.currentFileUrl = fileUrl;
        this.currentFileName = fileName;
        
        // Create full-page file viewer overlay
        const fileViewerHtml = this.createFileViewerHtml(fileUrl, fileName, fileExtension);
        
        // Create overlay container
        const overlay = document.createElement('div');
        overlay.id = 'file-viewer-overlay';
        overlay.innerHTML = fileViewerHtml;
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: #1a1a1a;
            z-index: 9999;
        `;
        
        // Add overlay to body
        document.body.appendChild(overlay);
        
        // Render file content
        this.renderFileContent(fileUrl, fileExtension);
        
        // Bind events
        this.bindEvents();
    }
    
    /**
     * Create the HTML structure for the file viewer
     */
    createFileViewerHtml(fileUrl, fileName, fileExtension) {
        const fileIcon = this.getFileIcon(fileExtension);
        const fileType = this.getFileType(fileExtension);
        
        return `
            <div class="file-viewer-container" style="width: 100%; height: 100%; background: #1a1a1a;">
                <!-- Header -->
                <div class="file-viewer-header d-flex align-items-center justify-content-between p-3" style="background: #2d2d2d; border-bottom: 1px solid #404040;">
                    <div class="d-flex align-items-center">
                        <i class="${fileIcon} me-2"></i>
                        <span class="text-white fw-medium">${fileName}</span>
                        <span class="text-muted ms-2">${fileType}</span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-outline-light btn-sm" id="download-btn">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn btn-outline-light btn-sm" id="close-btn">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Content Area -->
                <div class="file-viewer-content" style="height: calc(100vh - 60px); position: relative;">
                    <div id="file-content" class="d-flex align-items-center justify-content-center" style="height: 100%;">
                        <div class="text-center text-white">
                            <i class="fas fa-spinner fa-spin fa-2x"></i>
                            <p class="mt-2">Dosya yükleniyor...</p>
                        </div>
                    </div>
                </div>
                
                <!-- Zoom Controls -->
                <div class="file-viewer-controls position-fixed" style="bottom: 20px; right: 20px;">
                    <div class="btn-group-vertical">
                        <button class="btn btn-dark btn-sm" id="zoom-in-btn">
                            <i class="fas fa-search-plus"></i>
                        </button>
                        <button class="btn btn-dark btn-sm" id="zoom-out-btn">
                            <i class="fas fa-search-minus"></i>
                        </button>
                        <button class="btn btn-dark btn-sm" id="zoom-reset-btn" title="Reset Zoom">
                            <i class="fas fa-expand-arrows-alt"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Zoom Level Display -->
                <div class="zoom-level position-fixed" style="bottom: 20px; left: 20px; background: rgba(0,0,0,0.7); color: white; padding: 5px 10px; border-radius: 4px; font-size: 12px;">
                    <span id="zoom-level-text">${this.zoomLevel}%</span>
                </div>
            </div>
        `;
    }
    
    /**
     * Get appropriate icon for file type
     */
    getFileIcon(fileExtension) {
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
     * Get file type description
     */
    getFileType(fileExtension) {
        const ext = fileExtension.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
            return 'resim';
        } else if (ext === 'pdf') {
            return 'belge';
        } else if (['mp4', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) {
            return 'video';
        } else if (['doc', 'docx'].includes(ext)) {
            return 'belge';
        } else if (['xls', 'xlsx'].includes(ext)) {
            return 'tablo';
        } else if (['ppt', 'pptx'].includes(ext)) {
            return 'sunum';
        } else {
            return 'dosya';
        }
    }
    
    /**
     * Render file content based on type
     */
    renderFileContent(fileUrl, fileExtension) {
        const overlay = document.getElementById('file-viewer-overlay');
        if (!overlay) return;
        
        const fileContent = overlay.querySelector('#file-content');
        const ext = fileExtension.toLowerCase();
        
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
            this.renderImage(fileUrl, fileContent);
        } else if (ext === 'pdf') {
            this.renderPdf(fileUrl, fileContent);
        } else if (['mp4', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) {
            this.renderVideo(fileUrl, ext, fileContent);
        } else if (['txt', 'json', 'xml', 'csv', 'log'].includes(ext)) {
            this.renderText(fileUrl, fileContent);
        } else {
            this.renderUnsupported(fileContent);
        }
    }
    
    /**
     * Render image file
     */
    renderImage(fileUrl, container) {
        const img = document.createElement('img');
        img.src = fileUrl;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        img.id = 'viewer-image';
        
        img.onload = () => {
            container.innerHTML = '';
            container.appendChild(img);
        };
        
        img.onerror = () => {
            container.innerHTML = `
                <div class="text-center text-white">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <p class="mt-2">Resim yüklenemedi</p>
                </div>
            `;
        };
    }
    
    /**
     * Render PDF file
     */
    renderPdf(fileUrl, container) {
        container.innerHTML = `
            <iframe id="viewer-pdf" src="${fileUrl}" width="100%" height="100%" style="border: none; background: white;">
                <div class="text-center text-white">
                    <i class="fas fa-file-pdf fa-2x"></i>
                    <p class="mt-2">PDF önizleme desteklenmiyor. İndir butonunu kullanın.</p>
                </div>
            </iframe>
        `;
    }
    
    /**
     * Render video file
     */
    renderVideo(fileUrl, fileExtension, container) {
        container.innerHTML = `
            <video id="viewer-video" controls width="100%" height="100%" style="background: black;">
                <source src="${fileUrl}" type="video/${fileExtension}">
                Tarayıcınız video önizlemesini desteklemiyor.
            </video>
        `;
    }
    
    /**
     * Render text file
     */
    renderText(fileUrl, container) {
        fetch(fileUrl)
            .then(response => response.text())
            .then(text => {
                container.innerHTML = `
                    <div id="viewer-text" style="width: 100%; height: 100%; background: white; padding: 20px; overflow-y: auto;">
                        <pre style="white-space: pre-wrap; font-family: monospace;">${text}</pre>
                    </div>
                `;
            })
            .catch(() => {
                container.innerHTML = `
                    <div class="text-center text-white">
                        <i class="fas fa-exclamation-triangle fa-2x"></i>
                        <p class="mt-2">Metin dosyası yüklenemedi</p>
                    </div>
                `;
            });
    }
    
    /**
     * Render unsupported file type
     */
    renderUnsupported(container) {
        container.innerHTML = `
            <div class="text-center text-white">
                <i class="fas fa-file fa-2x"></i>
                <p class="mt-2">Bu dosya türü için önizleme mevcut değil</p>
                <p class="small">İndir butonunu kullanarak dosyayı görüntüleyebilirsiniz</p>
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        const overlay = document.getElementById('file-viewer-overlay');
        if (!overlay) return;
        
        // Close button
        const closeBtn = overlay.querySelector('#close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.close();
            });
        }
        
        // Download button
        const downloadBtn = overlay.querySelector('#download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                this.download();
            });
        }
        
        // Zoom controls
        const zoomInBtn = overlay.querySelector('#zoom-in-btn');
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                this.zoomIn();
            });
        }
        
        const zoomOutBtn = overlay.querySelector('#zoom-out-btn');
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                this.zoomOut();
            });
        }
        
        const zoomResetBtn = overlay.querySelector('#zoom-reset-btn');
        if (zoomResetBtn) {
            zoomResetBtn.addEventListener('click', () => {
                this.zoomReset();
            });
        }
        
        // Keyboard shortcuts
        const keydownHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
            } else if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                this.zoomIn();
            } else if (e.key === '-') {
                e.preventDefault();
                this.zoomOut();
            } else if (e.key === '0') {
                e.preventDefault();
                this.zoomReset();
            }
        };
        
        document.addEventListener('keydown', keydownHandler);
        
        // Store handler for cleanup
        this.keydownHandler = keydownHandler;
    }
    
    /**
     * Close file viewer and restore page
     */
    close() {
        // Clean up event listeners
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }
        
        // Remove overlay
        const overlay = document.getElementById('file-viewer-overlay');
        if (overlay) {
            overlay.remove();
        }
        
        // Trigger custom event for page re-initialization (if needed)
        window.dispatchEvent(new CustomEvent('fileViewerClosed'));
    }
    
    /**
     * Download current file
     */
    download() {
        // This will be set by the calling code
        if (this.downloadCallback) {
            this.downloadCallback();
        } else {
            // Fallback: try to download the current file
            this.downloadFile(this.currentFileUrl, this.currentFileName);
        }
    }
    
    /**
     * Set download callback
     */
    setDownloadCallback(callback) {
        this.downloadCallback = callback;
    }
    
    /**
     * Download file with proper handling for different file types
     */
    async downloadFile(fileUrl, fileName) {
        try {
            // Try to fetch the file as a blob first
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const blob = await response.blob();
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            
            // Append to body, click, and remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the URL object
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            console.warn('Failed to download via fetch, falling back to direct link:', error);
            
            // Fallback: try direct download link
            const link = document.createElement('a');
            link.href = fileUrl;
            link.download = fileName;
            link.target = '_blank';
            
            // Append to body, click, and remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
    
    /**
     * Zoom in
     */
    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel + 25, 300);
        this.applyZoom();
    }
    
    /**
     * Zoom out
     */
    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel - 25, 25);
        this.applyZoom();
    }
    
    /**
     * Reset zoom
     */
    zoomReset() {
        this.zoomLevel = 100;
        this.applyZoom();
    }
    
    /**
     * Apply zoom level to content
     */
    applyZoom() {
        const overlay = document.getElementById('file-viewer-overlay');
        if (!overlay) return;
        
        const zoomText = overlay.querySelector('#zoom-level-text');
        if (zoomText) {
            zoomText.textContent = `${this.zoomLevel}%`;
        }
        
        // Apply zoom to different content types
        const image = overlay.querySelector('#viewer-image');
        const pdf = overlay.querySelector('#viewer-pdf');
        const video = overlay.querySelector('#viewer-video');
        const text = overlay.querySelector('#viewer-text');
        
        if (image) {
            image.style.transform = `scale(${this.zoomLevel / 100})`;
        } else if (pdf) {
            pdf.style.transform = `scale(${this.zoomLevel / 100})`;
            pdf.style.transformOrigin = 'top left';
        } else if (video) {
            video.style.transform = `scale(${this.zoomLevel / 100})`;
        } else if (text) {
            text.style.fontSize = `${this.zoomLevel / 100}em`;
        }
    }
}

// Global instance
window.fileViewer = new FileViewer();

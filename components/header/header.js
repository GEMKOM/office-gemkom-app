/**
 * Reusable Header Component
 * Provides a consistent header across different pages with configurable buttons
 */

export class HeaderComponent {
    constructor(config = {}) {
        this.config = {
            // Default configuration
            title: 'Sayfa Başlığı',
            subtitle: 'Sayfa açıklaması',
            icon: 'home',
            containerId: 'header-placeholder', // Default container ID
            
            // Button visibility
            showBackButton: 'block',
            showCreateButton: 'none',
            showBulkCreateButton: 'none',
            showExportButton: 'none',
            showRefreshButton: 'none',
            
            // Button text
            createButtonText: 'Yeni Oluştur',
            bulkCreateButtonText: 'Toplu Oluştur',
            exportButtonText: 'Dışa Aktar',
            refreshButtonText: 'Yenile',
            
            // Callback functions
            onBackClick: null,
            onCreateClick: null,
            onBulkCreateClick: null,
            onExportClick: null,
            onRefreshClick: null,
            
            // Default back navigation
            backUrl: null,
            
            ...config
        };
        
        this.init();
    }
    
    init() {
        this.render();
        this.attachEventListeners();
    }
    
    render() {
        // Get the template
        const template = this.getTemplate();
        
        // Replace placeholders with actual values
        const html = template
            .replace(/{{title}}/g, this.config.title)
            .replace(/{{subtitle}}/g, this.config.subtitle)
            .replace(/{{icon}}/g, this.config.icon)
            .replace(/{{showBackButton}}/g, this.config.showBackButton)
            .replace(/{{showCreateButton}}/g, this.config.showCreateButton)
            .replace(/{{showBulkCreateButton}}/g, this.config.showBulkCreateButton)
            .replace(/{{showExportButton}}/g, this.config.showExportButton)
            .replace(/{{showRefreshButton}}/g, this.config.showRefreshButton)
            .replace(/{{createButtonText}}/g, this.config.createButtonText)
            .replace(/{{bulkCreateButtonText}}/g, this.config.bulkCreateButtonText)
            .replace(/{{exportButtonText}}/g, this.config.exportButtonText)
            .replace(/{{refreshButtonText}}/g, this.config.refreshButtonText);
        
        // Insert the header into the page
        this.insertHeader(html);
    }
    
    getTemplate() {
        // In a real implementation, you might fetch this from a file
        // For now, we'll return the template string
        return `
            <div class="row mb-3">
                <div class="col-12">
                    <div class="dashboard-header compact">
                        <div class="d-flex align-items-center justify-content-between">
                            <div>
                                <h3 class="section-title mb-1">
                                    <i class="fas fa-{{icon}} me-2 text-primary"></i>
                                    {{title}}
                                </h3>
                                <p class="section-subtitle mb-0 small">{{subtitle}}</p>
                            </div>
                            <div class="dashboard-controls">
                                                                 <!-- Back Button -->
                                 <button id="back-to-main" class="btn btn-sm btn-outline-secondary me-2" style="display: {{showBackButton}};">
                                     <i class="fas fa-arrow-left me-1"></i>Geri Dön
                                 </button>
                                 
                                 <!-- Create Button -->
                                 <button id="create-btn" class="btn btn-sm btn-primary me-2" style="display: {{showCreateButton}};">
                                     <i class="fas fa-plus me-1"></i>{{createButtonText}}
                                 </button>
                                 
                                 <!-- Bulk Create Button -->
                                 <button id="bulk-create-btn" class="btn btn-sm btn-outline-primary me-2" style="display: {{showBulkCreateButton}};">
                                     <i class="fas fa-layer-group me-1"></i>{{bulkCreateButtonText}}
                                 </button>
                                 
                                 <!-- Export Button -->
                                 <button id="export-btn" class="btn btn-sm btn-outline-secondary me-2" style="display: {{showExportButton}};">
                                     <i class="fas fa-download me-1"></i>{{exportButtonText}}
                                 </button>
                                 
                                 <!-- Refresh Button -->
                                 <button id="refresh-btn" class="btn btn-sm btn-primary" style="display: {{showRefreshButton}};">
                                     <i class="fas fa-sync-alt me-1"></i>{{refreshButtonText}}
                                 </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    insertHeader(html) {
        // Find the container element where the header should be inserted
        const container = document.getElementById(this.config.containerId);
        if (container) {
            // Insert the header HTML into the container
            container.innerHTML = html;
        } else {
            console.warn(`HeaderComponent: No container found with id '${this.config.containerId}'. Add <div id="${this.config.containerId}"></div> where you want the header to appear.`);
        }
    }
    
    attachEventListeners() {
        // Back button
        const backBtn = document.getElementById('back-to-main');
        if (backBtn && this.config.showBackButton !== 'none') {
            backBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.config.onBackClick) {
                    this.config.onBackClick();
                } else if (this.config.backUrl) {
                    window.location.href = this.config.backUrl;
                } else {
                    // Default back behavior
                    window.history.back();
                }
            });
        }
        
        // Create button
        const createBtn = document.getElementById('create-btn');
        if (createBtn && this.config.showCreateButton !== 'none') {
            createBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.config.onCreateClick) {
                    this.config.onCreateClick();
                }
            });
        }
        
        // Bulk create button
        const bulkCreateBtn = document.getElementById('bulk-create-btn');
        if (bulkCreateBtn && this.config.showBulkCreateButton !== 'none') {
            bulkCreateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.config.onBulkCreateClick) {
                    this.config.onBulkCreateClick();
                }
            });
        }
        
        // Export button
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn && this.config.showExportButton !== 'none') {
            exportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.config.onExportClick) {
                    this.config.onExportClick();
                }
            });
        }
        
        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn && this.config.showRefreshButton !== 'none') {
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.config.onRefreshClick) {
                    this.config.onRefreshClick();
                } else {
                    // Default refresh behavior
                    window.location.reload();
                }
            });
        }
    }
    
    // Method to update header configuration
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.render();
        this.attachEventListeners();
    }
    
    // Method to show/hide specific buttons
    showButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.style.display = 'block';
        }
    }
    
    hideButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.style.display = 'none';
        }
    }
    
    // Method to update title and subtitle
    updateTitle(title, subtitle = null) {
        const titleElement = document.querySelector('.section-title');
        const subtitleElement = document.querySelector('.section-subtitle');
        
        if (titleElement) {
            titleElement.innerHTML = `<i class="fas fa-${this.config.icon} me-2 text-primary"></i>${title}`;
        }
        
        if (subtitleElement && subtitle) {
            subtitleElement.textContent = subtitle;
        }
    }
}
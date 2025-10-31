/**
 * Reusable Confirmation Modal Component
 * Displays confirmation dialogs with customizable content and callbacks
 */
export class ConfirmationModal {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container with id "${containerId}" not found`);
        }
        
        this.options = {
            title: 'Onay',
            icon: 'fas fa-exclamation-triangle',
            message: 'Bu işlemi yapmak istediğinize emin misiniz?',
            confirmText: 'Evet',
            cancelText: 'İptal',
            confirmButtonClass: 'btn-primary',
            showCancelButton: true,
            ...options
        };
        
        this.modal = null;
        this.onConfirm = null;
        this.onCancel = null;
        
        this.init();
    }
    
    init() {
        this.createModal();
        this.bindEvents();
    }
    
    createModal() {
        const modalHtml = `
            <div class="modal fade confirmation-modal" id="confirmationModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header confirmation-modal-header">
                            <h5 class="modal-title">
                                <i class="${this.options.icon} me-2"></i>
                                <span class="confirmation-title-text">${this.options.title}</span>
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="text-center">
                                <i class="fas fa-question-circle confirmation-icon mb-3"></i>
                                <h5 class="confirmation-message">${this.options.message}</h5>
                                <p class="text-muted confirmation-description" id="confirmation-description"></p>
                                <div class="alert alert-info confirmation-details" id="confirmation-details" style="display: none;"></div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            ${this.options.showCancelButton ? `
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                    <i class="fas fa-times me-2"></i>${this.options.cancelText}
                                </button>
                            ` : ''}
                            <button type="button" class="btn ${this.options.confirmButtonClass}" id="confirm-action-btn">
                                <i class="fas fa-check me-2"></i>${this.options.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.container.innerHTML = modalHtml;
        this.modal = this.container.querySelector('#confirmationModal');
    }
    
    bindEvents() {
        // Confirm button event
        const confirmBtn = this.container.querySelector('#confirm-action-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.handleConfirm();
            });
        }
        
        // Cancel button event (when modal is closed)
        if (this.modal) {
            this.modal.addEventListener('hidden.bs.modal', () => {
                if (this.onCancel) {
                    this.onCancel();
                }
            });
        }
    }
    
    handleConfirm() {
        if (this.onConfirm) {
            this.onConfirm();
        }
        this.hide();
    }
    
    show(options = {}) {
        // Update options if provided
        if (options.title) {
            const titleElement = this.modal.querySelector('.confirmation-title-text');
            if (titleElement) {
                titleElement.textContent = options.title;
            }
        }
        
        if (options.message) {
            const messageElement = this.modal.querySelector('.confirmation-message');
            if (messageElement) {
                messageElement.textContent = options.message;
            }
        }
        
        if (options.description) {
            const descElement = document.getElementById('confirmation-description');
            if (descElement) {
                descElement.textContent = options.description;
                descElement.style.display = 'block';
            }
        } else {
            const descElement = document.getElementById('confirmation-description');
            if (descElement) {
                descElement.style.display = 'none';
            }
        }
        
        if (options.details) {
            const detailsElement = document.getElementById('confirmation-details');
            if (detailsElement) {
                detailsElement.innerHTML = options.details;
                detailsElement.style.display = 'block';
            }
        } else {
            const detailsElement = document.getElementById('confirmation-details');
            if (detailsElement) {
                detailsElement.style.display = 'none';
            }
        }
        
        if (options.confirmText) {
            const confirmBtn = this.container.querySelector('#confirm-action-btn');
            if (confirmBtn) {
                confirmBtn.innerHTML = `<i class="fas fa-check me-2"></i>${options.confirmText}`;
            }
        }
        
        // Set callbacks
        if (options.onConfirm) {
            this.onConfirm = options.onConfirm;
        }
        
        if (options.onCancel) {
            this.onCancel = options.onCancel;
        }
        
        // Show modal
        const modalInstance = bootstrap.Modal.getOrCreateInstance(this.modal);
        modalInstance.show();
    }
    
    hide() {
        if (this.modal) {
            const modalInstance = bootstrap.Modal.getInstance(this.modal);
            if (modalInstance) {
                modalInstance.hide();
            }
        }
    }
    
    setOnConfirm(callback) {
        this.onConfirm = callback;
    }
    
    setOnCancel(callback) {
        this.onCancel = callback;
    }
    
    updateMessage(message) {
        const messageElement = this.modal.querySelector('.confirmation-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }
    
    updateDetails(details) {
        const detailsElement = document.getElementById('confirmation-details');
        if (detailsElement) {
            detailsElement.innerHTML = details;
            detailsElement.style.display = details ? 'block' : 'none';
        }
    }
}


import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { ItemsManager } from './itemsManager.js';
import { SuppliersManager } from './suppliersManager.js';
import { ComparisonManager } from './comparisonManager.js';
import { DataManager } from './dataManager.js';
import { fetchCurrencyRates } from '../../../generic/formatters.js';
import { createPurchaseRequest, submitPurchaseRequest } from '../../../generic/procurement.js';

// Global state
let headerComponent;
let itemsManager;
let suppliersManager;
let comparisonManager;
let dataManager;

let requestData = {
    requestNumber: '',
    requestDate: '',
    requestor: '',
    items: [],
    suppliers: [],
    offers: {},
    recommendations: {},
    itemRecommendations: {}
};

// Currency conversion rates - will be fetched from backend
let currencyRates = null;

// Currency symbols
const currencySymbols = {
    TRY: '₺',
    USD: '$',
    EUR: '€',
    GBP: '£'
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    
    if (!guardRoute()) {
        return;
    }

    initNavbar();
    
    initializeManagers();
    
    initializeHeader();
    
    // Load draft before rendering to ensure we don't double-attach
    const draftLoaded = dataManager.loadDraftData();
    
    // Fetch currency rates and then render everything
    currencyRates = await fetchCurrencyRates();
    updateComparisonManagerRates();
    
    // Now render all components with proper currency rates
    renderAll();
    
});

function initializeHeader() {
    headerComponent = new HeaderComponent({
        title: 'Satın Alma Talebi Oluştur',
        subtitle: 'Malzeme ve tedarikçi bilgilerini girin',
        icon: 'file-invoice',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'none',
        showExportButton: 'block',
        showRefreshButton: 'none',
        createButtonText: 'Taslak Kaydet',
        exportButtonText: 'Gönder',
        onBackClick: () => {
            window.history.back();
        },
        onCreateClick: () => {
            dataManager.saveDraft();
            showNotification('Taslak kaydedildi', 'success');
        },
        onExportClick: () => {
            submitRequest();
        }
    });
}

function initializeManagers() {
    // Initialize data manager first
    dataManager = new DataManager(requestData);
    
    // Initialize other managers
    itemsManager = new ItemsManager(requestData, () => {
        dataManager.autoSave();
        renderAll();
    });
    
    suppliersManager = new SuppliersManager(requestData, () => {
        dataManager.autoSave();
        renderAll();
    }, currencySymbols);
    
    comparisonManager = new ComparisonManager(requestData, () => {
        dataManager.autoSave();
        renderAll();
    }, currencyRates, currencySymbols);
    
    // Make managers globally accessible for onclick handlers
    window.itemsManager = itemsManager;
    window.suppliersManager = suppliersManager;
    window.comparisonManager = comparisonManager;
}

function updateComparisonManagerRates() {
    if (comparisonManager && currencyRates) {
        comparisonManager.currencyRates = currencyRates;
        comparisonManager.renderComparisonTable();
        comparisonManager.updateSummary();
    }
}

function renderAll() {
    itemsManager.renderItemsTable();
    suppliersManager.renderSuppliersContainer();
    
    // Only render comparison if currency rates are available
    if (currencyRates) {
        comparisonManager.renderComparisonTable();
        comparisonManager.updateSummary();
    }
}

async function submitRequest() {
    // Validate data before submission
    const validation = dataManager.validateData();
    if (!validation.isValid) {
        showNotification('Lütfen tüm gerekli alanları doldurun: ' + validation.errors.join(', '), 'error');
        return;
    }
    
    try {
        // Prepare data for backend
        const submitData = {
            title: 'Malzeme Satın Alma Talebi', // You might want to make this configurable
            description: 'Proje için gerekli malzemeler', // You might want to make this configurable
            priority: 'normal', // You might want to make this configurable
            items: requestData.items,
            suppliers: requestData.suppliers,
            offers: requestData.offers,
            recommendations: requestData.recommendations
        };
        
        // Create purchase request using generic function
        const result = await createPurchaseRequest(submitData);
        
        // Submit the request (change status from draft to submitted)
        await submitPurchaseRequest(result.id);
        
        showNotification('Talep başarıyla gönderildi!', 'success');
        
        // Clear draft after successful submission
        dataManager.clearDraft();
        
        // Reset the form
        requestData = {
            requestNumber: '',
            requestDate: '',
            requestor: '',
            items: [],
            suppliers: [],
            offers: {},
            recommendations: {},
            itemRecommendations: {}
        };
        
        renderAll();
        
    } catch (error) {
        console.error('Submission error:', error);
        showNotification('Talep gönderilirken hata oluştu: ' + error.message, 'error');
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// Export functions for potential external use
window.purchaseRequestApp = {
    getData: () => requestData,
    exportData: () => dataManager.exportData(),
    importData: (file) => dataManager.importData(file),
    clearData: () => {
        requestData = {
            requestNumber: '',
            requestDate: '',
            requestor: '',
            items: [],
            suppliers: [],
            offers: {},
            recommendations: {},
            itemRecommendations: {}
        };
        renderAll();
        dataManager.clearDraft();
    }
};

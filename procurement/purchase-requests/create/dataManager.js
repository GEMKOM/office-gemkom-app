// Data Manager Module
export class DataManager {
    constructor(requestData) {
        this.requestData = requestData;
        this.autoSaveTimeout = null;
        this.setupAutoSave();
    }

    setupAutoSave() {
        // Auto-save every 30 seconds
        setInterval(() => {
            if (this.hasMeaningfulData()) {
                this.saveDraft();
            }
        }, 30000);
    }

    hasMeaningfulData() {
        // Check if there's actually meaningful data to save
        return (
            (this.requestData.title && this.requestData.title.trim() !== '') ||
            (this.requestData.description && this.requestData.description.trim() !== '') ||
            (this.requestData.needed_date && this.requestData.needed_date.trim() !== '') ||
            (this.requestData.items && this.requestData.items.length > 0) ||
            (this.requestData.suppliers && this.requestData.suppliers.length > 0) ||
            (this.requestData.offers && Object.keys(this.requestData.offers).length > 0) ||
            (this.requestData.itemRecommendations && Object.keys(this.requestData.itemRecommendations).length > 0)
        );
    }

    autoSave() {
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            if (this.hasMeaningfulData()) {
                this.saveDraft();
                this.showAutoSaveIndicator();
            }
        }, 2000);
    }

    showAutoSaveIndicator() {
        let indicator = document.querySelector('.auto-save-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'auto-save-indicator position-fixed top-0 end-0 p-3';
            indicator.style.zIndex = '9999';
            document.body.appendChild(indicator);
        }
        
        indicator.innerHTML = `
            <div class="alert alert-success alert-dismissible fade show" role="alert">
                <i class="fas fa-check-circle me-2"></i>
                Otomatik kaydedildi
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        setTimeout(() => {
            if (indicator) {
                indicator.remove();
            }
        }, 3000);
    }

    saveDraft() {
        try {
            const draftData = {
                title: this.requestData.title,
                description: this.requestData.description,
                priority: this.requestData.priority,
                needed_date: this.requestData.needed_date,
                items: this.requestData.items,
                suppliers: this.requestData.suppliers,
                offers: this.requestData.offers,
                recommendations: this.requestData.recommendations,
                itemRecommendations: this.requestData.itemRecommendations,
                timestamp: new Date().toISOString()
            };
            
            console.log('Saving draft with needed_date:', this.requestData.needed_date);
            localStorage.setItem('purchaseRequestDraft', JSON.stringify(draftData));
        } catch (error) {
            console.error('Error saving draft:', error);
        }
    }

    loadDraftData() {
        try {
            const savedDraft = localStorage.getItem('purchaseRequestDraft');
            if (savedDraft) {
                const draftData = JSON.parse(savedDraft);
                console.log('Loading draft from localStorage:', draftData);
                
                // Check if draft is not too old (e.g., 24 hours)
                const draftTime = new Date(draftData.timestamp);
                const now = new Date();
                const hoursDiff = (now - draftTime) / (1000 * 60 * 60);
                
                if (hoursDiff < 24) {
                    // Migrate old data format if needed
                    this.migrateSupplierData(draftData);
                    
                    this.requestData.title = draftData.title || '';
                    this.requestData.description = draftData.description || '';
                    this.requestData.priority = draftData.priority || 'normal';
                    this.requestData.needed_date = draftData.needed_date || '';
                    this.requestData.items = draftData.items || [];
                    this.requestData.suppliers = draftData.suppliers || [];
                    this.requestData.offers = draftData.offers || {};
                    this.requestData.recommendations = draftData.recommendations || {};
                    this.requestData.itemRecommendations = draftData.itemRecommendations || {};
                    
                    console.log('Loaded needed_date from localStorage:', this.requestData.needed_date);
                    
                    return true;
                } else {
                    localStorage.removeItem('purchaseRequestDraft');
                }
            }
        } catch (error) {
            console.error('Error loading draft:', error);
            localStorage.removeItem('purchaseRequestDraft');
        }
        return false;
    }

    migrateSupplierData(draftData) {
        // Migrate suppliers from draft format to frontend format
        if (draftData.suppliers && Array.isArray(draftData.suppliers)) {
            console.log('Migrating supplier data from draft format:', draftData.suppliers);
            draftData.suppliers.forEach(supplier => {
                // Map currency to default_currency (draft format -> frontend format)
                if (supplier.currency !== undefined && supplier.default_currency === undefined) {
                    console.log('Migrating currency to default_currency for supplier:', supplier.name);
                    supplier.default_currency = supplier.currency;
                    delete supplier.currency;
                }
                
                // Map payment_terms_id to default_payment_terms (draft format -> frontend format)
                if (supplier.payment_terms_id !== undefined && supplier.default_payment_terms === undefined) {
                    console.log('Migrating payment_terms_id to default_payment_terms for supplier:', supplier.name, 'value:', supplier.payment_terms_id);
                    supplier.default_payment_terms = supplier.payment_terms_id;
                    delete supplier.payment_terms_id;
                }
                
                // Map tax_rate to default_tax_rate (draft format -> frontend format)
                if (supplier.tax_rate !== undefined && supplier.default_tax_rate === undefined) {
                    console.log('Migrating tax_rate to default_tax_rate for supplier:', supplier.name, 'value:', supplier.tax_rate);
                    supplier.default_tax_rate = supplier.tax_rate;
                    delete supplier.tax_rate;
                }
                
                // Also handle legacy migration from old field names
                if (supplier.payment_terms !== undefined && supplier.default_payment_terms === undefined) {
                    console.log('Migrating payment_terms to default_payment_terms for supplier:', supplier.name);
                    supplier.default_payment_terms = supplier.payment_terms;
                    delete supplier.payment_terms;
                }
            });
            console.log('Migration completed:', draftData.suppliers);
        }
    }

    clearDraft() {
        try {
            localStorage.removeItem('purchaseRequestDraft');
        } catch (error) {
            console.error('Error clearing draft:', error);
        }
    }

    exportData() {
        try {
            const exportData = {
                title: this.requestData.title,
                description: this.requestData.description,
                priority: this.requestData.priority,
                needed_date: this.requestData.needed_date,
                items: this.requestData.items,
                suppliers: this.requestData.suppliers,
                offers: this.requestData.offers,
                recommendations: this.requestData.recommendations,
                itemRecommendations: this.requestData.itemRecommendations,
                exportDate: new Date().toISOString()
            };
            
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `purchase-request-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            
        } catch (error) {
            console.error('Error exporting data:', error);
            alert('Veri dışa aktarma hatası: ' + error.message);
        }
    }

    importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importData = JSON.parse(e.target.result);
                    
                    // Validate the imported data structure
                    if (!importData.items || !importData.suppliers) {
                        throw new Error('Geçersiz veri formatı');
                    }
                    
                    // Migrate old data format if needed
                    this.migrateSupplierData(importData);
                    
                    this.requestData.title = importData.title || '';
                    this.requestData.description = importData.description || '';
                    this.requestData.priority = importData.priority || 'normal';
                    this.requestData.needed_date = importData.needed_date || '';
                    this.requestData.items = importData.items || [];
                    this.requestData.suppliers = importData.suppliers || [];
                    this.requestData.offers = importData.offers || {};
                    this.requestData.recommendations = importData.recommendations || {};
                    this.requestData.itemRecommendations = importData.itemRecommendations || {};
                    
                    resolve(true);
                } catch (error) {
                    console.error('Error importing data:', error);
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Dosya okuma hatası'));
            reader.readAsText(file);
        });
    }

    getDataStats() {
        return {
            totalItems: this.requestData.items.length,
            totalSuppliers: this.requestData.suppliers.length,
            totalOffers: Object.keys(this.requestData.offers).length,
            totalRecommendations: Object.keys(this.requestData.itemRecommendations || {}).length,
            lastModified: this.requestData.lastModified || new Date().toISOString()
        };
    }

    validateData() {
        const errors = [];
        
        // Validate items
        this.requestData.items.forEach((item, index) => {
            if (!item.name || !item.code) {
                errors.push(`Item ${index + 1}: Name and code are required`);
            }
            if (!item.job_no) {
                errors.push(`Item ${index + 1}: Job number is required`);
            }
            if (!item.quantity || item.quantity <= 0) {
                errors.push(`Item ${index + 1}: Valid quantity is required`);
            }
        });
        
        // Validate suppliers
        this.requestData.suppliers.forEach((supplier, index) => {
            if (!supplier.name) {
                errors.push(`Supplier ${index + 1}: Name is required`);
            }
            if (!supplier.default_currency) {
                errors.push(`Supplier ${index + 1}: Currency is required`);
            }
        });
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
}

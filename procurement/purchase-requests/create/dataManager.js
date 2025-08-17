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
            if (Object.keys(this.requestData).length > 0) {
                this.saveDraft();
            }
        }, 30000);
    }

    autoSave() {
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.saveDraft();
            this.showAutoSaveIndicator();
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
                items: this.requestData.items,
                suppliers: this.requestData.suppliers,
                offers: this.requestData.offers,
                recommendations: this.requestData.recommendations,
                itemRecommendations: this.requestData.itemRecommendations,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('purchaseRequestDraft', JSON.stringify(draftData));
            console.log('Draft saved successfully');
        } catch (error) {
            console.error('Error saving draft:', error);
        }
    }

    loadDraftData() {
        try {
            const savedDraft = localStorage.getItem('purchaseRequestDraft');
            if (savedDraft) {
                const draftData = JSON.parse(savedDraft);
                
                // Check if draft is not too old (e.g., 24 hours)
                const draftTime = new Date(draftData.timestamp);
                const now = new Date();
                const hoursDiff = (now - draftTime) / (1000 * 60 * 60);
                
                if (hoursDiff < 24) {
                    this.requestData.items = draftData.items || [];
                    this.requestData.suppliers = draftData.suppliers || [];
                    this.requestData.offers = draftData.offers || {};
                    this.requestData.recommendations = draftData.recommendations || {};
                    this.requestData.itemRecommendations = draftData.itemRecommendations || {};
                    
                    console.log('Draft loaded successfully');
                    return true;
                } else {
                    console.log('Draft is too old, clearing...');
                    localStorage.removeItem('purchaseRequestDraft');
                }
            }
        } catch (error) {
            console.error('Error loading draft:', error);
            localStorage.removeItem('purchaseRequestDraft');
        }
        return false;
    }

    clearDraft() {
        try {
            localStorage.removeItem('purchaseRequestDraft');
            console.log('Draft cleared successfully');
        } catch (error) {
            console.error('Error clearing draft:', error);
        }
    }

    exportData() {
        try {
            const exportData = {
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
            
            console.log('Data exported successfully');
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
                    
                    this.requestData.items = importData.items || [];
                    this.requestData.suppliers = importData.suppliers || [];
                    this.requestData.offers = importData.offers || {};
                    this.requestData.recommendations = importData.recommendations || {};
                    this.requestData.itemRecommendations = importData.itemRecommendations || {};
                    
                    console.log('Data imported successfully');
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
            if (!item.quantity || item.quantity <= 0) {
                errors.push(`Item ${index + 1}: Valid quantity is required`);
            }
        });
        
        // Validate suppliers
        this.requestData.suppliers.forEach((supplier, index) => {
            if (!supplier.name) {
                errors.push(`Supplier ${index + 1}: Name is required`);
            }
            if (!supplier.currency) {
                errors.push(`Supplier ${index + 1}: Currency is required`);
            }
        });
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
}

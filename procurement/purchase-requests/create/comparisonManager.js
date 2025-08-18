// Comparison Manager Module
export class ComparisonManager {
    constructor(requestData, autoSave, currencyRates, currencySymbols) {
        this.requestData = requestData;
        this.autoSave = autoSave;
        this.currencyRates = currencyRates;
        this.currencySymbols = currencySymbols;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Save offer button
        const saveOfferBtn = document.getElementById('save-offer-btn');
        if (saveOfferBtn) {
            saveOfferBtn.addEventListener('click', () => {
                // This will be handled by the suppliers manager
                if (window.suppliersManager) {
                    window.suppliersManager.saveOffer();
                }
            });
        }
    }

    renderComparisonTable() {
        const headersRow = document.getElementById('supplier-headers');
        const tbody = document.getElementById('comparison-tbody');
        
        // Clear existing content
        headersRow.innerHTML = '';
        tbody.innerHTML = '';

        if (this.requestData.suppliers.length === 0 || this.requestData.items.length === 0) {
            return;
        }

        // Add supplier headers with "Hepsi için Öner" action
        this.requestData.suppliers.forEach(supplier => {
            const th = document.createElement('th');
            th.innerHTML = `
                <div class="d-flex flex-column align-items-center gap-1">
                    <div class="fw-semibold">${supplier.name}</div>
                    <div class="small text-muted">${supplier.currency}</div>
                    <button class="btn btn-sm btn-outline-warning" onclick="window.comparisonManager.recommendSupplierForAll('${supplier.id}')">
                        <i class="fas fa-star me-1"></i>Hepsi için Öner
                    </button>
                </div>`;
            th.className = 'text-center align-middle';
            headersRow.appendChild(th);
        });

        // Update group header colspan
        const groupHeader = document.getElementById('supplier-group-header');
        if (groupHeader) {
            groupHeader.colSpan = Math.max(1, this.requestData.suppliers.length);
        }

        // Add comparison rows
        this.requestData.items.forEach((item, itemIndex) => {
            const row = document.createElement('tr');
            
            // Item info
            row.innerHTML = `
                <td><strong>${item.name}</strong><br><small class="text-muted">${item.code}</small></td>
                <td>${item.job_no || '-'}</td>
                <td>${item.quantity}</td>
                <td>${item.unit}</td>
            `;

            // Supplier offers
            this.requestData.suppliers.forEach(supplier => {
                const offer = this.requestData.offers[supplier.id]?.[itemIndex];
                
                if (offer && offer.totalPrice > 0) {
                    const cell = document.createElement('td');
                    const itemRecommendation = this.getItemRecommendation(itemIndex);
                    const isRecommended = itemRecommendation === supplier.id;
                    // Only recommended state paints the cell green
                    cell.className = `price-cell ${isRecommended ? 'recommended-cell' : ''}`;
                    
                                         if (this.currencyRates) {
                         const convertedTotalPrice = this.convertCurrency(offer.totalPrice, supplier.currency, 'EUR');
                         cell.innerHTML = `
                             <div class="d-flex flex-column align-items-center">
                                 <div class="fw-bold">${this.formatCurrency(convertedTotalPrice, 'EUR')}</div>
                                 <small class="text-muted">${this.formatCurrency(offer.totalPrice, supplier.currency)} <span class="currency-badge">${supplier.currency}</span></small>
                                 <div class="unit-price-display mt-1">
                                     <small class="text-primary">
                                         <i class="fas fa-tag me-1"></i>Birim: ${this.formatCurrency(offer.unitPrice, supplier.currency)} <span class="currency-badge">${supplier.currency}</span>
                                     </small>
                                 </div>
                                 ${offer.deliveryDays ? `<small class="text-info"><i class="fas fa-clock me-1"></i>${offer.deliveryDays} gün</small>` : ''}
                                 ${offer.notes ? `<small class="text-muted">${offer.notes}</small>` : ''}
                                 <div class="mt-1">
                                     <button class="btn btn-sm ${this.getItemRecommendation(itemIndex) === supplier.id ? 'btn-warning' : 'btn-outline-warning'}" data-item-index="${itemIndex}" data-supplier-id="${supplier.id}" onclick="window.comparisonManager.toggleItemRecommendation(${itemIndex}, '${supplier.id}')">
                                         <i class="fas fa-star me-1"></i>${this.getItemRecommendation(itemIndex) === supplier.id ? 'Önerildi' : 'Öner'}
                                     </button>
                                 </div>
                             </div>
                         `;
                    } else {
                        cell.innerHTML = `
                            <div class="d-flex flex-column align-items-center">
                                <div class="text-muted">Döviz kurları yüklenemedi</div>
                                <small class="text-muted">${this.formatCurrency(offer.totalPrice, supplier.currency)} <span class="currency-badge">${supplier.currency}</span></small>
                                <div class="unit-price-display mt-1">
                                    <small class="text-primary">
                                        <i class="fas fa-tag me-1"></i>Birim: ${this.formatCurrency(offer.unitPrice, supplier.currency)} <span class="currency-badge">${supplier.currency}</span>
                                    </small>
                                </div>
                                ${offer.deliveryDays ? `<small class="text-info"><i class="fas fa-clock me-1"></i>${offer.deliveryDays} gün</small>` : ''}
                                ${offer.notes ? `<small class="text-muted">${offer.notes}</small>` : ''}
                                <div class="mt-1">
                                    <button class="btn btn-sm ${this.getItemRecommendation(itemIndex) === supplier.id ? 'btn-warning' : 'btn-outline-warning'}" data-item-index="${itemIndex}" data-supplier-id="${supplier.id}" onclick="window.comparisonManager.toggleItemRecommendation(${itemIndex}, '${supplier.id}')">
                                        <i class="fas fa-star me-1"></i>${this.getItemRecommendation(itemIndex) === supplier.id ? 'Önerildi' : 'Öner'}
                                    </button>
                                </div>
                            </div>
                        `;
                    }
                    row.appendChild(cell);
                } else {
                    const cell = document.createElement('td');
                    cell.className = 'text-muted';
                    cell.textContent = 'Teklif yok';
                    row.appendChild(cell);
                }
            });

            tbody.appendChild(row);
        });
    }

    getItemRecommendation(itemIndex) {
        return this.requestData.itemRecommendations?.[itemIndex] || null;
    }

    toggleItemRecommendation(itemIndex, supplierId) {
        if (!this.requestData.itemRecommendations) this.requestData.itemRecommendations = {};
        const current = this.requestData.itemRecommendations[itemIndex];
        this.requestData.itemRecommendations[itemIndex] = current === supplierId ? null : supplierId;
        this.renderComparisonTable();
        this.autoSave();
        
        // Re-validate ALL items to restore error states after table re-render
        if (window.validationManager) {
            this.requestData.items.forEach((_, idx) => {
                window.validationManager.revalidateItem(
                    idx, 
                    this.requestData.items, 
                    this.requestData.itemRecommendations, 
                    this.requestData.offers, 
                    this.requestData.suppliers
                );
            });
        }
    }

    recommendSupplierForAll(supplierId) {
        if (!this.requestData.itemRecommendations) this.requestData.itemRecommendations = {};
        
        // Check if all items that have offers from this supplier are already recommended
        let allRecommended = true;
        let hasAnyOffers = false;
        
        this.requestData.items.forEach((_, idx) => {
            const offer = this.requestData.offers[supplierId]?.[idx];
            if (offer && offer.totalPrice > 0) {
                hasAnyOffers = true;
                if (this.requestData.itemRecommendations[idx] !== supplierId) {
                    allRecommended = false;
                }
            }
        });
        
        // If all are already recommended, deselect them all
        if (allRecommended && hasAnyOffers) {
            this.requestData.items.forEach((_, idx) => {
                const offer = this.requestData.offers[supplierId]?.[idx];
                if (offer && offer.totalPrice > 0) {
                    this.requestData.itemRecommendations[idx] = null;
                }
            });
        } else {
            // Otherwise, recommend all items for this supplier
            this.requestData.items.forEach((_, idx) => {
                const offer = this.requestData.offers[supplierId]?.[idx];
                if (offer && offer.totalPrice > 0) {
                    this.requestData.itemRecommendations[idx] = supplierId;
                }
            });
        }
        
        this.renderComparisonTable();
        this.autoSave();
        
        // Re-validate ALL items to restore error states after table re-render
        if (window.validationManager) {
            this.requestData.items.forEach((_, idx) => {
                window.validationManager.revalidateItem(
                    idx, 
                    this.requestData.items, 
                    this.requestData.itemRecommendations, 
                    this.requestData.offers, 
                    this.requestData.suppliers
                );
            });
        }
    }

    convertCurrency(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return amount;
        
        // Since rates are TRY-based (how much TRY for 1 unit of currency)
        // To convert fromCurrency to toCurrency:
        // 1. Convert fromCurrency to TRY: amount / rate[fromCurrency]
        // 2. Convert TRY to toCurrency: (amount / rate[fromCurrency]) * rate[toCurrency]
        return (amount / this.currencyRates[fromCurrency]) * this.currencyRates[toCurrency];
    }

    formatCurrency(amount, currency) {
        const symbol = this.currencySymbols[currency];
        return `${symbol}${amount.toFixed(2)}`;
    }

    updateSummary() {
        document.getElementById('total-items').textContent = this.requestData.items.length;
        
        // Calculate number of different recommended suppliers
        const recommendedSupplierIds = new Set();
        if (this.requestData.itemRecommendations) {
            Object.values(this.requestData.itemRecommendations).forEach(supplierId => {
                if (supplierId) {
                    recommendedSupplierIds.add(supplierId);
                }
            });
        }
        document.getElementById('total-suppliers').textContent = recommendedSupplierIds.size;
        
        // Handle total amount based on currency rates availability
        const totalAmountElement = document.getElementById('total-amount');
        
        if (!this.currencyRates) {
            totalAmountElement.innerHTML = `
                <div class="text-muted">Hata</div>
                <button class="btn btn-sm btn-outline-primary mt-1" onclick="location.reload()">
                    <i class="fas fa-refresh me-1"></i>Sayfayı Yenile
                </button>
            `;
        } else {
            // Calculate total amount of recommended items only
            let totalAmount = 0;
            if (this.requestData.itemRecommendations) {
                Object.keys(this.requestData.itemRecommendations).forEach(itemIndex => {
                    const recommendedSupplierId = this.requestData.itemRecommendations[itemIndex];
                    if (recommendedSupplierId) {
                        const offer = this.requestData.offers[recommendedSupplierId]?.[itemIndex];
                        if (offer && offer.totalPrice > 0) {
                            const supplier = this.requestData.suppliers.find(s => s.id === recommendedSupplierId);
                            totalAmount += this.convertCurrency(offer.totalPrice, supplier.currency, 'EUR');
                        }
                    }
                });
            }
            
            totalAmountElement.textContent = this.formatCurrency(totalAmount, 'EUR');
        }
        
        // Calculate total quantity by units
        const quantityByUnit = {};
        this.requestData.items.forEach(item => {
            const unit = item.unit;
            if (!quantityByUnit[unit]) {
                quantityByUnit[unit] = 0;
            }
            quantityByUnit[unit] += item.quantity;
        });
        
        const totalQuantityElement = document.getElementById('total-quantity');
        if (Object.keys(quantityByUnit).length > 0) {
            const quantityText = Object.entries(quantityByUnit)
                .map(([unit, quantity]) => `${quantity} ${unit}`)
                .join(', ');
            totalQuantityElement.textContent = quantityText;
        } else {
            totalQuantityElement.textContent = '-';
        }
    }
}

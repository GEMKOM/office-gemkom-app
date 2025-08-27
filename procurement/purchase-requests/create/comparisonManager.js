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
        const subheadersRow = document.getElementById('supplier-subheaders');
        const headersRow = document.getElementById('supplier-headers');
        const tbody = document.getElementById('comparison-tbody');
        
        // Clear existing content
        subheadersRow.innerHTML = '';
        headersRow.innerHTML = '';
        tbody.innerHTML = '';

        if (this.requestData.suppliers.length === 0 || this.requestData.items.length === 0) {
            return;
        }

        // Calculate total columns needed (5 columns per supplier: Euro Total, Original Total, Unit Price, Delivery Days, Recommendation Button)
        const totalColumns = this.requestData.suppliers.length * 4;

        // Add supplier subheaders (group headers for each supplier)
        this.requestData.suppliers.forEach(supplier => {
            const th = document.createElement('th');
            th.innerHTML = `
                <div class="d-flex flex-column align-items-center gap-1">
                    <div class="fw-semibold">${supplier.name}</div>
                    <div class="small text-muted">${supplier.default_currency || 'TRY'}</div>
                    <button class="btn btn-sm btn-outline-warning" onclick="window.comparisonManager.recommendSupplierForAll('${supplier.id}')">
                        <i class="fas fa-star me-1"></i>Hepsi için Öner
                    </button>
                </div>`;
            th.className = 'text-center align-middle';
            th.colSpan = 4;
            subheadersRow.appendChild(th);
        });

        // Add individual column headers
        this.requestData.suppliers.forEach(supplier => {
            // Unit Price column
            const unitTh = document.createElement('th');
            unitTh.innerHTML = `<div class="text-center"><i class="fas fa-tag me-1"></i>Birim Fiyat<br><small class="text-muted">${supplier.default_currency || 'TRY'}</small></div>`;
            unitTh.className = 'text-center align-middle';
            headersRow.appendChild(unitTh);

            // Original Total column
            const originalTh = document.createElement('th');
            originalTh.innerHTML = `<div class="text-center">Orijinal Toplam<br><small class="text-muted">${supplier.default_currency || 'TRY'}</small></div>`;
            originalTh.className = 'text-center align-middle';
            headersRow.appendChild(originalTh);

            // Delivery Days column
            const deliveryTh = document.createElement('th');
            deliveryTh.innerHTML = '<div class="text-center"><i class="fas fa-clock me-1"></i>Teslimat<br><small class="text-muted">Gün</small></div>';
            deliveryTh.className = 'text-center align-middle';
            headersRow.appendChild(deliveryTh);

            // Recommendation Button column
            const recommendationTh = document.createElement('th');
            recommendationTh.innerHTML = '<div class="text-center"><i class="fas fa-star me-1"></i>Öner</div>';
            recommendationTh.className = 'text-center align-middle';
            headersRow.appendChild(recommendationTh);
        });

        // Update group header colspan
        const groupHeader = document.getElementById('supplier-group-header');
        if (groupHeader) {
            groupHeader.colSpan = totalColumns;
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

            // Supplier offers - now 4 columns per supplier
            this.requestData.suppliers.forEach(supplier => {
                const offer = this.requestData.offers[supplier.id]?.[itemIndex];
                const itemRecommendation = this.getItemRecommendation(itemIndex);
                const isRecommended = itemRecommendation === supplier.id;
                const unitCell = document.createElement('td');
                const originalCell = document.createElement('td');
                const deliveryCell = document.createElement('td');
                const recommendationCell = document.createElement('td');

                try {
                    // Unit Price column
                    
                    unitCell.className = `text-center ${isRecommended ? 'recommended-cell' : ''}`;
                    unitCell.innerHTML = `
                        <div class="fw-bold">${this.formatCurrency(offer.unitPrice, supplier.default_currency || 'TRY')}</div>
                        <small class="text-muted">${supplier.default_currency || 'TRY'}</small>
                    `;
                    

                    // Original Total column
                    originalCell.className = `text-center ${isRecommended ? 'recommended-cell' : ''}`;
                    originalCell.innerHTML = `
                        <div class="fw-bold">${this.formatCurrency(offer.totalPrice, supplier.default_currency || 'TRY')}</div>
                        <small class="text-muted">${supplier.default_currency || 'TRY'}</small>
                    `;



                    // Delivery Days column
                    deliveryCell.className = `text-center ${isRecommended ? 'recommended-cell' : ''}`;
                    deliveryCell.innerHTML = offer.deliveryDays ? 
                        `<div class="fw-bold">${offer.deliveryDays}</div><small class="text-muted">gün</small>` : 
                        `<div class="text-muted">-</div>`;

                    // Add notes to delivery days cell if they exist
                    if (offer.notes) {
                        deliveryCell.innerHTML += `<br><small class="text-muted">${offer.notes}</small>`;
                    }

                    // Recommendation Button column
                    recommendationCell.className = `text-center ${isRecommended ? 'recommended-cell' : ''}`;
                    recommendationCell.innerHTML = `
                        <button class="btn btn-sm ${isRecommended ? 'btn-warning' : 'btn-outline-warning'}" data-item-index="${itemIndex}" data-supplier-id="${supplier.id}" onclick="window.comparisonManager.toggleItemRecommendation(${itemIndex}, '${supplier.id}')">
                            <i class="fas fa-star"></i>
                        </button>
                    `;
                } catch (error) {
                    console.error('Error in renderComparisonTable:', error);
                }
                

                if (offer && offer.totalPrice > 0) {
                    row.appendChild(unitCell);
                    row.appendChild(originalCell);
                    row.appendChild(deliveryCell);
                    row.appendChild(recommendationCell);
                } else {
                    // No offer - create 4 empty cells
                    for (let i = 0; i < 4; i++) {
                        const cell = document.createElement('td');
                        cell.className = 'text-muted text-center';
                        cell.textContent = 'Teklif yok';
                        row.appendChild(cell);
                    }
                }
            });

            tbody.appendChild(row);
        });

        // Add summary row at the bottom
        this.addSummaryRow(tbody);
    }

    addSummaryRow(tbody) {
        const summaryRow = document.createElement('tr');
        summaryRow.className = 'table-info summary-row';
        
        // Add empty cells for item info columns
        summaryRow.innerHTML = `
            <td colspan="4" class="text-center fw-bold">
                <i class="fas fa-calculator me-2"></i>TOPLAM
            </td>
        `;

        // Calculate and display totals for each supplier
        this.requestData.suppliers.forEach(supplier => {
            let euroTotal = 0;
            let originalTotal = 0;
            let unitPriceTotal = 0;
            let totalDeliveryDays = 0;
            let offerCount = 0;

            // Calculate totals for this supplier
            this.requestData.items.forEach((_, itemIndex) => {
                const offer = this.requestData.offers[supplier.id]?.[itemIndex];
                if (offer && offer.totalPrice > 0) {
                    offerCount++;
                    originalTotal += offer.totalPrice;
                    unitPriceTotal += offer.unitPrice;
                    if (offer.deliveryDays) {
                        totalDeliveryDays = Math.max(totalDeliveryDays, offer.deliveryDays);
                    }
                    
                    // Convert to Euro if rates are available
                    if (this.currencyRates && supplier.default_currency) {
                        euroTotal += this.convertCurrency(offer.totalPrice, supplier.default_currency, 'EUR');
                    }
                }
            });           

            // Original Total column
            const originalCell = document.createElement('td');
            originalCell.className = 'text-center fw-bold summary-cell';
            if (originalTotal > 0) {
                originalCell.innerHTML = `
                    <div class="text-primary">${this.formatCurrency(originalTotal, supplier.default_currency || 'TRY')}</div>
                    <small class="text-muted">${supplier.default_currency || 'TRY'}</small>
                `;
            } else {
                originalCell.innerHTML = `<div class="text-muted">-</div>`;
            }
            

            // Unit Price column
            const unitCell = document.createElement('td');
            unitCell.className = 'text-center fw-bold summary-cell';
            if (unitPriceTotal > 0) {
                unitCell.innerHTML = `
                    <div class="text-primary">${this.formatCurrency(unitPriceTotal, supplier.default_currency || 'TRY')}</div>
                    <small class="text-muted">${supplier.default_currency || 'TRY'}</small>
                `;
            } else {
                unitCell.innerHTML = `<div class="text-muted">-</div>`;
            }
            

            // Delivery Days column (maximum)
            const deliveryCell = document.createElement('td');
            deliveryCell.className = 'text-center fw-bold summary-cell';
            if (totalDeliveryDays > 0) {
                deliveryCell.innerHTML = `
                    <div class="text-primary">${totalDeliveryDays}</div>
                    <small class="text-muted">gün (maks.)</small>
                `;
            } else {
                deliveryCell.innerHTML = `<div class="text-muted">-</div>`;
            }
            

            // Empty cell for recommendation button column
            const emptyCell = document.createElement('td');
            emptyCell.className = 'text-center summary-cell';
            emptyCell.innerHTML = `<div class="text-muted">-</div>`;


            summaryRow.appendChild(unitCell);
            summaryRow.appendChild(originalCell);
            summaryRow.appendChild(deliveryCell);
            summaryRow.appendChild(emptyCell);
            

        });

        tbody.appendChild(summaryRow);
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
                        if (supplier && supplier.default_currency) {
                            totalAmount += this.convertCurrency(offer.totalPrice, supplier.default_currency, 'EUR');
                        }
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
            // Ensure quantity is treated as a number
            const quantity = parseFloat(item.quantity) || 0;
            quantityByUnit[unit] += quantity;
        });
        
        const totalQuantityElement = document.getElementById('total-quantity');
        if (Object.keys(quantityByUnit).length > 0) {
            const quantityText = Object.entries(quantityByUnit)
                .map(([unit, quantity]) => `${quantity.toFixed(2)} ${unit}`)
                .join(', ');
            totalQuantityElement.textContent = quantityText;
        } else {
            totalQuantityElement.textContent = '-';
        }
    }
}

// Comparison Table Component
export class ComparisonTable {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        
        // Default options
        this.options = {
            showSummary: true,
            showSummaryRow: true, // New option to control just the summary row
            showRecommendations: true,
            showCurrencyConversion: true,
            showDeliveryDays: true,
            showNotes: true,
            showEuroTotal: true,
            showOriginalTotal: true,
            showUnitPrice: true,
            columnOrder: ['unitPrice', 'deliveryDays', 'originalTotal', 'euroTotal', 'recommendations'], // Default column order
            autoSave: null,
            onRecommendationChange: null,
            onSupplierRecommendAll: null,
            currencyRates: null,
            currencySymbols: {
                TRY: '₺',
                USD: '$',
                EUR: '€',
                GBP: '£'
            },
            ...options
        };
        
        this.data = {
            items: [],
            suppliers: [],
            offers: {},
            itemRecommendations: {}
        };
        
        // Column minimization state
        this.columnStates = {
            // General columns (not part of suppliers)
            item: { minimized: false, width: 'auto' },
            job_no: { minimized: false, width: 'auto' },
            quantity: { minimized: false, width: 'auto' },
            unit: { minimized: false, width: 'auto' },
            // Supplier columns
            unitPrice: { minimized: false, width: 'auto' },
            deliveryDays: { minimized: false, width: 'auto' },
            originalTotal: { minimized: false, width: 'auto' },
            euroTotal: { minimized: false, width: 'auto' },
            recommendations: { minimized: false, width: 'auto' }
        };
        
        this.init();
    }
    
    init() {
        if (!this.container) {
            console.error(`ComparisonTable: Container with ID "${this.containerId}" not found`);
            return;
        }
        
        this.render();
    }
    
    setData(data) {
        this.data = {
            items: data.items || [],
            suppliers: data.suppliers || [],
            offers: data.offers || {},
            itemRecommendations: data.itemRecommendations || {}
        };
        this.render();
    }

    // Toggle column minimization
    toggleColumnMinimization(columnType) {
        if (this.columnStates[columnType]) {
            this.columnStates[columnType].minimized = !this.columnStates[columnType].minimized;
            this.render();
        }
    }

    // Set column minimization state
    setColumnMinimization(columnType, minimized) {
        if (this.columnStates[columnType]) {
            this.columnStates[columnType].minimized = minimized;
            this.render();
        }
    }

    // Get column minimization state
    isColumnMinimized(columnType) {
        return this.columnStates[columnType]?.minimized || false;
    }
    
    setCurrencyRates(rates) {
        this.options.currencyRates = rates;
        this.render();
    }
    
    render() {
        if (!this.container) return;
        
        this.container.innerHTML = this.generateHTML();
        this.setupEventListeners();
    }
    
    generateHTML() {
        if (!this.data.items.length || !this.data.suppliers.length) {
            return `
                <div class="comparison-table-empty">
                    <i class="fas fa-table"></i>
                    <p>Karşılaştırma tablosu için veri bulunamadı.</p>
                </div>
            `;
        }

        // Calculate total columns per supplier
        const columnsPerSupplier = this.getVisibleColumnsCount();

        return `
            <div class="card">
                <div class="card-header">
                    <h5 class="mb-0"><i class="fas fa-table me-2"></i>Karşılaştırma Tablosu</h5>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-bordered" id="comparison-table">
                            <thead class="table-primary">
                                <tr>
                                    ${this.generateGeneralHeaders()}
                                    <th id="supplier-group-header" colspan="${this.data.suppliers.length * columnsPerSupplier}" class="text-center">Tedarikçi Teklifleri</th>
                                </tr>
                                <tr id="supplier-subheaders">
                                    ${this.generateSupplierSubheaders()}
                                </tr>
                                <tr id="supplier-headers">
                                    ${this.generateSupplierHeaders()}
                                </tr>
                            </thead>
                            <tbody id="comparison-tbody">
                                ${this.generateComparisonRows()}
                                ${this.options.showSummaryRow ? this.generateSummaryRow() : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            ${this.options.showSummary ? this.generateSummarySection() : ''}
        `;
    }
    






    generateGeneralHeaders() {
        const generalColumns = [
            { key: 'item', name: 'Malzeme', icon: 'fa-box' },
            { key: 'job_no', name: 'İş No', icon: 'fa-tag' },
            { key: 'quantity', name: 'Miktar', icon: 'fa-hashtag' },
            { key: 'unit', name: 'Birim', icon: 'fa-ruler' }
        ];

        return generalColumns.map(col => {
            const isMinimized = this.isColumnMinimized(col.key);
            if (isMinimized) {
                return `
                    <th rowspan="3" class="align-middle minimized-column clickable-header" style="width: 40px; min-width: 40px;" 
                        onclick="window.comparisonTableInstance.toggleColumnMinimization('${col.key}')" 
                        title="Genişlet ${col.name}">
                        <div class="minimized-header">
                            <span class="rotated-text">${col.name}</span>
                        </div>
                    </th>
                `;
            } else {
                return `
                    <th rowspan="3" class="align-middle clickable-header" 
                        onclick="window.comparisonTableInstance.toggleColumnMinimization('${col.key}')" 
                        title="Küçült ${col.name}">
                        <i class="fas ${col.icon} me-1"></i>${col.name}
                    </th>
                `;
            }
        }).join('');
    }

    getGeneralColumnsCount() {
        const generalColumns = ['item', 'job_no', 'quantity', 'unit'];
        let count = 0;
        
        generalColumns.forEach(colKey => {
            if (!this.isColumnMinimized(colKey)) {
                count++;
            } else {
                count++; // Even minimized columns take up space (40px)
            }
        });
        
        return count;
    }

    getVisibleColumnsCount() {
        let count = 0;
        
        // Count based on column order and visibility flags
        this.options.columnOrder.forEach(columnType => {
            switch (columnType) {
                case 'unitPrice':
                    if (this.options.showUnitPrice) count++;
                    break;
                case 'deliveryDays':
                    if (this.options.showDeliveryDays) count++;
                    break;
                case 'originalTotal':
                    if (this.options.showOriginalTotal) count++;
                    break;
                case 'euroTotal':
                    if (this.options.showEuroTotal) count++;
                    break;
                case 'recommendations':
                    if (this.options.showRecommendations) count++;
                    break;
            }
        });
        
        return count;
    }

    generateSupplierSubheaders() {
        const columnsPerSupplier = this.getVisibleColumnsCount();
        return this.data.suppliers.map(supplier => `
            <th class="text-center align-middle" colspan="${columnsPerSupplier}">
                <div class="d-flex flex-column align-items-center gap-1">
                    <div class="fw-semibold supplier-name-truncate" title="${supplier.name}">${supplier.name}</div>
                    <div class="small text-muted">${supplier.default_currency || 'TRY'}</div>
                    ${this.options.showRecommendations ? `
                        <button class="btn btn-sm btn-outline-warning recommend-all-btn" data-supplier-id="${supplier.id}">
                            <i class="fas fa-star me-1"></i>Hepsi için Öner
                        </button>
                    ` : ''}
                </div>
            </th>
        `).join('');
    }
    
    generateSupplierHeaders() {
        return this.data.suppliers.map(supplier => {
            let headers = '';
            
            // Generate headers based on column order
            this.options.columnOrder.forEach(columnType => {
                switch (columnType) {
                                            case 'unitPrice':
                            if (this.options.showUnitPrice) {
                                if (this.isColumnMinimized('unitPrice')) {
                                    headers += `
                                        <th class="text-center align-middle minimized-column clickable-header" style="width: 40px; min-width: 40px;" 
                                            onclick="window.comparisonTableInstance.toggleColumnMinimization('unitPrice')" 
                                            title="Genişlet Birim Fiyat">
                                            <div class="minimized-header">
                                                <span class="rotated-text">Birim Fiyat</span>
                                            </div>
                                        </th>
                                    `;
                                } else {
                                    headers += `
                                        <th class="text-center align-middle clickable-header" 
                                            onclick="window.comparisonTableInstance.toggleColumnMinimization('unitPrice')" 
                                            title="Küçült Birim Fiyat">
                                            <div class="text-center">
                                                <i class="fas fa-tag me-1"></i>Birim Fiyat<br>
                                                <small class="text-muted">${supplier.default_currency || 'TRY'}</small>
                                            </div>
                                        </th>
                                    `;
                                }
                            }
                            break;
                                            case 'deliveryDays':
                            if (this.options.showDeliveryDays) {
                                if (this.isColumnMinimized('deliveryDays')) {
                                    headers += `
                                        <th class="text-center align-middle minimized-column clickable-header" style="width: 40px; min-width: 40px;" 
                                            onclick="window.comparisonTableInstance.toggleColumnMinimization('deliveryDays')" 
                                            title="Genişlet Teslim">
                                            <div class="minimized-header">
                                                <span class="rotated-text">Teslim</span>
                                            </div>
                                        </th>
                                    `;
                                } else {
                                    headers += `
                                        <th class="text-center align-middle clickable-header" 
                                            onclick="window.comparisonTableInstance.toggleColumnMinimization('deliveryDays')" 
                                            title="Küçült Teslim">
                                            <div class="text-center">
                                                <i class="fas fa-clock me-1"></i>Teslim<br>
                                                <small class="text-muted">Gün</small>
                                            </div>
                                        </th>
                                    `;
                                }
                            }
                            break;
                                            case 'originalTotal':
                            if (this.options.showOriginalTotal) {
                                if (this.isColumnMinimized('originalTotal')) {
                                    headers += `
                                        <th class="text-center align-middle minimized-column clickable-header" style="width: 40px; min-width: 40px;" 
                                            onclick="window.comparisonTableInstance.toggleColumnMinimization('originalTotal')" 
                                            title="Genişlet Toplam">
                                            <div class="minimized-header">
                                                <span class="rotated-text">Toplam</span>
                                            </div>
                                        </th>
                                    `;
                                } else {
                                    headers += `
                                        <th class="text-center align-middle clickable-header" 
                                            onclick="window.comparisonTableInstance.toggleColumnMinimization('originalTotal')" 
                                            title="Küçült Toplam">
                                            <div class="text-center">Toplam<br>
                                                <small class="text-muted">${supplier.default_currency || 'TRY'}</small>
                                            </div>
                                        </th>
                                    `;
                                }
                            }
                            break;
                                            case 'euroTotal':
                            if (this.options.showEuroTotal) {
                                if (this.isColumnMinimized('euroTotal')) {
                                    headers += `
                                        <th class="text-center align-middle minimized-column clickable-header" style="width: 40px; min-width: 40px;" 
                                            onclick="window.comparisonTableInstance.toggleColumnMinimization('euroTotal')" 
                                            title="Genişlet Euro Toplam">
                                            <div class="minimized-header">
                                                <span class="rotated-text">Euro</span>
                                            </div>
                                        </th>
                                    `;
                                } else {
                                    headers += `
                                        <th class="text-center align-middle clickable-header" 
                                            onclick="window.comparisonTableInstance.toggleColumnMinimization('euroTotal')" 
                                            title="Küçült Euro Toplam">
                                            <div class="text-center">
                                                <i class="fas fa-euro-sign me-1"></i>Euro Toplam<br>
                                                <small class="text-muted">EUR</small>
                                            </div>
                                        </th>
                                    `;
                                }
                            }
                            break;
                                            case 'recommendations':
                            if (this.options.showRecommendations) {
                                if (this.isColumnMinimized('recommendations')) {
                                    headers += `
                                        <th class="text-center align-middle minimized-column clickable-header" style="width: 40px; min-width: 40px;" 
                                            onclick="window.comparisonTableInstance.toggleColumnMinimization('recommendations')" 
                                            title="Genişlet Öneriler">
                                            <div class="minimized-header">
                                                <span class="rotated-text">Öner</span>
                                            </div>
                                        </th>
                                    `;
                                } else {
                                    headers += `
                                        <th class="text-center align-middle clickable-header" 
                                            onclick="window.comparisonTableInstance.toggleColumnMinimization('recommendations')" 
                                            title="Küçült Öneriler">
                                            <div class="text-center">
                                                <i class="fas fa-star me-1"></i>Öner
                                            </div>
                                        </th>
                                    `;
                                }
                            }
                            break;
                }
            });
            
            return headers;
        }).join('');
    }
    
    generateComparisonRows() {
        return this.data.items.map((item, itemIndex) => `
            <tr>
                ${this.generateGeneralCells(item, itemIndex)}
                ${this.generateSupplierCells(itemIndex)}
            </tr>
        `).join('');
    }

    generateGeneralCells(item, itemIndex) {
        const generalColumns = [
            { key: 'item', content: `<strong>${item.name}</strong><br><small class="text-muted">${item.code}</small>` },
            { key: 'job_no', content: item.job_no || '-' },
            { key: 'quantity', content: item.quantity },
            { key: 'unit', content: item.unit }
        ];

        return generalColumns.map(col => {
            const isMinimized = this.isColumnMinimized(col.key);
            if (isMinimized) {
                return `
                    <td class="minimized-cell" style="width: 40px; min-width: 40px;">
                        <div class="minimized-content">
                            <span class="rotated-text">${col.content}</span>
                        </div>
                    </td>
                `;
            } else {
                return `<td>${col.content}</td>`;
            }
        }).join('');
    }
    
    generateSupplierCells(itemIndex) {
        return this.data.suppliers.map(supplier => {
            const offer = this.data.offers[supplier.id]?.[itemIndex];
            const isRecommended = this.data.itemRecommendations?.[itemIndex] === supplier.id;
            
            if (offer && offer.totalPrice > 0) {
                let cells = '';
                
                // Generate cells based on column order
                this.options.columnOrder.forEach(columnType => {
                    switch (columnType) {
                        case 'unitPrice':
                            if (this.options.showUnitPrice) {
                                if (this.isColumnMinimized('unitPrice')) {
                                    cells += `
                                        <td class="text-center minimized-cell ${isRecommended ? 'recommended-cell' : ''}" style="width: 40px; min-width: 40px;">
                                            <div class="minimized-content">
                                                <span class="rotated-text">${this.formatCurrency(offer.unitPrice, supplier.default_currency || 'TRY')}</span>
                                            </div>
                                        </td>
                                    `;
                                } else {
                                    cells += `
                                        <td class="text-center ${isRecommended ? 'recommended-cell' : ''}">
                                            <div class="fw-bold">${this.formatCurrency(offer.unitPrice, supplier.default_currency || 'TRY')}</div>
                                            <small class="text-muted">${supplier.default_currency || 'TRY'}</small>
                                        </td>
                                    `;
                                }
                            }
                            break;
                        case 'deliveryDays':
                            if (this.options.showDeliveryDays) {
                                if (this.isColumnMinimized('deliveryDays')) {
                                    cells += `
                                        <td class="text-center minimized-cell ${isRecommended ? 'recommended-cell' : ''}" style="width: 40px; min-width: 40px;">
                                            <div class="minimized-content">
                                                <span class="rotated-text">${offer.deliveryDays || '-'}</span>
                                            </div>
                                        </td>
                                    `;
                                } else {
                                    cells += `
                                        <td class="text-center ${isRecommended ? 'recommended-cell' : ''}">
                                            <div class="fw-bold">${offer.deliveryDays || '-'}</div>
                                            <small class="text-muted">gün</small>
                                            ${this.options.showNotes && offer.notes ? `<br><small class="text-muted">${offer.notes}</small>` : ''}
                                        </td>
                                    `;
                                }
                            }
                            break;
                        case 'originalTotal':
                            if (this.options.showOriginalTotal) {
                                if (this.isColumnMinimized('originalTotal')) {
                                    cells += `
                                        <td class="text-center minimized-cell ${isRecommended ? 'recommended-cell' : ''}" style="width: 40px; min-width: 40px;">
                                            <div class="minimized-content">
                                                <span class="rotated-text">${this.formatCurrency(offer.totalPrice, supplier.default_currency || 'TRY')}</span>
                                            </div>
                                        </td>
                                    `;
                                } else {
                                    cells += `
                                        <td class="text-center ${isRecommended ? 'recommended-cell' : ''}">
                                            <div class="fw-bold">${this.formatCurrency(offer.totalPrice, supplier.default_currency || 'TRY')}</div>
                                            <small class="text-muted">${supplier.default_currency || 'TRY'}</small>
                                        </td>
                                    `;
                                }
                            }
                            break;
                        case 'euroTotal':
                            if (this.options.showEuroTotal) {
                                const euroTotal = this.convertCurrency(offer.totalPrice, supplier.default_currency || 'TRY', 'EUR');
                                if (this.isColumnMinimized('euroTotal')) {
                                    cells += `
                                        <td class="text-center minimized-cell ${isRecommended ? 'recommended-cell' : ''}" style="width: 40px; min-width: 40px;">
                                            <div class="minimized-content">
                                                <span class="rotated-text">${this.formatCurrency(euroTotal, 'EUR')}</span>
                                            </div>
                                        </td>
                                    `;
                                } else {
                                    cells += `
                                        <td class="text-center ${isRecommended ? 'recommended-cell' : ''}">
                                            <div class="fw-bold">${this.formatCurrency(euroTotal, 'EUR')}</div>
                                            <small class="text-muted">EUR</small>
                                        </td>
                                    `;
                                }
                            }
                            break;
                        case 'recommendations':
                            if (this.options.showRecommendations) {
                                if (this.isColumnMinimized('recommendations')) {
                                    cells += `
                                        <td class="text-center minimized-cell ${isRecommended ? 'recommended-cell' : ''}" style="width: 40px; min-width: 40px;">
                                            <div class="minimized-content">
                                                <button class="btn btn-sm ${isRecommended ? 'btn-warning' : 'btn-outline-warning'} recommendation-btn-mini" 
                                                        data-item-index="${itemIndex}" data-supplier-id="${supplier.id}">
                                                    <i class="fas fa-star"></i>
                                                </button>
                                            </div>
                                        </td>
                                    `;
                                } else {
                                    cells += `
                                        <td class="text-center ${isRecommended ? 'recommended-cell' : ''}">
                                            <button class="btn btn-sm ${isRecommended ? 'btn-warning' : 'btn-outline-warning'} recommendation-btn" 
                                                    data-item-index="${itemIndex}" data-supplier-id="${supplier.id}">
                                                <i class="fas fa-star"></i>
                                            </button>
                                        </td>
                                    `;
                                }
                            }
                            break;
                    }
                });
                
                return cells;
            } else {
                const columnsPerSupplier = this.getVisibleColumnsCount();
                return `
                    <td class="text-muted text-center" colspan="${columnsPerSupplier}">
                        Teklif yok
                    </td>
                `;
            }
        }).join('');
    }
    
    generateSummaryRow() {
        const generalColumnsCount = this.getGeneralColumnsCount();
        return `
            <tr class="table-info summary-row">
                <td colspan="${generalColumnsCount}" class="text-center fw-bold">
                    <i class="fas fa-calculator me-2"></i>TOPLAM
                </td>
                ${this.data.suppliers.map(supplier => {
                    const totals = this.calculateSupplierTotals(supplier.id);
                    let summaryCells = '';
                    
                    // Generate summary cells based on column order
                    this.options.columnOrder.forEach(columnType => {
                        switch (columnType) {
                            case 'unitPrice':
                                if (this.options.showUnitPrice) {
                                    if (this.isColumnMinimized('unitPrice')) {
                                        summaryCells += `
                                            <td class="text-center fw-bold summary-cell minimized-cell" style="width: 40px; min-width: 40px;">
                                                <div class="minimized-content">
                                                    <span class="rotated-text">${this.formatCurrency(totals.unitPriceTotal, supplier.default_currency || 'TRY')}</span>
                                                </div>
                                            </td>
                                        `;
                                    } else {
                                        summaryCells += `
                                            <td class="text-center fw-bold summary-cell">
                                                <div class="text-primary">${this.formatCurrency(totals.unitPriceTotal, supplier.default_currency || 'TRY')}</div>
                                                <small class="text-muted">${supplier.default_currency || 'TRY'}</small>
                                            </td>
                                        `;
                                    }
                                }
                                break;
                            case 'deliveryDays':
                                if (this.options.showDeliveryDays) {
                                    if (this.isColumnMinimized('deliveryDays')) {
                                        summaryCells += `
                                            <td class="text-center fw-bold summary-cell minimized-cell" style="width: 40px; min-width: 40px;">
                                                <div class="minimized-content">
                                                    <span class="rotated-text">-</span>
                                                </div>
                                            </td>
                                        `;
                                    } else {
                                        summaryCells += `
                                            <td class="text-center fw-bold summary-cell">
                                                <div class="text-muted">-</div>
                                            </td>
                                        `;
                                    }
                                }
                                break;
                            case 'originalTotal':
                                if (this.options.showOriginalTotal) {
                                    if (this.isColumnMinimized('originalTotal')) {
                                        summaryCells += `
                                            <td class="text-center fw-bold summary-cell minimized-cell" style="width: 40px; min-width: 40px;">
                                                <div class="minimized-content">
                                                    <span class="rotated-text">${this.formatCurrency(totals.originalTotal, supplier.default_currency || 'TRY')}</span>
                                                </div>
                                            </td>
                                        `;
                                    } else {
                                        summaryCells += `
                                            <td class="text-center fw-bold summary-cell">
                                                <div class="text-primary">${this.formatCurrency(totals.originalTotal, supplier.default_currency || 'TRY')}</div>
                                                <small class="text-muted">${supplier.default_currency || 'TRY'}</small>
                                            </td>
                                        `;
                                    }
                                }
                                break;
                            case 'euroTotal':
                                if (this.options.showEuroTotal) {
                                    const euroTotal = this.convertCurrency(totals.originalTotal, supplier.default_currency || 'TRY', 'EUR');
                                    if (this.isColumnMinimized('euroTotal')) {
                                        summaryCells += `
                                            <td class="text-center fw-bold summary-cell minimized-cell" style="width: 40px; min-width: 40px;">
                                                <div class="minimized-content">
                                                    <span class="rotated-text">${this.formatCurrency(euroTotal, 'EUR')}</span>
                                                </div>
                                            </td>
                                        `;
                                    } else {
                                        summaryCells += `
                                            <td class="text-center fw-bold summary-cell">
                                                <div class="text-primary">${this.formatCurrency(euroTotal, 'EUR')}</div>
                                                <small class="text-muted">EUR</small>
                                            </td>
                                        `;
                                    }
                                }
                                break;
                            case 'recommendations':
                                if (this.options.showRecommendations) {
                                    if (this.isColumnMinimized('recommendations')) {
                                        summaryCells += `
                                            <td class="text-center summary-cell minimized-cell" style="width: 40px; min-width: 40px;">
                                                <div class="minimized-content">
                                                    <span class="rotated-text">-</span>
                                                </div>
                                            </td>
                                        `;
                                    } else {
                                        summaryCells += `
                                            <td class="text-center summary-cell">
                                                <div class="text-muted">-</div>
                                            </td>
                                        `;
                                    }
                                }
                                break;
                        }
                    });
                    
                    return summaryCells;
                }).join('')}
            </tr>
        `;
    }
    
    generateSummarySection() {
        const summary = this.calculateSummary();
        return `
            <div class="row mt-3">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0"><i class="fas fa-calculator me-2"></i>Özet Bilgiler</h5>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="summary-item">
                                        <label class="form-label">Toplam Malzeme Sayısı</label>
                                        <div class="form-control-plaintext">${summary.totalItems}</div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="summary-item">
                                        <label class="form-label">Toplam Miktar</label>
                                        <div class="form-control-plaintext">${summary.totalQuantity}</div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="summary-item">
                                        <label class="form-label">Önerilen Tedarikçi Sayısı</label>
                                        <div class="form-control-plaintext">${summary.recommendedSuppliers}</div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="summary-item">
                                        <label class="form-label">Toplam Tahmini Tutar (EUR)</label>
                                        <div class="form-control-plaintext">${this.formatCurrency(summary.totalAmountEUR, 'EUR')}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    setupEventListeners() {
        // Recommendation buttons
        this.container.querySelectorAll('.recommendation-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemIndex = parseInt(e.target.closest('.recommendation-btn').dataset.itemIndex);
                const supplierId = e.target.closest('.recommendation-btn').dataset.supplierId;
                this.toggleRecommendation(itemIndex, supplierId);
            });
        });

        // Mini recommendation buttons (for minimized columns)
        this.container.querySelectorAll('.recommendation-btn-mini').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemIndex = parseInt(e.target.closest('.recommendation-btn-mini').dataset.itemIndex);
                const supplierId = e.target.closest('.recommendation-btn-mini').dataset.supplierId;
                this.toggleRecommendation(itemIndex, supplierId);
            });
        });
        
        // Recommend all buttons
        this.container.querySelectorAll('.recommend-all-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const supplierId = e.target.closest('.recommend-all-btn').dataset.supplierId;
                this.recommendSupplierForAll(supplierId);
            });
        });
    }
    
    toggleRecommendation(itemIndex, supplierId) {
        if (!this.data.itemRecommendations) {
            this.data.itemRecommendations = {};
        }
        
        const current = this.data.itemRecommendations[itemIndex];
        this.data.itemRecommendations[itemIndex] = current === supplierId ? null : supplierId;
        
        if (this.options.onRecommendationChange) {
            this.options.onRecommendationChange(itemIndex, supplierId, this.data.itemRecommendations);
        }
        
        if (this.options.autoSave) {
            this.options.autoSave();
        }
        
        this.render();
    }
    
    recommendSupplierForAll(supplierId) {
        if (!this.data.itemRecommendations) {
            this.data.itemRecommendations = {};
        }
        
        // Check if all items that have offers from this supplier are already recommended
        let allRecommended = true;
        let hasAnyOffers = false;
        
        this.data.items.forEach((_, idx) => {
            const offer = this.data.offers[supplierId]?.[idx];
            if (offer && offer.totalPrice > 0) {
                hasAnyOffers = true;
                if (this.data.itemRecommendations[idx] !== supplierId) {
                    allRecommended = false;
                }
            }
        });
        
        // If all are already recommended, deselect them all
        if (allRecommended && hasAnyOffers) {
            this.data.items.forEach((_, idx) => {
                const offer = this.data.offers[supplierId]?.[idx];
                if (offer && offer.totalPrice > 0) {
                    this.data.itemRecommendations[idx] = null;
                }
            });
        } else {
            // Otherwise, recommend all items for this supplier
            this.data.items.forEach((_, idx) => {
                const offer = this.data.offers[supplierId]?.[idx];
                if (offer && offer.totalPrice > 0) {
                    this.data.itemRecommendations[idx] = supplierId;
                }
            });
        }
        
        if (this.options.onSupplierRecommendAll) {
            this.options.onSupplierRecommendAll(supplierId, this.data.itemRecommendations);
        }
        
        if (this.options.autoSave) {
            this.options.autoSave();
        }
        
        this.render();
    }
    
    calculateSupplierTotals(supplierId) {
        let originalTotal = 0;
        let unitPriceTotal = 0;
        let maxDeliveryDays = 0;
        
        this.data.items.forEach((_, itemIndex) => {
            const offer = this.data.offers[supplierId]?.[itemIndex];
            if (offer && offer.totalPrice > 0) {
                originalTotal += offer.totalPrice;
                unitPriceTotal += offer.unitPrice;
                if (offer.deliveryDays) {
                    maxDeliveryDays = Math.max(maxDeliveryDays, offer.deliveryDays);
                }
            }
        });
        
        return { originalTotal, unitPriceTotal, maxDeliveryDays };
    }
    
    calculateSummary() {
        const totalItems = this.data.items.length;
        
        // Calculate total quantity by units
        const quantityByUnit = {};
        this.data.items.forEach(item => {
            const unit = item.unit;
            if (!quantityByUnit[unit]) {
                quantityByUnit[unit] = 0;
            }
            const quantity = parseFloat(item.quantity) || 0;
            quantityByUnit[unit] += quantity;
        });
        
        const totalQuantity = Object.keys(quantityByUnit).length > 0 
            ? Object.entries(quantityByUnit)
                .map(([unit, quantity]) => `${quantity.toFixed(2)} ${unit}`)
                .join(', ')
            : '-';
        
        // Calculate number of different recommended suppliers
        const recommendedSupplierIds = new Set();
        if (this.data.itemRecommendations) {
            Object.values(this.data.itemRecommendations).forEach(supplierId => {
                if (supplierId) {
                    recommendedSupplierIds.add(supplierId);
                }
            });
        }
        
        // Calculate total amount in EUR
        let totalAmountEUR = 0;
        if (this.options.currencyRates && this.data.itemRecommendations) {
            Object.keys(this.data.itemRecommendations).forEach(itemIndex => {
                const recommendedSupplierId = this.data.itemRecommendations[itemIndex];
                if (recommendedSupplierId) {
                    const offer = this.data.offers[recommendedSupplierId]?.[itemIndex];
                    if (offer && offer.totalPrice > 0) {
                        const supplier = this.data.suppliers.find(s => s.id === recommendedSupplierId);
                        if (supplier && supplier.default_currency) {
                            totalAmountEUR += this.convertCurrency(offer.totalPrice, supplier.default_currency, 'EUR');
                        }
                    }
                }
            });
        }
        
        return {
            totalItems,
            totalQuantity,
            recommendedSuppliers: recommendedSupplierIds.size,
            totalAmountEUR
        };
    }
    
    convertCurrency(amount, fromCurrency, toCurrency) {
        if (!this.options.currencyRates || fromCurrency === toCurrency) {
            return amount;
        }
        
        return (amount / this.options.currencyRates[fromCurrency]) * this.options.currencyRates[toCurrency];
    }
    
    formatCurrency(amount, currency) {
        const symbol = this.options.currencySymbols[currency];
        return `${symbol}${amount.toFixed(2)}`;
    }
    
    // Public methods for external access
    getRecommendations() {
        return this.data.itemRecommendations || {};
    }
    
    setRecommendations(recommendations) {
        this.data.itemRecommendations = recommendations;
        this.render();
    }
    
    updateData(newData) {
        this.setData({ ...this.data, ...newData });
    }

    // Column visibility control methods
    showColumn(columnName) {
        if (this.options.hasOwnProperty(`show${columnName}`)) {
            this.options[`show${columnName}`] = true;
            this.render();
        }
    }

    hideColumn(columnName) {
        if (this.options.hasOwnProperty(`show${columnName}`)) {
            this.options[`show${columnName}`] = false;
            this.render();
        }
    }

    toggleColumn(columnName) {
        if (this.options.hasOwnProperty(`show${columnName}`)) {
            this.options[`show${columnName}`] = !this.options[`show${columnName}`];
            this.render();
        }
    }

    setColumnVisibility(columnName, visible) {
        if (this.options.hasOwnProperty(`show${columnName}`)) {
            this.options[`show${columnName}`] = visible;
            this.render();
        }
    }

    // Convenience methods for specific columns
    showEuroTotal() { this.showColumn('EuroTotal'); }
    hideEuroTotal() { this.hideColumn('EuroTotal'); }
    toggleEuroTotal() { this.toggleColumn('EuroTotal'); }

    showOriginalTotal() { this.showColumn('OriginalTotal'); }
    hideOriginalTotal() { this.hideColumn('OriginalTotal'); }
    toggleOriginalTotal() { this.toggleColumn('OriginalTotal'); }

    showUnitPrice() { this.showColumn('UnitPrice'); }
    hideUnitPrice() { this.hideColumn('UnitPrice'); }
    toggleUnitPrice() { this.toggleColumn('UnitPrice'); }

    showDeliveryDays() { this.showColumn('DeliveryDays'); }
    hideDeliveryDays() { this.hideColumn('DeliveryDays'); }
    toggleDeliveryDays() { this.toggleColumn('DeliveryDays'); }

    showRecommendations() { this.showColumn('Recommendations'); }
    hideRecommendations() { this.hideColumn('Recommendations'); }
    toggleRecommendations() { this.toggleColumn('Recommendations'); }

    // Get current column visibility state
    getColumnVisibility() {
        return {
            euroTotal: this.options.showEuroTotal,
            originalTotal: this.options.showOriginalTotal,
            unitPrice: this.options.showUnitPrice,
            deliveryDays: this.options.showDeliveryDays,
            recommendations: this.options.showRecommendations
        };
    }

    // Set multiple column visibilities at once
    setColumnVisibilities(visibilities) {
        Object.keys(visibilities).forEach(key => {
            const optionKey = `show${key.charAt(0).toUpperCase() + key.slice(1)}`;
            if (this.options.hasOwnProperty(optionKey)) {
                this.options[optionKey] = visibilities[key];
            }
        });
        this.render();
    }

    // Set column order
    setColumnOrder(columnOrder) {
        this.options.columnOrder = columnOrder;
        this.render();
    }

    // Get current column order
    getColumnOrder() {
        return [...this.options.columnOrder];
    }
}

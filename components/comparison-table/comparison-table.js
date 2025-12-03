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
            // Export options
            showExportButton: true,
            exportFormats: ['csv', 'excel'], // Available export formats
            exportFilename: 'comparison-table', // Default filename (without extension)
            onExport: null, // Callback function when export is triggered
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
            specifications: { minimized: true, width: 'auto' },
            files: { minimized: true, width: 'auto' },
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
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0"><i class="fas fa-table me-2"></i>Karşılaştırma Tablosu</h5>
                    ${this.options.showExportButton ? this.generateExportButton() : ''}
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

    generateExportButton() {
        if (!this.options.exportFormats || this.options.exportFormats.length === 0) {
            return '';
        }

        const exportOptions = this.options.exportFormats.map(format => {
            const formatInfo = this.getFormatInfo(format);
            return `<a class="dropdown-item" href="#" onclick="event.preventDefault(); window.comparisonTableInstance.exportTo${formatInfo.method}(); return false;">
                <i class="${formatInfo.icon} me-2"></i>${formatInfo.label}
            </a>`;
        }).join('');

        return `
            <div class="dropdown">
                <button class="btn btn-outline-primary btn-sm dropdown-toggle" type="button" 
                        id="exportDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class="fas fa-download me-1"></i>Dışa Aktar
                </button>
                <ul class="dropdown-menu" aria-labelledby="exportDropdown">
                    ${exportOptions}
                </ul>
            </div>
        `;
    }

    getFormatInfo(format) {
        const formatMap = {
            'csv': {
                method: 'CSV',
                label: 'CSV',
                icon: 'fas fa-file-csv'
            },
            'excel': {
                method: 'Excel',
                label: 'Excel',
                icon: 'fas fa-file-excel'
            }
        };
        return formatMap[format] || { method: 'CSV', label: 'Dışa Aktar', icon: 'fas fa-download' };
    }





    generateGeneralHeaders() {
        const generalColumns = [
            { key: 'item', name: 'Malzeme', icon: 'fa-box' },
            { key: 'job_no', name: 'İş No', icon: 'fa-tag' },
            { key: 'quantity', name: 'Miktar', icon: 'fa-hashtag' },
            { key: 'unit', name: 'Birim', icon: 'fa-ruler' },
            { key: 'specifications', name: '', icon: 'fa-cogs' },
            { key: 'files', name: '', icon: 'fa-paperclip' }
        ];

        return generalColumns.map(col => {
            const isMinimized = this.isColumnMinimized(col.key);
            // Set appropriate display name for tooltip based on column key
            let displayName = col.name;
            if (!displayName) {
                if (col.key === 'specifications') {
                    displayName = 'Teknik Özellikler';
                } else if (col.key === 'files') {
                    displayName = 'Dosyalar';
                } else {
                    displayName = col.name || '';
                }
            }
            
            if (isMinimized) {
                return `
                    <th rowspan="3" class="align-middle minimized-column clickable-header" style="width: 40px; min-width: 40px;" 
                        onclick="window.comparisonTableInstance.toggleColumnMinimization('${col.key}')" 
                        title="Genişlet ${displayName}">
                        <div class="minimized-header">
                            <span class="rotated-text"><i class="fas ${col.icon}"></i></span>
                        </div>
                    </th>
                `;
            } else {
                return `
                    <th rowspan="3" class="align-middle clickable-header" 
                        onclick="window.comparisonTableInstance.toggleColumnMinimization('${col.key}')" 
                        title="Küçült ${displayName}">
                        ${col.name ? `<i class="fas ${col.icon} me-1"></i>${col.name}` : `<i class="fas ${col.icon}" title="${displayName}"></i>`}
                    </th>
                `;
            }
        }).join('');
    }

    getGeneralColumnsCount() {
        const generalColumns = ['item', 'job_no', 'quantity', 'unit', 'specifications', 'files'];
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
            { key: 'unit', content: item.unit },
            { key: 'specifications', content: this.formatSpecificationsCell(item.specifications, item.item_description, itemIndex) },
            { key: 'files', content: this.formatFilesCell(item.files || [], itemIndex) }
        ];

        return generalColumns.map(col => {
            const isMinimized = this.isColumnMinimized(col.key);
            if (isMinimized) {
                // For minimized columns, we need to handle clickable content differently
                // If the content has an onclick handler (like files), we need to preserve it
                const hasOnclick = col.content.includes('onclick=');
                if (hasOnclick && col.key === 'files') {
                    // For files column, render the icon directly without rotation wrapper
                    return `
                        <td class="minimized-cell" style="width: 40px; min-width: 40px;">
                            <div class="minimized-content" style="display: flex; align-items: center; justify-content: center;">
                                ${col.content}
                            </div>
                        </td>
                    `;
                } else {
                    return `
                        <td class="minimized-cell" style="width: 40px; min-width: 40px;">
                            <div class="minimized-content">
                                <span class="rotated-text">${col.content}</span>
                            </div>
                        </td>
                    `;
                }
            } else {
                return `<td class="text-center">${col.content}</td>`;
            }
        }).join('');
    }
    
    formatFilesCell(files, itemIndex) {
        if (!files || !Array.isArray(files) || files.length === 0) {
            return '-';
        }
        
        const fileCount = files.length;
        const titleText = fileCount === 1 ? '1 dosya' : `${fileCount} dosya`;
        return `
            <div class="files-cell" style="position: relative; justify-content: center; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;" 
                 onclick="if(window.comparisonTableInstance) { window.comparisonTableInstance.showFilesModal(${itemIndex}); }"
                 title="${titleText}">
                <i class="fas fa-paperclip text-primary" style="font-size: 1rem;"></i>
            </div>
        `;
    }
    
    showFilesModal(itemIndex) {
        // This will be called from the onclick handler
        // The actual modal will be created in the parent component (pending.js)
        if (this.options.onShowFiles && typeof this.options.onShowFiles === 'function') {
            const item = this.data.items[itemIndex];
            if (item && item.files) {
                this.options.onShowFiles(itemIndex, item.files, item);
            }
        }
    }
    
    showSpecificationsModal(itemIndex) {
        // This will be called from the onclick handler
        // The actual modal will be created in the parent component (pending.js)
        if (this.options.onShowSpecifications && typeof this.options.onShowSpecifications === 'function') {
            const item = this.data.items[itemIndex];
            if (item) {
                this.options.onShowSpecifications(itemIndex, item.specifications, item.item_description, item);
            }
        }
    }

    formatSpecificationsCell(specifications, itemDescription, itemIndex) {
        const hasSpecs = specifications && specifications.trim() !== '';
        const hasDescription = itemDescription && itemDescription.trim() !== '';
        
        if (!hasSpecs && !hasDescription) {
            return '-';
        }
        
        // Combine both texts for display
        const combinedText = [];
        if (hasDescription) {
            combinedText.push(`Açıklama: ${itemDescription.trim()}`);
        }
        if (hasSpecs) {
            combinedText.push(`Özellikler: ${specifications.trim()}`);
        }
        const fullText = combinedText.join('\n\n');
        
        return `
            <div class="specs-cell" style="position: relative; justify-content: center; cursor: pointer;" 
                 onclick="window.comparisonTableInstance.showSpecificationsModal(${itemIndex})"
                 title="${this.escapeHtml(fullText)}">
                <i class="fas fa-comment-dots text-info"></i>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
                .map(([unit, quantity]) => {
                    const formattedQty = parseFloat(quantity).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    return `${formattedQty} ${unit}`;
                })
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

    // Export functionality
    exportToCSV(filename = null) {
        const exportFilename = filename || `${this.options.exportFilename}.csv`;
        const csvData = this.generateCSVData();
        this.downloadFile(csvData, exportFilename, 'text/csv');
        
        if (this.options.onExport) {
            this.options.onExport('csv', exportFilename);
        }
    }

    exportToExcel(filename = null) {
        const exportFilename = filename || `${this.options.exportFilename}.xlsx`;
        console.log('Excel export başlatılıyor:', exportFilename);
        
        // Check if SheetJS is available
        if (typeof XLSX === 'undefined') {
            console.log('SheetJS kütüphanesi bulunamadı, yükleniyor...');
            this.loadSheetJS().then(() => {
                console.log('SheetJS kütüphanesi yüklendi, export tekrar deneniyor...');
                this.exportToExcel(filename);
            }).catch((error) => {
                console.error('SheetJS kütüphanesi yüklenemedi:', error);
                alert('Excel dışa aktarma için SheetJS kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin.');
            });
            return;
        }

        console.log('SheetJS kütüphanesi bulundu');
        console.log('Mevcut veri:', this.data);
        console.log('Malzeme sayısı:', this.data.items.length);
        console.log('Tedarikçi sayısı:', this.data.suppliers.length);
        
        const workbook = XLSX.utils.book_new();
        
        // Main comparison data with enhanced formatting
        const comparisonData = this.generateEnhancedExcelData();
        console.log('Gelişmiş karşılaştırma verisi oluşturuldu:', comparisonData.length, 'satır');
        const comparisonSheet = XLSX.utils.aoa_to_sheet(comparisonData);
        
        // Apply formatting to the comparison sheet
        this.applyExcelFormatting(comparisonSheet, comparisonData);
        XLSX.utils.book_append_sheet(workbook, comparisonSheet, 'Karşılaştırma');

        // Summary data
        if (this.options.showSummary) {
            const summaryData = this.generateEnhancedSummaryExcelData();
            console.log('Gelişmiş özet verisi oluşturuldu:', summaryData.length, 'satır');
            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            this.applySummaryExcelFormatting(summarySheet, summaryData);
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Özet');
        }

        console.log('Excel dosyası yazılıyor...');
        XLSX.writeFile(workbook, exportFilename);
        console.log('Excel dosyası başarıyla oluşturuldu:', exportFilename);
        
        if (this.options.onExport) {
            this.options.onExport('excel', exportFilename);
        }
    }

    generateCSVData() {
        const data = [];
        
        // Add headers
        const headers = this.generateCSVHeaders();
        data.push(headers);
        
        // Add data rows
        this.data.items.forEach((item, itemIndex) => {
            const row = this.generateCSVRow(item, itemIndex);
            data.push(row);
        });
        
        // Add summary row if enabled
        if (this.options.showSummary && this.options.showSummaryRow) {
            const summaryRow = this.generateCSVSummaryRow();
            data.push(summaryRow);
        }
        
        return data.map(row => row.map(cell => this.escapeCSV(cell)).join(',')).join('\n');
    }

    generateCSVHeaders() {
        const headers = ['Malzeme', 'İş No', 'Miktar', 'Birim'];
        
        if (!this.options.specifications) {
            headers.push('Teknik Özellikler');
        }
        
        this.data.suppliers.forEach(supplier => {
            if (this.options.showUnitPrice) headers.push(`${supplier.name} - Birim Fiyat`);
            if (this.options.showDeliveryDays) headers.push(`${supplier.name} - Teslim Süresi`);
            if (this.options.showOriginalTotal) headers.push(`${supplier.name} - Toplam`);
            if (this.options.showEuroTotal) headers.push(`${supplier.name} - Euro Toplam`);
            if (this.options.showRecommendations) headers.push(`${supplier.name} - Öneri`);
        });
        
        return headers;
    }

    generateCSVRow(item, itemIndex) {
        // Format quantity with comma as decimal separator
        const formattedQuantity = item.quantity ? 
            parseFloat(item.quantity).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        
        const row = [
            item.name || '',
            item.job_no || '',
            formattedQuantity,
            item.unit || ''
        ];
        
        if (!this.options.specifications) {
            row.push(item.specifications || '');
        }
        
        this.data.suppliers.forEach(supplier => {
            const offer = this.data.offers[supplier.id] && this.data.offers[supplier.id][itemIndex];
            const isRecommended = this.data.itemRecommendations && 
                this.data.itemRecommendations[itemIndex] === supplier.id;
            
            if (this.options.showUnitPrice) {
                const formattedUnitPrice = offer && offer.unitPrice ? 
                    parseFloat(offer.unitPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                row.push(formattedUnitPrice ? `${formattedUnitPrice} ${supplier.default_currency || ''}` : '');
            }
            
            if (this.options.showDeliveryDays) {
                row.push(offer && offer.deliveryDays ? offer.deliveryDays.toString() : '');
            }
            
            if (this.options.showOriginalTotal) {
                const formattedTotalPrice = offer && offer.totalPrice ? 
                    parseFloat(offer.totalPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                row.push(formattedTotalPrice ? `${formattedTotalPrice} ${supplier.default_currency || ''}` : '');
            }
            
            if (this.options.showEuroTotal) {
                if (offer && offer.totalPrice && supplier.default_currency) {
                    const euroAmount = this.convertCurrency(offer.totalPrice, supplier.default_currency, 'EUR');
                    const formattedEuro = euroAmount ? 
                        parseFloat(euroAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                    row.push(formattedEuro ? `€${formattedEuro}` : '');
                } else {
                    row.push('');
                }
            }
            
            if (this.options.showRecommendations) {
                row.push(isRecommended ? 'Önerilen' : '');
            }
        });
        
        return row;
    }

    generateCSVSummaryRow() {
        const row = ['TOPLAM', '', '', ''];
        
        if (!this.options.specifications) {
            row.push('');
        }
        
        this.data.suppliers.forEach(supplier => {
            const totals = this.calculateSupplierTotals(supplier.id);
            
            if (this.options.showUnitPrice) {
                row.push(''); // No total for unit prices
            }
            
            if (this.options.showDeliveryDays) {
                const formattedAvgDays = totals.avgDeliveryDays ? 
                    parseFloat(totals.avgDeliveryDays).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '';
                row.push(formattedAvgDays);
            }
            
            if (this.options.showOriginalTotal) {
                const formattedTotalPrice = totals.totalPrice ? 
                    parseFloat(totals.totalPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                row.push(formattedTotalPrice ? `${formattedTotalPrice} ${supplier.default_currency || ''}` : '');
            }
            
            if (this.options.showEuroTotal) {
                if (totals.totalPrice && supplier.default_currency) {
                    const euroAmount = this.convertCurrency(totals.totalPrice, supplier.default_currency, 'EUR');
                    const formattedEuro = euroAmount ? 
                        parseFloat(euroAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                    row.push(formattedEuro ? `€${formattedEuro}` : '');
                } else {
                    row.push('');
                }
            }
            
            if (this.options.showRecommendations) {
                row.push(''); // No total for recommendations
            }
        });
        
        return row;
    }

    generateExcelData() {
        const data = [];
        
        // Add headers
        const headers = this.generateCSVHeaders();
        data.push(headers);
        
        // Add data rows
        this.data.items.forEach((item, itemIndex) => {
            const row = this.generateCSVRow(item, itemIndex);
            data.push(row);
        });
        
        // Add summary row if enabled
        if (this.options.showSummary && this.options.showSummaryRow) {
            const summaryRow = this.generateCSVSummaryRow();
            data.push(summaryRow);
        }
        
        return data;
    }

    generateEnhancedExcelData() {
        const data = [];
        
        // Add title row
        data.push(['KARŞILAŞTIRMA TABLOSU']);
        data.push([]); // Empty row
        
        // Add main header row
        const mainHeaders = ['Malzeme', 'İş No', 'Miktar', 'Birim'];
        if (!this.options.specifications) {
            mainHeaders.push('Teknik Özellikler');
        }
        
        // Add supplier headers
        this.data.suppliers.forEach(supplier => {
            if (this.options.showUnitPrice) mainHeaders.push(`${supplier.name} - Birim Fiyat`);
            if (this.options.showDeliveryDays) mainHeaders.push(`${supplier.name} - Teslim Süresi`);
            if (this.options.showOriginalTotal) mainHeaders.push(`${supplier.name} - Toplam`);
            if (this.options.showEuroTotal) mainHeaders.push(`${supplier.name} - Euro Toplam`);
            if (this.options.showRecommendations) mainHeaders.push(`${supplier.name} - Öneri`);
        });
        
        data.push(mainHeaders);
        
        // Add sub-header row for supplier details
        const subHeaders = ['', '', '', ''];
        if (!this.options.specifications) {
            subHeaders.push('');
        }
        
        this.data.suppliers.forEach(supplier => {
            const supplierColumns = [];
            if (this.options.showUnitPrice) supplierColumns.push('Birim Fiyat');
            if (this.options.showDeliveryDays) supplierColumns.push('Teslim (Gün)');
            if (this.options.showOriginalTotal) supplierColumns.push('Toplam Fiyat');
            if (this.options.showEuroTotal) supplierColumns.push('Euro Toplam');
            if (this.options.showRecommendations) supplierColumns.push('Önerilen');
            
            subHeaders.push(...supplierColumns);
        });
        
        data.push(subHeaders);
        data.push([]); // Empty row for spacing
        
        // Add data rows with enhanced formatting
        this.data.items.forEach((item, itemIndex) => {
            const row = [
                item.name || '',
                item.job_no || '',
                item.quantity || '',
                item.unit || ''
            ];
            
            if (!this.options.specifications) {
                row.push(item.specifications || '');
            }
            
            this.data.suppliers.forEach(supplier => {
                const offer = this.data.offers[supplier.id] && this.data.offers[supplier.id][itemIndex];
                const isRecommended = this.data.itemRecommendations && 
                    this.data.itemRecommendations[itemIndex] === supplier.id;
                
                // Debug logging
                if (itemIndex === 0) { // Only log for first item to avoid spam
                    console.log(`Supplier ${supplier.name} (${supplier.id}) for item ${itemIndex}:`, offer);
                }
                
                if (this.options.showUnitPrice) {
                    if (offer && offer.unitPrice) {
                        row.push(`${offer.unitPrice} ${supplier.default_currency || ''}`);
                    } else {
                        row.push('-');
                    }
                }
                
                if (this.options.showDeliveryDays) {
                    if (offer && offer.deliveryDays) {
                        row.push(`${offer.deliveryDays} gün`);
                    } else {
                        row.push('-');
                    }
                }
                
                if (this.options.showOriginalTotal) {
                    if (offer && offer.totalPrice) {
                        row.push(`${offer.totalPrice} ${supplier.default_currency || ''}`);
                    } else {
                        row.push('-');
                    }
                }
                
                if (this.options.showEuroTotal) {
                    if (offer && offer.totalPrice && supplier.default_currency) {
                        const euroAmount = this.convertCurrency(offer.totalPrice, supplier.default_currency, 'EUR');
                        const formattedEuro = euroAmount ? 
                            parseFloat(euroAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                        row.push(formattedEuro ? `€${formattedEuro}` : '-');
                    } else {
                        row.push('-');
                    }
                }
                
                if (this.options.showRecommendations) {
                    row.push(isRecommended ? '★ ÖNERİLEN' : '');
                }
            });
            
            data.push(row);
        });
        
        // Add summary row if enabled
        if (this.options.showSummary && this.options.showSummaryRow) {
            data.push([]); // Empty row for spacing
            const summaryRow = ['TOPLAM', '', '', ''];
            
            if (!this.options.specifications) {
                summaryRow.push('');
            }
            
            this.data.suppliers.forEach(supplier => {
                const totals = this.calculateSupplierTotals(supplier.id);
                
                if (this.options.showUnitPrice) {
                    summaryRow.push(''); // No total for unit prices
                }
                
                if (this.options.showDeliveryDays) {
                    const formattedAvgDays = totals.avgDeliveryDays ? 
                        parseFloat(totals.avgDeliveryDays).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '';
                    summaryRow.push(formattedAvgDays ? `${formattedAvgDays} gün` : '-');
                }
                
                if (this.options.showOriginalTotal) {
                    const formattedTotalPrice = totals.totalPrice ? 
                        parseFloat(totals.totalPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                    summaryRow.push(formattedTotalPrice ? `${formattedTotalPrice} ${supplier.default_currency || ''}` : '-');
                }
                
                if (this.options.showEuroTotal) {
                    if (totals.totalPrice && supplier.default_currency) {
                        const euroAmount = this.convertCurrency(totals.totalPrice, supplier.default_currency, 'EUR');
                        const formattedEuro = euroAmount ? 
                            parseFloat(euroAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                        summaryRow.push(formattedEuro ? `€${formattedEuro}` : '-');
                    } else {
                        summaryRow.push('-');
                    }
                }
                
                if (this.options.showRecommendations) {
                    summaryRow.push(''); // No total for recommendations
                }
            });
            
            data.push(summaryRow);
        }
        
        return data;
    }

    generateSummaryExcelData() {
        const data = [];
        
        // Summary headers
        data.push(['Özet Bilgileri']);
        data.push(['']);
        
        // Items summary
        data.push(['Malzeme Özeti']);
        data.push(['Toplam Malzeme', this.data.items.length]);
        data.push(['']);
        
        // Suppliers summary
        data.push(['Tedarikçi Özeti']);
        this.data.suppliers.forEach(supplier => {
            const totals = this.calculateSupplierTotals(supplier.id);
            data.push([supplier.name]);
            data.push(['Toplam Fiyat', totals.totalPrice ? 
                `${totals.totalPrice} ${supplier.default_currency || ''}` : 'N/A']);
            const formattedAvgDays = totals.avgDeliveryDays ? 
                parseFloat(totals.avgDeliveryDays).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '';
            data.push(['Ortalama Teslim Süresi', formattedAvgDays || 'N/A']);
            data.push(['']);
        });
        
        // Recommendations summary
        if (this.data.itemRecommendations) {
            data.push(['Öneri Özeti']);
            const recommendationCounts = {};
            Object.values(this.data.itemRecommendations).forEach(supplierId => {
                if (supplierId) {
                    const supplier = this.data.suppliers.find(s => s.id === supplierId);
                    const supplierName = supplier ? supplier.name : supplierId;
                    recommendationCounts[supplierName] = (recommendationCounts[supplierName] || 0) + 1;
                }
            });
            
            Object.entries(recommendationCounts).forEach(([supplierName, count]) => {
                data.push([supplierName, count]);
            });
        }
        
        return data;
    }

    escapeCSV(cell) {
        if (cell === null || cell === undefined) return '';
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    applyExcelFormatting(worksheet, data) {
        // Set column widths
        const colWidths = [];
        const maxCols = Math.max(...data.map(row => row.length));
        
        for (let i = 0; i < maxCols; i++) {
            if (i < 4) { // First 4 columns (Malzeme, İş No, Miktar, Birim)
                colWidths.push({ wch: 15 });
            } else if (i === 4 && !this.options.specifications) { // Specifications column
                colWidths.push({ wch: 25 });
            } else { // Supplier columns
                colWidths.push({ wch: 18 });
            }
        }
        
        worksheet['!cols'] = colWidths;
        
        // Set row heights
        const rowHeights = [];
        for (let i = 0; i < data.length; i++) {
            if (i === 0) { // Title row
                rowHeights.push({ hpt: 25 });
            } else if (i === 2 || i === 3) { // Header rows
                rowHeights.push({ hpt: 20 });
            } else {
                rowHeights.push({ hpt: 18 });
            }
        }
        worksheet['!rows'] = rowHeights;
        
        // Apply cell formatting
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        
        for (let row = range.s.r; row <= range.e.r; row++) {
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                const cell = worksheet[cellAddress];
                
                if (cell) {
                    // Title row formatting
                    if (row === 0) {
                        cell.s = {
                            font: { bold: true, size: 16, color: { rgb: "FFFFFF" } },
                            fill: { fgColor: { rgb: "4472C4" } },
                            alignment: { horizontal: "center", vertical: "center" }
                        };
                    }
                    // Main header row formatting
                    else if (row === 2) {
                        cell.s = {
                            font: { bold: true, size: 12, color: { rgb: "FFFFFF" } },
                            fill: { fgColor: { rgb: "5B9BD5" } },
                            alignment: { horizontal: "center", vertical: "center" },
                            border: {
                                top: { style: "thin", color: { rgb: "000000" } },
                                bottom: { style: "thin", color: { rgb: "000000" } },
                                left: { style: "thin", color: { rgb: "000000" } },
                                right: { style: "thin", color: { rgb: "000000" } }
                            }
                        };
                    }
                    // Sub-header row formatting
                    else if (row === 3) {
                        cell.s = {
                            font: { bold: true, size: 10, color: { rgb: "000000" } },
                            fill: { fgColor: { rgb: "D9E2F3" } },
                            alignment: { horizontal: "center", vertical: "center" },
                            border: {
                                top: { style: "thin", color: { rgb: "000000" } },
                                bottom: { style: "thin", color: { rgb: "000000" } },
                                left: { style: "thin", color: { rgb: "000000" } },
                                right: { style: "thin", color: { rgb: "000000" } }
                            }
                        };
                    }
                    // Data rows formatting
                    else if (row > 4) {
                        const isSummaryRow = data[row] && data[row][0] === 'TOPLAM';
                        
                        if (isSummaryRow) {
                            cell.s = {
                                font: { bold: true, size: 11, color: { rgb: "000000" } },
                                fill: { fgColor: { rgb: "E2EFDA" } },
                                alignment: { horizontal: "center", vertical: "center" },
                                border: {
                                    top: { style: "medium", color: { rgb: "000000" } },
                                    bottom: { style: "medium", color: { rgb: "000000" } },
                                    left: { style: "thin", color: { rgb: "000000" } },
                                    right: { style: "thin", color: { rgb: "000000" } }
                                }
                            };
                        } else {
                            cell.s = {
                                font: { size: 10 },
                                alignment: { horizontal: "center", vertical: "center" },
                                border: {
                                    top: { style: "thin", color: { rgb: "CCCCCC" } },
                                    bottom: { style: "thin", color: { rgb: "CCCCCC" } },
                                    left: { style: "thin", color: { rgb: "CCCCCC" } },
                                    right: { style: "thin", color: { rgb: "CCCCCC" } }
                                }
                            };
                            
                            // Highlight recommended cells
                            if (cell.v && cell.v.includes('★ ÖNERİLEN')) {
                                cell.s.fill = { fgColor: { rgb: "FFF2CC" } };
                                cell.s.font = { size: 10, bold: true, color: { rgb: "B8860B" } };
                            }
                        }
                    }
                }
            }
        }
    }

    applySummaryExcelFormatting(worksheet, data) {
        // Set column widths
        worksheet['!cols'] = [{ wch: 25 }, { wch: 20 }];
        
        // Apply cell formatting
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        
        for (let row = range.s.r; row <= range.e.r; row++) {
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                const cell = worksheet[cellAddress];
                
                if (cell) {
                    // Title formatting
                    if (data[row] && data[row][0] && data[row][0].includes('Özet')) {
                        cell.s = {
                            font: { bold: true, size: 14, color: { rgb: "FFFFFF" } },
                            fill: { fgColor: { rgb: "4472C4" } },
                            alignment: { horizontal: "center", vertical: "center" }
                        };
                    }
                    // Section headers
                    else if (data[row] && data[row][0] && (
                        data[row][0].includes('Malzeme') || 
                        data[row][0].includes('Tedarikçi') || 
                        data[row][0].includes('Öneri')
                    )) {
                        cell.s = {
                            font: { bold: true, size: 12, color: { rgb: "000000" } },
                            fill: { fgColor: { rgb: "D9E2F3" } },
                            alignment: { horizontal: "left", vertical: "center" }
                        };
                    }
                    // Data rows
                    else if (data[row] && data[row][0]) {
                        cell.s = {
                            font: { size: 10 },
                            alignment: { horizontal: "left", vertical: "center" }
                        };
                    }
                }
            }
        }
    }

    generateEnhancedSummaryExcelData() {
        const data = [];
        
        // Title
        data.push(['ÖZET BİLGİLERİ']);
        data.push([]);
        
        // Items summary
        data.push(['Malzeme Özeti']);
        data.push(['Toplam Malzeme', this.data.items.length]);
        data.push(['']);
        
        // Suppliers summary
        data.push(['Tedarikçi Özeti']);
        this.data.suppliers.forEach(supplier => {
            const totals = this.calculateSupplierTotals(supplier.id);
            data.push([supplier.name, '']);
            data.push(['Toplam Fiyat', totals.totalPrice ? 
                `${totals.totalPrice} ${supplier.default_currency || ''}` : 'N/A']);
            const formattedAvgDays = totals.avgDeliveryDays ? 
                parseFloat(totals.avgDeliveryDays).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '';
            data.push(['Ortalama Teslim Süresi', formattedAvgDays ? `${formattedAvgDays} gün` : 'N/A']);
            data.push(['']);
        });
        
        // Recommendations summary
        if (this.data.itemRecommendations) {
            data.push(['Öneri Özeti']);
            const recommendationCounts = {};
            Object.values(this.data.itemRecommendations).forEach(supplierId => {
                if (supplierId) {
                    const supplier = this.data.suppliers.find(s => s.id === supplierId);
                    const supplierName = supplier ? supplier.name : supplierId;
                    recommendationCounts[supplierName] = (recommendationCounts[supplierName] || 0) + 1;
                }
            });
            
            Object.entries(recommendationCounts).forEach(([supplierName, count]) => {
                data.push([supplierName, `${count} malzeme`]);
            });
        }
        
        return data;
    }

    loadSheetJS() {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (typeof XLSX !== 'undefined') {
                resolve();
                return;
            }

            // Check if script is already being loaded
            if (document.querySelector('script[src*="xlsx"]')) {
                // Wait for it to load
                const checkLoaded = setInterval(() => {
                    if (typeof XLSX !== 'undefined') {
                        clearInterval(checkLoaded);
                        resolve();
                    }
                }, 100);
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    clearInterval(checkLoaded);
                    reject(new Error('SheetJS yükleme zaman aşımı'));
                }, 10000);
                return;
            }

            // Load the script
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            script.onload = () => {
                console.log('SheetJS kütüphanesi başarıyla yüklendi');
                resolve();
            };
            script.onerror = () => {
                console.error('SheetJS kütüphanesi yüklenemedi');
                reject(new Error('SheetJS kütüphanesi yüklenemedi'));
            };
            document.head.appendChild(script);
        });
    }
}

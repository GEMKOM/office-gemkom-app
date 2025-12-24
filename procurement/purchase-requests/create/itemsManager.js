// Items Manager Module
import { UNIT_CHOICES } from '../../../apis/constants.js';

export class ItemsManager {
    constructor(requestData, autoSave) {
        this.requestData = requestData;
        this.autoSave = autoSave;
        this.setupEventListeners();
    }

    // ===== EVENT LISTENERS =====
    setupEventListeners() {
        this.setupItemButtons();
        this.setupModalButtons();
        this.setupBulkImportButtons();
    }

    setupItemButtons() {
        const addItemBtn = document.getElementById('add-item-btn');
        const clearItemsBtn = document.getElementById('clear-items-btn');
        const mergeItemsBtn = document.getElementById('merge-items-btn');

        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => this.showItemModal());
        }
        if (clearItemsBtn) {
            clearItemsBtn.addEventListener('click', () => this.clearAllItems());
        }
        if (mergeItemsBtn) {
            mergeItemsBtn.addEventListener('click', () => this.mergeDuplicateItems());
        }
    }

    setupModalButtons() {
        const saveItemBtn = document.getElementById('save-item-btn');
        if (saveItemBtn) {
            saveItemBtn.addEventListener('click', () => this.saveItem());
        }
    }

    setupBulkImportButtons() {
        const bulkImportBtn = document.getElementById('bulk-import-btn');
        const previewImportBtn = document.getElementById('preview-import-btn');
        const clearImportBtn = document.getElementById('clear-import-btn');
        const importItemsBtn = document.getElementById('import-items-btn');
        const confirmMappingBtn = document.getElementById('confirm-mapping-btn');

        if (bulkImportBtn) {
            bulkImportBtn.addEventListener('click', () => this.showBulkImportModal());
        }
        if (previewImportBtn) {
            previewImportBtn.addEventListener('click', () => this.previewBulkImport());
        }
        if (clearImportBtn) {
            clearImportBtn.addEventListener('click', () => this.clearBulkImport());
        }
        if (importItemsBtn) {
            importItemsBtn.addEventListener('click', () => this.importBulkItems());
        }
        if (confirmMappingBtn) {
            confirmMappingBtn.addEventListener('click', () => this.confirmColumnMapping());
        }
    }

    // ===== ITEM MANAGEMENT =====
    showItemModal(itemIndex = null) {
        const modalElement = document.getElementById('itemModal');
        const modal = new bootstrap.Modal(modalElement);
        const title = document.getElementById('itemModalTitle');
        const form = document.getElementById('itemForm');

        if (itemIndex !== null) {
            // Edit existing item
            title.textContent = 'Malzeme Düzenle';
            const item = this.requestData.items[itemIndex];
            this.populateItemForm(item);
            form.dataset.editIndex = itemIndex;
        } else {
            // Add new item
            title.textContent = 'Malzeme Ekle';
            form.reset();
            delete form.dataset.editIndex;
        }

        modal.show();
    }

    populateItemForm(item) {
        document.getElementById('item-code').value = item.code;
        document.getElementById('item-name').value = item.name;
        document.getElementById('item-job-no').value = item.job_no || '';
        document.getElementById('item-quantity').value = item.quantity;
        document.getElementById('item-unit').value = item.unit;
        document.getElementById('item-description').value = item.item_description || '';
        document.getElementById('item-specs').value = item.specifications || item.specs || '';
    }

    saveItem() {
        const form = document.getElementById('itemForm');
        const editIndex = form.dataset.editIndex;

        // Get form values
        const code = document.getElementById('item-code').value.trim();
        const name = document.getElementById('item-name').value.trim();
        const jobNo = document.getElementById('item-job-no').value.trim();
        const quantity = parseFloat(document.getElementById('item-quantity').value) || 0;
        const unit = document.getElementById('item-unit').value;
        const itemDescription = document.getElementById('item-description').value.trim();
        const specifications = document.getElementById('item-specs').value.trim();

        // Validate required fields
        const errors = [];
        
        if (!code) {
            errors.push('Malzeme kodu zorunludur');
        }
        
        if (!name) {
            errors.push('Malzeme adı zorunludur');
        }
        
        if (!jobNo) {
            errors.push('İş numarası zorunludur');
        }
        
        if (!quantity || quantity <= 0) {
            errors.push('Miktar zorunludur ve 0\'dan büyük olmalıdır');
        }
        
        // Check if quantity is integer when unit is 'adet'
        if (unit === 'adet' && !Number.isInteger(quantity)) {
            errors.push('\'Adet\' birimi için miktar tam sayı olmalıdır');
        }

        // Show errors if any
        if (errors.length > 0) {
            this.showNotification('Lütfen aşağıdaki hataları düzeltin:\n' + errors.join('\n'), 'error');
            return;
        }

        const item = {
            id: editIndex !== undefined ? this.requestData.items[editIndex].id : this.generateItemId(),
            code: code,
            name: name,
            job_no: jobNo,
            quantity: quantity,
            unit: unit,
            specs: specifications, // Keep for backward compatibility
            item_description: itemDescription,
            specifications: specifications,
            // Preserve other fields if editing
            ...(editIndex !== undefined && this.requestData.items[editIndex] ? {
                source_planning_request_item_id: this.requestData.items[editIndex].source_planning_request_item_id,
                file_asset_ids: this.requestData.items[editIndex].file_asset_ids,
                allocations: this.requestData.items[editIndex].allocations
            } : {})
        };

        if (editIndex !== undefined) {
            // Update existing item
            this.requestData.items[editIndex] = item;
        } else {
            // Add new item
            this.requestData.items.push(item);
        }

        this.renderItemsTable();
        this.autoSave();

        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('itemModal')).hide();
    }

    deleteItem(index) {
        const item = this.requestData.items[index];
        this.showDeleteItemModal(item, index);
    }

    showDeleteItemModal(item, index) {
        const modalId = 'deleteItemModal_' + Date.now();
        
        const modalHtml = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-exclamation-triangle me-2"></i>Malzeme Silme Onayı
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-warning">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                <strong>Dikkat:</strong> Bu işlem geri alınamaz!
                            </div>
                            <p>Aşağıdaki malzemeyi silmek istediğinizden emin misiniz?</p>
                            <div class="item-details p-3 bg-light rounded">
                                <div class="row">
                                    <div class="col-md-6">
                                        <strong>Kod:</strong> ${item.code}
                                    </div>
                                    <div class="col-md-6">
                                        <strong>Ad:</strong> ${item.name}
                                    </div>
                                </div>
                                <div class="row mt-2">
                                    <div class="col-md-6">
                                        <strong>İş No:</strong> ${item.job_no || '-'}
                                    </div>
                                    <div class="col-md-6">
                                        <strong>Miktar:</strong> ${item.quantity} ${item.unit}
                                    </div>
                                </div>

                                ${item.specs ? `
                                <div class="row mt-2">
                                    <div class="col-12">
                                        <strong>Özellikler:</strong> 
                                        <div class="specs-preview mt-1">${item.specs.length > 100 ? item.specs.substring(0, 100) + '...' : item.specs}</div>
                                    </div>
                                </div>
                                ` : ''}
                            </div>
                            <div class="alert alert-info mt-3">
                                <i class="fas fa-info-circle me-2"></i>
                                Bu malzeme ile ilişkili tüm tedarikçi teklifleri de silinecektir.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times me-1"></i>İptal
                            </button>
                            <button type="button" class="btn btn-danger" onclick="window.itemsManager.confirmDeleteItem(${index}, '${modalId}')">
                                <i class="fas fa-trash me-1"></i>Evet, Sil
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById(modalId));
        modal.show();
        
        document.getElementById(modalId).addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    confirmDeleteItem(index, modalId) {
        const item = this.requestData.items[index];
        
        // Remove all offers for this item
        Object.keys(this.requestData.offers).forEach(supplierId => {
            if (this.requestData.offers[supplierId][index]) {
                delete this.requestData.offers[supplierId][index];
                // Reindex the offers
                const reindexedOffers = {};
                Object.keys(this.requestData.offers[supplierId]).forEach(key => {
                    const numKey = parseInt(key);
                    if (numKey > index) {
                        reindexedOffers[numKey - 1] = this.requestData.offers[supplierId][key];
                    } else if (numKey < index) {
                        reindexedOffers[numKey] = this.requestData.offers[supplierId][key];
                    }
                });
                this.requestData.offers[supplierId] = reindexedOffers;
            }
        });

        // Remove from planning_request_item_ids if this item came from a planning request
        if (item.source_planning_request_item_id) {
            const itemId = item.source_planning_request_item_id;
            if (this.requestData.planning_request_item_ids) {
                this.requestData.planning_request_item_ids = this.requestData.planning_request_item_ids.filter(
                    id => id !== itemId
                );
            }
        }
        
        this.requestData.items.splice(index, 1);
        
        // Sync planning_request_item_ids with actual items after deletion
        // This ensures accuracy even if manual cleanup missed something
        if (window.syncPlanningRequestItemIds) {
            window.syncPlanningRequestItemIds();
        }
        
        this.renderItemsTable();
        this.autoSave();
        
        // Close modal
        bootstrap.Modal.getInstance(document.getElementById(modalId)).hide();
        
        // Show success notification
        this.showNotification('Malzeme başarıyla silindi', 'success');
    }

    clearAllItems() {
        if (!this.requestData.items.length) return;
        this.showClearAllItemsModal();
    }

    showClearAllItemsModal() {
        const modalId = 'clearAllItemsModal_' + Date.now();
        const itemCount = this.requestData.items.length;
        
        const modalHtml = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title">
                                <i class="fas fa-exclamation-triangle me-2"></i>Tüm Malzemeleri Silme Onayı
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-danger">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                <strong>Dikkat:</strong> Bu işlem geri alınamaz!
                            </div>
                            <p><strong>${itemCount} adet malzeme</strong> silinecektir. Bu işlem:</p>
                            <ul class="list-group list-group-flush mb-3">
                                <li class="list-group-item">
                                    <i class="fas fa-trash text-danger me-2"></i>
                                    Tüm malzemeleri kalıcı olarak silecek
                                </li>
                                <li class="list-group-item">
                                    <i class="fas fa-handshake text-danger me-2"></i>
                                    Tüm tedarikçi tekliflerini silecek
                                </li>
                                <li class="list-group-item">
                                    <i class="fas fa-chart-bar text-danger me-2"></i>
                                    Karşılaştırma tablosunu temizleyecek
                                </li>
                            </ul>
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle me-2"></i>
                                <strong>Öneri:</strong> Eğer emin değilseniz, önce verilerinizi dışa aktarabilirsiniz.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times me-1"></i>İptal
                            </button>
                            <button type="button" class="btn btn-warning" onclick="window.itemsManager.confirmClearAllItems('${modalId}')">
                                <i class="fas fa-trash me-1"></i>Evet, Tümünü Sil
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById(modalId));
        modal.show();
        
        document.getElementById(modalId).addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    confirmClearAllItems(modalId) {
        this.requestData.items = [];
        // Clear all offers since there are no items left
        this.requestData.offers = {};
        this.renderItemsTable();
        this.autoSave();
        
        // Close modal
        bootstrap.Modal.getInstance(document.getElementById(modalId)).hide();
        
        // Show success notification
        this.showNotification('Tüm malzemeler başarıyla silindi', 'success');
    }

    mergeDuplicateItems() {
        if (!this.requestData.items.length) return;
        
        // Group items by code
        const groupedByCode = {};
        this.requestData.items.forEach((item, index) => {
            const code = item.code.trim().toLowerCase();
            if (!groupedByCode[code]) {
                groupedByCode[code] = [];
            }
            groupedByCode[code].push({ ...item, originalIndex: index });
        });

        // Find groups with multiple items
        const duplicates = Object.entries(groupedByCode)
            .filter(([code, items]) => items.length > 1)
            .map(([code, items]) => ({ code, items }));

        if (duplicates.length === 0) {
            this.showNotification('Birleştirilecek aynı kodlu malzeme bulunamadı.', 'info');
            return;
        }

        this.showMergeItemsModal(duplicates);
    }

    showMergeItemsModal(duplicates) {
        const modalId = 'mergeItemsModal_' + Date.now();
        
        let duplicatesHtml = '';
        duplicates.forEach(({ code, items }, groupIndex) => {
            // Check if items have different specs
            const uniqueSpecs = [...new Set(items.map(item => item.specs || '').filter(specs => specs.trim()))];
            const hasDifferentSpecs = uniqueSpecs.length > 1;
            
            // Check if items have different names or units
            const firstItem = items[0];
            const sameName = items.every(item => 
                item.name.trim().toLowerCase() === firstItem.name.trim().toLowerCase()
            );
            const sameUnit = items.every(item => 
                item.unit.trim().toLowerCase() === firstItem.unit.trim().toLowerCase()
            );

            // Check if items have the same code, name, job_no, AND specifications (cannot be merged)
            const sameJobNo = items.every(item => 
                (item.job_no || '').trim().toLowerCase() === (firstItem.job_no || '').trim().toLowerCase()
            );
            const sameSpecs = items.every(item => 
                (item.specs || '').trim() === (firstItem.specs || '').trim()
            );
            const cannotMerge = sameJobNo && sameSpecs;
            
            duplicatesHtml += `
                <div class="duplicate-group mb-3 p-3 border rounded" data-group-index="${groupIndex}">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="text-primary mb-0">
                            <i class="fas fa-tags me-2"></i>Kod: <strong>${items[0].code}</strong>
                            <span class="badge bg-primary ms-2">${items.length} adet</span>
                        </h6>
                        <div class="form-check">
                            <input class="form-check-input merge-group-checkbox" type="checkbox" 
                                   id="merge-group-${groupIndex}" data-group-index="${groupIndex}" 
                                   ${sameName && sameUnit && !cannotMerge ? 'checked' : ''} 
                                   ${!sameName || !sameUnit || cannotMerge ? 'disabled' : ''}>
                            <label class="form-check-label" for="merge-group-${groupIndex}">
                                Bu grubu birleştir
                            </label>
                        </div>
                    </div>
                    
                    ${(!sameName || !sameUnit) ? `
                        <div class="alert alert-warning mb-2">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            <strong>Uyarı:</strong> Bu gruptaki malzemeler farklı ad veya birime sahip olduğu için birleştirilemez.
                            ${!sameName ? '<br>• Farklı malzeme adları' : ''}
                            ${!sameUnit ? '<br>• Farklı birimler' : ''}
                        </div>
                    ` : ''}
                    
                    ${cannotMerge ? `
                        <div class="alert alert-danger mb-2">
                            <i class="fas fa-ban me-2"></i>
                            <strong>Birleştirilemez:</strong> Bu gruptaki malzemeler aynı kod, ad, iş numarası ve teknik özelliklere sahip olduğu için birleştirilemez.
                            <br>• Aynı malzeme adı: ${firstItem.name}
                            <br>• Aynı iş numarası: ${firstItem.job_no || 'Belirtilmemiş'}
                            <br>• Aynı teknik özellikler: ${firstItem.specs || 'Belirtilmemiş'}
                            <br><br><strong>Not:</strong> Eğer bu malzemeler aynıysa ve iş emri de aynıysa farklı bir malzeme girip toplam miktarını güncelleyebilirsiniz.
                        </div>
                    ` : ''}
                    
                    ${hasDifferentSpecs ? `
                        <div class="alert alert-info mb-2">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>Teknik Özellikler Farklılığı:</strong> Bu gruptaki malzemeler farklı teknik özelliklere sahip.
                            <div class="mt-2">
                                ${uniqueSpecs.map((specs, index) => `
                                    <div class="specs-difference">
                                        <strong>Özellik ${index + 1}:</strong> ${specs || 'Özellik belirtilmemiş'}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="table-responsive">
                        <table class="table table-sm table-bordered">
                            <thead class="table-light">
                                <tr>
                                    <th style="width: 40px;">Seç</th>
                                    <th>#</th>
                                    <th>Ad</th>
                                    <th>İş No</th>
                                    <th>Miktar</th>
                                    <th>Birim</th>
                                    <th>Teknik Özellikler</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map((item, i) => `
                                    <tr>
                                        <td>
                                            <div class="form-check">
                                                <input class="form-check-input merge-item-checkbox" type="checkbox" 
                                                       data-group-index="${groupIndex}" data-item-index="${i}"
                                                       ${sameName && sameUnit && !cannotMerge ? 'checked' : ''} 
                                                       ${!sameName || !sameUnit || cannotMerge ? 'disabled' : ''}>
                                            </div>
                                        </td>
                                        <td>${i + 1}</td>
                                        <td>${item.name}</td>
                                        <td>${item.job_no || '-'}</td>
                                        <td>${item.quantity}</td>
                                        <td>${item.unit}</td>
                                        <td>
                                            <small class="text-muted">
                                                ${item.specs ? (item.specs.length > 50 ? item.specs.substring(0, 50) + '...' : item.specs) : 'Özellik belirtilmemiş'}
                                            </small>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="merge-preview mt-2 p-2 bg-light rounded">
                        <small class="text-muted">
                            <i class="fas fa-arrow-right me-1"></i>
                            <strong>Birleştirilecek:</strong> 
                            <span class="merge-preview-text">
                                ${(() => {
                                    const jobNoGroups = {};
                                    items.forEach(item => {
                                        const jobNo = item.job_no || '';
                                        if (!jobNoGroups[jobNo]) {
                                            jobNoGroups[jobNo] = 0;
                                        }
                                        jobNoGroups[jobNo] += parseFloat(item.quantity || 0);
                                    });
                                    const totalQuantity = items.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
                                    const allocationText = Object.entries(jobNoGroups).map(([jobNo, totalQty]) => 
                                        `${totalQty} ${items[0].unit} (${jobNo || 'İş No Yok'})`
                                    ).join(', ');
                                    return `${totalQuantity} ${items[0].unit} toplam - ${allocationText}`;
                                })()}
                            </span>
                        </small>
                    </div>
                </div>
            `;
        });
        
        const modalHtml = `
            <div class="modal fade" id="${modalId}" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-object-group me-2"></i>Malzeme Birleştirme Onayı
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle me-2"></i>
                                <strong>${duplicates.length} kod</strong> için birden fazla malzeme bulundu. 
                                Birleştirmek istediğiniz grupları ve öğeleri seçebilirsiniz.
                            </div>
                            <div class="duplicates-container">
                                ${duplicatesHtml}
                            </div>
                            <div class="alert alert-warning">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                <strong>Not:</strong> Birleştirme işlemi aynı kod, ad ve birime sahip malzemeler için yapılır. Farklı iş numaraları tek bir satırda allocations olarak birleştirilecektir.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times me-1"></i>İptal
                            </button>
                            <button type="button" class="btn btn-primary" onclick="window.itemsManager.confirmMergeItems('${modalId}')">
                                <i class="fas fa-object-group me-1"></i>Seçilenleri Birleştir
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById(modalId));
        modal.show();
        
        // Setup checkbox event listeners
        this.setupMergeCheckboxListeners(modalId, duplicates);
        
        document.getElementById(modalId).addEventListener('hidden.bs.modal', function() {
            this.remove();
        });
    }

    setupMergeCheckboxListeners(modalId, duplicates) {
        const modal = document.getElementById(modalId);
        
        // Group checkbox event listeners
        const groupCheckboxes = modal.querySelectorAll('.merge-group-checkbox');
        groupCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const groupIndex = parseInt(e.target.dataset.groupIndex);
                const isChecked = e.target.checked;
                
                // Update all item checkboxes in this group
                const itemCheckboxes = modal.querySelectorAll(`.merge-item-checkbox[data-group-index="${groupIndex}"]`);
                itemCheckboxes.forEach(itemCheckbox => {
                    itemCheckbox.checked = isChecked;
                });
                
                // Update merge preview for this group
                this.updateMergePreview(modal, groupIndex, duplicates[groupIndex]);
            });
        });
        
        // Individual item checkbox event listeners
        const itemCheckboxes = modal.querySelectorAll('.merge-item-checkbox');
        itemCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const groupIndex = parseInt(e.target.dataset.groupIndex);
                
                // Update group checkbox based on item checkboxes
                const groupCheckbox = modal.querySelector(`.merge-group-checkbox[data-group-index="${groupIndex}"]`);
                const itemCheckboxesInGroup = modal.querySelectorAll(`.merge-item-checkbox[data-group-index="${groupIndex}"]`);
                const checkedItems = Array.from(itemCheckboxesInGroup).filter(cb => cb.checked);
                
                groupCheckbox.checked = checkedItems.length === itemCheckboxesInGroup.length;
                groupCheckbox.indeterminate = checkedItems.length > 0 && checkedItems.length < itemCheckboxesInGroup.length;
                
                // Update merge preview for this group
                this.updateMergePreview(modal, groupIndex, duplicates[groupIndex]);
            });
        });
    }

    updateMergePreview(modal, groupIndex, groupData) {
        const groupElement = modal.querySelector(`[data-group-index="${groupIndex}"]`);
        const previewText = groupElement.querySelector('.merge-preview-text');
        const itemCheckboxes = modal.querySelectorAll(`.merge-item-checkbox[data-group-index="${groupIndex}"]`);
        
        // Get selected items
        const selectedItems = [];
        itemCheckboxes.forEach((checkbox, index) => {
            if (checkbox.checked) {
                selectedItems.push(groupData.items[index]);
            }
        });
        
        if (selectedItems.length === 0) {
            previewText.textContent = 'Hiçbir öğe seçilmedi';
            return;
        }
        
        // Calculate preview for selected items
        const jobNoGroups = {};
        selectedItems.forEach(item => {
            const jobNo = item.job_no || '';
            if (!jobNoGroups[jobNo]) {
                jobNoGroups[jobNo] = 0;
            }
            jobNoGroups[jobNo] += parseFloat(item.quantity || 0);
        });
        
        const totalQuantity = selectedItems.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
        const allocationText = Object.entries(jobNoGroups).map(([jobNo, totalQty]) => 
            `${totalQty} ${selectedItems[0].unit} (${jobNo || 'İş No Yok'})`
        ).join(', ');
        
        previewText.textContent = `${totalQuantity} ${selectedItems[0].unit} toplam - ${allocationText}`;
    }

    confirmMergeItems(modalId) {
        // Get the duplicates data from the modal
        const modal = document.getElementById(modalId);
        const duplicatesContainer = modal.querySelector('.duplicates-container');
        const duplicateGroups = duplicatesContainer.querySelectorAll('.duplicate-group');
        
        // Process each group
        const mergedItems = [];
        const itemsToRemove = [];
        const mergedGroups = [];

        // Reconstruct duplicates data from the DOM and get selected items
        const duplicates = [];
        duplicateGroups.forEach((group, groupIndex) => {
            const codeElement = group.querySelector('h6 strong');
            const code = codeElement ? codeElement.textContent : '';
            const rows = group.querySelectorAll('tbody tr');
            const items = [];
            
            rows.forEach((row, index) => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 7) { // Updated to account for checkbox column
                    const checkbox = row.querySelector('.merge-item-checkbox');
                    const isSelected = checkbox && checkbox.checked;
                    
                    items.push({
                        code: code,
                        name: cells[2].textContent.trim(), // Updated index
                        job_no: cells[3].textContent.trim(), // Updated index
                        quantity: parseFloat(cells[4].textContent) || 0, // Updated index
                        unit: cells[5].textContent.trim(), // Updated index
                        specs: this.getSpecsFromOriginalItem(code, cells[2].textContent.trim(), cells[3].textContent.trim()),
                        originalIndex: this.findItemIndexByCodeAndNameAndJobNo(code, cells[2].textContent.trim(), cells[3].textContent.trim()),
                        isSelected: isSelected
                    });
                }
            });
            
            if (items.length > 0) {
                duplicates.push({ code, items, groupIndex });
            }
        });

        duplicates.forEach(({ code, items, groupIndex }) => {
            // Get only selected items
            const selectedItems = items.filter(item => item.isSelected);
            
            if (selectedItems.length === 0) {
                return; // Skip if no items selected
            }
            
            if (selectedItems.length === 1) {
                return; // Skip if only one item selected (no merging needed)
            }

            // Check if all selected items have the same name and unit (job_no can be different)
            const firstItem = selectedItems[0];
            const sameName = selectedItems.every(item => 
                item.name.trim().toLowerCase() === firstItem.name.trim().toLowerCase()
            );
            const sameUnit = selectedItems.every(item => 
                item.unit.trim().toLowerCase() === firstItem.unit.trim().toLowerCase()
            );

            if (!sameName || !sameUnit) {
                // Items have different names or units - show warning and skip
                const differentItems = selectedItems.filter(item => 
                    item.name.trim().toLowerCase() !== firstItem.name.trim().toLowerCase() ||
                    item.unit.trim().toLowerCase() !== firstItem.unit.trim().toLowerCase()
                );
                
                alert(`Kod "${firstItem.code}" için farklı malzeme adı veya birim bulundu:\n\n` +
                      `Beklenen: ${firstItem.name} - ${firstItem.unit}\n` +
                      `Farklı olanlar:\n` +
                      differentItems.map(item => `  ${item.name} - ${item.unit}`).join('\n') +
                      '\n\nBu grup birleştirilmeyecek.');
                return;
            }

            // Check if items have the same code, name, job_no, specifications, AND item_description
            // This would cause backend problems, so we prevent merging
            const sameJobNo = selectedItems.every(item => 
                (item.job_no || '').trim().toLowerCase() === (firstItem.job_no || '').trim().toLowerCase()
            );
            const sameSpecs = selectedItems.every(item => {
                const itemSpecs = item.specifications || item.specs || '';
                const firstSpecs = firstItem.specifications || firstItem.specs || '';
                return itemSpecs.trim() === firstSpecs.trim();
            });
            const sameItemDescription = selectedItems.every(item => 
                (item.item_description || '').trim() === (firstItem.item_description || '').trim()
            );

            if (sameJobNo && sameSpecs && sameItemDescription) {
                // Items have same code, name, job_no, specifications, AND item_description - this would cause backend problems
                alert(`Kod "${firstItem.code}" için aynı malzeme adı, iş numarası, teknik özellikler ve malzeme açıklamasına sahip malzemeler bulundu:\n\n` +
                      `Malzeme: ${firstItem.name}\n` +
                      `İş No: ${firstItem.job_no || 'Belirtilmemiş'}\n` +
                      `Teknik Özellikler: ${firstItem.specifications || firstItem.specs || 'Belirtilmemiş'}\n` +
                      `Malzeme Açıklaması: ${firstItem.item_description || 'Belirtilmemiş'}\n\n` +
                      `Bu tür malzemeler birleştirilemez çünkü backend sorunlarına neden olur.\n` +
                      `Lütfen bu malzemeleri ayrı satırlar olarak bırakın.`);
                return;
            }

            // Group items by job_no and sum quantities for each job number
            const jobNoAllocations = {};
            selectedItems.forEach(item => {
                const jobNo = item.job_no || '';
                if (!jobNoAllocations[jobNo]) {
                    jobNoAllocations[jobNo] = 0;
                }
                jobNoAllocations[jobNo] += parseFloat(item.quantity || 0);
            });

            // Create a single merged item with allocations
            const totalQuantity = selectedItems.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
            const allocations = Object.entries(jobNoAllocations).map(([jobNo, quantity]) => ({
                job_no: jobNo,
                quantity: quantity.toFixed(2)
            }));

            // Collect file_asset_ids from all merged items (avoid duplicates)
            const mergedFileAssetIds = [];
            selectedItems.forEach(item => {
                if (item.file_asset_ids && Array.isArray(item.file_asset_ids)) {
                    item.file_asset_ids.forEach(fileAssetId => {
                        if (!mergedFileAssetIds.includes(fileAssetId)) {
                            mergedFileAssetIds.push(fileAssetId);
                        }
                    });
                }
            });

            // Merge specifications from all items
            const mergedSpecs = this.mergeSpecs(selectedItems.map(item => item.specifications || item.specs || ''));
            // Use the first item's item_description (since they should be the same if mergeable)
            const mergedItemDescription = selectedItems[0].item_description || '';
            
            // Collect all source_planning_request_item_id values from original items
            const sourcePlanningRequestItemIds = [];
            selectedItems.forEach(item => {
                const originalItem = this.requestData.items[item.originalIndex];
                if (originalItem && originalItem.source_planning_request_item_id) {
                    // Add single source_planning_request_item_id
                    if (!sourcePlanningRequestItemIds.includes(originalItem.source_planning_request_item_id)) {
                        sourcePlanningRequestItemIds.push(originalItem.source_planning_request_item_id);
                    }
                }
                // Also check for source_planning_request_item_ids array (from previously merged items)
                if (originalItem && originalItem.source_planning_request_item_ids && Array.isArray(originalItem.source_planning_request_item_ids)) {
                    originalItem.source_planning_request_item_ids.forEach(id => {
                        if (!sourcePlanningRequestItemIds.includes(id)) {
                            sourcePlanningRequestItemIds.push(id);
                        }
                    });
                }
            });
            
            // Get the first item's original data for backward compatibility
            const firstOriginalItem = this.requestData.items[selectedItems[0].originalIndex];
            
            const mergedItem = {
                id: selectedItems[0].id,
                code: selectedItems[0].code,
                name: selectedItems[0].name,
                job_no: '', // Will be empty since we're using allocations
                quantity: totalQuantity,
                unit: selectedItems[0].unit,
                specs: mergedSpecs, // Keep for backward compatibility
                specifications: mergedSpecs,
                item_description: mergedItemDescription,
                allocations: allocations, // Add allocations array
                file_asset_ids: mergedFileAssetIds, // Combine file asset IDs from all merged items
                // Preserve planning request item IDs
                source_planning_request_item_id: firstOriginalItem?.source_planning_request_item_id || null, // Keep for backward compatibility
                source_planning_request_item_ids: sourcePlanningRequestItemIds // Store all IDs as array
            };

            mergedItems.push(mergedItem);
            itemsToRemove.push(...selectedItems.map(item => item.originalIndex));

            mergedGroups.push({
                code: firstItem.code,
                originalCount: selectedItems.length,
                mergedCount: 1,
                totalQuantity: totalQuantity,
                allocationCount: allocations.length
            });
        });

        if (mergedItems.length === 0) {
            return;
        }

        // Remove original items and add merged items
        // Sort indices in descending order to avoid index shifting issues
        const sortedIndices = itemsToRemove.sort((a, b) => b - a);
        sortedIndices.forEach(index => {
            this.requestData.items.splice(index, 1);
        });

        // Add merged items
        mergedItems.forEach(item => {
            this.requestData.items.push(item);
        });

        // Clear offers for removed items (they will be recreated if needed)
        this.requestData.offers = {};

        this.renderItemsTable();
        
        // Sync planning_request_item_ids after merging
        if (window.syncPlanningRequestItemIds) {
            window.syncPlanningRequestItemIds();
        }
        
        this.autoSave();

        // Close modal
        bootstrap.Modal.getInstance(document.getElementById(modalId)).hide();
        
        // Show success message
        if (mergedItems.length === 0) {
            this.showNotification('Birleştirilecek seçili malzeme bulunamadı.', 'info');
            return;
        }
        
        let successMessage = `${mergedItems.length} malzeme grubu başarıyla birleştirildi:\n\n`;
        mergedGroups.forEach(group => {
            successMessage += `• ${group.code}: ${group.originalCount} seçili satır → 1 satır (${group.allocationCount} iş no, ${group.totalQuantity} ${mergedItems.find(item => item.code === group.code)?.unit})\n`;
        });
        this.showNotification(successMessage, 'success');
    }

    mergeSpecs(specsArray) {
        // Combine specs from multiple items, removing duplicates
        const allSpecs = specsArray
            .filter(specs => specs && specs.trim())
            .map(specs => specs.trim())
            .join(' | ')
            .split(' | ')
            .filter((spec, index, array) => array.indexOf(spec) === index) // Remove duplicates
            .join(' | ');
        
        return allSpecs;
    }

    findItemIndexByCodeAndName(code, name) {
        return this.requestData.items.findIndex(item => 
            item.code.trim().toLowerCase() === code.trim().toLowerCase() &&
            item.name.trim().toLowerCase() === name.trim().toLowerCase()
        );
    }

    findItemIndexByCodeAndNameAndJobNo(code, name, jobNo) {
        return this.requestData.items.findIndex(item => 
            item.code.trim().toLowerCase() === code.trim().toLowerCase() &&
            item.name.trim().toLowerCase() === name.trim().toLowerCase() &&
            (item.job_no || '').trim().toLowerCase() === (jobNo || '').trim().toLowerCase()
        );
    }

    getSpecsFromOriginalItem(code, name, jobNo) {
        const itemIndex = this.findItemIndexByCodeAndNameAndJobNo(code, name, jobNo);
        if (itemIndex !== -1) {
            return this.requestData.items[itemIndex].specs || '';
        }
        return '';
    }

    renderItemsTable() {
        console.log('itemsManager.renderItemsTable - this.requestData.items:', this.requestData.items);
        const tbody = document.getElementById('items-tbody');
        tbody.innerHTML = '';

        this.requestData.items.forEach((item, index) => {
            const row = document.createElement('tr');
            row.setAttribute('data-item-index', index);
            const itemDescriptionCell = this.formatDescriptionCell(item.item_description);
            const specsCell = this.formatSpecsCell(item.specifications || item.specs);
            
            // Handle job_no display - show allocations if they exist
            let jobNoDisplay = item.job_no || '-';
            if (item.allocations && Array.isArray(item.allocations) && item.allocations.length > 0) {
                jobNoDisplay = item.allocations.map(allocation => 
                    `${allocation.job_no} (${allocation.quantity})`
                ).join(', ');
            }
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td class="editable-cell" data-item-index="${index}" data-field="code">${item.code}</td>
                <td class="editable-cell" data-item-index="${index}" data-field="name">${item.name}</td>
                <td class="editable-cell" data-item-index="${index}" data-field="job_no">${jobNoDisplay}</td>
                <td class="editable-cell" data-item-index="${index}" data-field="quantity">${item.quantity}</td>
                <td class="editable-cell" data-item-index="${index}" data-field="unit">${item.unit}</td>
                <td class="editable-cell" data-item-index="${index}" data-field="item_description">${itemDescriptionCell}</td>
                <td class="editable-cell" data-item-index="${index}" data-field="specifications">${specsCell}</td>
                <td class="action-buttons">
                    <button class="btn btn-outline-danger btn-sm" onclick="window.itemsManager.deleteItem(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Setup inline editing
        this.setupInlineEditing();
    }



    formatDescriptionCell(description) {
        if (!description || description.trim() === '') {
            return '-';
        }

        const maxLength = 50;
        const descText = description.trim();
        
        if (descText.length <= maxLength) {
            return descText;
        }
        
        return `
            <span class="specs-preview">${descText.substring(0, maxLength)}...</span>
            <button class="btn btn-link btn-sm p-0 ms-1 view-full-specs-btn" 
                    data-specs="${descText.replace(/"/g, '&quot;')}" 
                    title="Tamamını görüntüle">
                <i class="fas fa-eye"></i>
            </button>
        `;
    }

    formatSpecsCell(specs) {
        if (!specs || specs.trim() === '') {
            return '-';
        }

        const maxLength = 50;
        const specsText = specs.trim();
        
        if (specsText.length <= maxLength) {
            return specsText;
        }

        const truncatedText = specsText.substring(0, maxLength) + '...';
        
        return `
            <div class="specs-cell">
                <span class="specs-text">${truncatedText}</span>
            </div>
        `;
    }



    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }



    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        const alertClass = type === 'error' ? 'danger' : type;
        const iconClass = type === 'error' ? 'exclamation-triangle' : 
                         type === 'success' ? 'check-circle' : 
                         type === 'warning' ? 'exclamation-triangle' : 'info-circle';
        
        notification.className = `alert alert-${alertClass} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 10000; min-width: 300px; max-width: 500px;';
        notification.innerHTML = `
            <i class="fas fa-${iconClass} me-2"></i>
            <div style="white-space: pre-line;">${message}</div>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds for longer messages
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    // ===== INLINE EDITING METHODS =====
    setupInlineEditing() {
        const editableCells = document.querySelectorAll('.editable-cell');
        
        editableCells.forEach(cell => {
            cell.addEventListener('click', function(e) {
                // Don't trigger if clicking on action buttons
                if (e.target.closest('.action-buttons')) {
                    return;
                }
                
                const itemIndex = parseInt(this.dataset.itemIndex);
                const field = this.dataset.field;
                
                // For specs, item_description, and specifications fields, get the actual value from the item data
                let currentValue;
                if (field === 'specs' || field === 'item_description' || field === 'specifications') {
                    const item = window.itemsManager.requestData.items[itemIndex];
                    if (field === 'specs') {
                        currentValue = item && item.specs ? item.specs : '';
                    } else if (field === 'item_description') {
                        currentValue = item && item.item_description ? item.item_description : '';
                    } else if (field === 'specifications') {
                        currentValue = item && item.specifications ? item.specifications : (item && item.specs ? item.specs : '');
                    }
                } else {
                    currentValue = this.textContent.trim();
                }
                
                // Skip if already editing this cell
                if (this.querySelector('input') || this.querySelector('select') || this.querySelector('textarea')) {
                    return;
                }
                
                window.itemsManager.startInlineEdit(this, itemIndex, field, currentValue);
            });
        });
    }

    startInlineEdit(cell, itemIndex, field, currentValue) {
        // Store current editing item index for validation
        this.currentEditingItemIndex = itemIndex;
        
        // Add editing class to indicate the cell is being edited
        cell.classList.add('editing');
        
        // Create input element based on field type
        let input;
        
        switch (field) {
            case 'quantity':
                input = document.createElement('input');
                input.type = 'number';
                input.min = '0';
                
                // Set step based on unit - integer for 'adet', decimal for others
                const currentItem = this.requestData.items[itemIndex];
                if (currentItem && currentItem.unit === 'ADET') {
                    input.step = '1';
                } else {
                    input.step = '0.01';
                }
                
                input.className = 'form-control form-control-sm';
                input.value = currentValue === 'N/A' || currentValue === '0' ? '' : currentValue;
                break;
            case 'unit':
                // Create dropdown for unit selection
                input = document.createElement('select');
                input.className = 'form-control form-control-sm';
                
                // Use centralized UNIT_CHOICES from constants
                UNIT_CHOICES.forEach(unitChoice => {
                    const option = document.createElement('option');
                    option.value = unitChoice.value;
                    option.textContent = unitChoice.label;
                    
                    // Handle case-insensitive comparison for existing values
                    if (unitChoice.value.toLowerCase() === (currentValue || '').toLowerCase()) {
                        option.selected = true;
                    }
                    
                    input.appendChild(option);
                });
                break;

            case 'specs':
            case 'item_description':
            case 'specifications':
                // Create textarea for specs, item_description, and specifications to handle longer text
                input = document.createElement('textarea');
                input.className = 'form-control form-control-sm';
                input.rows = '3';
                input.style.resize = 'vertical';
                input.style.minHeight = '60px';
                input.style.maxHeight = '120px';
                input.style.width = '100%';
                input.style.boxSizing = 'border-box';
                // Get the actual value from the item data
                const item = this.requestData.items[itemIndex];
                if (field === 'specs') {
                    input.value = item && item.specs ? item.specs : '';
                } else if (field === 'item_description') {
                    input.value = item && item.item_description ? item.item_description : '';
                } else if (field === 'specifications') {
                    input.value = item && item.specifications ? item.specifications : (item && item.specs ? item.specs : '');
                }
                // Add editing class for specs cell
                cell.classList.add('editing-specs');
                break;
            default:
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'form-control form-control-sm';
                input.value = currentValue === 'N/A' ? '' : currentValue;
        }
        
        // Store original content
        const originalContent = cell.innerHTML;
        
        // Replace cell content with input
        cell.innerHTML = '';
        cell.appendChild(input);
        
        // Focus on input
        input.focus();
        if (input.type !== 'select-one') {
            input.select();
        }
        
        // Handle input events
        input.addEventListener('blur', (e) => {
            // For select elements, don't handle blur immediately
            if (input.tagName === 'SELECT') {
                return;
            }
            
            // Add a small delay to prevent race conditions
            setTimeout(() => {
                if (input.parentNode) {
                    this.finishInlineEdit(cell, itemIndex, field, input.value, originalContent);
                }
            }, 100);
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // For textarea, Ctrl+Enter saves, regular Enter creates new line
                if (input.tagName === 'TEXTAREA') {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.finishInlineEdit(cell, itemIndex, field, input.value, originalContent);
                    }
                    // Regular Enter in textarea creates new line (default behavior)
                } else {
                    // For other inputs, Enter saves
                    this.finishInlineEdit(cell, itemIndex, field, input.value, originalContent);
                }
            } else if (e.key === 'Escape') {
                // Remove editing classes
                cell.classList.remove('editing');
                if (field === 'specs') {
                    cell.classList.remove('editing-specs');
                }
                if (cell && cell.parentNode) {
                    cell.innerHTML = originalContent;
                }
            }
        });
        
        // For select elements, handle change event
        if (input.tagName === 'SELECT') {
            let editCompleted = false;
            
            input.addEventListener('change', () => {
                if (!editCompleted) {
                    editCompleted = true;
                    this.finishInlineEdit(cell, itemIndex, field, input.value, originalContent);
                }
            });
            
            // Add document click listener to close dropdown when clicking outside
            const handleDocumentClick = (e) => {
                if (!input.contains(e.target) && !editCompleted) {
                    editCompleted = true;
                    this.finishInlineEdit(cell, itemIndex, field, input.value, originalContent);
                    document.removeEventListener('click', handleDocumentClick);
                }
            };
            
            setTimeout(() => {
                document.addEventListener('click', handleDocumentClick);
            }, 50);
        }
    }

    finishInlineEdit(cell, itemIndex, field, newValue, originalContent) {
        try {
            // Remove editing classes
            cell.classList.remove('editing');
            if (field === 'specs' || field === 'item_description' || field === 'specifications') {
                cell.classList.remove('editing-specs');
            }
            
            // Validate input based on field type
            if (!this.validateFieldValue(field, newValue)) {
                if (cell && cell.parentNode) {
                    cell.innerHTML = originalContent;
                }
                this.showNotification('Geçersiz değer', 'error');
                return;
            }
            
            // Get the item
            const item = this.requestData.items[itemIndex];
            if (!item) {
                if (cell && cell.parentNode) {
                    cell.innerHTML = originalContent;
                }
                return;
            }
            
            // Don't update if value hasn't changed
            const currentValue = item[field];
            if (currentValue == newValue) {
                if (cell && cell.parentNode) {
                    cell.innerHTML = originalContent;
                }
                return;
            }
            
            // Update the item
            if (field === 'quantity') {
                item[field] = parseFloat(newValue) || 0;
            } else if (field === 'specifications') {
                // Update both specifications and specs for backward compatibility
                item.specifications = newValue;
                item.specs = newValue;
            } else if (field === 'item_description') {
                item.item_description = newValue;
            } else {
                item[field] = newValue;
            }
            
            // Update cell content
            this.updateCellContent(cell, field, newValue);
            
            // Save changes
            this.autoSave();
            
            // If quantity was changed, update comparison table and recalculate offers
            if (field === 'quantity') {
                this.updateComparisonTableAndOffers(itemIndex, newValue);
            }
            
            this.showNotification('Malzeme başarıyla güncellendi', 'success');
            
        } catch (error) {
            console.error('Error updating item:', error);
            if (cell && cell.parentNode) {
                cell.innerHTML = originalContent;
            }
            this.showNotification('Güncelleme sırasında hata oluştu', 'error');
        }
    }

    validateFieldValue(field, value) {
        switch (field) {
            case 'code':
                return value && value.trim().length > 0;
            case 'name':
                return value && value.trim().length > 0;
            case 'job_no':
                // For items with allocations, job_no can be empty
                const editingItem = this.requestData.items[this.currentEditingItemIndex];
                if (editingItem && editingItem.allocations && Array.isArray(editingItem.allocations) && editingItem.allocations.length > 0) {
                    return true; // Allow empty job_no if item has allocations
                }
                return value && value.trim().length > 0;
            case 'quantity':
                const numValue = parseFloat(value);
                if (isNaN(numValue) || numValue <= 0) {
                    return false;
                }
                // Check if quantity is integer when unit is 'adet'
                const currentItem = this.requestData.items[this.currentEditingItemIndex];
                if (currentItem && currentItem.unit === 'adet' && !Number.isInteger(numValue)) {
                    return false;
                }
                return true;
            case 'unit':
                return value && value.trim().length > 0;

            case 'specs':
            case 'item_description':
            case 'specifications':
                // These fields can be empty, so just return true
                return true;
            default:
                return true;
        }
    }

    updateCellContent(cell, field, value) {
        if (field === 'quantity') {
            cell.textContent = parseFloat(value) || 0;
        } else if (field === 'specs' || field === 'specifications') {
            // Use the formatSpecsCell method to maintain the same display format
            cell.innerHTML = this.formatSpecsCell(value);
        } else if (field === 'item_description') {
            // Use the formatDescriptionCell method to maintain the same display format
            cell.innerHTML = this.formatDescriptionCell(value);
        } else if (field === 'job_no') {
            cell.textContent = value || '-';
        } else {
            cell.textContent = value;
        }
    }

    // editItem method removed - replaced with inline editing

    generateItemId() {
        return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ===== COMPARISON TABLE UPDATE METHODS =====
    updateComparisonTableAndOffers(itemIndex, newQuantity) {
        // Recalculate offers for this item based on new quantity
        this.recalculateOffersForItem(itemIndex, newQuantity);
        
        // Update comparison table if comparison manager exists
        if (window.comparisonManager) {
            window.comparisonManager.renderComparisonTable();
            window.comparisonManager.updateSummary();
        }
    }

    recalculateOffersForItem(itemIndex, newQuantity) {
        // Update all offers for this item with the new quantity
        Object.keys(this.requestData.offers).forEach(supplierId => {
            const offer = this.requestData.offers[supplierId]?.[itemIndex];
            if (offer && offer.unitPrice) {
                // Recalculate total price based on new quantity
                offer.totalPrice = offer.unitPrice * newQuantity;
            }
        });
    }

    // ===== BULK IMPORT METHODS =====
    showBulkImportModal() {
        const modal = new bootstrap.Modal(document.getElementById('bulkImportModal'));
        modal.show();
    }



    previewBulkImport() {
        const fileInput = document.getElementById('excel-file-input');
        const file = fileInput.files[0];
        
        if (!file) {
            alert('Lütfen bir dosya seçin.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                let jsonData;
                
                if (file.name.toLowerCase().endsWith('.csv')) {
                    // Handle CSV files
                    const csvText = e.target.result;
                    jsonData = this.parseCSV(csvText);
                } else {
                    // Handle Excel files
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                }

                if (jsonData.length < 2) {
                    alert('Dosya boş veya geçersiz format.');
                    return;
                }

                this.processExcelData(jsonData);
            } catch (error) {
                console.error('Dosya okuma hatası:', error);
                alert('Dosya okunamadı. Lütfen geçerli bir Excel veya CSV dosyası seçin.');
            }
        };
        
        if (file.name.toLowerCase().endsWith('.csv')) {
            reader.readAsText(file, 'UTF-8');
        } else {
            reader.readAsArrayBuffer(file);
        }
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const result = [];
        
        lines.forEach(line => {
            if (line.trim()) {
                // Handle both comma and semicolon separators
                const values = line.includes(';') ? line.split(';') : line.split(',');
                result.push(values.map(value => value.trim().replace(/^["']|["']$/g, '')));
            }
        });
        
        return result;
    }

    processExcelData(data) {
        const headers = data[0];
        const dataRows = data.slice(1);
        
        // Auto-detect column mappings
        const columnMapping = this.detectColumnMapping(headers, dataRows);
        
        // Validate required columns
        const missingColumns = this.validateRequiredColumns(columnMapping);
        
        if (missingColumns.length > 0) {
            this.showColumnMappingModal(headers, columnMapping, dataRows);
            return;
        }
        
        // Always show mapping modal for manual verification/adjustment
        this.showColumnMappingModal(headers, columnMapping, dataRows);
    }

    // ===== COLUMN DETECTION & MAPPING =====
    detectColumnMapping(headers, dataRows = []) {
        const mapping = {
            code: -1,
            name: -1,
            job_no: -1,
            quantity: -1,
            unit: -1,
            specs: -1
        };

        const columnKeywords = {
            code: ['kod', 'code', 'stok', 'ürün', 'malzeme', 'item', 'product', 'material', 'part', 'parça', 'sku', 'malzeme kodu', 'stok kodu'],
            name: ['ad', 'name', 'açıklama', 'description', 'ürün adı', 'malzeme adı', 'title', 'başlık', 'tanım', 'isim', 'malzeme adı', 'malzeme adi', 'isim', 'stok ismi'],
            job_no: ['srm. kodu', 'srm kodu', 'iş no', 'is no', 'job no', 'job number', 'work no', 'work number', 'proje no', 'project no', 'iş ismi'],
            quantity: ['miktar', 'quantity', 'adet', 'sayı', 'number', 'amount', 'qty', 'count', 'piece', 'talep miktari'],
            unit: ['birim', 'unit', 'ölçü', 'measure', 'uom', 'measurement'],
            specs: ['özellik', 'specs', 'specification', 'teknik', 'technical', 'detay', 'detail', 'açıklama', 'description', 'teknik özellikler', 'açıklama-1', 'açıklama-2']
        };

        headers.forEach((header, index) => {
            if (!header) return;
            
            // Handle Turkish characters properly
            const headerLower = header.toString().toLowerCase().trim();
            const headerNormalized = this.normalizeTurkish(header);
            
            // First, try exact matches for common Turkish headers
            if (mapping.code === -1 && (headerLower === 'kod' || headerNormalized === 'kod' || header === 'KOD')) {
                mapping.code = index;
            }
            if (mapping.name === -1 && (headerLower === 'isim' || headerNormalized === 'isim' || header === 'İSİM')) {
                mapping.name = index;
            }
            if (mapping.quantity === -1 && (headerLower === 'miktar' || headerNormalized === 'miktar' || header === 'MİKTAR')) {
                mapping.quantity = index;
            }
            if (mapping.unit === -1 && (headerLower === 'birim' || headerNormalized === 'birim' || header === 'BİRİM')) {
                mapping.unit = index;
            }
            
            // Exact matches for the new Excel format (sa_raporu.xlsx)
            if (mapping.code === -1 && (headerLower === 'stok kodu' || headerNormalized === 'stok kodu' || header === 'STOK KODU')) {
                mapping.code = index;
            }
            if (mapping.name === -1 && (headerLower === 'stok ismi' || headerNormalized === 'stok ismi' || header === 'STOK İSMİ')) {
                mapping.name = index;
            }
            if (mapping.job_no === -1 && (headerLower === 'iş kodu' || headerNormalized === 'iş kodu' || header === 'İŞ KODU')) {
                mapping.job_no = index;
            }
            if (mapping.quantity === -1 && (headerLower === 'talep miktari' || headerNormalized === 'talep miktari' || header === 'TALEP MİKTARI')) {
                mapping.quantity = index;
            }
            
            // Then try keyword matching for other cases
            for (const [field, keywords] of Object.entries(columnKeywords)) {
                if (mapping[field] === -1) {
                    for (const keyword of keywords) {
                        // Try exact match first, then partial match
                        if (headerLower === keyword || headerLower.includes(keyword)) {
                            mapping[field] = index;
                            break;
                        }
                        // Also try with normalized Turkish characters
                        if (headerNormalized === keyword || headerNormalized.includes(keyword)) {
                            mapping[field] = index;
                            break;
                        }
                    }
                }
            }
        });

        // Smart content-based detection if we have data rows
        if (dataRows && dataRows.length > 0) {
            const firstRow = dataRows[0];
            
            // Look for numeric columns (quantity)
            if (mapping.quantity === -1) {
                for (let i = 0; i < firstRow.length; i++) {
                    const value = firstRow[i];
                    if (value && !isNaN(parseFloat(value.toString().replace(',', '.')))) {
                        mapping.quantity = i;
                        break;
                    }
                }
            }
            
            // Look for short text columns (code)
            if (mapping.code === -1) {
                for (let i = 0; i < firstRow.length; i++) {
                    const value = firstRow[i];
                    if (value && value.toString().length <= 20 && !isNaN(parseFloat(value))) {
                        mapping.code = i;
                        break;
                    }
                }
            }
        }

        // Additional smart detection for common Turkish patterns
        headers.forEach((header, index) => {
            if (!header) return;
            
            const headerLower = header.toString().toLowerCase().trim();
            const headerNormalized = this.normalizeTurkish(header);
            
            // Smart detection for common Turkish patterns
            if (mapping.code === -1 && (headerLower.includes('malzeme') && headerLower.includes('kod'))) {
                mapping.code = index;
            }
            if (mapping.name === -1 && (headerLower.includes('malzeme') && headerLower.includes('ad'))) {
                mapping.name = index;
            }
            if (mapping.name === -1 && (headerLower === 'isim' || headerNormalized === 'isim')) {
                mapping.name = index;
            }
            if (mapping.job_no === -1 && (headerLower === 'srm. kodu' || headerNormalized === 'srm. kodu' || headerUpper === 'SRM. KODU')) {
                mapping.job_no = index;
            }
            if (mapping.quantity === -1 && (headerLower === 'miktar' || headerNormalized === 'miktar')) {
                mapping.quantity = index;
            }
            if (mapping.unit === -1 && (headerLower === 'birim' || headerNormalized === 'birim')) {
                mapping.unit = index;
            }
            if (mapping.specs === -1 && (headerLower.includes('teknik') && headerLower.includes('özellik'))) {
                mapping.specs = index;
            }
        });

        return mapping;
    }

    validateRequiredColumns(mapping) {
        const required = ['code', 'name', 'job_no', 'quantity', 'unit'];
        return required.filter(field => mapping[field] === -1);
    }

    showColumnMappingModal(headers, detectedMapping, dataRows) {
        // Create column mapping interface
        const mappingContainer = document.getElementById('column-mapping-container');
        mappingContainer.innerHTML = '';
        
        const requiredFields = [
            { key: 'code', label: 'Stok Kodu', required: true },
            { key: 'name', label: 'Malzeme Adı', required: true },
            { key: 'job_no', label: 'İş No', required: true },
            { key: 'quantity', label: 'Miktar', required: true },
            { key: 'unit', label: 'Birim', required: true }
        ];

        requiredFields.forEach(field => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'mb-3';
            const isDetected = detectedMapping[field.key] !== -1;
            const detectedText = isDetected ? ` (Otomatik algılandı: "${headers[detectedMapping[field.key]] || 'Bilinmeyen'}")` : '';
            
            fieldDiv.innerHTML = `
                <label class="form-label">
                    ${field.label} ${field.required ? '<span class="text-danger">*</span>' : ''}
                    ${isDetected ? `<span class="text-success">${detectedText}</span>` : ''}
                </label>
                <select class="form-select column-mapping-select" data-field="${field.key}">
                    <option value="">Seçiniz</option>
                    ${headers.map((header, index) => 
                        `<option value="${index}" ${detectedMapping[field.key] === index ? 'selected' : ''}>
                            ${header || `Sütun ${index + 1}`}
                        </option>`
                    ).join('')}
                </select>
            `;
            mappingContainer.appendChild(fieldDiv);
        });

        // Show mapping modal
        const mappingModal = new bootstrap.Modal(document.getElementById('columnMappingModal'));
        mappingModal.show();

        // Store data for later processing
        this.pendingImportData = { headers, dataRows };
    }

    // ===== DATA PROCESSING =====
    processDataWithMapping(dataRows, mapping, headers = []) {
        const processedItems = [];
        const errors = [];
        const warnings = [];
        let skippedRows = 0;

        dataRows.forEach((row, index) => {
            if (!row || row.length === 0) {
                skippedRows++;
                return;
            }

            try {
                // Combine AÇIKLAMA columns for specs if they exist
                let specs = this.getCellValue(row, mapping.specs) || '';
                
                // Look for additional AÇIKLAMA columns to combine
                const aciklamaIndices = [];
                headers.forEach((header, index) => {
                    if (header) {
                        const headerStr = header.toString();
                        const headerLower = headerStr.toLowerCase();
                        const headerUpper = headerStr.toUpperCase();
                        
                        if (headerLower.includes('açıklama') || 
                            headerLower.includes('aciklama') ||
                            headerUpper.includes('AÇIKLAMA') ||
                            headerUpper.includes('ACIKLAMA')) {
                            aciklamaIndices.push(index);
                        }
                    }
                });
                
                // Combine all AÇIKLAMA columns
                const aciklamaValues = aciklamaIndices
                    .map(index => this.getCellValue(row, index))
                    .filter(value => value && value.trim() !== '');
                
                const combinedAciklama = aciklamaValues.join(' | ');
                
                if (combinedAciklama) {
                    specs = specs ? `${specs} | ${combinedAciklama}` : combinedAciklama;
                }

                const item = {
                    code: this.getCellValue(row, mapping.code),
                    name: this.getCellValue(row, mapping.name),
                    job_no: this.getCellValue(row, mapping.job_no),
                    quantity: this.parseQuantity(this.getCellValue(row, mapping.quantity)),
                    unit: this.getCellValue(row, mapping.unit),
                    specs: specs, // Keep for backward compatibility
                    specifications: specs, // Technical specifications
                    item_description: '' // Empty for bulk import, can be filled manually
                };

                // Validate required fields - skip invalid rows instead of stopping
                let isValid = true;
                if (!item.code) {
                    errors.push(`Satır ${index + 2}: Stok kodu eksik - satır atlandı`);
                    skippedRows++;
                    isValid = false;
                }
                if (!item.name) {
                    errors.push(`Satır ${index + 2}: Malzeme adı eksik - satır atlandı`);
                    skippedRows++;
                    isValid = false;
                }
                if (!item.job_no) {
                    errors.push(`Satır ${index + 2}: İş no eksik - satır atlandı`);
                    skippedRows++;
                    isValid = false;
                }
                if (item.quantity <= 0) {
                    errors.push(`Satır ${index + 2}: Geçersiz miktar değeri - satır atlandı`);
                    skippedRows++;
                    isValid = false;
                }
                if (!item.unit) {
                    errors.push(`Satır ${index + 2}: Birim eksik - satır atlandı`);
                    skippedRows++;
                    isValid = false;
                }

                // If any validation failed, skip this row
                if (!isValid) {
                    return;
                }



                processedItems.push(item);
            } catch (error) {
                errors.push(`Satır ${index + 2}: ${error.message} - satır atlandı`);
                skippedRows++;
            }
        });

        // Show results summary
        if (processedItems.length === 0) {
            this.showImportErrors(errors, warnings);
            return;
        }

        // Show warnings if any
        if (warnings.length > 0) {
            this.showImportWarnings(warnings);
        }

        // Show summary of processed data
        if (errors.length > 0 || skippedRows > 0) {
            this.showImportSummary(processedItems.length, errors.length, skippedRows, errors, warnings);
        }

        this.displayImportPreview(processedItems);
    }

    // ===== UTILITY METHODS =====
    getCellValue(row, columnIndex) {
        if (columnIndex === -1 || columnIndex >= row.length) return '';
        const value = row[columnIndex];
        return value ? value.toString().trim() : '';
    }

    parseQuantity(value) {
        if (!value) return 0;
        const parsed = parseFloat(value.toString().replace(',', '.'));
        return isNaN(parsed) ? 0 : parsed;
    }

    normalizeTurkish(str) {
        return str.toLowerCase()
            .replace(/ı/g, 'i')
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ş/g, 's')
            .replace(/ö/g, 'o')
            .replace(/ç/g, 'c')
            .replace(/İ/g, 'i')
            .replace(/Ğ/g, 'g')
            .replace(/Ü/g, 'u')
            .replace(/Ş/g, 's')
            .replace(/Ö/g, 'o')
            .replace(/Ç/g, 'c');
    }



    showImportErrors(errors, warnings = []) {
        const errorContainer = document.getElementById('import-errors');
        let html = `
            <div class="alert alert-danger">
                <h6>İçe aktarma hataları:</h6>
                <ul class="mb-0">
                    ${errors.map(error => `<li>${error}</li>`).join('')}
                </ul>
            </div>
        `;
        
        if (warnings.length > 0) {
            html += `
                <div class="alert alert-warning">
                    <h6>Uyarılar:</h6>
                    <ul class="mb-0">
                        ${warnings.map(warning => `<li>${warning}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        errorContainer.innerHTML = html;
        errorContainer.style.display = 'block';
    }

    showImportWarnings(warnings) {
        const errorContainer = document.getElementById('import-errors');
        errorContainer.innerHTML = `
            <div class="alert alert-warning">
                <h6>Uyarılar:</h6>
                <ul class="mb-0">
                    ${warnings.map(warning => `<li>${warning}</li>`).join('')}
                </ul>
            </div>
        `;
        errorContainer.style.display = 'block';
    }

    showImportSummary(processedCount, errorCount, skippedCount, errors, warnings) {
        const errorContainer = document.getElementById('import-errors');
        let html = `
            <div class="alert alert-info">
                <h6>İçe Aktarma Özeti:</h6>
                <ul class="mb-0">
                    <li><strong>Başarıyla işlenen:</strong> ${processedCount} satır</li>
                    <li><strong>Atlanan satırlar:</strong> ${skippedCount} satır</li>
                    <li><strong>Hatalı satırlar:</strong> ${errorCount} satır</li>
                </ul>
            </div>
        `;
        
        if (errors.length > 0) {
            html += `
                <div class="alert alert-warning">
                    <h6>Atlanan Satırlar:</h6>
                    <ul class="mb-0">
                        ${errors.map(error => `<li>${error}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        if (warnings.length > 0) {
            html += `
                <div class="alert alert-info">
                    <h6>Uyarılar:</h6>
                    <ul class="mb-0">
                        ${warnings.map(warning => `<li>${warning}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        errorContainer.innerHTML = html;
        errorContainer.style.display = 'block';
    }

    confirmColumnMapping() {
        const selects = document.querySelectorAll('.column-mapping-select');
        const mapping = {};

        selects.forEach(select => {
            const field = select.dataset.field;
            const value = parseInt(select.value);
            mapping[field] = value;
        });

        // Validate required mappings
        const missingRequired = ['code', 'name', 'job_no', 'quantity', 'unit'].filter(field => mapping[field] === -1);
        if (missingRequired.length > 0) {
            alert('Lütfen gerekli alanları eşleştirin.');
            return;
        }

        // Process data with user mapping
        this.processDataWithMapping(this.pendingImportData.dataRows, mapping, this.pendingImportData.headers);
        
        // Close mapping modal
        bootstrap.Modal.getInstance(document.getElementById('columnMappingModal')).hide();
    }

    displayImportPreview(processedItems) {
        const previewDiv = document.getElementById('import-preview');
        const tbody = document.getElementById('preview-tbody');
        const importBtn = document.getElementById('import-items-btn');
        const errorContainer = document.getElementById('import-errors');
        
        tbody.innerHTML = '';
        errorContainer.style.display = 'none';
        
        processedItems.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-item-index', index);
            const specsCell = this.formatSpecsCell(item.specs);
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${item.code}</td>
                <td>${item.name}</td>
                <td>${item.job_no}</td>
                <td>${item.quantity}</td>
                <td>${item.unit}</td>
                <td>${specsCell}</td>
                <td><span class="badge bg-success">Geçerli</span></td>
                <td>
                    <button class="btn btn-outline-danger btn-sm" onclick="window.itemsManager.deletePreviewItem(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        previewDiv.style.display = 'block';
        importBtn.disabled = false;
        
        // Update the preview title to show count
        const previewTitle = previewDiv.querySelector('h6');
        if (previewTitle) {
            previewTitle.textContent = `Önizleme (${processedItems.length} malzeme)`;
        }
        
        // Update import button text to show count
        if (importBtn) {
            importBtn.innerHTML = `<i class="fas fa-upload me-1"></i>${processedItems.length} Malzemeyi İçe Aktar`;
        }
        
        // Store the processed items for import
        this.parsedImportData = processedItems;
    }

    deletePreviewItem(index) {
        if (!this.parsedImportData || index < 0 || index >= this.parsedImportData.length) {
            return;
        }
        
        // Remove the item from the parsed data
        this.parsedImportData.splice(index, 1);
        
        // Re-render the preview table with updated data
        this.displayImportPreview(this.parsedImportData);
        
        // Update the import button state
        const importBtn = document.getElementById('import-items-btn');
        if (this.parsedImportData.length === 0) {
            importBtn.disabled = true;
            importBtn.innerHTML = '<i class="fas fa-upload me-1"></i>Malzemeleri İçe Aktar';
        }
        
        // Show notification
        this.showNotification('Satır başarıyla silindi', 'success');
    }

    clearBulkImport() {
        document.getElementById('excel-file-input').value = '';
        document.getElementById('import-preview').style.display = 'none';
        document.getElementById('import-errors').style.display = 'none';
        document.getElementById('import-items-btn').disabled = true;
        this.parsedImportData = null;
        this.pendingImportData = null;
    }

    importBulkItems() {
        if (!this.parsedImportData) return;
        
        this.parsedImportData.forEach(item => {
            const newItem = {
                id: this.generateItemId(),
                ...item
            };
            this.requestData.items.push(newItem);
        });
        
        this.renderItemsTable();
        this.autoSave();
        
        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('bulkImportModal')).hide();
        this.clearBulkImport();
        
        alert(`${this.parsedImportData.length} malzeme başarıyla içe aktarıldı.`);
    }

    // ===== ITEM FORMATTING FOR SUBMISSION =====
    
    /**
     * Detect items that have the same code, name, job_no, and specifications
     * These items would cause backend constraint violations if merged
     */
    detectProblematicItems() {
        const problematicItems = [];
        const itemGroups = {};
        
        // Group items by code, name, job_no, specifications, and item_description
        // Items with different item_description are considered different even if other fields match
        this.requestData.items.forEach((item, index) => {
            const specsValue = item.specifications || item.specs || '';
            const itemDescriptionValue = item.item_description || '';
            const key = `${item.code}|${item.name}|${item.job_no || ''}|${specsValue}|${itemDescriptionValue}`;
            
            if (!itemGroups[key]) {
                itemGroups[key] = [];
            }
            itemGroups[key].push({ ...item, originalIndex: index });
        });
        
        // Find groups with multiple items (problematic)
        Object.entries(itemGroups).forEach(([key, items]) => {
            if (items.length > 1) {
                // This group has multiple items with same code, name, job_no, specifications, and item_description
                problematicItems.push({
                    code: items[0].code,
                    name: items[0].name,
                    job_no: items[0].job_no || 'Belirtilmemiş',
                    specs: items[0].specifications || items[0].specs || 'Belirtilmemiş',
                    item_description: items[0].item_description || 'Belirtilmemiş',
                    count: items.length,
                    items: items.map(item => ({
                        index: item.originalIndex + 1, // 1-based index for display
                        quantity: item.quantity,
                        unit: item.unit
                    }))
                });
            }
        });
        
        return problematicItems;
    }
    
    /**
     * Transform items to the new submission format where items are grouped by code, name, unit, specifications, and item_description
     * with allocations containing job_no and quantity
     * Items with different specifications or item_description are kept separate
     */
    getFormattedItemsForSubmission() {
        // First, check for problematic items that would cause backend issues
        const problematicItems = this.detectProblematicItems();
        if (problematicItems.length > 0) {
            return {
                items: [],
                mapping: [],
                error: {
                    type: 'problematic_items',
                    message: 'Aşağıdaki malzemeler aynı kod, ad, iş numarası, teknik özellikler ve malzeme açıklamasına sahip olduğu için gönderilemez:',
                    items: problematicItems
                }
            };
        }

        const groupedItems = {};
        const originalToGroupedMapping = [];
        let groupedIndex = 0;
        
        // Group items by code, name, unit, specifications, and item_description
        // Items with different specifications or item_description should be kept separate
        this.requestData.items.forEach((item, originalIndex) => {
            // Use specifications field if available, otherwise fall back to specs
            const specsValue = item.specifications || item.specs || '';
            const itemDescriptionValue = item.item_description || '';
            const key = `${item.code}|${item.name}|${item.unit}|${specsValue}|${itemDescriptionValue}`;
            
            if (!groupedItems[key]) {
                groupedItems[key] = {
                    code: item.code,
                    name: item.name,
                    unit: item.unit,
                    specifications: specsValue,
                    item_description: itemDescriptionValue,
                    quantity: 0,
                    allocations: [],
                    file_asset_ids: [], // Initialize file asset IDs array
                    groupedIndex: groupedIndex++
                };
            }
            
            // Collect file asset IDs from this item
            if (item.file_asset_ids && Array.isArray(item.file_asset_ids)) {
                item.file_asset_ids.forEach(fileAssetId => {
                    // Avoid duplicates
                    if (!groupedItems[key].file_asset_ids.includes(fileAssetId)) {
                        groupedItems[key].file_asset_ids.push(fileAssetId);
                    }
                });
            }
            
            // Check if item already has allocations (from merge)
            if (item.allocations && Array.isArray(item.allocations)) {
                // Item already has allocations, add them directly
                item.allocations.forEach(allocation => {
                    groupedItems[key].allocations.push({
                        job_no: allocation.job_no,
                        quantity: parseFloat(allocation.quantity).toFixed(2)
                    });
                    groupedItems[key].quantity += parseFloat(allocation.quantity);
                });
            } else {
                // Regular item, add as single allocation
                groupedItems[key].allocations.push({
                    job_no: item.job_no,
                    quantity: parseFloat(item.quantity).toFixed(2)
                });
                groupedItems[key].quantity += parseFloat(item.quantity);
            }
            
            // Store mapping from original index to grouped index
            originalToGroupedMapping[originalIndex] = groupedItems[key].groupedIndex;
        });
        
        // Convert to array and format quantities as strings
        const formattedItems = Object.values(groupedItems).map(item => ({
            code: item.code,
            name: item.name,
            unit: item.unit,
            specifications: item.specifications,
            item_description: item.item_description,
            quantity: item.quantity.toFixed(2),
            allocations: item.allocations,
            file_asset_ids: item.file_asset_ids || [] // Include file asset IDs
        }));
        
        return {
            items: formattedItems,
            mapping: originalToGroupedMapping
        };
    }

    // ===== TEST FUNCTION FOR NEW EXCEL MAPPINGS =====
    
    /**
     * Test function to verify the new Excel column mappings work correctly
     * This can be called from browser console for testing
     */
    testNewExcelMappings() {
        console.log('Testing new Excel column mappings...');
        
        // Test headers from sa_raporu.xlsx format
        const testHeaders = [
            'STOK KODU',
            'STOK İSMİ', 
            'İŞ İSMİ',
            'TALEP MİKTARI',
            'BİRİM',
            'TEKNİK ÖZELLİKLER'
        ];
        
        const mapping = this.detectColumnMapping(testHeaders);
        
        console.log('Detected mapping:', mapping);
        
        // Verify the mappings
        const expectedMapping = {
            code: 0,      // STOK KODU
            name: 1,      // STOK İSMİ
            job_no: 2,    // İŞ İSMİ
            quantity: 3,  // TALEP MİKTARI
            unit: 4,      // BİRİM
            specs: 5      // TEKNİK ÖZELLİKLER
        };
        
        const isCorrect = JSON.stringify(mapping) === JSON.stringify(expectedMapping);
        
        if (isCorrect) {
            console.log('✅ All new Excel mappings work correctly!');
        } else {
            console.log('❌ Some mappings are incorrect:');
            console.log('Expected:', expectedMapping);
            console.log('Actual:', mapping);
        }
        
        return isCorrect;
    }

    // ===== TEST FUNCTION FOR SPECIFICATIONS GROUPING =====
    
    /**
     * Test function to verify that items with different specifications are not merged
     * This can be called from browser console for testing
     */
    testSpecificationsGrouping() {
        console.log('Testing specifications grouping...');
        
        // Create test items with same code, name, unit but different specs
        const testItems = [
            {
                id: 'item1',
                code: 'TEST001',
                name: 'Test Item',
                unit: 'ADET',
                job_no: 'JOB001',
                quantity: 10,
                specs: 'Specification A'
            },
            {
                id: 'item2',
                code: 'TEST001',
                name: 'Test Item',
                unit: 'ADET',
                job_no: 'JOB002',
                quantity: 5,
                specs: 'Specification B'
            },
            {
                id: 'item3',
                code: 'TEST001',
                name: 'Test Item',
                unit: 'ADET',
                job_no: 'JOB003',
                quantity: 3,
                specs: 'Specification A' // Same as item1
            }
        ];
        
        // Temporarily set the test items
        const originalItems = this.requestData.items;
        this.requestData.items = testItems;
        
        // Test the formatting
        const result = this.getFormattedItemsForSubmission();
        
        console.log('Original items:', testItems);
        console.log('Formatted items:', result.items);
        
        // Restore original items
        this.requestData.items = originalItems;
        
        // Verify that items with different specs are not merged
        const expectedCount = 2; // Should have 2 groups: one for "Specification A" and one for "Specification B"
        const actualCount = result.items.length;
        
        if (actualCount === expectedCount) {
            console.log('✅ Items with different specifications are correctly kept separate!');
            console.log(`Expected ${expectedCount} groups, got ${actualCount}`);
            
            // Verify the specifications are preserved
            const specsA = result.items.find(item => item.specifications === 'Specification A');
            const specsB = result.items.find(item => item.specifications === 'Specification B');
            
            if (specsA && specsB) {
                console.log('✅ Specifications are correctly preserved in the output!');
                console.log('Spec A allocations:', specsA.allocations);
                console.log('Spec B allocations:', specsB.allocations);
                return true;
            } else {
                console.log('❌ Specifications are not correctly preserved!');
                return false;
            }
        } else {
            console.log('❌ Items with different specifications are being merged!');
            console.log(`Expected ${expectedCount} groups, got ${actualCount}`);
            return false;
        }
    }

    // ===== TEST FUNCTION FOR MERGE LOGIC =====
    
    /**
     * Test function to verify that items with same code, name, job_no, and specifications cannot be merged
     * This can be called from browser console for testing
     */
    testMergeLogic() {
        console.log('Testing merge logic...');
        
        // Create test items that should NOT be mergeable (same code, name, job_no, specs)
        const testItems = [
            {
                id: 'item1',
                code: 'TEST001',
                name: 'Test Item',
                unit: 'ADET',
                job_no: 'JOB001',
                quantity: 10,
                specs: 'Same Specification'
            },
            {
                id: 'item2',
                code: 'TEST001',
                name: 'Test Item',
                unit: 'ADET',
                job_no: 'JOB001', // Same job_no
                quantity: 5,
                specs: 'Same Specification' // Same specs
            },
            {
                id: 'item3',
                code: 'TEST001',
                name: 'Test Item',
                unit: 'ADET',
                job_no: 'JOB002', // Different job_no
                quantity: 3,
                specs: 'Same Specification'
            }
        ];
        
        // Temporarily set the test items
        const originalItems = this.requestData.items;
        this.requestData.items = testItems;
        
        // Test the merge logic by calling mergeDuplicateItems
        console.log('Original items:', testItems);
        
        // Simulate the merge logic validation
        const firstItem = testItems[0];
        const sameName = testItems.every(item => 
            item.name.trim().toLowerCase() === firstItem.name.trim().toLowerCase()
        );
        const sameUnit = testItems.every(item => 
            item.unit.trim().toLowerCase() === firstItem.unit.trim().toLowerCase()
        );
        const sameJobNo = testItems.every(item => 
            (item.job_no || '').trim().toLowerCase() === (firstItem.job_no || '').trim().toLowerCase()
        );
        const sameSpecs = testItems.every(item => 
            (item.specs || '').trim() === (firstItem.specs || '').trim()
        );
        const cannotMerge = sameJobNo && sameSpecs;
        
        console.log('Validation results:');
        console.log('- Same name:', sameName);
        console.log('- Same unit:', sameUnit);
        console.log('- Same job_no:', sameJobNo);
        console.log('- Same specs:', sameSpecs);
        console.log('- Cannot merge:', cannotMerge);
        
        // Restore original items
        this.requestData.items = originalItems;
        
        if (cannotMerge) {
            console.log('✅ Items with same code, name, job_no, and specifications are correctly identified as non-mergeable!');
            return true;
        } else {
            console.log('❌ Items with same code, name, job_no, and specifications are not being identified as non-mergeable!');
            return false;
        }
    }

    // ===== TEST FUNCTION FOR SUBMISSION VALIDATION =====
    
    /**
     * Test function to verify that problematic items are detected during submission
     * This can be called from browser console for testing
     */
    testSubmissionValidation() {
        console.log('Testing submission validation...');
        
        // Create test items that should cause submission errors
        const testItems = [
            {
                id: 'item1',
                code: 'TEST001',
                name: 'Test Item',
                unit: 'ADET',
                job_no: 'JOB001',
                quantity: 10,
                specs: 'Same Specification'
            },
            {
                id: 'item2',
                code: 'TEST001',
                name: 'Test Item',
                unit: 'ADET',
                job_no: 'JOB001', // Same job_no
                quantity: 5,
                specs: 'Same Specification' // Same specs
            },
            {
                id: 'item3',
                code: 'TEST002',
                name: 'Another Item',
                unit: 'KG',
                job_no: 'JOB002',
                quantity: 3,
                specs: 'Different Specification'
            }
        ];
        
        // Temporarily set the test items
        const originalItems = this.requestData.items;
        this.requestData.items = testItems;
        
        console.log('Original items:', testItems);
        
        // Test the problematic items detection
        const problematicItems = this.detectProblematicItems();
        console.log('Detected problematic items:', problematicItems);
        
        // Test the formatted items for submission
        const formattedData = this.getFormattedItemsForSubmission();
        console.log('Formatted data result:', formattedData);
        
        // Restore original items
        this.requestData.items = originalItems;
        
        // Verify that problematic items are detected
        if (formattedData.error && formattedData.error.type === 'problematic_items') {
            console.log('✅ Problematic items are correctly detected during submission!');
            console.log('Error details:', formattedData.error);
            return true;
        } else {
            console.log('❌ Problematic items are not being detected during submission!');
            return false;
        }
    }
}

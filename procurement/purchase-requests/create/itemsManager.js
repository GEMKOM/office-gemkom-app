// Items Manager Module
export class ItemsManager {
    constructor(requestData, autoSave) {
        this.requestData = requestData;
        this.autoSave = autoSave;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Add item button
        const addItemBtn = document.getElementById('add-item-btn');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => {
                this.showItemModal();
            });
        }

        // Bulk import button
        const bulkImportBtn = document.getElementById('bulk-import-btn');
        if (bulkImportBtn) {
            bulkImportBtn.addEventListener('click', () => {
                this.showBulkImportModal();
            });
        }

        // Clear items button
        const clearItemsBtn = document.getElementById('clear-items-btn');
        if (clearItemsBtn) {
            clearItemsBtn.addEventListener('click', () => {
                this.clearAllItems();
            });
        }

        // Modal event listeners
        const saveItemBtn = document.getElementById('save-item-btn');
        if (saveItemBtn) {
            saveItemBtn.addEventListener('click', () => this.saveItem());
        }

        // Bulk import modal event listeners
        const previewImportBtn = document.getElementById('preview-import-btn');
        const clearImportBtn = document.getElementById('clear-import-btn');
        const importItemsBtn = document.getElementById('import-items-btn');

        if (previewImportBtn) {
            previewImportBtn.addEventListener('click', () => this.previewBulkImport());
        }
        if (clearImportBtn) {
            clearImportBtn.addEventListener('click', () => this.clearBulkImport());
        }
        if (importItemsBtn) {
            importItemsBtn.addEventListener('click', () => this.importBulkItems());
        }
    }

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
        document.getElementById('item-quantity').value = item.quantity;
        document.getElementById('item-unit').value = item.unit;
        document.getElementById('item-priority').value = item.priority || 'normal';
        document.getElementById('item-specs').value = item.specs || '';
    }

    saveItem() {
        const form = document.getElementById('itemForm');
        const editIndex = form.dataset.editIndex;

        const item = {
            id: editIndex !== undefined ? this.requestData.items[editIndex].id : this.generateItemId(),
            code: document.getElementById('item-code').value,
            name: document.getElementById('item-name').value,
            quantity: parseFloat(document.getElementById('item-quantity').value) || 0,
            unit: document.getElementById('item-unit').value,
            priority: document.getElementById('item-priority').value,
            specs: document.getElementById('item-specs').value
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
        if (confirm('Bu malzemeyi silmek istediğinizden emin misiniz?')) {
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

            this.requestData.items.splice(index, 1);
            this.renderItemsTable();
            this.autoSave();
        }
    }

    clearAllItems() {
        if (!this.requestData.items.length) return;
        if (confirm('Tüm malzemeleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
            this.requestData.items = [];
            // Clear all offers since there are no items left
            this.requestData.offers = {};
            this.renderItemsTable();
            this.autoSave();
        }
    }

    renderItemsTable() {
        const tbody = document.getElementById('items-tbody');
        tbody.innerHTML = '';

        this.requestData.items.forEach((item, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${item.code}</td>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${item.unit}</td>
                <td>${item.specs || '-'}</td>
                <td>
                    <button class="btn btn-outline-primary btn-sm" onclick="window.itemsManager.editItem(${index})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="window.itemsManager.deleteItem(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    editItem(index) {
        this.showItemModal(index);
    }

    generateItemId() {
        return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Bulk Import Methods
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
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (jsonData.length < 2) {
                    alert('Dosya boş veya geçersiz format.');
                    return;
                }

                this.displayImportPreview(jsonData);
            } catch (error) {
                console.error('Dosya okuma hatası:', error);
                alert('Dosya okunamadı. Lütfen geçerli bir Excel dosyası seçin.');
            }
        };
        reader.readAsArrayBuffer(file);
    }

    displayImportPreview(data) {
        const previewDiv = document.getElementById('import-preview');
        const tbody = document.getElementById('preview-tbody');
        const importBtn = document.getElementById('import-items-btn');
        
        tbody.innerHTML = '';
        
        // Skip header row and process data
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (row.length < 4) continue; // Skip empty rows
            
            const item = {
                code: row[0] || '',
                name: row[1] || '',
                quantity: parseFloat(row[2]) || 0,
                unit: row[3] || '',
                priority: row[4] || 'normal',
                specs: row[5] || ''
            };

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${i}</td>
                <td>${item.code}</td>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${item.unit}</td>
                <td>${item.priority}</td>
                <td>${item.specs}</td>
                <td><span class="badge bg-success">Geçerli</span></td>
            `;
            tbody.appendChild(tr);
        }
        
        previewDiv.style.display = 'block';
        importBtn.disabled = false;
        
        // Store the parsed data for import
        this.parsedImportData = data;
    }

    clearBulkImport() {
        document.getElementById('excel-file-input').value = '';
        document.getElementById('import-preview').style.display = 'none';
        document.getElementById('import-items-btn').disabled = true;
        this.parsedImportData = null;
    }

    importBulkItems() {
        if (!this.parsedImportData) return;
        
        // Skip header row and process data
        for (let i = 1; i < this.parsedImportData.length; i++) {
            const row = this.parsedImportData[i];
            if (row.length < 4) continue;
            
            const item = {
                id: this.generateItemId(),
                code: row[0] || '',
                name: row[1] || '',
                quantity: parseFloat(row[2]) || 0,
                unit: row[3] || '',
                priority: row[4] || 'normal',
                specs: row[5] || ''
            };
            
            this.requestData.items.push(item);
        }
        
        this.renderItemsTable();
        this.autoSave();
        
        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('bulkImportModal')).hide();
        this.clearBulkImport();
        
        alert(`${this.parsedImportData.length - 1} malzeme başarıyla içe aktarıldı.`);
    }
}

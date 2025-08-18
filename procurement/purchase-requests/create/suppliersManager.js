// Suppliers Manager Module
export class SuppliersManager {
    constructor(requestData, autoSave, currencySymbols) {
        this.requestData = requestData;
        this.autoSave = autoSave;
        this.currencySymbols = currencySymbols;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Add supplier button
        const addSupplierBtn = document.getElementById('add-supplier-btn');
        if (addSupplierBtn) {
            addSupplierBtn.addEventListener('click', () => {
                this.showSupplierModal();
            });
        }

        // Clear suppliers button
        const clearSuppliersBtn = document.getElementById('clear-suppliers-btn');
        if (clearSuppliersBtn) {
            clearSuppliersBtn.addEventListener('click', () => {
                this.clearAllSuppliers();
            });
        }

        // Modal event listeners
        const saveSupplierBtn = document.getElementById('save-supplier-btn');
        if (saveSupplierBtn) {
            saveSupplierBtn.addEventListener('click', () => this.saveSupplier());
        }
    }

    showSupplierModal(supplierIndex = null) {
        const modalElement = document.getElementById('supplierModal');
        const modal = new bootstrap.Modal(modalElement);
        const title = document.getElementById('supplierModalTitle');
        const form = document.getElementById('supplierForm');

        if (supplierIndex !== null) {
            // Edit existing supplier
            title.textContent = 'Tedarikçi Düzenle';
            const supplier = this.requestData.suppliers[supplierIndex];
            this.populateSupplierForm(supplier);
            form.dataset.editIndex = supplierIndex;
        } else {
            // Add new supplier
            title.textContent = 'Tedarikçi Ekle';
            form.reset();
            delete form.dataset.editIndex;
        }

        modal.show();
    }

    populateSupplierForm(supplier) {
        document.getElementById('supplier-name').value = supplier.name;
        document.getElementById('supplier-contact').value = supplier.contact;
        document.getElementById('supplier-phone').value = supplier.phone;
        document.getElementById('supplier-email').value = supplier.email;
        document.getElementById('supplier-currency').value = supplier.currency;
    }

    saveSupplier() {
        const form = document.getElementById('supplierForm');
        const editIndex = form.dataset.editIndex;

        // Get form values
        const name = document.getElementById('supplier-name').value.trim();
        const contact = document.getElementById('supplier-contact').value.trim();
        const phone = document.getElementById('supplier-phone').value.trim();
        const email = document.getElementById('supplier-email').value.trim();
        const currency = document.getElementById('supplier-currency').value;

        // Validate required fields
        const errors = [];
        
        if (!name) {
            errors.push('Tedarikçi adı zorunludur');
        }

        // Show errors if any
        if (errors.length > 0) {
            this.showNotification('Lütfen aşağıdaki hataları düzeltin:\n' + errors.join('\n'), 'error');
            return;
        }

        const supplier = {
            id: editIndex !== undefined ? this.requestData.suppliers[editIndex].id : this.generateSupplierId(),
            name: name,
            contact: contact,
            phone: phone,
            email: email,
            currency: currency
        };

        if (editIndex !== undefined) {
            // Update existing supplier
            this.requestData.suppliers[editIndex] = supplier;
        } else {
            // Add new supplier
            this.requestData.suppliers.push(supplier);
        }

        this.renderSuppliersContainer();
        this.autoSave();

        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('supplierModal')).hide();
    }

    deleteSupplier(index) {
        if (confirm('Bu tedarikçiyi silmek istediğinizden emin misiniz? Tüm teklif verileri de silinecektir.')) {
            const supplier = this.requestData.suppliers[index];
            delete this.requestData.offers[supplier.id];
            delete this.requestData.recommendations[supplier.id];
            this.requestData.suppliers.splice(index, 1);
            
            this.renderSuppliersContainer();
            this.autoSave();
        }
    }

    clearAllSuppliers() {
        if (!this.requestData.suppliers.length) return;
        if (confirm('Tüm tedarikçileri ve ilişkili teklif verilerini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
            this.requestData.suppliers = [];
            this.requestData.offers = {};
            this.requestData.recommendations = {};
            this.renderSuppliersContainer();
            this.autoSave();
        }
    }

    renderSuppliersContainer() {
        const container = document.getElementById('suppliers-container');
        container.innerHTML = '';

        if (this.requestData.suppliers.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-handshake fa-3x mb-3"></i>
                    <p>Henüz tedarikçi eklenmemiş. Teklif karşılaştırması yapabilmek için tedarikçi ekleyin.</p>
                </div>
            `;
            return;
        }

        this.requestData.suppliers.forEach((supplier, index) => {
            const hasOffer = this.requestData.offers[supplier.id];
            const isRecommended = this.requestData.recommendations[supplier.id];
            
            const card = document.createElement('div');
            card.className = `supplier-card ${hasOffer ? 'has-offer' : ''} ${isRecommended ? 'recommended' : ''}`;
            
            card.innerHTML = `
                <div class="supplier-header">
                    <div class="supplier-name">${supplier.name}</div>
                    <div class="supplier-status ${hasOffer ? 'completed' : 'pending'}">
                        ${hasOffer ? 'Teklif Alındı' : 'Teklif Bekleniyor'}
                    </div>
                </div>
                <div class="supplier-info">
                    <div class="supplier-info-item">
                        <div class="supplier-info-label">İletişim Kişisi</div>
                        <div class="supplier-info-value">${supplier.contact || '-'}</div>
                    </div>
                    <div class="supplier-info-item">
                        <div class="supplier-info-label">Telefon</div>
                        <div class="supplier-info-value">${supplier.phone || '-'}</div>
                    </div>
                    <div class="supplier-info-item">
                        <div class="supplier-info-label">E-posta</div>
                        <div class="supplier-info-value">${supplier.email || '-'}</div>
                    </div>
                    <div class="supplier-info-item">
                        <div class="supplier-info-label">Para Birimi</div>
                        <div class="supplier-info-value">${this.currencySymbols[supplier.currency]} ${supplier.currency}</div>
                    </div>
                </div>
                <div class="supplier-actions">
                    <button class="btn btn-primary btn-sm" onclick="window.suppliersManager.showOfferModal('${supplier.id}')">
                        <i class="fas fa-dollar-sign me-1"></i>Teklif Gir
                    </button>
                    <button class="btn btn-outline-primary btn-sm" onclick="window.suppliersManager.editSupplier(${index})">
                        <i class="fas fa-edit me-1"></i>Düzenle
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="window.suppliersManager.deleteSupplier(${index})">
                        <i class="fas fa-trash me-1"></i>Sil
                    </button>
                </div>
            `;
            
            container.appendChild(card);
        });
    }

    editSupplier(index) {
        this.showSupplierModal(index);
    }

    generateSupplierId() {
        return 'supplier_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Offer Modal Methods
    showOfferModal(supplierId) {
        const supplier = this.requestData.suppliers.find(s => s.id === supplierId);
        if (!supplier) return;

        const modal = new bootstrap.Modal(document.getElementById('offerModal'));
        document.getElementById('offer-supplier-name').textContent = supplier.name;
        document.getElementById('offer-currency').textContent = `${this.currencySymbols[supplier.currency]} ${supplier.currency}`;

        // Populate offer table
        const tbody = document.getElementById('offer-tbody');
        tbody.innerHTML = '';

        this.requestData.items.forEach((item, index) => {
            const existingOffer = this.requestData.offers[supplierId]?.[index] || {};
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.name}</td>
                <td>${item.job_no || '-'}</td>
                <td>${item.quantity}</td>
                <td>${item.unit}</td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                           step="0.01" min="0" 
                           value="${existingOffer.unitPrice || ''}"
                           onchange="window.suppliersManager.updateOfferTotal(this, ${index})"
                           data-item-index="${index}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                           min="1" value="${existingOffer.deliveryDays || ''}"
                           placeholder="Gün"
                           data-item-index="${index}">
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm" 
                           value="${existingOffer.notes || ''}"
                           placeholder="Notlar..."
                           data-item-index="${index}">
                </td>
                <td class="text-end">
                    <span class="form-control-plaintext" id="total-price-${index}">
                        ${existingOffer.unitPrice ? (existingOffer.unitPrice * item.quantity).toFixed(2) : '0.00'}
                    </span>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Store supplier ID for saving
        document.getElementById('offerModal').dataset.supplierId = supplierId;
        modal.show();
    }

    updateOfferTotal(input, itemIndex) {
        const unitPrice = parseFloat(input.value) || 0;
        const item = this.requestData.items[itemIndex];
        const totalPrice = unitPrice * item.quantity;
        
        const totalPriceElement = document.getElementById(`total-price-${itemIndex}`);
        if (totalPriceElement) {
            totalPriceElement.textContent = totalPrice.toFixed(2);
        }
    }

    saveOffer() {
        const supplierId = document.getElementById('offerModal').dataset.supplierId;
        const tbody = document.getElementById('offer-tbody');
        const offers = {};

        tbody.querySelectorAll('tr').forEach((row, index) => {
            const inputs = row.querySelectorAll('input');
            const unitPrice = parseFloat(inputs[0].value) || 0;
            const item = this.requestData.items[index];
            const totalPrice = unitPrice * item.quantity;
            
            offers[index] = {
                unitPrice: unitPrice,
                totalPrice: totalPrice,
                deliveryDays: parseInt(inputs[1].value) || 0,
                notes: inputs[2].value
            };
        });

        this.requestData.offers[supplierId] = offers;
        
        this.renderSuppliersContainer();
        this.autoSave();
        
        // Re-validate all items to update error states when offers are added
        if (window.validationManager) {
            this.requestData.items.forEach((_, itemIndex) => {
                window.validationManager.revalidateItem(
                    itemIndex, 
                    this.requestData.items, 
                    this.requestData.itemRecommendations, 
                    this.requestData.offers, 
                    this.requestData.suppliers
                );
            });
        }

        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('offerModal')).hide();
    }

    showNotification(message, type = 'info') {
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
}

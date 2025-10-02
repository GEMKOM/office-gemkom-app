import { getSuppliers, getPaymentTerms } from '../../../apis/procurement.js';
import { ModernDropdown } from '../../../components/dropdown.js';

// Suppliers Manager Module
export class SuppliersManager {
    constructor(requestData, autoSave, currencySymbols) {
        this.requestData = requestData;
        this.autoSave = autoSave;
        this.currencySymbols = currencySymbols;
        this.availableSuppliers = []; // Store available suppliers from API
        this.availablePaymentTerms = []; // Store available payment terms from API
        this.supplierDropdown = null; // Modern dropdown instance
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

        // Offer modal event listeners
        const saveOfferBtn = document.getElementById('save-offer-btn');
        if (saveOfferBtn) {
            saveOfferBtn.addEventListener('click', () => this.saveOffer());
        }

        // Supplier dropdown will be initialized in loadAvailableSuppliers

        // Currency, payment terms and tax rate change listeners
        const currencySelect = document.getElementById('supplier-currency');
        const paymentTermsSelect = document.getElementById('supplier-payment-terms');
        const taxRateInput = document.getElementById('supplier-tax-rate');
        
        if (currencySelect) {
            currencySelect.addEventListener('change', () => this.updateChosenValues());
        }
        
        if (paymentTermsSelect) {
            paymentTermsSelect.addEventListener('change', () => this.updateChosenValues());
        }
        
        if (taxRateInput) {
            taxRateInput.addEventListener('input', () => this.updateChosenValues());
        }
    }

    async showSupplierModal(supplierIndex = null) {
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
            // Hide supplier selection for editing
            const supplierDropdownContainer = document.getElementById('supplier-dropdown-container');
            const supplierSelectLabel = document.querySelector('label[for="supplier-dropdown-container"]');
            if (supplierDropdownContainer) supplierDropdownContainer.style.display = 'none';
            if (supplierSelectLabel) supplierSelectLabel.style.display = 'none';
            
            // Show editable fields for editing existing suppliers
            this.showEditableFields();
        } else {
            // Add new supplier
            title.textContent = 'Tedarikçi Ekle';
            form.reset();
            delete form.dataset.editIndex;
            // Show supplier selection for new suppliers
            const supplierDropdownContainer = document.getElementById('supplier-dropdown-container');
            const supplierSelectLabel = document.querySelector('label[for="supplier-dropdown-container"]');
            if (supplierDropdownContainer) supplierDropdownContainer.style.display = 'block';
            if (supplierSelectLabel) supplierSelectLabel.style.display = 'block';
            
            // Hide all fields initially - user must select a supplier first
            this.hideAllFields();
            await this.loadAvailablePaymentTerms();
            await this.loadAvailableSuppliers();

        }

        // Hide default values section initially
        const defaultValuesSection = document.getElementById('default-values-section');
        if (defaultValuesSection) defaultValuesSection.style.display = 'none';

        modal.show();
    }

    async loadAvailableSuppliers() {
        try {
            const response = await getSuppliers({ status: 'active' });
            this.availableSuppliers = Array.isArray(response) ? response : (response.results || []);
            
            // Initialize the modern dropdown
            const dropdownContainer = document.getElementById('supplier-dropdown-container');
            if (dropdownContainer && !this.supplierDropdown) {
                this.supplierDropdown = new ModernDropdown(dropdownContainer, {
                    placeholder: 'Tedarikçi seçin...',
                    searchable: true,
                    multiple: false,
                    maxHeight: 300
                });
                
                // Add event listener for supplier selection
                dropdownContainer.addEventListener('dropdown:select', (e) => {
                    this.onSupplierSelect(e.detail.value);
                });
            }
            
            // Convert suppliers to dropdown items format
            const dropdownItems = this.availableSuppliers.map(supplier => ({
                value: supplier.id,
                text: supplier.name
            }));
            
            // Set items in dropdown
            if (this.supplierDropdown) {
                this.supplierDropdown.setItems(dropdownItems);
            }
        } catch (error) {
            console.error('Error loading suppliers:', error);
            this.showNotification('Tedarikçiler yüklenirken hata oluştu: ' + error.message, 'error');
        }
    }

    async loadAvailablePaymentTerms() {
        try {
            console.log('Loading available payment terms...');
            const response = await getPaymentTerms({ status: 'active' });
            this.availablePaymentTerms = Array.isArray(response) ? response : (response.results || []);
            console.log('Loaded payment terms:', this.availablePaymentTerms);
            
            const paymentTermsSelect = document.getElementById('supplier-payment-terms');
            if (paymentTermsSelect) {
                paymentTermsSelect.innerHTML = '<option value="">Ödeme koşulu seçin...</option>';
                
                this.availablePaymentTerms.forEach(paymentTerm => {
                    const option = document.createElement('option');
                    option.value = paymentTerm.id;
                    option.textContent = paymentTerm.name;
                    paymentTermsSelect.appendChild(option);
                });
            }
            
            // Re-render suppliers container after payment terms are loaded
            // This ensures payment terms are displayed correctly after page refresh
            if (this.requestData.suppliers.length > 0) {
                console.log('Re-rendering suppliers container after payment terms loaded');
                this.renderSuppliersContainer();
            }
        } catch (error) {
            console.error('Error loading payment terms:', error);
            this.showNotification('Ödeme koşulları yüklenirken hata oluştu: ' + error.message, 'error');
        }
    }

    onSupplierSelect(supplierId) {
        if (!supplierId || supplierId === '') {
            // Clear form if no supplier selected
            this.clearSupplierForm();
            const defaultValuesSection = document.getElementById('default-values-section');
            if (defaultValuesSection) defaultValuesSection.style.display = 'none';
            // Hide all fields when no supplier is selected
            this.hideAllFields();
            return;
        }

        const selectedSupplier = this.availableSuppliers.find(s => s.id == supplierId);
        if (selectedSupplier) {
            this.populateSupplierFormFromAPI(selectedSupplier);
        }
    }

    hideAllFields() {
        // Hide supplier info display
        const infoDisplay = document.getElementById('supplier-info-display');
        if (infoDisplay) infoDisplay.style.display = 'none';
        
        // Hide currency and payment terms fields
        const currencyRow = document.querySelector('.row:has(#supplier-currency)');
        const paymentTermsRow = document.querySelector('.row:has(#supplier-payment-terms)');
        if (currencyRow) currencyRow.style.display = 'none';
        if (paymentTermsRow) paymentTermsRow.style.display = 'none';
    }

    showEditableFields() {
        // Show currency and payment terms fields
        const currencyRow = document.querySelector('.row:has(#supplier-currency)');
        const paymentTermsRow = document.querySelector('.row:has(#supplier-payment-terms)');
        if (currencyRow) currencyRow.style.display = 'flex';
        if (paymentTermsRow) paymentTermsRow.style.display = 'flex';
    }

    showSupplierInfoDisplay(supplier) {
        // Hide manual entry
        const manualEntry = document.getElementById('supplier-manual-entry');
        if (manualEntry) manualEntry.style.display = 'none';
        
        // Show supplier info display
        const infoDisplay = document.getElementById('supplier-info-display');
        if (infoDisplay) infoDisplay.style.display = 'block';
        
        // Populate display fields
        const nameDisplay = document.getElementById('display-supplier-name');
        const contactDisplay = document.getElementById('display-supplier-contact');
        const phoneDisplay = document.getElementById('display-supplier-phone');
        const emailDisplay = document.getElementById('display-supplier-email');
        
        if (nameDisplay) nameDisplay.textContent = supplier.name || '-';
        if (contactDisplay) contactDisplay.textContent = supplier.contact_person || '-';
        if (phoneDisplay) phoneDisplay.textContent = supplier.phone || '-';
        if (emailDisplay) emailDisplay.textContent = supplier.email || '-';
    }



    populateSupplierFormFromAPI(supplier) {
        // Show supplier info display instead of form fields
        this.showSupplierInfoDisplay(supplier);
        
        // Show editable fields (currency, payment terms and tax rate)
        this.showEditableFields();
        
        // Set editable fields (currency, payment terms and tax rate)
        const currencyField = document.getElementById('supplier-currency');
        const paymentTermsField = document.getElementById('supplier-payment-terms');
        const taxRateField = document.getElementById('supplier-tax-rate');

        if (currencyField) currencyField.value = supplier.default_currency || 'TRY';
        
        // Set payment terms - try to find by ID first, then fallback to value
        if (paymentTermsField) {
            const paymentTermId = supplier.default_payment_terms;
            if (paymentTermId && this.availablePaymentTerms.length > 0) {
                const foundPaymentTerm = this.availablePaymentTerms.find(pt => pt.id == paymentTermId);
                if (foundPaymentTerm) {
                    paymentTermsField.value = foundPaymentTerm.id;
                } else {
                    paymentTermsField.value = '';
                }
            } else {
                paymentTermsField.value = '';
            }
        }
        
        // Set tax rate
        if (taxRateField) {
            taxRateField.value = supplier.default_tax_rate || '20.00';
        }

        // Show default values section
        this.showDefaultValuesSection(supplier);
    }

    showDefaultValuesSection(supplier) {
        const defaultValuesSection = document.getElementById('default-values-section');
        const defaultCurrency = document.getElementById('default-currency');
        const defaultPaymentTerms = document.getElementById('default-payment-terms');
        const defaultTaxRate = document.getElementById('default-tax-rate');
        
        // Set default values
        if (defaultCurrency) {
            defaultCurrency.textContent = supplier.default_currency ? this.getCurrencyDisplayName(supplier.default_currency) : 'Belirtilmemiş (TRY)';
        }
        if (defaultPaymentTerms) {
            const paymentTermId = supplier.default_payment_terms;
            if (paymentTermId && this.availablePaymentTerms.length > 0) {
                const foundPaymentTerm = this.availablePaymentTerms.find(pt => pt.id == paymentTermId);
                if (foundPaymentTerm) {
                    defaultPaymentTerms.textContent = foundPaymentTerm.name;
                } else {
                    defaultPaymentTerms.textContent = 'Belirtilmemiş';
                }
            } else {
                defaultPaymentTerms.textContent = 'Belirtilmemiş';
            }
        }
        if (defaultTaxRate) {
            defaultTaxRate.textContent = supplier.default_tax_rate ? `${supplier.default_tax_rate}%` : 'Belirtilmemiş (20%)';
        }

        // Set chosen values (initially same as default)
        this.updateChosenValues();

        // Show the section
        if (defaultValuesSection) {
            defaultValuesSection.style.display = 'block';
        }
    }

    updateChosenValues() {
        const currencySelect = document.getElementById('supplier-currency');
        const paymentTermsSelect = document.getElementById('supplier-payment-terms');
        const taxRateInput = document.getElementById('supplier-tax-rate');
        const chosenCurrency = document.getElementById('chosen-currency');
        const chosenPaymentTerms = document.getElementById('chosen-payment-terms');
        const chosenTaxRate = document.getElementById('chosen-tax-rate');

        if (chosenCurrency && currencySelect) {
            chosenCurrency.textContent = this.getCurrencyDisplayName(currencySelect.value);
        }
        if (chosenPaymentTerms && paymentTermsSelect) {
            const selectedPaymentTermId = paymentTermsSelect.value;
            if (selectedPaymentTermId && this.availablePaymentTerms.length > 0) {
                const foundPaymentTerm = this.availablePaymentTerms.find(pt => pt.id == selectedPaymentTermId);
                if (foundPaymentTerm) {
                    chosenPaymentTerms.textContent = foundPaymentTerm.name;
                } else {
                    chosenPaymentTerms.textContent = 'Seçilmedi';
                }
            } else {
                chosenPaymentTerms.textContent = 'Seçilmedi';
            }
        }
        if (chosenTaxRate && taxRateInput) {
            chosenTaxRate.textContent = taxRateInput.value ? `${taxRateInput.value}%` : 'Seçilmedi';
        }
    }

    getCurrencyDisplayName(currency) {
        const currencyNames = {
            'TRY': 'Türk Lirası (₺)',
            'USD': 'Amerikan Doları ($)',
            'EUR': 'Euro (€)',
            'GBP': 'İngiliz Sterlini (£)'
        };
        return currencyNames[currency] || currency;
    }

    getPaymentTermsDisplayName(paymentTerms) {
        const paymentTermsNames = {
            'immediate': 'Peşin',
            '30_days': '30 Gün Vadeli',
            '60_days': '60 Gün Vadeli',
            '90_days': '90 Gün Vadeli',
            'custom': 'Özel'
        };
        return paymentTermsNames[paymentTerms] || paymentTerms;
    }

    getPaymentTermsDisplayNameById(paymentTermId) {
        console.log('getPaymentTermsDisplayNameById called with:', paymentTermId);
        console.log('availablePaymentTerms:', this.availablePaymentTerms);
        if (paymentTermId && this.availablePaymentTerms.length > 0) {
            const foundPaymentTerm = this.availablePaymentTerms.find(pt => pt.id == paymentTermId);
            console.log('foundPaymentTerm:', foundPaymentTerm);
            if (foundPaymentTerm) {
                return foundPaymentTerm.name;
            }
        }
        return 'Belirtilmemiş';
    }

    clearSupplierForm() {
        const currencyField = document.getElementById('supplier-currency');
        const paymentTermsField = document.getElementById('supplier-payment-terms');
        const taxRateField = document.getElementById('supplier-tax-rate');

        if (currencyField) currencyField.value = '';
        if (paymentTermsField) paymentTermsField.value = '';
        if (taxRateField) taxRateField.value = '';
        
        // Clear dropdown selection
        if (this.supplierDropdown) {
            this.supplierDropdown.setValue('');
        }
    }

    populateSupplierForm(supplier) {
        // For editing existing suppliers, we need to show the supplier info display
        // since we can't edit the basic info (name, contact, phone, email)
        this.showSupplierInfoDisplay(supplier);
        this.showEditableFields();
        
        const currencyField = document.getElementById('supplier-currency');
        const paymentTermsField = document.getElementById('supplier-payment-terms');
        const taxRateField = document.getElementById('supplier-tax-rate');

        if (currencyField) currencyField.value = supplier.default_currency || 'TRY';
        
        // Set payment terms - try to find by ID first, then fallback to value
        if (paymentTermsField) {
            const paymentTermId = supplier.default_payment_terms;
            if (paymentTermId && this.availablePaymentTerms.length > 0) {
                const foundPaymentTerm = this.availablePaymentTerms.find(pt => pt.id == paymentTermId);
                if (foundPaymentTerm) {
                    paymentTermsField.value = foundPaymentTerm.id;
                } else {
                    paymentTermsField.value = '';
                }
            } else {
                paymentTermsField.value = '';
            }
        }
        
        // Set tax rate
        if (taxRateField) {
            taxRateField.value = supplier.default_tax_rate || '20.00';
        }
    }

    saveSupplier() {
        const form = document.getElementById('supplierForm');
        const editIndex = form.dataset.editIndex;
        const isApiSupplier = this.supplierDropdown && this.supplierDropdown.getValue();

        // Check if supplier is selected for new suppliers
        if (!editIndex && !isApiSupplier) {
            this.showNotification('Lütfen bir tedarikçi seçin.', 'error');
            return;
        }

        // Get editable form values
        const currencyField = document.getElementById('supplier-currency');
        const paymentTermsField = document.getElementById('supplier-payment-terms');
        const taxRateField = document.getElementById('supplier-tax-rate');
        const currency = currencyField ? currencyField.value : '';
        const paymentTerms = paymentTermsField ? paymentTermsField.value : '';
        const taxRate = taxRateField ? parseFloat(taxRateField.value) : 0;

        // Validate required fields
        const errors = [];
        if (!currency) {
            errors.push('Para birimi seçimi zorunludur');
        }
        if (!paymentTerms) {
            errors.push('Ödeme koşulları seçimi zorunludur');
        }
        if (!taxRateField.value || isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
            errors.push('Geçerli bir vergi oranı giriniz (0-100 arası)');
        }

        // Show errors if any
        if (errors.length > 0) {
            this.showNotification('Lütfen aşağıdaki hataları düzeltin:\n' + errors.join('\n'), 'error');
            return;
        }

        let supplier;

        if (isApiSupplier && !editIndex) {
            // API supplier selected - get data from display fields
            const nameDisplay = document.getElementById('display-supplier-name');
            const contactDisplay = document.getElementById('display-supplier-contact');
            const phoneDisplay = document.getElementById('display-supplier-phone');
            const emailDisplay = document.getElementById('display-supplier-email');

            const name = nameDisplay ? nameDisplay.textContent : '';
            const contact = contactDisplay ? contactDisplay.textContent : '';
            const phone = phoneDisplay ? phoneDisplay.textContent : '';
            const email = emailDisplay ? emailDisplay.textContent : '';

            // Remove '-' values
            const cleanName = name === '-' ? '' : name;
            const cleanContact = contact === '-' ? '' : contact;
            const cleanPhone = phone === '-' ? '' : phone;
            const cleanEmail = email === '-' ? '' : email;

            // Get the selected supplier ID from dropdown
            const selectedSupplierId = this.supplierDropdown ? this.supplierDropdown.getValue() : null;
            
            supplier = {
                id: this.generateSupplierId(),
                name: cleanName,
                contact_person: cleanContact,
                phone: cleanPhone,
                email: cleanEmail,
                default_currency: currency,
                default_payment_terms: paymentTerms,
                default_tax_rate: taxRate
            };
        } else {
            // Editing existing supplier - get data from display fields
            const nameDisplay = document.getElementById('display-supplier-name');
            const contactDisplay = document.getElementById('display-supplier-contact');
            const phoneDisplay = document.getElementById('display-supplier-phone');
            const emailDisplay = document.getElementById('display-supplier-email');

            const name = nameDisplay ? nameDisplay.textContent : '';
            const contact = contactDisplay ? contactDisplay.textContent : '';
            const phone = phoneDisplay ? phoneDisplay.textContent : '';
            const email = emailDisplay ? emailDisplay.textContent : '';

            // Remove '-' values
            const cleanName = name === '-' ? '' : name;
            const cleanContact = contact === '-' ? '' : contact;
            const cleanPhone = phone === '-' ? '' : phone;
            const cleanEmail = email === '-' ? '' : email;

            supplier = {
                id: editIndex !== undefined ? this.requestData.suppliers[editIndex].id : this.generateSupplierId(),
                name: cleanName,
                contact_person: cleanContact,
                phone: cleanPhone,
                email: cleanEmail,
                default_currency: currency,
                default_payment_terms: paymentTerms,
                default_tax_rate: taxRate
            };
        }

        if (editIndex !== undefined) {
            // Update existing supplier
            this.requestData.suppliers[editIndex] = supplier;
        } else {
            // Add new supplier
            this.requestData.suppliers.push(supplier);
        }

        this.renderSuppliersContainer();
        
        // Save immediately instead of using delayed autoSave
        this.saveImmediately();
        
        // Debug: Log the saved supplier data
        console.log('Saved supplier data:', supplier);
        console.log('All suppliers after save:', this.requestData.suppliers);

        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('supplierModal')).hide();
        
        // Reset dropdown selection
        if (this.supplierDropdown) {
            this.supplierDropdown.setValue('');
        }
    }

    deleteSupplier(index) {
        if (confirm('Bu tedarikçiyi silmek istediğinizden emin misiniz? Tüm teklif verileri de silinecektir.')) {
            const supplier = this.requestData.suppliers[index];
            delete this.requestData.offers[supplier.id];
            delete this.requestData.recommendations[supplier.id];
            this.requestData.suppliers.splice(index, 1);
            
            this.renderSuppliersContainer();
            this.saveImmediately();
        }
    }

    clearAllSuppliers() {
        if (!this.requestData.suppliers.length) return;
        if (confirm('Tüm tedarikçileri ve ilişkili teklif verilerini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
            this.requestData.suppliers = [];
            this.requestData.offers = {};
            this.requestData.recommendations = {};
            this.renderSuppliersContainer();
            this.saveImmediately();
        }
    }

    renderSuppliersContainer() {
        const container = document.getElementById('suppliers-container');
        container.innerHTML = '';

        console.log('Rendering suppliers container with data:', this.requestData.suppliers);

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
                        <div class="supplier-info-value">${supplier.contact_person || '-'}</div>
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
                        <div class="supplier-info-value">${this.currencySymbols[supplier.default_currency || 'TRY']} ${supplier.default_currency || 'TRY'}</div>
                    </div>
                    <div class="supplier-info-item">
                        <div class="supplier-info-label">Ödeme Koşulları</div>
                        <div class="supplier-info-value">
                            ${this.getPaymentTermsDisplayNameById(supplier.default_payment_terms)}
                        </div>
                    </div>
                    <div class="supplier-info-item">
                        <div class="supplier-info-label">Vergi Oranı</div>
                        <div class="supplier-info-value">${supplier.default_tax_rate ? `${supplier.default_tax_rate}%` : 'Belirtilmemiş (20%)'}</div>
                    </div>
                </div>
                <div class="supplier-actions">
                    <button class="btn btn-primary btn-sm offer-btn" data-supplier-id="${supplier.id}">
                        <i class="fas fa-dollar-sign me-1"></i>Teklif Gir
                    </button>
                    <button class="btn btn-outline-primary btn-sm edit-btn" data-supplier-index="${index}">
                        <i class="fas fa-edit me-1"></i>Düzenle
                    </button>
                    <button class="btn btn-outline-danger btn-sm delete-btn" data-supplier-index="${index}">
                        <i class="fas fa-trash me-1"></i>Sil
                    </button>
                </div>
            `;
            
            container.appendChild(card);
            
            // Add event listeners directly to the buttons in this card
            const offerBtn = card.querySelector('.offer-btn');
            const editBtn = card.querySelector('.edit-btn');
            const deleteBtn = card.querySelector('.delete-btn');
            
            if (offerBtn) {
                offerBtn.addEventListener('click', () => {
                    this.showOfferModal(supplier.id);
                });
            }
            
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    this.editSupplier(index);
                });
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    this.deleteSupplier(index);
                });
            }
        });
        
    }

    editSupplier(index) {
        this.showSupplierModal(index);
    }

    generateSupplierId() {
        return 'supplier_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    saveImmediately() {
        // Save to localStorage immediately
        try {
            const draftData = {
                title: this.requestData.title,
                description: this.requestData.description,
                priority: this.requestData.priority,
                items: this.requestData.items,
                suppliers: this.requestData.suppliers,
                offers: this.requestData.offers,
                recommendations: this.requestData.recommendations,
                itemRecommendations: this.requestData.itemRecommendations,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('purchaseRequestDraft', JSON.stringify(draftData));
            console.log('Data saved immediately to localStorage');
            
            // Update comparison table when supplier data changes
            if (window.comparisonTable) {
                window.comparisonTable.setData({
                    items: this.requestData.items,
                    suppliers: this.requestData.suppliers,
                    offers: this.requestData.offers,
                    itemRecommendations: this.requestData.itemRecommendations
                });
            }
            
            // Call the autoSave callback to trigger renderAll
            if (this.autoSave) {
                this.autoSave();
            }
        } catch (error) {
            console.error('Error saving data immediately:', error);
        }
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

    // Offer Modal Methods
    showOfferModal(supplierId) {
        const supplier = this.requestData.suppliers.find(s => s.id === supplierId);
        if (!supplier) return;

        const modalElement = document.getElementById('offerModal');
        const modal = new bootstrap.Modal(modalElement);
        
        document.getElementById('offer-supplier-name').textContent = supplier.name;
        document.getElementById('offer-currency').textContent = `${this.currencySymbols[supplier.default_currency || 'TRY']} ${supplier.default_currency || 'TRY'}`;

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
                     <input type="number" class="form-control form-control-sm unit-price-input" 
                            step="0.01" min="0" 
                            value="${existingOffer.unitPrice || ''}"
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
        
        // Add real-time validation listeners
        this.setupOfferValidationListeners();
        
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

         setupOfferValidationListeners() {
         const tbody = document.getElementById('offer-tbody');
         if (!tbody) return;
 
         tbody.querySelectorAll('tr').forEach((row, index) => {
             const inputs = row.querySelectorAll('input');
             const unitPriceInput = inputs[0];
             const deliveryDaysInput = inputs[1];
             const notesInput = inputs[2];
 
             // Add validation listeners for unit price
             if (unitPriceInput) {
                 unitPriceInput.addEventListener('input', () => {
                     this.validateOfferRow(row, index);
                     this.updateOfferTotal(unitPriceInput, index);
                 });
                 
                 // Add keyboard navigation
                 unitPriceInput.addEventListener('keydown', (e) => {
                     this.handleKeyboardNavigation(e, index, 0, tbody);
                 });
             }
 
             // Add validation listeners for delivery days
             if (deliveryDaysInput) {
                 deliveryDaysInput.addEventListener('input', () => {
                     this.validateOfferRow(row, index);
                 });
                 
                 // Add keyboard navigation
                 deliveryDaysInput.addEventListener('keydown', (e) => {
                     this.handleKeyboardNavigation(e, index, 1, tbody);
                 });
             }
             
             // Add keyboard navigation for notes input
             if (notesInput) {
                 notesInput.addEventListener('keydown', (e) => {
                     this.handleKeyboardNavigation(e, index, 2, tbody);
                 });
             }
         });
     }

    handleKeyboardNavigation(e, currentRowIndex, currentColIndex, tbody) {
        const rows = tbody.querySelectorAll('tr');
        const totalRows = rows.length;
        const totalCols = 3; // unit price, delivery days, notes
        
        let targetRowIndex = currentRowIndex;
        let targetColIndex = currentColIndex;
        
        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                if (currentRowIndex > 0) {
                    targetRowIndex = currentRowIndex - 1;
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (currentRowIndex < totalRows - 1) {
                    targetRowIndex = currentRowIndex + 1;
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (currentColIndex > 0) {
                    targetColIndex = currentColIndex - 1;
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (currentColIndex < totalCols - 1) {
                    targetColIndex = currentColIndex + 1;
                }
                break;
            default:
                return; // Don't prevent default for other keys
        }
        
        // Focus the target input
        const targetRow = rows[targetRowIndex];
        if (targetRow) {
            const targetInputs = targetRow.querySelectorAll('input');
            const targetInput = targetInputs[targetColIndex];
            if (targetInput) {
                targetInput.focus();
                targetInput.select(); // Select all text for easy editing
            }
        }
    }

    validateOfferRow(row, index) {
        const inputs = row.querySelectorAll('input');
        const unitPriceInput = inputs[0];
        const deliveryDaysInput = inputs[1];

        const unitPrice = parseFloat(unitPriceInput.value) || 0;
        const deliveryDays = parseInt(deliveryDaysInput.value) || 0;

        // Remove existing validation classes
        unitPriceInput.classList.remove('is-valid', 'is-invalid');
        deliveryDaysInput.classList.remove('is-valid', 'is-invalid');

        // Apply validation classes
        if (unitPrice > 0) {
            unitPriceInput.classList.add('is-valid');
        } else if (unitPriceInput.value !== '') {
            unitPriceInput.classList.add('is-invalid');
        }

        if (deliveryDays > 0) {
            deliveryDaysInput.classList.add('is-valid');
        } else if (deliveryDaysInput.value !== '') {
            deliveryDaysInput.classList.add('is-invalid');
        }
    }

    saveOffer() {
        const supplierId = document.getElementById('offerModal').dataset.supplierId;
        const tbody = document.getElementById('offer-tbody');
        const offers = {};

        // Validate that at least one row has both unit price and delivery days
        let hasValidOffer = false;
        const validationErrors = [];

        tbody.querySelectorAll('tr').forEach((row, index) => {
            const inputs = row.querySelectorAll('input');
            const unitPrice = parseFloat(inputs[0].value) || 0;
            const deliveryDays = parseInt(inputs[1].value) || 0;
            const item = this.requestData.items[index];
            const totalPrice = unitPrice * item.quantity;
            
            // Check if this row has both unit price and delivery days
            if (unitPrice > 0 && deliveryDays > 0) {
                hasValidOffer = true;
            }
            
            // Collect validation errors for individual rows
            if (unitPrice > 0 && deliveryDays === 0) {
                validationErrors.push(`Satır ${index + 1}: Birim fiyat girildi ancak teslimat süresi girilmedi`);
            }
            if (unitPrice === 0 && deliveryDays > 0) {
                validationErrors.push(`Satır ${index + 1}: Teslimat süresi girildi ancak birim fiyat girilmedi`);
            }
            
            offers[index] = {
                unitPrice: unitPrice,
                totalPrice: totalPrice,
                deliveryDays: deliveryDays,
                notes: inputs[2].value
            };
        });

        // Check if at least one complete offer exists
        if (!hasValidOffer) {
            this.showNotification('En az bir satır için hem birim fiyat hem de teslimat süresi girilmelidir.', 'error');
            return;
        }

        // Show warnings for incomplete rows if any
        if (validationErrors.length > 0) {
            this.showNotification('Bazı satırlarda eksik bilgi var:\n' + validationErrors.join('\n'), 'warning');
        }

        this.requestData.offers[supplierId] = offers;
        
        this.renderSuppliersContainer();
        this.saveImmediately();
        
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

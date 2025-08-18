// Validation Manager Module
export class ValidationManager {
    constructor() {
        this.validationRules = {
            'request-title': {
                required: true,
                minLength: 3,
                maxLength: 100,
                messages: {
                    required: 'Talep başlığı zorunludur',
                    minLength: 'Talep başlığı en az 3 karakter olmalıdır',
                    maxLength: 'Talep başlığı en fazla 100 karakter olabilir'
                }
            },
            'request-description': {
                required: false,
                minLength: 0,
                maxLength: 500,
                messages: {
                    maxLength: 'Talep açıklaması en fazla 500 karakter olabilir'
                }
            }
        };
        
        // Track validation state for each field
        this.fieldValidationState = {};
        
        // Track if validation has been triggered
        this.validationTriggered = false;
    }

    // Validate a single field
    validateField(fieldId, value) {
        const rules = this.validationRules[fieldId];
        if (!rules) return { isValid: true, message: '' };

        const errors = [];

        // Required validation
        if (rules.required && (!value || value.trim() === '')) {
            errors.push(rules.messages.required);
        }

        // Min length validation
        if (value && rules.minLength && value.trim().length < rules.minLength) {
            errors.push(rules.messages.minLength);
        }

        // Max length validation
        if (value && rules.maxLength && value.trim().length > rules.maxLength) {
            errors.push(rules.messages.maxLength);
        }

        const result = {
            isValid: errors.length === 0,
            message: errors[0] || ''
        };
        
        // Store validation state
        this.fieldValidationState[fieldId] = result;
        
        return result;
    }

    // Show field validation state
    showFieldValidation(fieldId, isValid, message = '') {
        const field = document.getElementById(fieldId);
        if (!field) return;

        const label = document.querySelector(`label[for="${fieldId}"]`);
        const feedbackId = `${fieldId}-feedback`;
        
        // Remove existing feedback
        const existingFeedback = document.getElementById(feedbackId);
        if (existingFeedback) {
            existingFeedback.remove();
        }

        // Remove existing validation classes
        field.classList.remove('is-valid', 'is-invalid');
        if (label) {
            label.classList.remove('has-success', 'has-error');
        }

        // Add validation classes - only show success for required fields
        const rules = this.validationRules[fieldId];
        if (isValid) {
            // Only show success state for required fields
            if (rules && rules.required) {
                field.classList.add('is-valid');
                if (label) {
                    label.classList.add('has-success');
                }
            }
        } else {
            field.classList.add('is-invalid');
            if (label) {
                label.classList.add('has-error');
            }
        }

        // Add feedback message if there's an error
        if (!isValid && message) {
            const feedback = document.createElement('div');
            feedback.id = feedbackId;
            feedback.className = 'invalid-feedback';
            feedback.textContent = message;
            
            // Insert after the field
            field.parentNode.appendChild(feedback);
        }
    }

    // Clear field validation state
    clearFieldValidation(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        const label = document.querySelector(`label[for="${fieldId}"]`);
        const feedbackId = `${fieldId}-feedback`;
        
        // Remove validation classes
        field.classList.remove('is-valid', 'is-invalid');
        if (label) {
            label.classList.remove('has-success', 'has-error');
        }

        // Remove feedback
        const existingFeedback = document.getElementById(feedbackId);
        if (existingFeedback) {
            existingFeedback.remove();
        }
        
        // Clear validation state
        delete this.fieldValidationState[fieldId];
    }

    // Validate all fields
    validateAllFields(formData) {
        const results = {};
        let allValid = true;

        Object.keys(this.validationRules).forEach(fieldId => {
            const value = formData[fieldId] || '';
            const validation = this.validateField(fieldId, value);
            
            results[fieldId] = validation;
            if (!validation.isValid) {
                allValid = false;
            }
        });

        return {
            isValid: allValid,
            results: results
        };
    }

    // Show validation for all fields
    showAllFieldValidations(formData) {
        let firstErrorField = null;
        
        Object.keys(this.validationRules).forEach(fieldId => {
            const value = formData[fieldId] || '';
            const validation = this.validateField(fieldId, value);
            this.showFieldValidation(fieldId, validation.isValid, validation.message);
            
            // Track the first error field for scrolling
            if (!validation.isValid && !firstErrorField) {
                firstErrorField = document.getElementById(fieldId);
            }
        });
        
        return firstErrorField;
    }

    // Clear all field validations
    clearAllFieldValidations() {
        Object.keys(this.validationRules).forEach(fieldId => {
            this.clearFieldValidation(fieldId);
        });
        
        // Also clear item recommendation marks
        this.clearItemRecommendationMarks();
        
        // Reset validation state
        this.fieldValidationState = {};
        this.validationTriggered = false;
    }

    // Setup real-time validation for a field
    setupFieldValidation(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        // Validate on input and show feedback immediately
        field.addEventListener('input', () => {
            const value = field.value;
            const validation = this.validateField(fieldId, value);
            
            // Always show validation feedback on input
            this.showFieldValidation(fieldId, validation.isValid, validation.message);
        });

        // Validate on blur
        field.addEventListener('blur', () => {
            const value = field.value;
            const validation = this.validateField(fieldId, value);
            this.showFieldValidation(fieldId, validation.isValid, validation.message);
        });
    }

    // Setup validation for all fields
    setupAllFieldValidations() {
        Object.keys(this.validationRules).forEach(fieldId => {
            this.setupFieldValidation(fieldId);
        });
    }

    // Validate items data
    validateItems(items) {
        const errors = [];
        
        if (!items || items.length === 0) {
            errors.push('En az bir malzeme eklemelisiniz');
            return { isValid: false, errors };
        }

        items.forEach((item, index) => {
            // Check required fields
            if (!item.code || item.code.trim() === '') {
                errors.push(`Malzeme ${index + 1}: Malzeme kodu zorunludur`);
            }
            
            if (!item.name || item.name.trim() === '') {
                errors.push(`Malzeme ${index + 1}: Malzeme adı zorunludur`);
            }
            
            if (!item.job_no || item.job_no.trim() === '') {
                errors.push(`Malzeme ${index + 1}: İş numarası zorunludur`);
            }
            
            if (!item.quantity || item.quantity <= 0) {
                errors.push(`Malzeme ${index + 1}: Miktar zorunludur ve 0'dan büyük olmalıdır`);
            }
            
            // Check if quantity is integer when unit is 'adet'
            if (item.unit === 'adet' && item.quantity && !Number.isInteger(parseFloat(item.quantity))) {
                errors.push(`Malzeme ${index + 1}: 'Adet' birimi için miktar tam sayı olmalıdır`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Validate suppliers data
    validateSuppliers(suppliers) {
        const errors = [];
        
        if (!suppliers || suppliers.length < 2) {
            errors.push('En az 2 tedarikçi eklemelisiniz');
            return { isValid: false, errors };
        }

        suppliers.forEach((supplier, index) => {
            if (!supplier.name || supplier.name.trim() === '') {
                errors.push(`Tedarikçi ${index + 1}: Tedarikçi adı zorunludur`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Comprehensive validation for all data
    validateAllData(formData, items, suppliers, itemRecommendations, offers) {
        const errors = [];
        
        // Mark that validation has been triggered
        this.validationTriggered = true;
        
        // Validate form fields
        const formValidation = this.validateAllFields(formData);
        if (!formValidation.isValid) {
            Object.values(formValidation.results).forEach(result => {
                if (!result.isValid && result.message) {
                    errors.push(result.message);
                }
            });
        }
        
        // Validate items
        const itemsValidation = this.validateItems(items);
        if (!itemsValidation.isValid) {
            errors.push(...itemsValidation.errors);
        }
        
        // Validate suppliers
        const suppliersValidation = this.validateSuppliers(suppliers);
        if (!suppliersValidation.isValid) {
            errors.push(...suppliersValidation.errors);
        }
        
        // Validate that all items have offers
        const offersValidation = this.validateItemOffers(items, offers, suppliers);
        if (!offersValidation.isValid) {
            errors.push(...offersValidation.errors);
        }
        
        // Validate recommendations
        const recommendationsValidation = this.validateRecommendations(items, itemRecommendations, offers, suppliers);
        if (!recommendationsValidation.isValid) {
            errors.push(...recommendationsValidation.errors);
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Validate that all items have offers
    validateItemOffers(items, offers, suppliers) {
        const errors = [];
        
        if (!items || items.length === 0) {
            return { isValid: true, errors: [] };
        }

        items.forEach((item, index) => {
            if (!this.hasAnyOffer(index, offers, suppliers)) {
                errors.push(`Malzeme ${index + 1}: Bu malzeme için hiçbir tedarikçiden teklif bulunmamaktadır`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Validate recommendations
    validateRecommendations(items, itemRecommendations, offers, suppliers) {
        const errors = [];
        
        if (!items || items.length === 0) {
            return { isValid: true, errors: [] };
        }

        items.forEach((item, index) => {
            if (!this.hasValidRecommendation(index, itemRecommendations, offers, suppliers)) {
                errors.push(`Malzeme ${index + 1}: Bu malzeme için tedarikçi önerisi seçmelisiniz`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // Helper method to check if item has any offer
    hasAnyOffer(itemIndex, offers, suppliers) {
        if (!offers || !suppliers) return false;
        
        return suppliers.some(supplier => {
            const supplierOffers = offers[supplier.id];
            return supplierOffers && supplierOffers[itemIndex] && supplierOffers[itemIndex].totalPrice > 0;
        });
    }

    // Helper method to check if item has valid recommendation
    hasValidRecommendation(itemIndex, itemRecommendations, offers, suppliers) {
        if (!itemRecommendations || !itemRecommendations[itemIndex] || !offers || !suppliers) {
            return false;
        }
        
        const recommendedSupplierId = itemRecommendations[itemIndex];
        const supplierOffers = offers[recommendedSupplierId];
        return supplierOffers && supplierOffers[itemIndex] && supplierOffers[itemIndex].totalPrice > 0;
    }

    // Mark items without recommendations and offers visually and show errors on table
    markItemsWithoutRecommendations(items, itemRecommendations, offers, suppliers) {
        if (!items || items.length === 0) return;

        // Get the comparison table tbody
        const comparisonTbody = document.getElementById('comparison-tbody');
        if (!comparisonTbody) {
            console.warn('Comparison table not found. Items cannot be marked for missing recommendations.');
            return;
        }

        // Get all rows from the comparison table
        const comparisonRows = comparisonTbody.querySelectorAll('tr');
        
        if (comparisonRows.length === 0) {
            console.warn('No comparison table rows found. Items cannot be marked for missing recommendations.');
            return;
        }
        
        // Clear any existing error messages
        this.clearTableErrorMessages();
        
        let firstErrorElement = null;
        
        items.forEach((item, index) => {
            const row = comparisonRows[index];
            if (!row) return;

            const hasAnyOffer = this.hasAnyOffer(index, offers, suppliers);
            const hasValidRecommendation = this.hasValidRecommendation(index, itemRecommendations, offers, suppliers);
            
            let hasError = false;
            let errorMessage = '';
            let errorType = '';
            
            if (!hasAnyOffer) {
                // Add visual indication for items without offers
                row.classList.add('item-no-offer');
                row.style.backgroundColor = '#f8d7da';
                row.style.borderLeft = '4px solid #dc3545';
                hasError = true;
                errorMessage = `Bu malzeme için hiçbir tedarikçiden teklif bulunmamaktadır`;
                errorType = 'no-offer';
            } else if (!hasValidRecommendation) {
                // Add visual indication for items without recommendations
                row.classList.add('item-no-recommendation');
                row.style.backgroundColor = '#fff3cd';
                row.style.borderLeft = '4px solid #ffc107';
                hasError = true;
                errorMessage = `Bu malzeme için tedarikçi önerisi seçmelisiniz`;
                errorType = 'no-recommendation';
            } else {
                // Remove visual indication if item has both offers and recommendations
                row.classList.remove('item-no-recommendation', 'item-no-offer');
                row.style.backgroundColor = '';
                row.style.borderLeft = '';
            }
            
            // Add error message if there's an error
            if (hasError) {
                this.addTableErrorMessage(row, errorMessage, errorType);
                
                // Track the first error element for scrolling
                if (!firstErrorElement) {
                    firstErrorElement = row;
                }
            }
        });
        
        // Return the first error element for scrolling
        return firstErrorElement;
    }
    
    // Add error message to a table row
    addTableErrorMessage(row, message, errorType) {
        // Remove any existing error indicators
        const existingIndicator = row.querySelector('.table-error-icon');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Create warning icon
        const errorIcon = document.createElement('div');
        errorIcon.className = `table-error-icon ${errorType}`;
        errorIcon.setAttribute('data-tooltip', message);
        errorIcon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        
        // Add the icon to the first cell of the row for proper positioning
        const firstCell = row.querySelector('td:first-child');
        if (firstCell) {
            // Ensure the first cell has relative positioning
            firstCell.style.position = 'relative';
            firstCell.appendChild(errorIcon);
        } else {
            // Fallback: add to the row itself
            row.style.position = 'relative';
            row.appendChild(errorIcon);
        }
        
        return errorIcon;
    }
    
    // Clear all table error messages
    clearTableErrorMessages() {
        const errorMessages = document.querySelectorAll('.table-error-icon');
        errorMessages.forEach(error => error.remove());
    }

    // Clear visual marks from items
    clearItemRecommendationMarks() {
        const markedItems = document.querySelectorAll('.item-no-recommendation, .item-no-offer');
        markedItems.forEach(item => {
            item.classList.remove('item-no-recommendation', 'item-no-offer');
            item.style.backgroundColor = '';
            item.style.borderLeft = '';
        });
        
        // Also clear any inline styles from comparison table rows
        const comparisonTbody = document.getElementById('comparison-tbody');
        if (comparisonTbody) {
            const comparisonRows = comparisonTbody.querySelectorAll('tr');
            comparisonRows.forEach(row => {
                row.style.backgroundColor = '';
                row.style.borderLeft = '';
            });
        }
        
        // Clear table error messages
        this.clearTableErrorMessages();
    }
    
    // Scroll to the first error element
    scrollToFirstError(formErrorField, tableErrorElement) {
        // Determine which error to scroll to (prioritize form errors over table errors)
        const targetElement = formErrorField || tableErrorElement;
        
        if (targetElement) {
            // Smooth scroll to the element with some offset for better visibility
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            
            // Add a brief highlight effect
            targetElement.style.transition = 'box-shadow 0.3s ease';
            targetElement.style.boxShadow = '0 0 0 3px rgba(220, 53, 69, 0.3)';
            
            setTimeout(() => {
                targetElement.style.boxShadow = '';
            }, 2000);
        }
    }
    
    // Clear specific error for an item
    clearItemError(itemIndex) {
        const comparisonTbody = document.getElementById('comparison-tbody');
        if (!comparisonTbody) return;
        
        const comparisonRows = comparisonTbody.querySelectorAll('tr');
        if (comparisonRows[itemIndex]) {
            const row = comparisonRows[itemIndex];
            
            // Remove visual marks
            row.classList.remove('item-no-recommendation', 'item-no-offer');
            row.style.backgroundColor = '';
            row.style.borderLeft = '';
            
            // Remove error icon
            const errorIcon = row.querySelector('.table-error-icon');
            if (errorIcon) {
                errorIcon.remove();
            }
        }
    }
    
    // Re-validate and update specific item
    revalidateItem(itemIndex, items, itemRecommendations, offers, suppliers) {
        if (!items || !items[itemIndex]) return;
        
        // Clear any existing errors for this item
        this.clearItemError(itemIndex);
        
        const hasAnyOffer = this.hasAnyOffer(itemIndex, offers, suppliers);
        const hasValidRecommendation = this.hasValidRecommendation(itemIndex, itemRecommendations, offers, suppliers);
        
        let hasError = false;
        let errorMessage = '';
        let errorType = '';
        
        if (!hasAnyOffer) {
            hasError = true;
            errorMessage = `Bu malzeme için hiçbir tedarikçi teklifi bulunmamaktadır`;
            errorType = 'no-offer';
        } else if (!hasValidRecommendation) {
            hasError = true;
            errorMessage = `Bu malzeme için tedarikçi önerisi seçmelisiniz`;
            errorType = 'no-recommendation';
        }
        
        // If there's still an error, show it
        if (hasError) {
            const comparisonTbody = document.getElementById('comparison-tbody');
            if (comparisonTbody) {
                const comparisonRows = comparisonTbody.querySelectorAll('tr');
                if (comparisonRows[itemIndex]) {
                    const row = comparisonRows[itemIndex];
                    
                    // Add visual mark
                    row.classList.add(`item-${errorType}`);
                    
                    // Add error icon
                    this.addTableErrorMessage(row, errorMessage, errorType);
                }
            }
        }
    }
    
    // Check if a specific field has validation errors
    hasFieldError(fieldId) {
        return this.fieldValidationState[fieldId] && !this.fieldValidationState[fieldId].isValid;
    }
    
    // Get all current validation errors
    getAllValidationErrors() {
        const errors = [];
        
        // Add field validation errors
        Object.values(this.fieldValidationState).forEach(state => {
            if (!state.isValid && state.message) {
                errors.push(state.message);
            }
        });
        
        return errors;
    }
    
    // Check if a specific item error should be cleared
    shouldClearItemError(itemIndex, items, itemRecommendations, offers, suppliers) {
        if (!items || !items[itemIndex]) return true;
        
        const hasAnyOffer = this.hasAnyOffer(itemIndex, offers, suppliers);
        const hasValidRecommendation = this.hasValidRecommendation(itemIndex, itemRecommendations, offers, suppliers);
        
        return hasAnyOffer && hasValidRecommendation;
    }
    
    // Smart clear validation - only clear errors that are resolved
    smartClearValidation(items, itemRecommendations, offers, suppliers) {
        // Clear field validations that are now valid
        Object.keys(this.fieldValidationState).forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                const value = field.value;
                const validation = this.validateField(fieldId, value);
                if (validation.isValid) {
                    this.clearFieldValidation(fieldId);
                }
            }
        });
        
        // Clear item errors that are now resolved
        if (items && items.length > 0) {
            items.forEach((item, index) => {
                if (this.shouldClearItemError(index, items, itemRecommendations, offers, suppliers)) {
                    this.clearItemError(index);
                }
            });
        }
    }
}

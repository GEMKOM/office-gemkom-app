// Excel Parser for Bulk Material Import
// This module handles Excel file parsing for the procurement bulk import feature

export class ExcelParser {
    constructor() {
        this.validUnits = ['adet', 'kg', 'metre', 'litre', 'paket', 'kutu'];
        this.validPriorities = ['normal', 'acil', 'kritik'];
    }

    /**
     * Parse Excel file and extract material data
     * @param {File} file - The Excel file to parse
     * @returns {Promise<Array>} Promise that resolves to array of parsed materials
     */
    async parseExcelFile(file) {
        try {
            // Check if file is Excel format
            if (!this.isExcelFile(file)) {
                throw new Error('Lütfen geçerli bir Excel dosyası seçin (.xlsx veya .xls)');
            }

            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            const workbook = await this.parseWorkbook(arrayBuffer);
            const materials = this.extractMaterialsFromWorkbook(workbook);

            return materials;
        } catch (error) {
            console.error('Excel parsing error:', error);
            throw error;
        }
    }

    /**
     * Check if file is Excel format
     * @param {File} file - File to check
     * @returns {boolean} True if file is Excel format
     */
    isExcelFile(file) {
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel' // .xls
        ];
        const validExtensions = ['.xlsx', '.xls'];
        
        return validTypes.includes(file.type) || 
               validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    }

    /**
     * Read file as ArrayBuffer
     * @param {File} file - File to read
     * @returns {Promise<ArrayBuffer>} Promise that resolves to ArrayBuffer
     */
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Dosya okuma hatası'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Parse Excel workbook using SheetJS library
     * @param {ArrayBuffer} arrayBuffer - File data as ArrayBuffer
     * @returns {Promise<Object>} Promise that resolves to workbook object
     */
    async parseWorkbook(arrayBuffer) {
        try {
            // Check if SheetJS is available
            if (typeof XLSX === 'undefined') {
                throw new Error('SheetJS kütüphanesi yüklenmemiş. Lütfen sayfayı yenileyin.');
            }

            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            return workbook;
        } catch (error) {
            throw new Error('Excel dosyası okunamadı: ' + error.message);
        }
    }

    /**
     * Extract materials from workbook
     * @param {Object} workbook - Parsed workbook object
     * @returns {Array} Array of parsed materials
     */
    extractMaterialsFromWorkbook(workbook) {
        const materials = [];
        const sheetName = workbook.SheetNames[0]; // Use first sheet
        const worksheet = workbook.Sheets[sheetName];
        
        if (!worksheet) {
            throw new Error('Excel dosyasında veri bulunamadı');
        }

        // Convert worksheet to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
            throw new Error('Excel dosyasında yeterli veri bulunamadı (en az 1 satır veri gerekli)');
        }

        // Find column indices
        const headerRow = jsonData[0];
        const columnMap = this.mapColumns(headerRow);
        
        // Parse data rows
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row.length === 0) continue; // Skip empty rows
            
            const material = this.parseMaterialRow(row, columnMap, i);
            if (material) {
                materials.push(material);
                console.log(material);
            }
        }

        return materials;
    }

    /**
     * Map Excel columns to material properties
     * @param {Array} headerRow - First row of Excel data
     * @returns {Object} Column mapping object
     */
    mapColumns(headerRow) {
        const columnMap = {
            code: -1,
            name: -1,
            quantity: -1,
            unit: -1,
            priority: -1
        };

        headerRow.forEach((header, index) => {
            if (!header) return;
            
            const headerStr = header.toString().toLowerCase().trim();
            
            // Map column names
            if (headerStr.includes('stok') && headerStr.includes('kod')) {
                columnMap.code = index;
            } else if (headerStr === 'ad' || headerStr.includes('malzeme') && headerStr.includes('ad')) {
                columnMap.name = index;
            } else if (headerStr === 'miktar') {
                columnMap.quantity = index;
            } else if (headerStr === 'birim') {
                columnMap.unit = index;
            } else if (headerStr.includes('öncelik') || headerStr.includes('oncelik')) {
                columnMap.priority = index;
            }
        });

        // Validate required columns
        if (columnMap.code === -1) {
            throw new Error('Stok kodu sütunu bulunamadı');
        }
        if (columnMap.name === -1) {
            throw new Error('Malzeme adı sütunu bulunamadı');
        }
        if (columnMap.quantity === -1) {
            throw new Error('Miktar sütunu bulunamadı');
        }

        return columnMap;
    }

    /**
     * Parse a single material row
     * @param {Array} row - Data row from Excel
     * @param {Object} columnMap - Column mapping
     * @param {number} rowIndex - Row index for error reporting
     * @returns {Object|null} Parsed material object or null if invalid
     */
    parseMaterialRow(row, columnMap, rowIndex) {
        try {
            const material = {
                code: this.getCellValue(row, columnMap.code),
                name: this.getCellValue(row, columnMap.name),
                quantity: this.parseQuantity(this.getCellValue(row, columnMap.quantity)),
                unit: this.getCellValue(row, columnMap.unit) || 'adet',
                priority: this.getCellValue(row, columnMap.priority) || 'normal',
                specifications: '',
                isValid: true,
                errorMessage: '',
                rowIndex: rowIndex + 1 // Excel row number (1-based)
            };

            // Validate material
            this.validateMaterial(material);

            return material;
        } catch (error) {
            console.warn(`Row ${rowIndex + 1} parsing error:`, error);
            return null;
        }
    }

    /**
     * Get cell value safely
     * @param {Array} row - Data row
     * @param {number} columnIndex - Column index
     * @returns {string} Cell value as string
     */
    getCellValue(row, columnIndex) {
        if (columnIndex === -1 || columnIndex >= row.length) {
            return '';
        }
        
        const value = row[columnIndex];
        if (value === null || value === undefined) {
            return '';
        }
        
        return value.toString().trim();
    }

    /**
     * Parse quantity value
     * @param {string} quantityStr - Quantity string
     * @returns {number} Parsed quantity
     */
    parseQuantity(quantityStr) {
        if (!quantityStr) return 0;
        
        // Remove any non-numeric characters except decimal point
        const cleanStr = quantityStr.toString().replace(/[^\d.,]/g, '');
        
        // Handle different decimal separators
        const normalizedStr = cleanStr.replace(',', '.');
        
        const quantity = parseFloat(normalizedStr);
        return isNaN(quantity) ? 0 : quantity;
    }

    /**
     * Validate material data
     * @param {Object} material - Material object to validate
     */
    validateMaterial(material) {
        if (!material.code) {
            material.isValid = false;
            material.errorMessage = 'Malzeme kodu gerekli';
            return;
        }

        if (!material.name) {
            material.isValid = false;
            material.errorMessage = 'Malzeme adı gerekli';
            return;
        }

        if (material.quantity <= 0) {
            material.isValid = false;
            material.errorMessage = 'Geçerli miktar gerekli';
            return;
        }

        // Validate unit
        if (material.unit && !this.validUnits.includes(material.unit.toLowerCase())) {
            material.unit = 'adet'; // Default to 'adet' if invalid
        }

        // Validate priority
        if (material.priority && !this.validPriorities.includes(material.priority.toLowerCase())) {
            material.priority = 'normal'; // Default to 'normal' if invalid
        }
    }

    /**
     * Get validation summary
     * @param {Array} materials - Array of materials
     * @returns {Object} Validation summary
     */
    getValidationSummary(materials) {
        const total = materials.length;
        const valid = materials.filter(m => m.isValid).length;
        const invalid = total - valid;

        return {
            total,
            valid,
            invalid,
            hasErrors: invalid > 0
        };
    }
}

// Export default instance
export const excelParser = new ExcelParser();

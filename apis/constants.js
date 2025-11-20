/**
 * Application-wide constants
 */

/**
 * Unit choices for items
 * Matches backend UNIT_CHOICES
 */
export const UNIT_CHOICES = [
    { value: 'adet', label: 'Adet' },
    { value: 'kg', label: 'KG' },
    { value: 'metre', label: 'Metre' },
    { value: 'litre', label: 'Litre' },
    { value: 'paket', label: 'Paket' },
    { value: 'kutu', label: 'Kutu' }
];

/**
 * Get unit label by value
 * @param {string} value - Unit value
 * @returns {string} Unit label or value if not found
 */
export function getUnitLabel(value) {
    const unit = UNIT_CHOICES.find(u => u.value === value);
    return unit ? unit.label : value;
}

/**
 * Get unit options for dropdowns
 * @returns {Array} Array of {value, label} objects
 */
export function getUnitOptions() {
    return UNIT_CHOICES;
}

/**
 * Predefined process/operation items for department requests
 * These items can be used to quickly fill item fields
 */
export const PREDEFINED_PROCESS_ITEMS = [
    { code: 'F001 0000 0000 000 000', name: 'BÜKÜM', unit: 'adet' },
    { code: 'F002 0000 0000 000 000', name: 'İŞLEME', unit: 'adet' },
    { code: 'F003 0000 0000 000 000', name: 'SAC KESİM', unit: 'adet' },
    { code: 'F004 0000 0000 000 000', name: 'MALZEMELİ İMALAT', unit: 'adet' },
    { code: 'F005 0000 0000 000 00', name: 'ISIL İŞLEM', unit: 'adet' },
    { code: 'F006 0000 0000 000 000', name: 'TEL EREZYON', unit: 'adet' },
    { code: 'F007 0000 0000 000 000', name: 'KAMA KANALI İŞLEMİ', unit: 'adet' },
    { code: 'F008 0000 0000 000 000', name: 'KROM-SERAMİK KAPLAMA', unit: 'adet' },
    { code: 'F010 0000 0000 000 000', name: 'DÖKÜM İŞLEMİ', unit: 'adet' },
    { code: 'F011 0000 0000 000 001', name: 'KAYNAK AĞZI AÇMA', unit: 'adet' },
    { code: 'F012 0000 0000 000 000', name: 'MİL KESİM', unit: 'adet' },
    { code: 'F013 0000 0000 000 000', name: 'BORWERK İŞLEMESİ', unit: 'adet' },
    { code: 'F014 0000 0000 000 000', name: 'LAZER KESİM', unit: 'adet' },
    { code: 'F015 0000 0000 000 000', name: 'İNDÜKSİYON İŞLEMİ', unit: 'adet' },
    { code: 'F016 0000 0000 000 000', name: 'KUMLAMA İŞLEMİ', unit: 'adet' },
    { code: 'F017 0000 0000 000 000', name: 'TAŞLAMA İŞLEMİ', unit: 'adet' },
    { code: 'F018 0000 0000 000 000', name: 'MONTAJ İŞLEMİ', unit: 'adet' },
    { code: 'F019 0000 0000 000 000', name: 'NİTRASYON İŞLEMİ', unit: 'adet' },
    { code: 'F020 0000 0000 000 000', name: 'NORMALİZASYON İŞLEMİ', unit: 'adet' },
    { code: 'F021 0000 0000 000 000', name: 'ISLAH İŞLEMİ', unit: 'adet' },
    { code: 'F023 0000 0000 000 000', name: 'BALANCE İŞLEMİ', unit: 'adet' },
    { code: 'F024 0000 0000 000 000', name: 'CAM KÜRE KUMLAMA İŞLEMİ', unit: 'adet' },
    { code: 'F025 0000 0000 000 000', name: 'FOSFAT KAPLAMA İŞLEMİ', unit: 'adet' },
    { code: 'F026 0000 0000 000 000', name: 'GALVANİZ KAPLAMA İŞLEMİ', unit: 'adet' },
    { code: 'F003 0083 1001 000 117', name: 'GERİLİM GİDERME İŞLEMİ', unit: 'adet' }
];

/**
 * Get predefined process items
 * @returns {Array} Array of {code, name, unit} objects
 */
export function getPredefinedProcessItems() {
    return PREDEFINED_PROCESS_ITEMS;
}


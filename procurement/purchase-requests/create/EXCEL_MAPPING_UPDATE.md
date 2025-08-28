# Excel Field Mapping Update

## Overview
Added support for a new Excel format (`sa_raporu.xlsx`) in addition to the existing Excel import functionality.

## New Column Mappings

The following column mappings have been added to support the new Excel format:

| Excel Column Name | System Variable | Description |
|------------------|-----------------|-------------|
| `STOK KODU` | `code` | Stock/Product code |
| `STOK İSMİ` | `name` | Stock/Product name |
| `İŞ İSMİ` | `job_no` | Job/Project name |
| `TALEP MİKTARI` | `quantity` | Requested quantity |

## Unchanged Fields
- `unit` - Remains unchanged (no mapping in the new format)
- `specs` - Remains unchanged (no mapping in the new format)

## Implementation Details

### Files Modified
- `procurement/purchase-requests/create/itemsManager.js`

### Changes Made

1. **Updated `columnKeywords` object** in `detectColumnMapping()` function:
   - Added `'stok kodu'` to code keywords
   - Added `'stok ismi'` to name keywords  
   - Added `'iş ismi'` to job_no keywords
   - Added `'talep miktari'` to quantity keywords

2. **Added exact matches** for the new column names:
   - `STOK KODU` → `code`
   - `STOK İSMİ` → `name`
   - `İŞ İSMİ` → `job_no`
   - `TALEP MİKTARI` → `quantity`

3. **Added test function** `testNewExcelMappings()` for verification

### Turkish Character Support
The implementation includes proper handling of Turkish characters through the existing `normalizeTurkish()` function, which normalizes:
- `ı` → `i`
- `ğ` → `g`
- `ü` → `u`
- `ş` → `s`
- `ö` → `o`
- `ç` → `c`
- And their uppercase variants

## Usage

### Testing the New Mappings
You can test the new column mappings by running the following in the browser console:

```javascript
// Assuming itemsManager is available in scope
itemsManager.testNewExcelMappings();
```

### Importing Excel Files
1. Click "Toplu İçe Aktar" (Bulk Import) button
2. Select an Excel file with the new format
3. The system will automatically detect the column mappings
4. Review and confirm the mappings in the modal
5. Import the items

## Backward Compatibility
The new mappings are additive and do not affect existing Excel import functionality. The system will continue to support:
- Original Turkish column names (`KOD`, `İSİM`, `MİKTAR`, etc.)
- English column names (`CODE`, `NAME`, `QUANTITY`, etc.)
- Mixed formats and variations

## Example Excel Format
```
STOK KODU | STOK İSMİ | İŞ İSMİ | TALEP MİKTARI | BİRİM | TEKNİK ÖZELLİKLER
12345     | Malzeme A | Proje 1 | 10.5          | Adet  | Teknik detaylar
67890     | Malzeme B | Proje 2 | 25.0          | Kg    | Diğer özellikler
```

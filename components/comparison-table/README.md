# Karşılaştırma Tablosu Bileşeni

Tedarikçi tekliflerini ve önerilerini tedarik uygulamalarında görüntülemek için yeniden kullanılabilir karşılaştırma tablosu bileşeni.

## Özellikler

- **Dinamik Tablo Oluşturma**: Malzemeler ve tedarikçilere göre karşılaştırma tablolarını otomatik olarak oluşturur
- **Öneri Sistemi**: Belirli malzemeler için tedarikçi önermek için etkileşimli yıldız butonları
- **Para Birimi Dönüştürme**: EUR'ye otomatik dönüştürme ile çoklu para birimlerini destekler
- **Dışa Aktarma İşlevi**: Özelleştirilebilir seçeneklerle verileri CSV ve Excel formatlarında dışa aktarır
- **Duyarlı Tasarım**: Masaüstü, tablet ve mobil cihazlarda çalışır
- **Özet Bölümü**: Toplamları ve istatistikleri görüntüler
- **Özelleştirilebilir Seçenekler**: Yapılandırılabilir görüntüleme seçenekleri ve geri çağırımlar

## Kurulum

1. HTML dosyanıza CSS dosyasını ekleyin:
```html
<link rel="stylesheet" href="components/comparison-table/comparison-table.css">
```

2. Excel dışa aktarma için SheetJS kütüphanesini ekleyin (isteğe bağlı, sadece Excel dışa aktarma için gerekli):
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
```

3. JavaScript dosyanızda bileşeni içe aktarın:
```javascript
import { ComparisonTable } from './components/comparison-table/comparison-table.js';
```

## Kullanım

### Temel Kullanım

```javascript
// HTML dosyanızda bir konteyner elementi oluşturun
<div id="comparison-table-container"></div>

// Bileşeni başlatın
const comparisonTable = new ComparisonTable('comparison-table-container', {
    currencyRates: currencyRates,
    autoSave: () => saveData(),
    onRecommendationChange: (itemIndex, supplierId, recommendations) => {
        console.log('Öneri değişti:', itemIndex, supplierId, recommendations);
    }
});

// Set data
comparisonTable.setData({
    items: [
        { name: 'Item 1', code: 'ITM001', job_no: 'JOB001', quantity: 10, unit: 'pcs' },
        { name: 'Item 2', code: 'ITM002', job_no: 'JOB002', quantity: 5, unit: 'kg' }
    ],
    suppliers: [
        { id: 'supplier1', name: 'Supplier A', default_currency: 'TRY' },
        { id: 'supplier2', name: 'Supplier B', default_currency: 'USD' }
    ],
    offers: {
        supplier1: {
            0: { unitPrice: 100, totalPrice: 1000, deliveryDays: 7 },
            1: { unitPrice: 50, totalPrice: 250, deliveryDays: 5 }
        },
        supplier2: {
            0: { unitPrice: 15, totalPrice: 150, deliveryDays: 10 },
            1: { unitPrice: 8, totalPrice: 40, deliveryDays: 8 }
        }
    },
    itemRecommendations: {
        0: 'supplier1',
        1: 'supplier2'
    }
});
```

### Configuration Options

```javascript
const options = {
    // Display options
    showSummary: true,                    // Show summary section
    showRecommendations: true,            // Show recommendation buttons
    showCurrencyConversion: true,         // Enable currency conversion
    showDeliveryDays: true,               // Show delivery days column
    showNotes: true,                      // Show offer notes
    
    // Export options
    showExportButton: true,               // Show export button in header
    exportFormats: ['csv', 'excel'],      // Available export formats
    exportFilename: 'comparison-table',   // Default filename (without extension)
    onExport: (format, filename) => {},   // Export callback function
    
    // Callbacks
    autoSave: () => {},                   // Auto-save function
    onRecommendationChange: (itemIndex, supplierId, recommendations) => {},
    onSupplierRecommendAll: (supplierId, recommendations) => {},
    
    // Currency settings
    currencyRates: { TRY: 1, USD: 0.037, EUR: 0.034 },
    currencySymbols: {
        TRY: '₺',
        USD: '$',
        EUR: '€',
        GBP: '£'
    }
};
```

## Data Structure

### Items
```javascript
{
    name: 'Item Name',           // Required
    code: 'ITEM001',            // Required
    job_no: 'JOB001',           // Optional
    quantity: 10,               // Required
    unit: 'pcs'                 // Required
}
```

### Suppliers
```javascript
{
    id: 'supplier1',            // Required - unique identifier
    name: 'Supplier Name',      // Required
    default_currency: 'TRY'     // Required - currency code
}
```

### Offers
```javascript
{
    [supplierId]: {
        [itemIndex]: {
            unitPrice: 100,     // Required
            totalPrice: 1000,   // Required
            deliveryDays: 7,    // Optional
            notes: 'Note'       // Optional
        }
    }
}
```

### Recommendations
```javascript
{
    [itemIndex]: supplierId     // Maps item index to recommended supplier ID
}
```

## Export Functionality

The comparison table component includes built-in export functionality to save data in various formats.

### Export Formats

- **CSV Export**: Exports data as a comma-separated values file
- **Excel Export**: Exports data as an Excel workbook with multiple sheets (requires SheetJS library)

### Export Methods

```javascript
// Export to CSV
comparisonTable.exportToCSV('my-comparison.csv');

// Export to Excel
comparisonTable.exportToExcel('my-comparison.xlsx');
```

### Export Configuration

```javascript
const comparisonTable = new ComparisonTable('container', {
    // Show/hide export button
    showExportButton: true,
    
    // Available export formats
    exportFormats: ['csv', 'excel'],
    
    // Default filename (without extension)
    exportFilename: 'comparison-table',
    
    // Export callback
    onExport: (format, filename) => {
        console.log(`Exported ${format} file: ${filename}`);
    }
});
```

### Export Data Structure

The exported data includes:
- **Main Sheet**: All comparison data with headers, item details, supplier offers, and summary row
- **Summary Sheet** (Excel only): Detailed summary information including:
  - Items summary
  - Suppliers summary with totals and averages
  - Recommendations summary

### Requirements

- **CSV Export**: No additional dependencies required
- **Excel Export**: Requires SheetJS library to be included in your HTML:
  ```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
  ```

## API Methods

### setData(data)
Updates the table with new data.

### setCurrencyRates(rates)
Updates currency conversion rates.

### getRecommendations()
Returns the current recommendations object.

### setRecommendations(recommendations)
Sets the recommendations manually.

### updateData(newData)
Updates specific parts of the data.

### render()
Manually triggers a re-render of the table.

### exportToCSV(filename)
Exports the comparison table data to a CSV file.
- `filename` (optional): Custom filename for the export

### exportToExcel(filename)
Exports the comparison table data to an Excel file.
- `filename` (optional): Custom filename for the export
- Requires SheetJS library to be loaded

## Events

### onRecommendationChange
Called when a recommendation is toggled.
```javascript
onRecommendationChange: (itemIndex, supplierId, allRecommendations) => {
    // itemIndex: Index of the item
    // supplierId: ID of the supplier (null if deselected)
    // allRecommendations: Complete recommendations object
}
```

### onSupplierRecommendAll
Called when "Recommend All" button is clicked.
```javascript
onSupplierRecommendAll: (supplierId, allRecommendations) => {
    // supplierId: ID of the supplier
    // allRecommendations: Complete recommendations object
}
```

### onExport
Called when an export operation is completed.
```javascript
onExport: (format, filename) => {
    // format: Export format ('csv' or 'excel')
    // filename: Name of the exported file
}
```

## Column Minimization
        
The comparison table now includes clickable column headers that allow users to minimize individual columns across all suppliers. This feature is particularly useful for saving space and focusing on specific data types.

### How It Works
        
- **Clickable Column Headers**: Each column header acts as a clickable button to minimize/expand that column
- **Two Column Categories**: 
  - **General Columns**: Item, Job No, Quantity, Unit (not part of suppliers)
  - **Supplier Columns**: Unit Price, Delivery Days, Total, Euro Total, Recommendations
- **Individual Column Control**: Click any column header to minimize/expand that specific column type
- **Cross-Supplier Application**: When minimized, the column is minimized for ALL suppliers simultaneously
- **Space Saving**: Minimized columns show as narrow 40px columns with rotated text
- **Dynamic Adjustment**: The table automatically adjusts its layout when columns are minimized

### General Columns vs Supplier Columns

- **General Columns** (left side of control panel):
  - `item`: Item name and code
  - `job_no`: Job number
  - `quantity`: Item quantity
  - `unit`: Unit of measurement
  
- **Supplier Columns** (right side of control panel):
  - `unitPrice`: Unit price for each supplier
  - `deliveryDays`: Delivery time for each supplier
  - `originalTotal`: Total price in original currency
  - `euroTotal`: Total price converted to EUR
  - `recommendations`: Recommendation buttons for each supplier

### Usage
        
```javascript
// Toggle column minimization for general columns
comparisonTable.toggleColumnMinimization('item');        // Item column
comparisonTable.toggleColumnMinimization('job_no');     // Job No column
comparisonTable.toggleColumnMinimization('quantity');   // Quantity column
comparisonTable.toggleColumnMinimization('unit');       // Unit column
        
// Toggle column minimization for supplier columns
comparisonTable.toggleColumnMinimization('unitPrice');      // Unit Price
comparisonTable.toggleColumnMinimization('deliveryDays');   // Delivery Days
comparisonTable.toggleColumnMinimization('originalTotal');  // Original Total
comparisonTable.toggleColumnMinimization('euroTotal');      // Euro Total
comparisonTable.toggleColumnMinimization('recommendations'); // Recommendations
        
// Set specific minimization state
comparisonTable.setColumnMinimization('item', true);        // Minimize Item column
comparisonTable.setColumnMinimization('unitPrice', false);  // Expand Unit Price column
        
// Check if column is minimized
const isItemMinimized = comparisonTable.isColumnMinimized('item');
const isUnitPriceMinimized = comparisonTable.isColumnMinimized('unitPrice');
```

**Note**: Users can also click directly on any column header to minimize/expand that column!

### Benefits
        
- **Space Efficiency**: Minimized columns take up only 40px width instead of full width
- **Better Focus**: Users can focus on specific data types while keeping others accessible
- **Improved UX**: Better use of screen real estate, especially on smaller devices
- **Consistent Behavior**: Minimization applies to all suppliers uniformly
- **Visual Clarity**: Rotated text in minimized columns maintains readability
- **Flexible Control**: Users can minimize any combination of general and supplier columns
- **Intuitive Interface**: Clicking column headers is more natural than separate control buttons
- **Clean Design**: No additional UI elements cluttering the interface

## Styling

The component includes comprehensive CSS styling with:
- Responsive design for mobile devices
- Hover effects and animations
- Recommended item highlighting
- Print-friendly styles
- Loading states

### Custom Styling

You can override the default styles by targeting the `.comparison-table` class:

```css
.comparison-table {
    /* Your custom styles */
}

.comparison-table td.recommended-cell {
    /* Custom recommended cell styling */
}
```

## Examples

### Read-only Table
```javascript
const readOnlyTable = new ComparisonTable('container', {
    showRecommendations: false,
    showSummary: true
});
```

### Minimal Table
```javascript
const minimalTable = new ComparisonTable('container', {
    showDeliveryDays: false,
    showNotes: false,
    showSummary: false
});
```

### With Validation
```javascript
const tableWithValidation = new ComparisonTable('container', {
    onRecommendationChange: (itemIndex, supplierId, recommendations) => {
        // Validate recommendations
        const isValid = validateRecommendations(recommendations);
        if (!isValid) {
            showError('Invalid recommendation combination');
            return false;
        }
        
        // Save to backend
        saveRecommendations(recommendations);
    }
});
```

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Dependencies

- Bootstrap 5.3.0+ (for basic styling and components)
- Font Awesome 6.4.0+ (for icons)

## License

This component is part of the GEMKOM application suite.

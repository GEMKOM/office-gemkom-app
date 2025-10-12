# CNC Cutting APIs

This directory contains the API functions for managing CNC cutting operations, including tasks, parts, and files.

## Files Overview

- **`crud.js`** - Main CRUD operations for CNC tasks and the add-file functionality
- **`parts.js`** - Individual CNC parts management (create, update, delete, get)
- **`files.js`** - File management operations (delete, add to task, download)
- **`example-usage.js`** - Comprehensive examples of how to use all APIs
- **`test-example.js`** - Existing test examples

## API Endpoints Implemented

### 1. CNC Parts Management (`parts.js`)

#### Create a New CNC Part
```javascript
import { createCncPart } from './parts.js';

const partData = {
    cnc_task: 1,           // Required: CNC task ID
    job_no: "JB-2024-101", // Required: Job number
    image_no: "IMG-005",   // Optional: Image number
    position_no: "P-03",   // Optional: Position number
    weight_kg: "15.750"    // Optional: Weight in kg
};

const newPart = await createCncPart(partData);
```

**Endpoint:** `POST /cnc_cutting/parts/`

#### Partially Update a CNC Part
```javascript
import { updateCncPart } from './parts.js';

const updateData = {
    position_no: "P-03-REVISED",
    weight_kg: "16.100"
};

const updatedPart = await updateCncPart(partId, updateData);
```

**Endpoint:** `PATCH /cnc_cutting/parts/{part_id}/`

#### Delete a CNC Part
```javascript
import { deleteCncPart } from './parts.js';

const success = await deleteCncPart(partId);
```

**Endpoint:** `DELETE /cnc_cutting/parts/{part_id}/`

#### Get CNC Part(s)
```javascript
import { getCncPart, getCncParts } from './parts.js';

// Get single part
const part = await getCncPart(partId);

// Get all parts with optional filtering
const parts = await getCncParts({ cnc_task: 1, job_no: "JB-2024-101" });
```

**Endpoints:** 
- `GET /cnc_cutting/parts/{part_id}/`
- `GET /cnc_cutting/parts/`

### 2. File Management (`files.js`)

#### Delete a File
```javascript
import { deleteCncFile } from './files.js';

const success = await deleteCncFile(fileId);
```

**Endpoint:** `DELETE /cnc_cutting/files/{file_id}/`

#### Add Files to an Existing Task
```javascript
import { addFilesToCncTask } from './files.js';

const fileInput = document.getElementById('fileInput');
const result = await addFilesToCncTask(taskId, fileInput.files);
```

**Endpoint:** `POST /cnc_cutting/tasks/{task_id}/add-file/`

#### Get File Information
```javascript
import { getCncFile, getCncTaskFiles } from './files.js';

// Get single file
const file = await getCncFile(fileId);

// Get all files for a task
const files = await getCncTaskFiles(taskId);
```

**Endpoints:**
- `GET /cnc_cutting/files/{file_id}/`
- `GET /cnc_cutting/tasks/{task_id}/files/`

#### Download a File
```javascript
import { downloadCncFile } from './files.js';

const blob = await downloadCncFile(fileId, 'filename.pdf');
```

**Endpoint:** `GET /cnc_cutting/files/{file_id}/download/`

### 3. Task File Management (`crud.js`)

#### Add Files to Task (Alternative)
```javascript
import { addFilesToCncTask } from './crud.js';

const result = await addFilesToCncTask(taskId, files);
```

**Endpoint:** `POST /cnc_cutting/tasks/{task_id}/add-file/`

## Utility Functions

### Validation Functions

#### Validate CNC Part Data
```javascript
import { validateCncPartData } from './parts.js';

const validation = validateCncPartData(partData, isUpdate = false);
if (!validation.isValid) {
    console.error('Validation errors:', validation.errors);
}
```

#### Validate File Upload
```javascript
import { validateFileUpload } from './files.js';

const validation = validateFileUpload(files, {
    maxSize: 5 * 1024 * 1024, // 5MB max
    allowedTypes: ['image/*', 'application/pdf'],
    maxFiles: 5
});
```

### Formatting Functions

#### Format CNC Part for Display
```javascript
import { formatCncPartForDisplay } from './parts.js';

const formattedPart = formatCncPartForDisplay(part);
```

#### Format CNC File for Display
```javascript
import { formatCncFileForDisplay } from './files.js';

const formattedFile = formatCncFileForDisplay(file);
```

#### Get File Icon
```javascript
import { getFileIcon } from './files.js';

const iconClass = getFileIcon('application/pdf'); // Returns 'fas fa-file-pdf'
```

#### Format File Size
```javascript
import { formatFileSize } from './files.js';

const sizeString = formatFileSize(1024000); // Returns '1000 KB'
```

## Error Handling

All API functions include comprehensive error handling:

```javascript
try {
    const result = await createCncPart(partData);
    console.log('Success:', result);
} catch (error) {
    console.error('Error:', error.message);
    // Handle error appropriately
}
```

## File Upload Requirements

When uploading files using `addFilesToCncTask`:

1. **Content-Type:** `multipart/form-data` (automatically set by FormData)
2. **Field Name:** `files` (multiple files supported)
3. **File Validation:** Use `validateFileUpload()` before uploading

Example HTML:
```html
<input type="file" id="fileInput" multiple accept="image/*,application/pdf">
```

## Complete Example

See `example-usage.js` for comprehensive examples of all API functions working together.

## Integration with Existing Code

These APIs are designed to work seamlessly with the existing CNC cutting module:

- Import functions as needed in your components
- Use validation functions before API calls
- Handle errors appropriately in your UI
- Use formatting functions for display purposes

## Notes

- All functions return Promises and should be used with `async/await`
- File uploads use FormData for multipart/form-data requests
- JSON requests use `application/json` content type
- All functions include proper error handling and logging
- Validation functions help prevent invalid data submission

# File Viewer Component

A full-page file viewer component that provides an immersive viewing experience for various file types.

## Features

- **Full-page viewing**: Takes over the entire page for distraction-free viewing
- **Multiple file types**: Supports images, PDFs, videos, and text files
- **Zoom controls**: Zoom in/out with keyboard shortcuts
- **Download functionality**: Direct file download
- **Keyboard shortcuts**: 
  - `Escape`: Close viewer
  - `+` or `=`: Zoom in
  - `-`: Zoom out
  - `0`: Reset zoom
- **Responsive design**: Works on desktop and mobile devices

## Usage

### Basic Usage

```javascript
import { FileViewer } from './components/file-viewer/file-viewer.js';

// Create instance
const fileViewer = new FileViewer();

// Open a file
fileViewer.openFile('https://example.com/file.pdf', 'document.pdf', 'pdf');

// Set download callback
fileViewer.setDownloadCallback(() => {
    // Custom download logic
    window.open('https://example.com/file.pdf', '_blank');
});
```

### Global Instance

The component also provides a global instance:

```javascript
// Use global instance
window.fileViewer.openFile(fileUrl, fileName, fileExtension);

// Set download callback
window.fileViewer.setDownloadCallback(() => {
    // Download logic
});
```

## Supported File Types

- **Images**: JPG, JPEG, PNG, GIF, BMP, WebP
- **Documents**: PDF
- **Videos**: MP4, AVI, MOV, WMV, FLV
- **Text**: TXT, JSON, XML, CSV, LOG
- **Office**: DOC, DOCX, XLS, XLSX, PPT, PPTX (icon only)

## API

### Methods

- `openFile(fileUrl, fileName, fileExtension)` - Open file in viewer
- `close()` - Close viewer and restore page
- `download()` - Trigger download
- `setDownloadCallback(callback)` - Set custom download handler
- `zoomIn()` - Increase zoom level
- `zoomOut()` - Decrease zoom level
- `zoomReset()` - Reset zoom to 100%

### Events

- `fileViewerClosed` - Dispatched when viewer is closed

## Styling

The component includes its own CSS file that provides:
- Dark theme styling
- Responsive design
- Smooth transitions
- Mobile-friendly controls

## Browser Support

- Modern browsers with ES6 support
- File API support for text files
- Video element support for video files
- Iframe support for PDF files

# File Attachments Component

A reusable component for displaying file attachments with thumbnails, previews, and download functionality.

## Features

- **Multiple layouts**: Grid or list layout options
- **File type support**: Images, PDFs, videos, documents with appropriate icons
- **Thumbnail previews**: Real image thumbnails and file type icons
- **Interactive elements**: Click to preview, download buttons
- **Responsive design**: Works on desktop and mobile devices
- **Customizable**: Configurable titles, icons, and callbacks
- **Event handling**: Custom click and download handlers

## Usage

### Basic Usage

```javascript
import { FileAttachments } from './components/file-attachments/file-attachments.js';

// Create instance
const fileAttachments = new FileAttachments('files-container', {
    title: 'Ekler',
    layout: 'grid'
});

// Set files data
const files = [
    {
        file_url: 'https://example.com/file1.pdf',
        file_name: 'document.pdf',
        uploaded_at: '2025-01-11T10:00:00Z',
        uploaded_by_username: 'john.doe'
    },
    {
        file_url: 'https://example.com/image.jpg',
        file_name: 'screenshot.jpg',
        uploaded_at: '2025-01-11T09:30:00Z',
        uploaded_by_username: 'jane.smith'
    }
];

fileAttachments.setFiles(files);
```

### With Custom Callbacks

```javascript
const fileAttachments = new FileAttachments('files-container', {
    title: 'Dosyalar',
    titleIcon: 'fas fa-paperclip',
    titleIconColor: 'text-primary',
    layout: 'list',
    onFileClick: (file, index) => {
        // Custom preview logic
        console.log('Preview file:', file);
    },
    onDownloadClick: (fileUrl, fileName) => {
        // Custom download logic
        window.open(fileUrl, '_blank');
    }
});
```

## API

### Constructor Options

- `title` (string): Title to display above files (default: 'Ekler')
- `titleIcon` (string): FontAwesome icon class for title (default: 'fas fa-paperclip')
- `titleIconColor` (string): CSS color class for title icon (default: 'text-muted')
- `showTitle` (boolean): Whether to show the title (default: true)
- `layout` (string): Layout type - 'grid' or 'list' (default: 'grid')
- `maxThumbnailSize` (number): Maximum thumbnail size in pixels (default: 80)
- `onFileClick` (function): Callback for file click events
- `onDownloadClick` (function): Callback for download click events

### Methods

- `setFiles(files)` - Set array of files to display
- `addFile(file)` - Add a single file
- `removeFile(index)` - Remove file by index
- `clearFiles()` - Clear all files
- `render()` - Re-render the component
- `setOnFileClick(callback)` - Set file click callback
- `setOnDownloadClick(callback)` - Set download click callback
- `updateOptions(newOptions)` - Update component options

### File Object Structure

```javascript
{
    file_url: 'https://example.com/file.pdf',      // Required: File URL
    file_name: 'document.pdf',                     // Required: File name
    uploaded_at: '2025-01-11T10:00:00Z',          // Optional: Upload date
    uploaded_by_username: 'john.doe'               // Optional: Uploader username
}
```

## Supported File Types

### Images (with thumbnails)
- JPG, JPEG, PNG, GIF, BMP, WebP

### Documents (with icons)
- PDF (red icon)
- DOC, DOCX (blue Word icon)
- XLS, XLSX (green Excel icon)
- PPT, PPTX (orange PowerPoint icon)

### Videos (with icons)
- MP4, AVI, MOV, WMV, FLV (blue video icon)

### Other Files
- Generic file icon for unsupported types

## Layouts

### Grid Layout
- Files displayed in a flexible grid
- Each file in a card with thumbnail and info
- Responsive - adapts to screen size

### List Layout
- Files displayed in a vertical list
- Compact horizontal cards
- Better for many files

## Styling

The component includes comprehensive CSS with:
- Hover effects and transitions
- Responsive design for mobile devices
- Loading states and animations
- Custom scrollbars for long lists
- Empty state styling

## Events

### File Click Event
Triggered when user clicks on a file thumbnail or preview button:
```javascript
onFileClick: (file, index) => {
    // file: The file object
    // index: The file index in the array
}
```

### Download Click Event
Triggered when user clicks the download button:
```javascript
onDownloadClick: (fileUrl, fileName) => {
    // fileUrl: The file URL
    // fileName: The file name
}
```

## Browser Support

- Modern browsers with ES6 support
- CSS Grid and Flexbox support
- FontAwesome icons support

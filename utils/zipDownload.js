/**
 * Bulk file download — fetch a list of files and hand the user a single zip.
 *
 * The NCR, job order, offer and purchase-request pages each carry their own
 * copy of this routine plus a JSZip <script> tag in their index.html. This is
 * that behaviour in one importable place, and it pulls JSZip in on first use
 * so a page needn't ship a library it may never need.
 *
 * A "file" here is any object exposing a URL (`file_url` / `url` / `file`)
 * and ideally a name (`filename` / `file_name` / `original_name` / `name`).
 * Missing names fall back to the URL's last path segment; missing extensions
 * are inferred from the response's content type.
 */

import { showNotification } from '../components/notification/notification.js';

const JSZIP_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

let jsZipLoad = null;

function loadJSZip() {
    // Pages that still include the CDN <script> themselves already have it.
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!jsZipLoad) {
        jsZipLoad = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = JSZIP_SRC;
            script.onload = () => (window.JSZip
                ? resolve(window.JSZip)
                : reject(new Error('JSZip yüklenemedi')));
            script.onerror = () => reject(new Error('JSZip yüklenemedi'));
            document.head.appendChild(script);
        }).catch((error) => {
            jsZipLoad = null;       // a later click gets a fresh attempt
            throw error;
        });
    }
    return jsZipLoad;
}

export function getFileExtension(fileName) {
    if (!fileName) return '';
    const name = String(fileName);
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex <= 0 || lastDotIndex === name.length - 1) return '';
    return name.slice(lastDotIndex + 1).toLowerCase();
}

/** Strip anything Windows/macOS refuses inside a zip entry name. */
export function sanitizeZipPathSegment(value, fallback = 'Dosyalar') {
    const raw = String(value || '').trim();
    const cleaned = raw
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/^\.+/, '')
        .replace(/[. ]+$/, '')
        .trim();
    return cleaned || fallback;
}

export function extractFileNameFromUrl(fileUrl) {
    if (!fileUrl) return '';
    try {
        const url = new URL(fileUrl, window.location.origin);
        const path = decodeURIComponent(url.pathname || '');
        const parts = path.split('/').filter(Boolean);
        return parts.length ? parts[parts.length - 1] : '';
    } catch (_) {
        return '';
    }
}

function inferExtensionFromContentType(contentType = '') {
    const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
    const map = {
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'text/plain': 'txt',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/msword': 'doc'
    };
    return map[normalized] || '';
}

/** Two files may legitimately share a name — keep both, suffixed. */
function buildUniqueFileName(baseName, usedNames) {
    const safeBaseName = sanitizeZipPathSegment(baseName, 'dosya');
    if (!usedNames.has(safeBaseName)) {
        usedNames.add(safeBaseName);
        return safeBaseName;
    }
    const extension = getFileExtension(safeBaseName);
    const stem = extension ? safeBaseName.slice(0, -(extension.length + 1)) : safeBaseName;
    let counter = 2;
    let candidate = '';
    do {
        candidate = extension ? `${stem} (${counter}).${extension}` : `${stem} (${counter})`;
        counter += 1;
    } while (usedNames.has(candidate));
    usedNames.add(candidate);
    return candidate;
}

/** The URL a file object carries, under any of the names the APIs use. */
export function fileUrlOf(file) {
    return file?.file_url || file?.url || file?.file || '';
}

/**
 * Zip ``files`` under a folder named ``zipName`` and start the download.
 *
 * Unreachable files are skipped with a console warning rather than failing
 * the whole batch — one dead link should not cost the user the other twenty.
 * Returns true when a zip was delivered.
 */
export async function downloadFilesAsZip(files, zipName = 'Dosyalar') {
    const list = Array.isArray(files) ? files : [];
    if (list.length === 0) {
        showNotification('İndirilecek dosya yok', 'warning');
        return false;
    }

    let JSZipCtor;
    try {
        JSZipCtor = await loadJSZip();
    } catch (error) {
        console.error('Error loading JSZip:', error);
        showNotification('JSZip kütüphanesi yüklenemedi', 'error');
        return false;
    }

    try {
        showNotification('Dosyalar indiriliyor...', 'info');
        const zip = new JSZipCtor();
        const folderName = sanitizeZipPathSegment(zipName);
        const rootFolder = zip.folder(folderName);
        if (!rootFolder) {
            showNotification('Zip klasörü oluşturulamadı', 'error');
            return false;
        }

        const usedNames = new Set();
        let addedCount = 0;

        for (let i = 0; i < list.length; i++) {
            const file = list[i];
            const fileUrl = fileUrlOf(file);
            const rawName = file?.filename || file?.file_name || file?.original_name
                || file?.name || extractFileNameFromUrl(fileUrl) || `dosya_${i + 1}`;

            if (!fileUrl) {
                console.warn(`Skipping file ${rawName}: no URL`);
                continue;
            }

            try {
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    console.warn(`Failed to fetch ${rawName}: ${response.status}`);
                    continue;
                }
                const blob = await response.blob();
                const existingExtension = getFileExtension(rawName)
                    || String(file?.file_extension || '').toLowerCase();
                const extension = existingExtension
                    || inferExtensionFromContentType(response.headers.get('content-type'));
                const cleanedName = sanitizeZipPathSegment(rawName, `dosya_${i + 1}`);
                const finalName = cleanedName.includes('.') || !extension
                    ? cleanedName
                    : `${cleanedName}.${extension}`;
                rootFolder.file(buildUniqueFileName(finalName, usedNames), blob);
                addedCount += 1;
            } catch (error) {
                console.error(`Error fetching file ${rawName}:`, error);
            }
        }

        if (addedCount === 0) {
            showNotification('Zip içine eklenecek geçerli dosya bulunamadı', 'warning');
            return false;
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = window.URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${folderName}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        const skipped = list.length - addedCount;
        showNotification(
            skipped > 0
                ? `${addedCount} dosya zip olarak indirildi (${skipped} dosya atlandı)`
                : `${addedCount} dosya zip olarak indirildi`,
            skipped > 0 ? 'warning' : 'success'
        );
        return true;
    } catch (error) {
        console.error('Error creating zip file:', error);
        showNotification('Zip dosyası oluşturulurken hata oluştu', 'error');
        return false;
    }
}

import type { NcrFile } from '@/api/quality-control/ncrs';
import { downloadFilesAsZip as downloadZip, fileExtension, fileNameFromUrl, type ZipResult } from '@/ui/files';

// File helpers from ncrs.js: normalizing the file payload and the NCR's icons.
// Download and "Tümünü İndir (ZIP)" are the shared ones in @/ui/files.

export { downloadFile, fileExtension } from '@/ui/files';
export type { ZipResult } from '@/ui/files';

export interface NcrFileView {
  id: number;
  url: string;
  fileName: string;
  extension: string;
  typeLabel: string;
  uploadedAt: string | null;
  uploadedBy: string;
}

/**
 * The backend sends a presigned `url` (some versions `file_url` / `file`). The
 * name may be a typed title with no extension, so fall back to the stored file's.
 */
export function normalizeNcrFile(file: NcrFile): NcrFileView {
  const url = file.url || file.file_url || file.file || '';
  const rawName = file.name || file.filename || file.original_name || 'Dosya';
  const extension =
    String(file.extension || '')
      .replace(/^\./, '')
      .toLowerCase() ||
    fileExtension(rawName) ||
    fileExtension(fileNameFromUrl(url));
  const fileName =
    extension && !rawName.toLowerCase().endsWith(`.${extension}`)
      ? `${rawName}.${extension}`
      : rawName;
  return {
    id: file.id,
    url,
    fileName,
    extension,
    typeLabel: file.file_type_display || '',
    uploadedAt: file.uploaded_at || file.created_at || null,
    uploadedBy: file.uploaded_by_username || file.uploaded_by_name || '',
  };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileIcon(name: string, mime = ''): string {
  const ext = fileExtension(name);
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) {
    return 'fas fa-file-image';
  }
  if (ext === 'pdf') return 'fas fa-file-pdf';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'fas fa-file-excel';
  if (['doc', 'docx'].includes(ext)) return 'fas fa-file-word';
  if (['dwg', 'dxf', 'step', 'stp'].includes(ext)) return 'fas fa-drafting-compass';
  return 'fas fa-file';
}

/** Port of downloadAllFilesAsZip: `<NCR no>.zip` with the files in a `<NCR no>/` folder. */
export function downloadFilesAsZip(files: NcrFileView[], ncrNumber: string): Promise<ZipResult> {
  return downloadZip(
    files.map((file) => ({ url: file.url, name: file.fileName, extension: file.extension })),
    ncrNumber,
    'NCR',
  );
}

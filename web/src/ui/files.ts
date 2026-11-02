/**
 * File helpers shared by FileAttachments, FileViewer and the pages that list
 * files: names and extensions, icons, sizes, one-file download and
 * "Tümünü İndir (ZIP)". Legacy used JSZip from a CDN; the archive here is
 * written by hand (stored, no compression), which every unzip reads.
 */

/** One file as the shared components show it. Pages map their API rows to this. */
export interface AttachmentFile {
  /** What delete and React keys use; the URL when absent. */
  id?: number | string;
  url: string;
  /** Shown name, with its extension. */
  name: string;
  /** Lower case, no dot. Taken from `name` when absent. */
  extension?: string;
  /** Bytes. */
  size?: number | null;
  uploadedBy?: string | null;
  uploadedAt?: string | null;
  /** "Tür": the file type label a page keeps (Fotoğraf, Rapor). */
  typeLabel?: string | null;
  /** A free-text title or description the uploader gave. */
  description?: string | null;
}

export type FileKind =
  | 'image'
  | 'pdf'
  | 'video'
  | 'text'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'archive'
  | 'cad'
  | 'other';

const KINDS: Record<Exclude<FileKind, 'other'>, readonly string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
  pdf: ['pdf'],
  video: ['mp4', 'webm', 'mov', 'avi', 'wmv', 'flv'],
  text: ['txt', 'json', 'xml', 'csv', 'log'],
  word: ['doc', 'docx'],
  excel: ['xls', 'xlsx'],
  powerpoint: ['ppt', 'pptx'],
  archive: ['zip', 'rar', '7z'],
  cad: ['dwg', 'dxf', 'step', 'stp'],
};

export function fileExtension(fileName: string | null | undefined): string {
  if (!fileName) return '';
  const name = String(fileName);
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/** The last path segment of a URL, decoded ("" when there is none). */
export function fileNameFromUrl(fileUrl: string | null | undefined): string {
  if (!fileUrl) return '';
  try {
    const url = new URL(fileUrl, window.location.origin);
    const parts = decodeURIComponent(url.pathname || '')
      .split('/')
      .filter(Boolean);
    return parts.length ? parts[parts.length - 1]! : '';
  } catch {
    return '';
  }
}

/** The extension a file is known by: its own, else its name's, else its URL's. */
export function extensionOf(file: Pick<AttachmentFile, 'name' | 'url' | 'extension'>): string {
  return (
    String(file.extension || '')
      .replace(/^\./, '')
      .toLowerCase() ||
    fileExtension(file.name) ||
    fileExtension(fileNameFromUrl(file.url))
  );
}

export function fileKind(extension: string): FileKind {
  const ext = extension.toLowerCase();
  for (const [kind, list] of Object.entries(KINDS)) {
    if (list.includes(ext)) return kind as FileKind;
  }
  return 'other';
}

/** Can FileViewer show it, rather than offer a download? */
export function isPreviewable(extension: string): boolean {
  return ['image', 'pdf', 'video', 'text'].includes(fileKind(extension));
}

const ICONS: Record<FileKind, { icon: string; family: string; label: string }> = {
  image: { icon: 'fas fa-file-image', family: 'green', label: 'resim' },
  pdf: { icon: 'fas fa-file-pdf', family: 'red', label: 'PDF belgesi' },
  video: { icon: 'fas fa-file-video', family: 'purple', label: 'video' },
  text: { icon: 'fas fa-file-lines', family: 'grey', label: 'metin' },
  word: { icon: 'fas fa-file-word', family: 'blue', label: 'belge' },
  excel: { icon: 'fas fa-file-excel', family: 'green', label: 'tablo' },
  powerpoint: { icon: 'fas fa-file-powerpoint', family: 'orange', label: 'sunum' },
  archive: { icon: 'fas fa-file-zipper', family: 'yellow', label: 'arşiv' },
  cad: { icon: 'fas fa-compass-drafting', family: 'blue', label: 'çizim' },
  other: { icon: 'fas fa-file', family: 'grey', label: 'dosya' },
};

/** Font Awesome classes, the status family that tints the tile, and a word for the type. */
export function fileIcon(extension: string): { icon: string; family: string; label: string } {
  return ICONS[fileKind(extension)];
}

/** 532 B, 12.4 KB, 3.1 MB. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Download through a blob, so the browser saves rather than opens it; when the
 * file host refuses (CORS), fall back to opening the URL in a new tab.
 */
export async function downloadFile(url: string, fileName: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    saveBlob(await response.blob(), fileName || 'Dosya');
  } catch (error) {
    console.error('Error downloading file:', error);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'Dosya';
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/** Strip what Windows and macOS refuse inside a zip entry name. */
export function sanitizeZipSegment(value: unknown, fallback = 'Dosyalar'): string {
  const cleaned = String(value ?? '')
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim();
  return cleaned || fallback;
}

const CONTENT_TYPE_EXTENSION: Record<string, string> = {
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
  'application/msword': 'doc',
};

function uniqueName(baseName: string, used: Set<string>): string {
  const safe = sanitizeZipSegment(baseName, 'dosya');
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  const ext = fileExtension(safe);
  const stem = ext ? safe.slice(0, -(ext.length + 1)) : safe;
  const numbered = (n: number) => (ext ? `${stem} (${n}).${ext}` : `${stem} (${n})`);
  let counter = 2;
  while (used.has(numbered(counter))) counter += 1;
  const candidate = numbered(counter);
  used.add(candidate);
  return candidate;
}

// ---- a minimal ZIP writer (method 0 = stored) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A stored ZIP archive of `entries` (paths may contain '/'). */
export function buildZip(entries: { path: string; data: Uint8Array }[], date = new Date()): Blob {
  const encoder = new TextEncoder();
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name as BlobPart, entry.data as BlobPart);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, 0x0800, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, dosTime, true);
    header.setUint16(14, dosDate, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, size, true);
    header.setUint32(24, size, true);
    header.setUint16(28, name.length, true);
    header.setUint32(42, offset, true);
    const record = new Uint8Array(46 + name.length);
    record.set(new Uint8Array(header.buffer), 0);
    record.set(name, 46);
    central.push(record);

    offset += 30 + name.length + size;
  }

  const centralSize = central.reduce((sum, r) => sum + r.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as BlobPart[]), end.buffer], { type: 'application/zip' });
}

export type ZipResult =
  { status: 'empty' } | { status: 'nothing-added' } | { status: 'done'; count: number };

/**
 * "Tümünü İndir (ZIP)": `<zipName>.zip` with the files in a `<zipName>/`
 * folder. Files that cannot be fetched are skipped; duplicate names are
 * numbered; a name without an extension gets one from the response type.
 */
export async function downloadFilesAsZip(
  files: readonly Pick<AttachmentFile, 'url' | 'name' | 'extension'>[],
  zipName: string,
  fallbackName = 'Dosyalar',
): Promise<ZipResult> {
  if (files.length === 0) return { status: 'empty' };
  const folder = sanitizeZipSegment(zipName, fallbackName);
  const used = new Set<string>();
  const entries: { path: string; data: Uint8Array }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const rawName = file.name || fileNameFromUrl(file.url) || `dosya_${i + 1}`;
    if (!file.url) {
      console.warn(`Skipping file ${rawName}: no URL`);
      continue;
    }
    try {
      const response = await fetch(file.url);
      if (!response.ok) {
        console.warn(`Failed to fetch ${rawName}: ${response.status}`);
        continue;
      }
      const data = new Uint8Array(await response.arrayBuffer());
      const contentType = String(response.headers.get('content-type') || '')
        .split(';')[0]!
        .trim()
        .toLowerCase();
      const extension =
        fileExtension(rawName) || file.extension || CONTENT_TYPE_EXTENSION[contentType] || '';
      const cleaned = sanitizeZipSegment(rawName, `dosya_${i + 1}`);
      const finalName = cleaned.includes('.') || !extension ? cleaned : `${cleaned}.${extension}`;
      entries.push({ path: `${folder}/${uniqueName(finalName, used)}`, data });
    } catch (error) {
      console.error(`Error fetching file ${rawName}:`, error);
    }
  }

  if (entries.length === 0) return { status: 'nothing-added' };
  saveBlob(buildZip(entries), `${folder}.zip`);
  return { status: 'done', count: entries.length };
}

import { describe, expect, it } from 'vitest';
import {
  buildZip,
  crc32,
  extensionOf,
  fileExtension,
  fileIcon,
  fileKind,
  formatFileSize,
  isPreviewable,
  sanitizeZipSegment,
} from './files';

describe('file names', () => {
  it('reads the extension in lower case', () => {
    expect(fileExtension('Rapor.PDF')).toBe('pdf');
    expect(fileExtension('.gitignore')).toBe('');
    expect(fileExtension('README')).toBe('');
    expect(fileExtension('a.')).toBe('');
    expect(fileExtension(null)).toBe('');
  });

  it('falls back from the given extension to the name, then to the URL', () => {
    expect(
      extensionOf({ name: 'Bulgu fotoğrafı', url: 'https://s3/x/IMG_1.JPG', extension: '' }),
    ).toBe('jpg');
    expect(extensionOf({ name: 'Bulgu', url: '', extension: '.PNG' })).toBe('png');
    expect(extensionOf({ name: 'teklif.xlsx', url: 'https://s3/x/abc' })).toBe('xlsx');
  });

  it('knows what it can preview', () => {
    expect(fileKind('jpeg')).toBe('image');
    expect(fileKind('pdf')).toBe('pdf');
    expect(fileKind('dwg')).toBe('cad');
    expect(fileKind('xyz')).toBe('other');
    expect(isPreviewable('png')).toBe(true);
    expect(isPreviewable('docx')).toBe(false);
    expect(fileIcon('pdf')).toMatchObject({ icon: 'fas fa-file-pdf', family: 'red' });
  });

  it('formats sizes the legacy way', () => {
    expect(formatFileSize(532)).toBe('532 B');
    expect(formatFileSize(12_700)).toBe('12.4 KB');
    expect(formatFileSize(3_250_000)).toBe('3.1 MB');
    expect(formatFileSize(undefined)).toBe('');
  });

  it('cleans zip entry names', () => {
    expect(sanitizeZipSegment('İSG-2026/014: "foto"')).toBe('İSG-2026-014- -foto-');
    expect(sanitizeZipSegment('   ')).toBe('Dosyalar');
    expect(sanitizeZipSegment('...gizli.')).toBe('gizli');
  });
});

describe('buildZip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes local headers, a central directory and the end record', async () => {
    const data = new TextEncoder().encode('merhaba');
    const blob = buildZip([{ path: 'ISG-1/not.txt', data }], new Date(2026, 10, 2, 10, 30, 0));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(blob.type).toBe('application/zip');
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(crc32(data));
    const name = new TextDecoder().decode(bytes.slice(30, 30 + 'ISG-1/not.txt'.length));
    expect(name).toBe('ISG-1/not.txt');
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(1);
  });
});

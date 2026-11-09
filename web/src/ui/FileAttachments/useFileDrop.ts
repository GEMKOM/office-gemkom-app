import { useEffect, useRef, useState, type DragEvent } from 'react';
import { matchesAccept } from '../files';
import { notify } from '../notify';

export interface FileDropOptions {
  /** The dropped files that pass `accept`; only the first unless `multiple`. */
  onFiles: (files: File[]) => void;
  /** The input's accept attribute; dropped files outside it are refused with a warning. */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}

function hasFiles(data: DataTransfer | null | undefined): boolean {
  if (!data) return false;
  return Array.from(data.types ?? []).includes('Files') || (data.files?.length ?? 0) > 0;
}

// A file dropped just outside a target would make the browser open it and
// leave the page (and the half-filled form). While any target is on screen,
// drops elsewhere do nothing.
let guards = 0;
function guard(event: globalThis.DragEvent) {
  if (event.defaultPrevented || !hasFiles(event.dataTransfer)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
}
function installGuard() {
  if (guards++ === 0) {
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
  }
  return () => {
    if (--guards === 0) {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    }
  };
}

/** Accepted and refused files out of a drop. */
export function splitDropped(
  list: FileList | readonly File[] | null | undefined,
  { accept, multiple = false }: Pick<FileDropOptions, 'accept' | 'multiple'>,
): { files: File[]; refused: File[]; extra: File[] } {
  const all = Array.from(list ?? []);
  const files = all.filter((file) => matchesAccept(file, accept));
  const refused = all.filter((file) => !files.includes(file));
  return multiple
    ? { files, refused, extra: [] }
    : { files: files.slice(0, 1), refused, extra: files.slice(1) };
}

/**
 * Drag-and-drop for any element: spread `dropProps` on it and style it with
 * `over` (true while files are dragged over it).
 */
export function useFileDrop({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
}: FileDropOptions) {
  const [over, setOver] = useState(false);
  // dragenter/dragleave fire for every child; count them to know when the pointer really left.
  const depth = useRef(0);
  useEffect(() => installGuard(), []);

  const drop = (list: FileList | null | undefined) => {
    const { files, refused, extra } = splitDropped(list, { accept, multiple });
    if (refused.length) {
      notify.warning(
        `Bu dosya türü kabul edilmiyor: ${refused.map((file) => file.name).join(', ')}`,
      );
    }
    if (extra.length) notify.warning('Yalnızca bir dosya eklenebilir; ilk dosya alındı');
    if (files.length) onFiles(files);
  };

  const active = (event: DragEvent) => !disabled && hasFiles(event.dataTransfer);

  const dropProps = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      if (!active(event)) return;
      event.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!active(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setOver(true);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!active(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!active(event)) return;
      event.preventDefault();
      depth.current = 0;
      setOver(false);
      drop(event.dataTransfer.files);
    },
  };

  return { over: over && !disabled, dropProps };
}

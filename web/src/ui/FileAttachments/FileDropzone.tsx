import { Button, Progress } from '@mantine/core';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { FaIcon } from '../FaIcon';
import { fileExtension, fileIcon, formatFileSize } from '../files';
import classes from './FileAttachments.module.css';
import type { UploadItem } from './useUploadQueue';

export interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  /** The input's accept attribute, e.g. "image/*,.pdf". */
  accept?: string;
  disabled?: boolean;
  /** Default "Dosyaları buraya sürükleyin veya". */
  hint?: ReactNode;
  /** Default "Dosya seçin". */
  buttonLabel?: ReactNode;
  compact?: boolean;
}

/** Pick files with the button or drop them on the box. */
export function FileDropzone({
  onFiles,
  multiple = true,
  accept,
  disabled = false,
  hint = 'Dosyaları buraya sürükleyin veya',
  buttonLabel = 'Dosya seçin',
  compact = false,
}: FileDropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length || disabled) return;
    onFiles(multiple ? files : files.slice(0, 1));
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setOver(true);
  };

  return (
    <div
      className={classes.dropzone}
      data-over={over || undefined}
      data-disabled={disabled || undefined}
      data-compact={compact || undefined}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files);
      }}
    >
      <FaIcon icon="fas fa-cloud-arrow-up" className={classes.dropIcon} />
      <span className={classes.dropHint}>{hint}</span>
      <Button
        size="xs"
        variant="default"
        disabled={disabled}
        leftSection={<FaIcon icon="fas fa-paperclip" />}
        onClick={() => input.current?.click()}
      >
        {buttonLabel}
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept={accept}
        data-testid="file-input"
        onChange={(event) => {
          take(event.currentTarget.files);
          event.currentTarget.value = ''; // the same file can be picked again
        }}
      />
    </div>
  );
}

export interface UploadQueueListProps {
  items: readonly UploadItem[];
  onRetry?: (key: string) => void;
  onDismiss?: (key: string) => void;
}

/** Files on their way up: progress while uploading, the error and a retry when one fails. */
export function UploadQueueList({ items, onRetry, onDismiss }: UploadQueueListProps) {
  if (!items.length) return null;
  return (
    <ul className={classes.queue} aria-label="Yüklenen dosyalar">
      {items.map((item) => {
        const { icon, family } = fileIcon(fileExtension(item.file.name));
        const percent = Math.round(item.progress * 100);
        return (
          <li key={item.key} className={classes.queueItem} data-status={item.status}>
            <span className={classes.tile} data-family={item.status === 'error' ? 'red' : family}>
              <FaIcon icon={item.status === 'error' ? 'fas fa-triangle-exclamation' : icon} />
            </span>
            <div className={classes.queueMain}>
              <div className={classes.queueRow}>
                <span className={classes.name}>{item.file.name}</span>
                <span className={classes.meta}>
                  {item.status === 'error'
                    ? formatFileSize(item.file.size)
                    : item.status === 'queued'
                      ? 'Sırada'
                      : `%${percent}`}
                </span>
              </div>
              {item.status === 'error' ? (
                <div className={classes.queueError} role="alert">
                  {item.error}
                </div>
              ) : (
                <Progress
                  value={item.status === 'queued' ? 0 : percent}
                  size="sm"
                  color="var(--gk-red-700)"
                  aria-label={`${item.file.name} yükleniyor`}
                  animated={item.status === 'uploading' && percent < 100}
                />
              )}
            </div>
            {item.status === 'error' ? (
              <div className={classes.queueActions}>
                {onRetry ? (
                  <Button size="compact-xs" variant="default" onClick={() => onRetry(item.key)}>
                    Tekrar dene
                  </Button>
                ) : null}
                {onDismiss ? (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => onDismiss(item.key)}
                  >
                    Kaldır
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

import { ActionIcon, Loader, Tooltip } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import { formatDateTime } from '@/lib/format';
import { confirm } from '../confirm';
import { FaIcon } from '../FaIcon';
import {
  downloadFile,
  extensionOf,
  fileIcon,
  fileKind,
  formatFileSize,
  type AttachmentFile,
} from '../files';
import { FileViewer } from '../FileViewer/FileViewer';
import { notify } from '../notify';
import classes from './FileAttachments.module.css';
import { FileDropzone, UploadQueueList } from './FileDropzone';
import { useUploadQueue, type UploadFn, type UploadResult } from './useUploadQueue';

export interface FileAttachmentsProps {
  files: readonly AttachmentFile[];
  /** The list is loading (first load: a spinner instead of the list). */
  loading?: boolean;
  /** The list failed to load. */
  error?: unknown;
  /** 'list' (default): rows; 'grid': cards that wrap. */
  layout?: 'list' | 'grid';
  /** A header over the list; the count follows it. */
  title?: ReactNode;
  /** Header buttons on the right, e.g. "Tümünü İndir (ZIP)". */
  actions?: ReactNode;
  /** Default "Henüz dosya yok.". */
  emptyText?: ReactNode;
  /** Hides upload and delete, whatever else is passed. */
  readOnly?: boolean;
  /** Turns the dropzone on. Each picked or dropped file goes through it, one at a time. */
  onUpload?: UploadFn;
  /** After a batch: refresh the list, tell the user. */
  onUploaded?: (result: UploadResult) => void;
  /** Turns the delete button on (after a confirm). Refresh the list yourself. */
  onDelete?: (file: AttachmentFile) => Promise<unknown>;
  /** Per-file delete permission; default every file. */
  canDelete?: (file: AttachmentFile) => boolean;
  multiple?: boolean;
  accept?: string;
  /** Bytes per file. */
  maxSize?: number;
  /** Default: the built-in FileViewer. */
  onPreview?: (file: AttachmentFile, index: number) => void;
  /** Thumbnail edge in px for images (legacy maxThumbnailSize). Default 48. */
  thumbnailSize?: number;
}

function Thumbnail({ file, size }: { file: AttachmentFile; size: number }) {
  const extension = extensionOf(file);
  const [broken, setBroken] = useState(false);
  const { icon, family } = fileIcon(extension);
  if (fileKind(extension) === 'image' && file.url && !broken) {
    return (
      <img
        className={classes.thumb}
        src={file.url}
        alt=""
        loading="lazy"
        width={size}
        height={size}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={classes.tile} data-family={family} style={{ width: size, height: size }}>
      <FaIcon icon={icon} />
    </span>
  );
}

/**
 * A record's files (legacy components/file-attachments): icon or thumbnail,
 * name, size, type, uploader and date; preview in FileViewer, download, and,
 * unless read-only, upload by picking or dropping (with progress and per-file
 * errors) and delete after a confirm. Each page passes its own endpoints.
 */
export function FileAttachments({
  files,
  loading = false,
  error,
  layout = 'list',
  title,
  actions,
  emptyText = 'Henüz dosya yok.',
  readOnly = false,
  onUpload,
  onUploaded,
  onDelete,
  canDelete,
  multiple = true,
  accept,
  maxSize,
  onPreview,
  thumbnailSize = 48,
}: FileAttachmentsProps) {
  const [viewing, setViewing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const queue = useUploadQueue(onUpload ?? (() => Promise.resolve()), { maxSize });
  const uploadable = !readOnly && Boolean(onUpload);

  const startUpload = async (picked: File[]) => {
    const result = await queue.start(picked);
    onUploaded?.(result);
  };
  const retry = async (key: string) => {
    const result = await queue.retry(key);
    onUploaded?.(result);
  };

  const preview = (file: AttachmentFile, index: number) => {
    if (onPreview) onPreview(file, index);
    else setViewing(index);
  };

  const remove = async (file: AttachmentFile) => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Dosya Sil',
      subtitle: 'Bu işlem geri alınamaz',
      icon: 'fas fa-trash',
      message: 'Bu dosyayı silmek istiyor musunuz?',
      details: file.name,
      confirmLabel: 'Sil',
      danger: true,
    });
    if (!ok) return;
    const key = String(file.id ?? file.url);
    setDeleting(key);
    try {
      await onDelete(file);
    } catch (err) {
      notify.error(err, { fallback: 'Dosya silinirken hata oluştu' });
    } finally {
      setDeleting(null);
    }
  };

  let body: ReactNode;
  if (loading && !files.length) {
    body = (
      <div className={classes.state}>
        <Loader size="sm" color="gray" /> Dosyalar yükleniyor…
      </div>
    );
  } else if (error && !files.length) {
    body = (
      <div className={classes.state} data-tone="error" role="alert">
        <FaIcon icon="fas fa-triangle-exclamation" /> Dosyalar yüklenemedi.
      </div>
    );
  } else if (!files.length) {
    body = queue.items.length ? null : <div className={classes.state}>{emptyText}</div>;
  } else {
    body = (
      <ul className={classes.files} data-layout={layout} aria-label="Dosyalar">
        {files.map((file, index) => {
          const key = String(file.id ?? file.url ?? index);
          const facts = [
            file.typeLabel ? `Tür: ${file.typeLabel}` : null,
            file.description && file.description !== file.name ? file.description : null,
          ].filter(Boolean);
          const by = [
            file.uploadedBy,
            file.uploadedAt ? formatDateTime(file.uploadedAt) : null,
            formatFileSize(file.size) || null,
          ]
            .filter(Boolean)
            .join(' · ');
          const deletable = !readOnly && Boolean(onDelete) && (canDelete ? canDelete(file) : true);
          return (
            <li key={key} className={classes.file}>
              <button
                type="button"
                className={classes.thumbButton}
                aria-label={`${file.name} önizle`}
                onClick={() => preview(file, index)}
              >
                <Thumbnail file={file} size={thumbnailSize} />
              </button>
              <div className={classes.fileMain}>
                <button
                  type="button"
                  className={classes.nameButton}
                  onClick={() => preview(file, index)}
                >
                  {file.name}
                </button>
                {facts.length ? <div className={classes.meta}>{facts.join(' · ')}</div> : null}
                {by ? <div className={classes.meta}>{by}</div> : null}
              </div>
              <div className={classes.fileActions}>
                <Tooltip label="Önizle" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Önizle"
                    onClick={() => preview(file, index)}
                  >
                    <FaIcon icon="fas fa-eye" />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="İndir" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="İndir"
                    disabled={!file.url}
                    onClick={() => void downloadFile(file.url, file.name)}
                  >
                    <FaIcon icon="fas fa-download" />
                  </ActionIcon>
                </Tooltip>
                {deletable ? (
                  <Tooltip label="Sil" withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      className={classes.danger}
                      aria-label="Sil"
                      loading={deleting === key}
                      onClick={() => void remove(file)}
                    >
                      <FaIcon icon="fas fa-trash" />
                    </ActionIcon>
                  </Tooltip>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className={classes.root}>
      {title || actions ? (
        <div className={classes.head}>
          {title ? (
            <h4 className={classes.title}>
              <FaIcon icon="fas fa-paperclip" />
              {title}
              {files.length ? <span className={classes.count}>{files.length}</span> : null}
            </h4>
          ) : (
            <span />
          )}
          {actions ? <div className={classes.headActions}>{actions}</div> : null}
        </div>
      ) : null}
      {body}
      <UploadQueueList
        items={queue.items}
        onRetry={(key) => void retry(key)}
        onDismiss={queue.dismiss}
      />
      {uploadable ? (
        <FileDropzone
          onFiles={(picked) => void startUpload(picked)}
          multiple={multiple}
          accept={accept}
          compact={files.length > 0}
        />
      ) : null}
      {onPreview ? null : (
        <FileViewer
          files={files}
          index={viewing}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

import { ActionIcon, Button, Loader, Modal, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FaIcon } from '../FaIcon';
import {
  downloadFile,
  extensionOf,
  fileIcon,
  fileKind,
  formatFileSize,
  type AttachmentFile,
} from '../files';
import { ModalFooter, ModalHeader, modalClassNames } from '../ModalParts';
import classes from './FileViewer.module.css';

const ZOOM_STEP = 25;
const ZOOM_MIN = 25;
const ZOOM_MAX = 300;

export interface FileViewerProps {
  files: readonly AttachmentFile[];
  /** The open file; null keeps the viewer closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** Keys typed into a field belong to the field, not to the viewer. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(
    el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)),
  );
}

function DownloadCard({ file, message }: { file: AttachmentFile; message: string }) {
  const { icon, family } = fileIcon(extensionOf(file));
  return (
    <div className={classes.card}>
      <span className={classes.cardTile} data-family={family}>
        <FaIcon icon={icon} />
      </span>
      <div className={classes.cardName}>{file.name}</div>
      <p className={classes.cardText}>{message}</p>
      <Button
        leftSection={<FaIcon icon="fas fa-download" />}
        onClick={() => void downloadFile(file.url, file.name)}
      >
        İndir
      </Button>
    </div>
  );
}

function TextPreview({ file }: { file: AttachmentFile }) {
  const text = useQuery({
    queryKey: ['fileViewer', 'text', file.url],
    queryFn: async ({ signal }) => {
      const response = await fetch(file.url, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    },
    staleTime: Infinity,
    retry: false,
  });
  if (text.isPending) return <Loader color="gray" />;
  if (text.isError) return <DownloadCard file={file} message="Metin dosyası yüklenemedi." />;
  return <pre className={classes.text}>{text.data}</pre>;
}

function ImagePreview({ file, zoom }: { file: AttachmentFile; zoom: number }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  if (state === 'error') return <DownloadCard file={file} message="Resim yüklenemedi." />;
  return (
    <div className={classes.imageScroller} data-zoomed={zoom > 100 || undefined}>
      {state === 'loading' ? <Loader color="gray" className={classes.loader} /> : null}
      <img
        src={file.url}
        alt={file.name}
        className={classes.image}
        data-ready={state === 'ready' || undefined}
        style={{ transform: `scale(${zoom / 100})` }}
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
      />
    </div>
  );
}

function Preview({ file, zoom }: { file: AttachmentFile; zoom: number }) {
  const kind = fileKind(extensionOf(file));
  if (!file.url) return <DownloadCard file={file} message="Dosya adresi bulunamadı." />;
  switch (kind) {
    case 'image':
      return <ImagePreview file={file} zoom={zoom} />;
    case 'pdf':
      return <iframe className={classes.frame} src={file.url} title={file.name} />;
    case 'video':
      return (
        <video className={classes.video} src={file.url} controls>
          Tarayıcınız video önizlemesini desteklemiyor.
        </video>
      );
    case 'text':
      return <TextPreview file={file} />;
    default:
      return (
        <DownloadCard
          file={file}
          message="Bu dosya türü için önizleme yok. İndirip bilgisayarınızda açabilirsiniz."
        />
      );
  }
}

/**
 * Preview attachments in a modal (legacy components/file-viewer): images with
 * zoom, PDFs in the browser's own viewer, video and plain text; anything else
 * gets a download card. ← → move between files, + − 0 zoom, Escape closes.
 */
export function FileViewer({ files, index, onIndexChange, onClose }: FileViewerProps) {
  const phone = useMediaQuery('(max-width: 48em)');
  const file = index !== null ? files[index] : undefined;
  const opened = Boolean(file);
  const count = files.length;
  // Zoom belongs to the file it was set on; moving on starts at 100%.
  const [zoomState, setZoomState] = useState({ index, zoom: 100 });
  const zoom = zoomState.index === index ? zoomState.zoom : 100;
  const setZoom = (next: (zoom: number) => number) =>
    setZoomState((prev) => ({ index, zoom: next(prev.index === index ? prev.zoom : 100) }));

  const extension = file ? extensionOf(file) : '';
  const kind = fileKind(extension);
  const zoomable = kind === 'image';
  const canStep = count > 1 && index !== null;
  const step = (delta: number) => {
    if (index === null || count < 2) return;
    onIndexChange((index + delta + count) % count);
  };

  useEffect(() => {
    if (!opened) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        if (count < 2 || index === null) return;
        event.preventDefault();
        onIndexChange((index + (event.key === 'ArrowRight' ? 1 : -1) + count) % count);
        return;
      }
      if (!zoomable) return;
      const change =
        event.key === '+' || event.key === '='
          ? (z: number) => Math.min(z + ZOOM_STEP, ZOOM_MAX)
          : event.key === '-'
            ? (z: number) => Math.max(z - ZOOM_STEP, ZOOM_MIN)
            : event.key === '0'
              ? () => 100
              : null;
      if (!change) return;
      event.preventDefault();
      setZoomState((prev) => ({ index, zoom: change(prev.index === index ? prev.zoom : 100) }));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [opened, count, index, zoomable, onIndexChange]);

  const { icon, label } = fileIcon(extension);
  const subtitle = file
    ? [
        count > 1 ? `${(index ?? 0) + 1} / ${count}` : null,
        label,
        formatFileSize(file.size) || null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={1100}
      fullScreen={Boolean(phone)}
      withCloseButton={false}
      classNames={modalClassNames}
    >
      {file ? (
        <>
          <ModalHeader title={file.name} subtitle={subtitle} icon={icon} />
          <div className={classes.stage} data-kind={kind}>
            {/* Keyed by file, so a new file starts loading from scratch. */}
            <Preview key={`${index}-${file.url}`} file={file} zoom={zoom} />
            {canStep ? (
              <>
                <button
                  type="button"
                  className={classes.nav}
                  data-side="prev"
                  aria-label="Önceki dosya"
                  onClick={() => step(-1)}
                >
                  <FaIcon icon="fas fa-chevron-left" />
                </button>
                <button
                  type="button"
                  className={classes.nav}
                  data-side="next"
                  aria-label="Sonraki dosya"
                  onClick={() => step(1)}
                >
                  <FaIcon icon="fas fa-chevron-right" />
                </button>
              </>
            ) : null}
          </div>
          <ModalFooter>
            {zoomable ? (
              <div className={classes.zoom} role="group" aria-label="Yakınlaştırma">
                <Tooltip label="Uzaklaştır (−)" withArrow>
                  <ActionIcon
                    variant="default"
                    aria-label="Uzaklaştır"
                    disabled={zoom <= ZOOM_MIN}
                    onClick={() => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN))}
                  >
                    <FaIcon icon="fas fa-magnifying-glass-minus" />
                  </ActionIcon>
                </Tooltip>
                <span className={classes.zoomValue} aria-live="polite">
                  %{zoom}
                </span>
                <Tooltip label="Yakınlaştır (+)" withArrow>
                  <ActionIcon
                    variant="default"
                    aria-label="Yakınlaştır"
                    disabled={zoom >= ZOOM_MAX}
                    onClick={() => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX))}
                  >
                    <FaIcon icon="fas fa-magnifying-glass-plus" />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Sığdır (0)" withArrow>
                  <ActionIcon
                    variant="default"
                    aria-label="Sığdır"
                    disabled={zoom === 100}
                    onClick={() => setZoom(() => 100)}
                  >
                    <FaIcon icon="fas fa-expand" />
                  </ActionIcon>
                </Tooltip>
              </div>
            ) : null}
            <Button
              variant="default"
              onClick={onClose}
              leftSection={<FaIcon icon="fas fa-times" />}
            >
              Kapat
            </Button>
            <Button
              leftSection={<FaIcon icon="fas fa-download" />}
              disabled={!file.url}
              onClick={() => void downloadFile(file.url, file.name)}
            >
              İndir
            </Button>
          </ModalFooter>
        </>
      ) : null}
    </Modal>
  );
}

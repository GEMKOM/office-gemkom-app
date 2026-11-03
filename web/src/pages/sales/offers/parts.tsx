import { Button, Checkbox, Group, Loader, Text } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import type { OfferFile } from '@/api/sales/offers';
import { FaIcon, FileViewer, type AttachmentFile } from '@/ui';
import css from './OffersPage.module.css';

/** A titled block of label / value rows (the legacy field-list sections). */
export function FieldSection({
  title,
  icon,
  action,
  muted,
  children,
}: {
  title: ReactNode;
  icon: string;
  action?: ReactNode;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={css.fieldSection}>
      <h4 className={css.fieldSectionTitle} data-muted={muted || undefined}>
        <span>
          <FaIcon icon={icon} /> {title}
        </span>
        {action}
      </h4>
      <dl className={css.fieldList}>{children}</dl>
    </section>
  );
}

export function FieldRow({
  label,
  icon,
  children,
  multiline,
}: {
  label: ReactNode;
  icon: string;
  children: ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className={css.fieldRow} data-multiline={multiline || undefined}>
      <dt>
        <FaIcon icon={icon} /> {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/** The centred grey message of an empty tab. */
export function EmptyState({
  icon = 'fas fa-inbox',
  children,
}: {
  icon?: string;
  children: ReactNode;
}) {
  return (
    <div className={css.empty}>
      <FaIcon icon={icon} />
      <div>{children}</div>
    </div>
  );
}

export function LoadingText({ children = 'Yükleniyor...' }: { children?: ReactNode }) {
  return (
    <Text size="sm" c="dimmed" ta="center" py="lg">
      <Loader size={14} mr={8} />
      {children}
    </Text>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text size="sm" c="red" ta="center" py="lg">
      {children}
    </Text>
  );
}

export function offerFileName(file: OfferFile): string {
  return file.filename || file.name || 'Dosya';
}

export function offerFileUrl(file: OfferFile): string {
  return file.file_url || file.url || file.file || '';
}

export function toAttachment(file: OfferFile): AttachmentFile {
  return {
    id: file.id,
    url: offerFileUrl(file),
    name: offerFileName(file),
    size: file.file_size ?? null,
    uploadedAt: file.uploaded_at ?? null,
    uploadedBy:
      file.uploaded_by_name || (file.uploaded_by != null ? String(file.uploaded_by) : null),
    typeLabel: file.file_type_display || file.file_type || null,
    description: file.name || null,
  };
}

/**
 * The offer's files with a checkbox each and a preview button (consultation
 * and convert modals). `withToolbar` adds Tümünü Seç / Seçimi Temizle and the
 * count.
 */
export function FileChecklist({
  files,
  loading,
  error,
  selected,
  onChange,
  title,
  hint,
  emptyTitle,
  emptyText,
  withToolbar,
}: {
  files: OfferFile[] | undefined;
  loading: boolean;
  error: boolean;
  selected: number[];
  onChange: (ids: number[]) => void;
  title: string;
  hint: string;
  emptyTitle: string;
  emptyText: string;
  withToolbar?: boolean;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  if (loading) {
    return (
      <Text size="sm" c="dimmed">
        <Loader size={12} mr={6} />
        Dosyalar yükleniyor...
      </Text>
    );
  }
  if (error) {
    return (
      <div>
        <Text fw={600} size="sm" c="red" mb={4}>
          <FaIcon icon="fas fa-exclamation-triangle" /> Dosyalar yüklenemedi
        </Text>
        <Text size="sm" c="dimmed">
          Dosyalar yüklenirken bir hata oluştu. Lütfen tekrar deneyin.
        </Text>
      </div>
    );
  }
  const list = files ?? [];
  if (!list.length) {
    return (
      <div>
        <Text fw={600} size="sm" c="dimmed" mb={4}>
          <FaIcon icon="fas fa-paperclip" /> {emptyTitle}
        </Text>
        <Text size="sm" c="dimmed">
          {emptyText}
        </Text>
      </div>
    );
  }
  const viewerFiles = list.map(toAttachment);
  const toggle = (id: number, on: boolean) =>
    onChange(on ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id));
  return (
    <div>
      <Text fw={600} size="sm" mb={4}>
        <FaIcon icon="fas fa-paperclip" /> {title}
      </Text>
      <Text size="sm" c="dimmed" mb="xs">
        {hint}
      </Text>
      {withToolbar ? (
        <Group gap="xs" mb="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={<FaIcon icon="fas fa-check-double" />}
            onClick={() => onChange(list.map((f) => f.id))}
          >
            Tümünü Seç
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<FaIcon icon="fas fa-eraser" />}
            onClick={() => onChange([])}
          >
            Seçimi Temizle
          </Button>
          <Text size="xs" c="dimmed" ml="auto">
            {selected.length} / {list.length} dosya seçili
          </Text>
        </Group>
      ) : null}
      {list.map((file, index) => (
        <div key={file.id} className={css.fileRow}>
          <Checkbox
            aria-label={offerFileName(file)}
            checked={selected.includes(file.id)}
            onChange={(e) => toggle(file.id, e.currentTarget.checked)}
          />
          <FaIcon icon="fas fa-file" />
          <div className={css.fileRowText}>
            <div className={css.fileRowName}>{offerFileName(file)}</div>
            <Text size="xs" c="dimmed">
              Tür: {file.file_type_display || file.file_type || '-'}
            </Text>
            <Text size="xs" c="dimmed">
              İsim: {file.name || '-'}
            </Text>
          </div>
          <Button
            size="xs"
            variant="light"
            leftSection={<FaIcon icon="fas fa-eye" />}
            onClick={() => setPreview(index)}
          >
            Önizle
          </Button>
        </div>
      ))}
      {preview !== null ? (
        <FileViewer
          files={viewerFiles}
          index={preview}
          onIndexChange={setPreview}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}

import { StatusBadge, type StatusFamily } from '@/ui';
import type { RequestFile } from '@/api/procurement/purchaseRequests';
import type { AttachmentFile } from '@/ui';

// getStatusBadge / getPriorityBadge of pending.js and registry.js.

const STATUS_COLOR: Record<string, StatusFamily> = {
  draft: 'grey',
  submitted: 'yellow',
  approved: 'green',
  cancelled: 'red',
};

export function RequestStatusBadge({ status, label }: { status: string; label?: string | null }) {
  return <StatusBadge color={STATUS_COLOR[status] ?? 'grey'}>{label || status}</StatusBadge>;
}

export const PRIORITY: Record<string, { label: string; color: StatusFamily }> = {
  normal: { label: 'Normal', color: 'grey' },
  urgent: { label: 'Acil', color: 'yellow' },
  critical: { label: 'Kritik', color: 'red' },
};

export function PriorityBadge({ priority }: { priority?: string | null }) {
  const meta = priority ? PRIORITY[priority] : undefined;
  return <StatusBadge color={meta?.color ?? 'grey'}>{meta?.label ?? priority ?? ''}</StatusBadge>;
}

/** API file row → AttachmentFile; name = last path segment of file_name, else 'Dosya'. */
export function toAttachment(file: RequestFile): AttachmentFile {
  const fromName = file.file_name ? String(file.file_name).split('/').pop() : '';
  return {
    id: file.id ?? file.file_url,
    url: file.file_url,
    name: fromName || 'Dosya',
    size: typeof file.file_size === 'number' ? file.file_size : null,
    uploadedBy: (file.uploaded_by_username as string | undefined) ?? null,
    uploadedAt: (file.uploaded_at as string | undefined) ?? null,
  };
}

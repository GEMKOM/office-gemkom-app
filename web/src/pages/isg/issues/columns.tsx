import { Avatar, Group, Text } from '@mantine/core';
import {
  ISG_SEVERITY_BADGE,
  ISG_STATUS_BADGE,
  type IsgIssue,
  type IsgIssueFile,
  type IsgPerson,
} from '@/api/isg/issues';
import { formatDate } from '@/lib/format';
import { extensionOf, FaIcon, StatusBadge, type AttachmentFile, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

export function IsgStatusBadge({ issue }: { issue: Pick<IsgIssue, 'status' | 'status_display'> }) {
  const info = ISG_STATUS_BADGE[issue.status] ?? { color: 'grey', label: issue.status };
  return <StatusBadge color={info.color}>{issue.status_display || info.label}</StatusBadge>;
}

export function IsgSeverityBadge({
  issue,
}: {
  issue: Pick<IsgIssue, 'severity' | 'severity_display'>;
}) {
  const info = ISG_SEVERITY_BADGE[issue.severity] ?? { color: 'grey', label: issue.severity };
  return <StatusBadge color={info.color}>{issue.severity_display || info.label}</StatusBadge>;
}

export function PersonChip({ person }: { person: IsgPerson }) {
  const name = person.name || person.username || '';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
      <Avatar name={name} color="initials" size={22} radius="xl" />
      <Text size="sm" span>
        {name}
      </Text>
    </span>
  );
}

export function Assignees({ issue }: { issue: IsgIssue }) {
  const people = issue.assigned_to_data ?? [];
  if (!people.length) return <Text c="dimmed">-</Text>;
  return (
    <Group gap={4} wrap="wrap">
      {people.map((person) => (
        <PersonChip key={person.id} person={person} />
      ))}
    </Group>
  );
}

/** Deadline: overdue in red with a warning icon. */
export function DueDate({ issue, detail = false }: { issue: IsgIssue; detail?: boolean }) {
  if (!issue.due_date) return <Text c="dimmed">-</Text>;
  const label = formatDate(issue.due_date);
  if (issue.is_overdue) {
    return (
      <Text c="var(--gk-danger)" fw={600} span size="sm">
        <FaIcon icon="fas fa-triangle-exclamation" style={{ marginRight: 4 }} />
        {label}
        {detail ? ' (gecikmiş)' : ''}
      </Text>
    );
  }
  return <span>{label}</span>;
}

/** The serializer's file row as FileAttachments shows it (legacy normalizeIssueFile). */
export function toAttachmentFile(file: IsgIssueFile): AttachmentFile {
  const url = file.url || file.file_url || file.file || '';
  const rawName = file.name || 'Dosya';
  // `name` may be a free-text title with no extension; the viewer needs one.
  const extension = extensionOf({ name: rawName, url, extension: file.extension ?? '' });
  const name =
    extension && !rawName.toLowerCase().endsWith(`.${extension}`)
      ? `${rawName}.${extension}`
      : rawName;
  return {
    id: file.id,
    url,
    name,
    extension,
    size: file.size ?? file.file_size ?? null,
    typeLabel: file.file_type_display || null,
    description: file.description || null,
    uploadedAt: file.uploaded_at ?? null,
    uploadedBy: file.uploaded_by_name || null,
  };
}

/** Port of the issues.js table. */
export const isgColumns: DataTableColumn<IsgIssue>[] = [
  {
    key: 'issue_number',
    header: 'Bildirim No',
    sortable: true,
    width: 140,
    render: (row) => <span className={uiClasses.code}>{row.issue_number || '-'}</span>,
    exportValue: (row) => row.issue_number,
  },
  {
    key: 'title',
    header: 'Başlık',
    sortable: true,
    render: (row) => (
      <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>
        {row.title || '-'}
      </Text>
    ),
  },
  {
    key: 'category_display',
    header: 'Kategori',
    width: 170,
    render: (row) =>
      row.category_display ? <StatusBadge color="grey">{row.category_display}</StatusBadge> : '-',
  },
  {
    key: 'severity',
    header: 'Önem',
    sortable: true,
    width: 100,
    render: (row) => <IsgSeverityBadge issue={row} />,
  },
  {
    key: 'status',
    header: 'Durum',
    sortable: true,
    width: 140,
    render: (row) => <IsgStatusBadge issue={row} />,
  },
  {
    key: 'location',
    header: 'Yer',
    width: 150,
    render: (row) => row.location || <Text c="dimmed">-</Text>,
  },
  {
    key: 'assigned_to',
    header: 'Atananlar',
    width: 220,
    render: (row) => <Assignees issue={row} />,
  },
  {
    key: 'due_date',
    header: 'Termin',
    sortable: true,
    width: 130,
    render: (row) => <DueDate issue={row} />,
  },
  {
    key: 'file_count',
    header: 'Ek',
    width: 64,
    render: (row) =>
      row.file_count ? (
        <Text c="dimmed" size="sm" span>
          <FaIcon icon="fas fa-paperclip" style={{ marginRight: 4 }} />
          {row.file_count}
        </Text>
      ) : (
        <Text c="dimmed">-</Text>
      ),
  },
  {
    key: 'created_at',
    header: 'Oluşturulma',
    sortable: true,
    width: 120,
    render: (row) => (row.created_at ? formatDate(row.created_at) : '-'),
  },
];

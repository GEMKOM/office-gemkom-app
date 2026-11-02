import { ActionIcon, Anchor, Group, Paper, SimpleGrid, Table, Text, Tooltip } from '@mantine/core';
import {
  DEPARTMENT_OPTIONS,
  type DepartmentRequest,
  type DepartmentRequestFile,
  type DepartmentRequestItem,
} from '@/api/general/departmentRequests';
import { formatDate } from '@/lib/format';
import { FaIcon, StatusBadge, type StatusFamily } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

// Helpers both department-request pages share (legacy list.js / pending.js /
// modals.js each had a copy).

const STATUS_FAMILY: Record<string, StatusFamily> = {
  approved: 'green',
  submitted: 'yellow',
  rejected: 'red',
  cancelled: 'red',
  transferred: 'blue',
  draft: 'grey',
};

export function RequestStatusBadge({
  row,
}: {
  row: Pick<DepartmentRequest, 'status' | 'status_label'>;
}) {
  const family = STATUS_FAMILY[row.status ?? ''] ?? 'grey';
  return <StatusBadge color={family}>{row.status_label || row.status || 'Bilinmiyor'}</StatusBadge>;
}

const PRIORITY: Record<string, { color: StatusFamily; label: string }> = {
  critical: { color: 'red', label: 'Kritik' },
  urgent: { color: 'yellow', label: 'Acil' },
  normal: { color: 'blue', label: 'Normal' },
};

export function priorityLabel(priority: string | null | undefined): string {
  return PRIORITY[priority ?? '']?.label ?? 'Normal';
}

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  const entry = PRIORITY[priority ?? ''] ?? { color: 'grey' as const, label: 'Normal' };
  return <StatusBadge color={entry.color}>{entry.label}</StatusBadge>;
}

/** Legacy formatDepartmentName. */
export function departmentName(department: string | null | undefined): string {
  if (!department) return '-';
  const known = DEPARTMENT_OPTIONS.find((d) => d.value === department);
  return known ? known.label : department.charAt(0).toUpperCase() + department.slice(1);
}

export function departmentLabel(
  row: Pick<DepartmentRequest, 'department' | 'department_label'>,
): string {
  return row.department_label || departmentName(row.department) || '-';
}

export function RequestNo({ id }: { id: number | string | null | undefined }) {
  return <span className={uiClasses.code}>{id ?? '-'}</span>;
}

export function itemsCount(row: Pick<DepartmentRequest, 'items_count' | 'items'>): number {
  return row.items_count ?? row.items?.length ?? 0;
}

/**
 * Stored file names are prefixed with the upload uuid (`<uuid>_original.pdf`);
 * show the original name so a file can be matched to its item row.
 */
export function prettyFileName(file: DepartmentRequestFile | null | undefined): string {
  const raw = String(file?.file_name ?? '')
    .split('/')
    .pop();
  if (!raw) return 'Dosya';
  return raw.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '');
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) return 'fas fa-file-image';
  if (ext === 'pdf') return 'fas fa-file-pdf';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'fas fa-file-excel';
  if (['doc', 'docx'].includes(ext)) return 'fas fa-file-word';
  if (['zip', 'rar', '7z'].includes(ext)) return 'fas fa-file-archive';
  if (['dwg', 'dxf', 'step', 'stp', 'igs', 'iges'].includes(ext)) return 'fas fa-drafting-compass';
  return 'fas fa-file';
}

/**
 * Small stand-in for components/file-attachments + file-viewer: one card per
 * file; the name opens it in a new tab, the icon downloads it.
 */
export function FileAttachmentList({
  files,
}: {
  files: DepartmentRequestFile[] | null | undefined;
}) {
  const list = files ?? [];
  if (list.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Dosya eki yok
      </Text>
    );
  }
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
      {list.map((file, index) => {
        const name = prettyFileName(file);
        const url = file.file_url ?? undefined;
        return (
          <Paper key={file.id ?? index} withBorder p="sm" radius="sm">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <FaIcon icon={fileIcon(name)} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Anchor
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="sm"
                  title={name}
                  lineClamp={1}
                >
                  {name}
                </Anchor>
                <Text size="xs" c="dimmed">
                  {[
                    file.uploaded_by_username,
                    file.uploaded_at ? formatDate(file.uploaded_at) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || ' '}
                </Text>
              </div>
              {url ? (
                <Tooltip label="İndir" withArrow>
                  <ActionIcon
                    component="a"
                    href={url}
                    download={name}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="subtle"
                    color="gray"
                    aria-label={`${name} indir`}
                  >
                    <FaIcon icon="fas fa-download" />
                  </ActionIcon>
                </Tooltip>
              ) : null}
            </Group>
          </Paper>
        );
      })}
    </SimpleGrid>
  );
}

/** Items are free-form JSON in two shapes (`name`/`unit` and `item_name`/`item_unit`); read both. */
export function normalizeItem(item: DepartmentRequestItem) {
  return {
    item_code: item.item_code || item.code || '-',
    name: item.item_name || item.name || item.product_name || '-',
    job_no: item.job_no || '-',
    quantity: item.quantity ?? null,
    unit: item.item_unit || item.unit || null,
    item_description: item.item_description || item.description || '-',
    item_specifications: item.item_specifications || item.specifications || '-',
  };
}

export interface ItemsTableProps {
  items: DepartmentRequestItem[];
  /** The pending page's table: row numbers, job no, item files, unit defaulting to Adet. */
  approval?: boolean;
  /** For `approval`: the request's files, matched to rows by asset id. */
  files?: DepartmentRequestFile[];
}

export function ItemsTable({ items, approval = false, files = [] }: ItemsTableProps) {
  const byAsset = new Map(
    files
      .filter((f) => f.asset_id !== null && f.asset_id !== undefined)
      .map((f) => [String(f.asset_id), f] as const),
  );
  return (
    <Table.ScrollContainer minWidth={approval ? 900 : 640}>
      <Table striped withTableBorder verticalSpacing={6} fz="sm">
        <Table.Thead>
          <Table.Tr>
            {approval ? <Table.Th>#</Table.Th> : null}
            <Table.Th>Ürün Kodu</Table.Th>
            <Table.Th>{approval ? 'Ad' : 'Ürün Adı'}</Table.Th>
            {approval ? <Table.Th>İş Emri</Table.Th> : null}
            <Table.Th>Miktar</Table.Th>
            <Table.Th>Birim</Table.Th>
            <Table.Th>Ürün Açıklaması</Table.Th>
            <Table.Th>Özellikler</Table.Th>
            {approval ? <Table.Th>Dosyalar</Table.Th> : null}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((raw, index) => {
            const item = normalizeItem(raw);
            const itemFiles = (raw.file_asset_ids ?? [])
              .map((id) => byAsset.get(String(id)))
              .filter((f): f is DepartmentRequestFile => Boolean(f));
            const quantity = approval
              ? (item.quantity ?? 0)
              : item.quantity || item.quantity === 0
                ? item.quantity
                : '-';
            return (
              <Table.Tr key={index}>
                {approval ? <Table.Td>{index + 1}</Table.Td> : null}
                <Table.Td fw={700}>{item.item_code}</Table.Td>
                <Table.Td>{item.name}</Table.Td>
                {approval ? <Table.Td>{item.job_no}</Table.Td> : null}
                <Table.Td>{String(quantity)}</Table.Td>
                <Table.Td>{item.unit || (approval ? 'Adet' : '-')}</Table.Td>
                <Table.Td>{item.item_description}</Table.Td>
                <Table.Td>{item.item_specifications}</Table.Td>
                {approval ? (
                  <Table.Td>
                    {itemFiles.length === 0 ? (
                      <Text c="dimmed" size="sm">
                        -
                      </Text>
                    ) : (
                      itemFiles.map((file, fileIndex) => (
                        <Anchor
                          key={fileIndex}
                          href={file.file_url ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="xs"
                          display="block"
                          maw={220}
                          truncate
                          title={prettyFileName(file)}
                        >
                          <FaIcon icon="fas fa-paperclip" /> {prettyFileName(file)}
                        </Anchor>
                      ))
                    )}
                  </Table.Td>
                ) : null}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

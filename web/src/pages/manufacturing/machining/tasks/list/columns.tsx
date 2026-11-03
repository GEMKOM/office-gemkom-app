import { Badge, Button, Tooltip } from '@mantine/core';
import type { MachiningPart } from '@/api/manufacturing/machiningParts';
import { formatDate } from '@/lib/format';
import { FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import { allocationTooltip, getPartAllocations } from './allocations';
import classes from './MachiningParts.module.css';

export interface PartColumnHandlers {
  /** İş No / Adet cells open the allocation editor. */
  openAllocations: (part: MachiningPart) => void;
  /** The paperclip button uploads files. */
  uploadFiles: (part: MachiningPart) => void;
}

function MultiJobLabel({ part }: { part: MachiningPart }) {
  // job_no is the display label: "254-01" or "254-01 +2"
  const label = part.job_no || '-';
  if (!part.is_multi_job) return <>{label}</>;
  const match = /^(.*?)\s\+(\d+)$/.exec(label);
  const base = match ? match[1] : label;
  const extra = match ? match[2] : Math.max(0, getPartAllocations(part).length - 1);
  return (
    <>
      {base}{' '}
      <Tooltip label={<span className={classes.preLine}>{allocationTooltip(part)}</span>} withArrow>
        <span>
          <StatusBadge color="blue">+{extra}</StatusBadge>
        </span>
      </Tooltip>
    </>
  );
}

function weight(value: unknown): string {
  // Legacy: `value ? parseFloat(value).toFixed(3) + ' kg' : '-'`
  if (!value) return '-';
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? `${n.toFixed(3)} kg` : '-';
}

/** Legacy status cell: locked, done, in progress, waiting. */
export function PartStatus({ part }: { part: MachiningPart }) {
  if (part.is_locked) {
    const dr = part.department_request_number || '';
    return (
      <span title={`Departman Talebine Dönüştürüldü${dr ? ` → ${dr}` : ''}`}>
        <StatusBadge color="blue">Talebe Dönüştü</StatusBadge>
      </span>
    );
  }
  if (part.completion_date) return <StatusBadge color="green">Tamamlandı</StatusBadge>;
  if ((part.incomplete_operation_count ?? 0) > 0)
    return <StatusBadge color="yellow">Devam Ediyor</StatusBadge>;
  return <StatusBadge color="grey">Bekliyor</StatusBadge>;
}

/**
 * Columns of the parts list. name, description, image_no, position_no,
 * material, weight_kg and finish_time edit inline (legacy editableColumns);
 * job_no / quantity open the allocation editor instead.
 */
export function partColumns(handlers: PartColumnHandlers): DataTableColumn<MachiningPart>[] {
  return [
    {
      key: 'key',
      header: 'Parça No',
      sortable: true,
      exportValue: (row) => `${row.key || '-'}${row.task_key ? ` (${row.task_key})` : ''}`,
      render: (row) => (
        <span className={classes.partKey}>
          {row.key || '-'}
          {row.task_key ? ` (${row.task_key})` : ''}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Ad',
      sortable: true,
      maxWidth: 'clamp(100px, 8.5vw, 260px)',
      editable: true,
      render: (row) => <strong>{row.name || '-'}</strong>,
    },
    {
      key: 'description',
      header: 'Açıklama',
      maxWidth: 'clamp(100px, 8.5vw, 320px)',
      editable: true,
    },
    {
      key: 'job_no',
      header: 'İş No',
      sortable: true,
      render: (row) => (
        <button
          type="button"
          className={classes.allocCell}
          title="İş emri dağılımı"
          onClick={(event) => {
            event.stopPropagation();
            handlers.openAllocations(row);
          }}
        >
          <MultiJobLabel part={row} />
        </button>
      ),
    },
    {
      key: 'image_no',
      header: 'Resim No',
      maxWidth: 'clamp(80px, 7vw, 180px)',
      editable: true,
    },
    { key: 'position_no', header: 'Poz No', editable: true },
    {
      key: 'quantity',
      header: 'Adet',
      align: 'center',
      exportValue: (row) => row.quantity ?? 0,
      render: (row) => (
        <button
          type="button"
          className={classes.allocCell}
          title={row.is_multi_job ? allocationTooltip(row) : 'İş emri dağılımı'}
          onClick={(event) => {
            event.stopPropagation();
            handlers.openAllocations(row);
          }}
        >
          <span className={classes.countPill}>{row.quantity || 0}</span>
        </button>
      ),
    },
    {
      key: 'material',
      header: 'Malzeme',
      maxWidth: 'clamp(80px, 7vw, 180px)',
      editable: true,
    },
    {
      key: 'weight_kg',
      header: 'Ağırlık (kg)',
      hideBelow: 1600,
      align: 'right',
      editable: { type: 'number', step: 0.001 },
      exportValue: (row) =>
        row.weight_kg === null || row.weight_kg === undefined || row.weight_kg === ''
          ? null
          : Number(row.weight_kg),
      render: (row) => weight(row.weight_kg),
    },
    {
      key: 'operation_count',
      header: 'Operasyon Sayısı',
      align: 'center',
      hideBelow: 1600,
      exportValue: (row) => row.operation_count || 0,
      render: (row) => <span className={classes.countPill}>{row.operation_count || 0}</span>,
    },
    {
      key: 'incomplete_operation_count',
      header: 'Kalan Op.',
      exportHeader: 'Tamamlanmamış',
      align: 'center',
      exportValue: (row) => row.incomplete_operation_count || 0,
      render: (row) => {
        const count = row.incomplete_operation_count || 0;
        return <StatusBadge color={count > 0 ? 'orange' : 'green'}>{count}</StatusBadge>;
      },
    },
    {
      key: 'finish_time',
      header: 'Bitiş Tarihi',
      sortable: true,
      // A native date picker; the saved value is 'YYYY-MM-DD'.
      editable: { type: 'date' },
      exportValue: (row) => (row.finish_time ? formatDate(row.finish_time) : '-'),
      render: (row) => (row.finish_time ? formatDate(row.finish_time) : '-'),
    },
    {
      key: 'files',
      header: 'Dosyalar',
      exportValue: (row) => row.files?.length ?? 0,
      render: (row) => {
        const count = row.files?.length ?? 0;
        if (row.is_locked) {
          return count > 0 ? (
            <Badge color="gray" title="Kilitli parça">
              {count}
            </Badge>
          ) : (
            '-'
          );
        }
        return (
          <Button
            size="compact-xs"
            variant="default"
            title="Dosya yükle"
            aria-label={`${row.key} dosya yükle`}
            onClick={(event) => {
              event.stopPropagation();
              handlers.uploadFiles(row);
            }}
            rightSection={count > 0 ? <Badge size="xs">{count}</Badge> : undefined}
          >
            <FaIcon icon="fas fa-paperclip" />
          </Button>
        );
      },
    },
    {
      key: 'status',
      header: 'Durum',
      exportValue: (row) =>
        row.is_locked
          ? `Departman Talebine Dönüştürüldü${row.department_request_number ? ` → ${row.department_request_number}` : ''}`
          : row.completion_date
            ? 'Tamamlandı'
            : (row.incomplete_operation_count ?? 0) > 0
              ? 'Devam Ediyor'
              : 'Bekliyor',
      render: (row) => <PartStatus part={row} />,
    },
  ];
}

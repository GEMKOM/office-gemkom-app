import { FLIPPED_TITLE, formatAngleTr } from '@/pages/manufacturing/linear-cutting/shared/lcGeometry';
import { UnstyledButton } from '@mantine/core';
import type { LinearCut, LinearCuttingTask } from '@/api/manufacturing/linearCutting';
import { StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

export function planText(task: LinearCuttingTask): string {
  const key = task.session || '';
  return task.session_title ? `${key} — ${task.session_title}` : key || '-';
}

export function materialText(task: LinearCuttingTask): string {
  return task.item_name || task.item_code || task.material || '-';
}

const hours = (value: unknown, empty: string) => (value ? `${String(value)} saat` : empty);

export interface TaskColumnsContext {
  machineName: (machineFk: number | null | undefined) => string | null;
  onToggleStatus: (task: LinearCuttingTask) => void;
}

/**
 * The legacy task table. Sortable = the fields its onSort mapped to an
 * ordering; the others re-sorted nothing on the server.
 */
export function taskColumns({
  machineName,
  onToggleStatus,
}: TaskColumnsContext): DataTableColumn<LinearCuttingTask>[] {
  return [
    {
      key: 'key',
      header: 'Görev No',
      sortable: true,
      render: (row) => <span className={uiClasses.code}>{row.key || '-'}</span>,
    },
    { key: 'session', header: 'Plan', accessor: planText },
    { key: 'item_name', header: 'Malzeme', accessor: materialText },
    {
      key: 'bar_index',
      header: 'Bar',
      sortable: true,
      render: (row) => (row.bar_index != null ? String(row.bar_index) : '-'),
    },
    {
      key: 'stock_length_mm',
      header: 'Stok (mm)',
      align: 'right',
      render: (row) => (row.stock_length_mm != null ? `${row.stock_length_mm} mm` : '-'),
      exportValue: (row) => row.stock_length_mm ?? null,
    },
    {
      key: 'machine_name',
      header: 'Makine',
      accessor: (row) => row.machine_name || machineName(row.machine_fk) || '-',
    },
    {
      key: 'status',
      header: 'Durum',
      accessor: (row) => (row.completion_date ? 'Tamamlandı' : 'Bekliyor'),
      render: (row) => (
        <UnstyledButton
          title="Durumu değiştirmek için tıklayın"
          onClick={(event) => {
            event.stopPropagation();
            onToggleStatus(row);
          }}
        >
          {row.completion_date ? (
            <StatusBadge color="green">Tamamlandı</StatusBadge>
          ) : (
            <StatusBadge color="yellow">Bekliyor</StatusBadge>
          )}
        </UnstyledButton>
      ),
    },
    {
      key: 'estimated_hours',
      header: 'Tahmini Saat',
      sortable: true,
      align: 'right',
      render: (row) => hours(row.estimated_hours, '-'),
      exportValue: (row) => (row.estimated_hours != null ? Number(row.estimated_hours) : null),
    },
    {
      key: 'total_hours_spent',
      header: 'Harcanan Saat',
      sortable: true,
      align: 'right',
      render: (row) => hours(row.total_hours_spent, '0 saat'),
      exportValue: (row) => Number(row.total_hours_spent) || 0,
    },
  ];
}

/** "Kesim Listesi" in the details modal; sorts the loaded cuts. */
export const cutColumns: DataTableColumn<LinearCut>[] = [
  { key: 'job_no', header: 'İş No' },
  {
    key: 'label',
    header: 'Parça',
    render: (row) => (
      <>
        {row.label || '-'}
        {row.flipped ? <span title={FLIPPED_TITLE}> ↻</span> : null}
        {row.requires_bending ? (
          <span title="Boy açınım boyudur — kesimden sonra bükülür" style={{ marginLeft: 6 }}>
            <StatusBadge color="yellow">Büküm</StatusBadge>
          </span>
        ) : null}
      </>
    ),
  },
  {
    key: 'nominal_mm',
    header: 'Boy (mm)',
    accessor: (row) => row.nominal_mm ?? row.effective_mm ?? '-',
  },
  {
    key: 'offset_mm',
    header: 'Başlangıç (mm)',
    align: 'right',
    render: (row) => row.offset_mm ?? '-',
  },
  { key: 'angle_left_deg', header: 'Sol Açı', render: (row) => formatAngleTr(row.angle_left_deg) },
  {
    key: 'angle_right_deg',
    header: 'Sağ Açı',
    render: (row) => formatAngleTr(row.angle_right_deg),
  },
];

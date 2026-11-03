import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { patchDepartmentTask, type DepartmentTask } from '@/api/projects/departmentTasks';
import { jobOrderDepartmentTasksQueryOptions } from '@/api/projects/jobOrders';
import { formatDate } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { DataTable, notify, StatusBadge, type CellEdit, type DataTableColumn, type StatusFamily } from '@/ui';
import css from './JobOrderDetail.module.css';
import { ErrorState, fieldErrors, LoadingState } from './parts';

const DEPARTMENT_URLS: Record<string, string> = {
  manufacturing: '/manufacturing/projects/',
  design: '/design/projects/',
  planning: '/planning/projects/',
  procurement: '/procurement/projects/',
  logistics: '/logistics/projects/',
  painting: '/painting/projects/',
};

function taskStatusColor(status: string | null | undefined): StatusFamily {
  switch (status) {
    case 'completed':
      return 'green';
    case 'in_progress':
      return 'blue';
    case 'pending':
      return 'yellow';
    case 'blocked':
      return 'red';
    default:
      return 'grey';
  }
}

function progressColor(pct: number): string {
  if (pct === 0) return '#6b7280';
  if (pct < 25) return '#ef4444';
  if (pct < 50) return '#f59e0b';
  if (pct < 75) return '#3b82f6';
  if (pct < 100) return '#10b981';
  return '#059669';
}

function ProgressCell({ value }: { value: unknown }) {
  if (!value && value !== 0) return <>-</>;
  const pct = Math.min(100, Math.max(0, Number.parseFloat(String(value)) || 0));
  const color = progressColor(pct);
  return (
    <div className={css.progress}>
      <div
        className={css.progressBar}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color} 0%, ${color}dd 100%)`,
        }}
      />
      <div className={css.progressText}>{pct.toFixed(1)}%</div>
    </div>
  );
}

/**
 * Talaşlı parça rows carry no quantity / job cell of their own: the part key
 * and "6 / 10 adet · ortak: 260-02" when the part is shared with other jobs.
 */
function machiningHint(row: DepartmentTask): { text: string; title: string } | null {
  if (row.type !== 'machining_part') return null;
  const md = row.machining_data ?? {};
  const others = Array.isArray(md.other_job_nos) ? md.other_job_nos.filter(Boolean) : [];
  let quantityText = '';
  if (others.length) {
    quantityText = `${md.allocated_quantity ?? '-'} / ${md.quantity ?? '-'} adet · ortak: ${others.join(', ')}`;
  } else if (md.quantity !== null && md.quantity !== undefined) {
    quantityText = `${md.quantity} adet`;
  } else if (md.allocated_quantity !== null && md.allocated_quantity !== undefined) {
    quantityText = `${md.allocated_quantity} adet`;
  }
  const keyText = md.key || row.key || '';
  const text = [keyText, quantityText].filter(Boolean).join(' · ');
  if (!text) return null;
  return {
    text,
    title: `Talaşlı parça${others.length ? ' — birden fazla iş emrine bölünmüş' : ''}`,
  };
}

function DepartmentCell({ row }: { row: DepartmentTask }) {
  const value = row.department_display;
  if (!value || value === '-') return <>-</>;
  const base = DEPARTMENT_URLS[row.department ?? ''];
  const hint = machiningHint(row);
  return (
    <>
      {base && row.id ? (
        <AppLink
          className={css.departmentLink}
          to={`${base}?task=${encodeURIComponent(row.id)}`}
        >
          {value}
        </AppLink>
      ) : (
        <strong>{value}</strong>
      )}
      {hint ? (
        <small className={css.hint} title={hint.title}>
          {hint.text}
        </small>
      ) : null}
    </>
  );
}

const weightEditable = (row: DepartmentTask) =>
  row.type !== 'machining_part' && row.type !== 'cnc_part';

/** Görevler: the job's department tasks (legacy renderDepartmentTasksTable). */
export function TasksTab({ jobNo }: { jobNo: string }) {
  const queryClient = useQueryClient();
  const options = jobOrderDepartmentTasksQueryOptions<DepartmentTask>(jobNo);
  const query = useQuery(options);

  const columns = useMemo<DataTableColumn<DepartmentTask>[]>(
    () => [
      {
        key: 'department_display',
        header: 'Departman',
        sortable: true,
        render: (row) => <DepartmentCell row={row} />,
      },
      {
        key: 'weight',
        header: 'Ağırlık',
        sortable: true,
        align: 'center',
        accessor: (row) =>
          row.weight === null || row.weight === undefined || row.weight === ''
            ? null
            : Number.parseFloat(String(row.weight)),
        render: (row) =>
          row.weight === null || row.weight === undefined || row.weight === ''
            ? '-'
            : Number.parseFloat(String(row.weight)).toFixed(2),
        editable: {
          type: 'number',
          min: 0,
          step: 0.01,
          enabled: weightEditable,
          value: (row) =>
            row.weight === null || row.weight === undefined || row.weight === ''
              ? ''
              : Number.parseFloat(String(row.weight)).toFixed(2),
          validate: (value) =>
            value !== null && (typeof value !== 'number' || Number.isNaN(value) || value < 0)
              ? 'Geçerli bir ağırlık değeri girin (0 veya pozitif sayı)'
              : null,
        },
      },
      {
        key: 'completion_percentage',
        header: 'Tamamlanma',
        sortable: true,
        width: 300,
        accessor: (row) => Number.parseFloat(String(row.completion_percentage ?? '')) || 0,
        render: (row) => <ProgressCell value={row.completion_percentage} />,
      },
      {
        key: 'status_display',
        header: 'Durum',
        sortable: true,
        render: (row) =>
          !row.status_display || row.status_display === '-' ? (
            '-'
          ) : (
            <StatusBadge color={taskStatusColor(row.status)}>{row.status_display}</StatusBadge>
          ),
      },
      {
        key: 'assigned_to_name',
        header: 'Atanan',
        render: (row) => row.assigned_to_name || '-',
      },
      {
        key: 'target_completion_date',
        header: 'Hedef Tarih',
        sortable: true,
        render: (row) => (row.target_completion_date ? formatDate(row.target_completion_date) : '-'),
      },
      {
        key: 'completed_at',
        header: 'Tamamlanma Tarihi',
        sortable: true,
        render: (row) => (row.completed_at ? formatDate(row.completed_at) : '-'),
      },
    ],
    [],
  );

  const saveWeight = async ({ row, value }: CellEdit<DepartmentTask>) => {
    const weight = value === null || value === '' ? null : Number(value);
    try {
      await patchDepartmentTask(row.id, { weight });
    } catch (error) {
      console.error('Error updating weight:', error);
      throw new Error(fieldErrors(error, 'Ağırlık güncellenirken hata oluştu'), { cause: error });
    }
    notify.success('Ağırlık güncellendi');
    queryClient.setQueryData(options.queryKey, (list) =>
      list?.map((task) => (task.id === row.id ? { ...task, weight } : task)),
    );
  };

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState>Departman görevleri yüklenirken hata oluştu.</ErrorState>;
  if (query.data.length === 0) {
    return <p className={css.state}>Departman görevi bulunamadı.</p>;
  }

  return (
    <DataTable
      title="Departman Görevleri"
      icon="fas fa-tasks"
      data={query.data}
      columns={columns}
      getRowId={(row) => String(row.id)}
      striped
      emptyMessage="Departman görevi bulunamadı"
      onCellEdit={saveWeight}
    />
  );
}

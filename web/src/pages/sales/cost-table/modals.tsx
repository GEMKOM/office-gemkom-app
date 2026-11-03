import { Box, Button, Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, type ReactNode } from 'react';
import { combinedJobCostsQueryOptions } from '@/api/jobCosts/combinedJobCosts';
import { machiningJobEntriesQueryOptions } from '@/api/jobCosts/machiningJobEntries';
import { procurementLinesQueryOptions, type ProcurementLine } from '@/api/projects/cost';
import {
  assignmentsQueryOptions,
  type SubcontractingAssignment,
} from '@/api/subcontracting/assignments';
import { weldingJobCostDetailQueryOptions, type WeldingJobEntry } from '@/api/welding/jobCosts';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { num } from '@/pages/management/analytics/analyticsData';
import { Tiles } from '@/pages/management/analytics/modals';
import {
  DataTable,
  DetailModal,
  FaIcon,
  notify,
  StatusBadge,
  type DataTableColumn,
  type DetailSection,
  type StatusFamily,
} from '@/ui';
import {
  assignmentTotals,
  jobCostFigures,
  MACHINING_WORK_TYPES,
  machiningEntryRows,
  sortByDate,
  sumOf,
  WELDING_OVERTIME_TYPES,
  type CombinedJob,
  type DepartmentFigures,
  type MachiningEntryLike,
  type MachiningEntryRow,
} from './costTableData';
import classes from './CostTable.module.css';

export interface DrillModalProps {
  jobNo: string;
  onClose: () => void;
}

const euro = (value: unknown) => formatCurrency(num(value), 'EUR', 2);
const hours1 = (value: unknown) => formatNumber(num(value), 1);
const hoursText = (value: unknown) => `${hours1(value)} saat`;
const money2 = (value: unknown) => formatNumber(num(value), 2);
/** Legacy amounts: "€" for EUR, else the currency code in front. */
const inCurrency = (value: unknown, currency: string | null | undefined) =>
  !currency || currency === 'EUR' ? euro(value) : `${currency} ${money2(value)}`;

/** Closes the modal with the legacy message when a load fails. */
function useFailClose(failed: boolean, message: string, onClose: () => void) {
  useEffect(() => {
    if (!failed) return;
    notify.error(message);
    onClose();
  }, [failed, message, onClose]);
}

const pending: DetailSection[] = [{ content: <Box mih={200} /> }];

const emptyNote = (text: string) => (
  <Text c="dimmed" ta="center" py="lg" size="sm">
    <FaIcon icon="fas fa-info-circle" style={{ marginRight: 6 }} />
    {text}
  </Text>
);

function TypeBadge({
  value,
  types,
}: {
  value: string | null | undefined;
  types: Record<string, { label: string; color: StatusFamily }>;
}) {
  const meta = types[value ?? ''];
  return <StatusBadge color={meta?.color ?? 'grey'}>{meta?.label ?? (value || '-')}</StatusBadge>;
}

function Employee({ fullName, username }: { fullName?: string; username?: string }) {
  return (
    <span className={classes.employee}>
      <Text span fw={700} size="sm">
        {fullName || username || '-'}
      </Text>
      {username ? <span className={classes.username}>{username}</span> : null}
    </span>
  );
}

/* ── İşçilik (job) ──────────────────────────────────────────────────── */

function DepartmentBlock({
  figures,
  emptyText,
  onDetails,
}: {
  figures: DepartmentFigures | null;
  emptyText: string;
  onDetails: () => void;
}): ReactNode {
  if (!figures) return emptyNote(emptyText);
  return (
    <>
      <Tiles
        min={150}
        items={[
          { icon: 'fas fa-euro-sign', label: 'Toplam Maliyet', value: euro(figures.totalCost) },
          { icon: 'fas fa-clock', label: 'Toplam Saat', value: hours1(figures.totalHours) },
          { icon: 'fas fa-calendar', label: 'Mesai Maliyeti', value: euro(figures.overtimeCost) },
          {
            icon: 'fas fa-calculator',
            label: 'Saat Başı Maliyet',
            value: euro(figures.costPerHour),
          },
        ]}
      />
      <Group justify="center" mt="sm">
        <Button size="xs" leftSection={<FaIcon icon="fas fa-table" />} onClick={onDetails}>
          Detayları Görüntüle
        </Button>
      </Group>
    </>
  );
}

export function JobDetailsModal({
  jobNo,
  onClose,
  onDepartment,
}: DrillModalProps & { onDepartment: (kind: 'machining' | 'welding') => void }) {
  const costs = useQuery({
    ...combinedJobCostsQueryOptions({ job_no: jobNo }),
    // job_no is a partial match; legacy took the first row.
    select: (page) =>
      ((page.results.find((r) => r.job_no === jobNo) ?? page.results[0]) as
        CombinedJob | undefined) ?? null,
  });
  useFailClose(costs.isError, 'İş detayları yüklenirken bir hata oluştu.', onClose);
  useFailClose(costs.isSuccess && !costs.data, 'Bu iş için maliyet verisi bulunamadı.', onClose);

  let sections = pending;
  if (costs.data) {
    const f = jobCostFigures(costs.data);
    sections = [
      {
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        content: (
          <Tiles
            items={[
              { icon: 'fas fa-euro-sign', label: 'Toplam Maliyet', value: euro(f.totalCost) },
              { icon: 'fas fa-clock', label: 'Toplam Saat', value: hours1(f.totalHours) },
              {
                icon: 'fas fa-calculator',
                label: 'Saat Başı Maliyet',
                value: euro(f.costPerHour),
              },
            ]}
          />
        ),
      },
      {
        title: 'Talaşlı İmalat Departmanı',
        icon: 'fas fa-cog',
        content: (
          <DepartmentBlock
            figures={f.machining}
            emptyText="Bu iş için talaşlı imalat verisi bulunmamaktadır."
            onDetails={() => onDepartment('machining')}
          />
        ),
      },
      {
        title: 'Kaynaklı İmalat Departmanı',
        icon: 'fas fa-fire',
        content: (
          <DepartmentBlock
            figures={f.welding}
            emptyText="Bu iş için kaynaklı imalat verisi bulunmamaktadır."
            onDetails={() => onDepartment('welding')}
          />
        ),
      },
    ];
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - İş Maliyeti Detayları`}
      icon="fas fa-calculator"
      size="xl"
      loading={costs.isPending}
      sections={sections}
    />
  );
}

/* ── Talaşlı imalat ─────────────────────────────────────────────────── */

const machiningColumns: DataTableColumn<MachiningEntryRow>[] = [
  { key: 'date', header: 'Tarih', width: 120, render: (row) => <strong>{row.date}</strong> },
  {
    key: 'employee_full_name',
    header: 'Çalışan',
    accessor: (row) => row.employee_full_name || row.employee_username || '-',
    render: (row) => (
      <Employee fullName={row.employee_full_name} username={row.employee_username} />
    ),
  },
  { key: 'operation_key', header: 'Operasyon Anahtarı' },
  { key: 'operation_name', header: 'Operasyon Adı' },
  {
    key: 'hours',
    header: 'Saat',
    align: 'right',
    width: 90,
    render: (row) => <strong>{hours1(row.hours)}</strong>,
  },
  {
    key: 'work_type',
    header: 'Tip',
    width: 110,
    exportValue: (row) => MACHINING_WORK_TYPES[row.work_type]?.label ?? row.work_type,
    render: (row) => <TypeBadge value={row.work_type} types={MACHINING_WORK_TYPES} />,
  },
];

export function MachiningDetailsModal({ jobNo, onClose }: DrillModalProps) {
  const detail = useQuery(machiningJobEntriesQueryOptions({ job_no: jobNo }));
  useFailClose(detail.isError, 'Talaşlı imalat detayları yüklenirken bir hata oluştu.', onClose);
  const rows = useMemo(
    () => machiningEntryRows((detail.data?.entries ?? []) as MachiningEntryLike[]),
    [detail.data],
  );

  let sections = pending;
  if (detail.data) {
    const summary = detail.data.summary ?? {};
    const split = summary.breakdown_by_type ?? {};
    sections = [
      {
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        content: (
          <Tiles
            min={150}
            items={[
              {
                icon: 'fas fa-list',
                label: 'Toplam Kayıt',
                value: formatNumber(summary.total_entries || rows.length),
              },
              { icon: 'fas fa-clock', label: 'Toplam Saat', value: hoursText(summary.total_hours) },
              {
                icon: 'fas fa-calendar-day',
                label: 'Hafta İçi Saat',
                value: hoursText(split.weekday_work),
              },
              { icon: 'fas fa-clock', label: 'Mesai Saat', value: hoursText(split.after_hours) },
              { icon: 'fas fa-calendar', label: 'Pazar Saat', value: hoursText(split.sunday) },
            ]}
          />
        ),
      },
      rows.length
        ? {
            content: (
              <DataTable
                title="Kayıtlar (Tarihe Göre Sıralı)"
                icon="fas fa-table"
                data={rows}
                columns={machiningColumns}
                getRowId={(row) => row.id}
                sortable
              />
            ),
          }
        : {
            title: 'Kayıtlar',
            icon: 'fas fa-table',
            content: emptyNote('Bu iş için kayıt bulunamadı.'),
          },
    ];
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - Talaşlı İmalat Detayları`}
      icon="fas fa-cog"
      size="xl"
      loading={detail.isPending}
      sections={sections}
    />
  );
}

/* ── Kaynaklı imalat ────────────────────────────────────────────────── */

const weldingColumns: DataTableColumn<WeldingJobEntry>[] = [
  {
    key: 'date',
    header: 'Tarih',
    width: 120,
    render: (row) => <strong>{row.date || '-'}</strong>,
  },
  {
    key: 'employee_full_name',
    header: 'Çalışan',
    accessor: (row) => row.employee_full_name || row.employee_username || '-',
    render: (row) => (
      <Employee fullName={row.employee_full_name} username={row.employee_username} />
    ),
  },
  {
    key: 'hours',
    header: 'Saat',
    align: 'right',
    width: 90,
    accessor: (row) => num(row.hours),
    render: (row) => <strong>{hours1(row.hours)}</strong>,
  },
  {
    key: 'overtime_type',
    header: 'Tip',
    width: 110,
    exportValue: (row) =>
      WELDING_OVERTIME_TYPES[row.overtime_type ?? '']?.label ?? row.overtime_type,
    render: (row) => <TypeBadge value={row.overtime_type} types={WELDING_OVERTIME_TYPES} />,
  },
];

export function WeldingDetailsModal({ jobNo, onClose }: DrillModalProps) {
  const detail = useQuery(weldingJobCostDetailQueryOptions({ job_no: jobNo }));
  useFailClose(detail.isError, 'Kaynaklı imalat detayları yüklenirken bir hata oluştu.', onClose);
  const rows = useMemo(() => sortByDate(detail.data?.entries ?? []), [detail.data]);

  let sections = pending;
  if (detail.data) {
    const summary = detail.data.summary ?? {};
    const split = (summary.breakdown_by_type ?? {}) as Record<string, unknown>;
    sections = [
      {
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        content: (
          <Tiles
            min={150}
            items={[
              {
                icon: 'fas fa-list',
                label: 'Toplam Kayıt',
                value: formatNumber(summary.total_entries || rows.length),
              },
              { icon: 'fas fa-clock', label: 'Toplam Saat', value: hoursText(summary.total_hours) },
              {
                icon: 'fas fa-calendar-day',
                label: 'Normal Saat',
                value: hoursText(split.regular),
              },
              { icon: 'fas fa-clock', label: 'Mesai Saat', value: hoursText(split.after_hours) },
              { icon: 'fas fa-calendar', label: 'Tatil Saat', value: hoursText(split.holiday) },
            ]}
          />
        ),
      },
      rows.length
        ? {
            content: (
              <DataTable
                title="Kayıtlar (Tarihe Göre Sıralı)"
                icon="fas fa-table"
                data={rows}
                columns={weldingColumns}
                getRowId={(row, index) => String(row.id ?? index)}
                sortable
              />
            ),
          }
        : {
            title: 'Kayıtlar',
            icon: 'fas fa-table',
            content: emptyNote('Bu iş için kayıt bulunamadı.'),
          },
    ];
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - Kaynaklı İmalat Detayları`}
      icon="fas fa-fire"
      size="xl"
      loading={detail.isPending}
      sections={sections}
    />
  );
}

/* ── Malzeme ────────────────────────────────────────────────────────── */

const materialColumns: DataTableColumn<ProcurementLine>[] = [
  {
    key: 'item_code',
    header: 'Malzeme Kodu',
    accessor: (row) => row.item_code || '-',
    render: (row) => <span className={classes.code}>{row.item_code || '-'}</span>,
  },
  { key: 'item_name', header: 'Malzeme Adı', accessor: (row) => row.item_name || '-' },
  { key: 'item_unit', header: 'Birim', accessor: (row) => row.item_unit || '-' },
  {
    key: 'item_description',
    header: 'Açıklama',
    sortable: false,
    accessor: (row) => row.item_description || '-',
  },
  {
    key: 'quantity',
    header: 'Miktar',
    align: 'right',
    accessor: (row) => num(row.quantity),
    render: (row) => <strong>{money2(row.quantity)}</strong>,
  },
  {
    key: 'unit_price',
    header: 'Birim Fiyat (€)',
    align: 'right',
    accessor: (row) => num(row.unit_price),
    render: (row) => euro(row.unit_price),
  },
  {
    key: 'amount_eur',
    header: 'Tutar (€)',
    align: 'right',
    accessor: (row) => num(row.amount_eur),
    render: (row) => <strong>{euro(row.amount_eur)}</strong>,
  },
];

export function MaterialDetailsModal({ jobNo, onClose }: DrillModalProps) {
  const lines = useQuery(procurementLinesQueryOptions(jobNo));
  useFailClose(lines.isError, 'Malzeme detayları yüklenirken bir hata oluştu.', onClose);

  let sections = pending;
  if (lines.data) {
    const rows = lines.data;
    sections = [
      {
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        content: (
          <Tiles
            items={[
              { icon: 'fas fa-list', label: 'Toplam Satır', value: formatNumber(rows.length) },
              {
                icon: 'fas fa-euro-sign',
                label: 'Toplam Tutar',
                value: euro(sumOf(rows, (l) => l.amount_eur)),
              },
            ]}
          />
        ),
      },
      rows.length
        ? {
            content: (
              <DataTable
                title="Malzeme Satırları"
                icon="fas fa-table"
                data={rows}
                columns={materialColumns}
                getRowId={(row, index) => String(row.id ?? index)}
                sortable
              />
            ),
          }
        : {
            title: 'Malzeme Satırları',
            icon: 'fas fa-table',
            content: emptyNote('Bu iş için malzeme satırı bulunamadı.'),
          },
    ];
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - Malzeme Detayları`}
      icon="fas fa-box"
      size="xl"
      loading={lines.isPending}
      sections={sections}
    />
  );
}

/* ── Taşeron ────────────────────────────────────────────────────────── */

const pct = (value: unknown) => formatPercent(num(value), 1);

const assignmentColumns: DataTableColumn<SubcontractingAssignment>[] = [
  {
    key: 'subcontractor_name',
    header: 'Taşeron',
    accessor: (row) => row.subcontractor_name || '-',
    render: (row) => <strong>{row.subcontractor_name || '-'}</strong>,
  },
  {
    key: 'price_tier_name',
    header: 'Fiyat Kademesi',
    accessor: (row) => row.price_tier_name || '-',
  },
  {
    key: 'price_per_kg',
    header: 'Kg Fiyatı',
    align: 'right',
    accessor: (row) => num(row.price_per_kg),
    render: (row) => inCurrency(row.price_per_kg, row.cost_currency),
  },
  {
    key: 'allocated_weight_kg',
    header: 'Ayrılan Ağırlık (kg)',
    align: 'right',
    accessor: (row) => num(row.allocated_weight_kg),
    render: (row) => <strong>{money2(row.allocated_weight_kg)}</strong>,
  },
  {
    key: 'current_progress',
    header: 'Mevcut İlerleme (%)',
    align: 'right',
    accessor: (row) => num(row.current_progress),
    render: (row) => <StatusBadge color="blue">{pct(row.current_progress)}</StatusBadge>,
  },
  {
    key: 'last_billed_progress',
    header: 'Son Faturalanan (%)',
    align: 'right',
    accessor: (row) => num(row.last_billed_progress),
    render: (row) => <StatusBadge color="green">{pct(row.last_billed_progress)}</StatusBadge>,
  },
  {
    key: 'unbilled_progress',
    header: 'Faturalanmamış (%)',
    align: 'right',
    accessor: (row) => num(row.unbilled_progress),
    render: (row) => <StatusBadge color="yellow">{pct(row.unbilled_progress)}</StatusBadge>,
  },
  {
    key: 'current_cost',
    header: 'Mevcut Maliyet',
    align: 'right',
    accessor: (row) => num(row.current_cost),
    render: (row) => <strong>{inCurrency(row.current_cost, row.cost_currency)}</strong>,
  },
  {
    key: 'unbilled_cost',
    header: 'Faturalanmamış Tutar',
    align: 'right',
    accessor: (row) => num(row.unbilled_cost),
    render: (row) => <strong>{inCurrency(row.unbilled_cost, row.cost_currency)}</strong>,
  },
];

export function SubcontractorDetailsModal({ jobNo, onClose }: DrillModalProps) {
  const assignments = useQuery(assignmentsQueryOptions({ job_no: jobNo }));
  useFailClose(assignments.isError, 'Taşeron detayları yüklenirken bir hata oluştu.', onClose);

  let sections = pending;
  if (assignments.data) {
    const rows = assignments.data;
    const t = assignmentTotals(rows);
    sections = [
      {
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        content: (
          <Tiles
            items={[
              { icon: 'fas fa-list', label: 'Toplam Atama', value: formatNumber(t.count) },
              { icon: 'fas fa-euro-sign', label: 'Toplam Maliyet', value: euro(t.cost) },
              {
                icon: 'fas fa-file-invoice',
                label: 'Faturalanmamış Tutar',
                value: euro(t.unbilled),
              },
              {
                icon: 'fas fa-weight-hanging',
                label: 'Toplam Ağırlık (kg)',
                value: `${money2(t.weight)} kg`,
              },
            ]}
          />
        ),
      },
      rows.length
        ? {
            content: (
              <DataTable
                title="Taşeron Atamaları"
                icon="fas fa-table"
                data={rows}
                columns={assignmentColumns}
                getRowId={(row, index) => String(row.id ?? index)}
                sortable
              />
            ),
          }
        : {
            title: 'Taşeron Atamaları',
            icon: 'fas fa-table',
            content: emptyNote('Bu iş için taşeron ataması bulunamadı.'),
          },
    ];
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - Taşeron Detayları`}
      icon="fas fa-handshake"
      size="xl"
      loading={assignments.isPending}
      sections={sections}
    />
  );
}

import { Box, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  machiningJobEntriesQueryOptions,
  type MachiningJobEntry,
} from '@/api/jobCosts/machiningJobEntries';
import { weldingJobCostDetailQueryOptions, type WeldingJobEntry } from '@/api/welding/jobCosts';
import { toDate } from '@/lib/format';
import {
  DataTable,
  DetailModal,
  FaIcon,
  notify,
  type DataTableColumn,
  type DetailField,
  type DetailSection,
} from '@/ui';
import { hours, machiningEntryColumns, weldingEntryColumns } from './columns';

const saat = (value: unknown) => `${hours(value)} saat`;

interface EntriesModalProps<T extends { id: number }> {
  title: string;
  icon: string;
  /** undefined while loading. */
  entries: T[] | undefined;
  summary: DetailField[];
  columns: DataTableColumn<T>[];
  onClose: () => void;
}

/** The shared layout of legacy showMachiningDetails / showWeldingDetails. */
function EntriesModal<T extends { id: number }>({
  title,
  icon,
  entries,
  summary,
  columns,
  onClose,
}: EntriesModalProps<T>) {
  let sections: DetailSection[];
  if (!entries) {
    sections = [{ content: <Box mih={160} /> }];
  } else {
    sections = [
      { title: 'Özet', icon: 'fas fa-chart-pie', fields: summary },
      entries.length > 0
        ? {
            content: (
              <DataTable
                title="Kayıtlar (Tarihe Göre Sıralı)"
                icon="fas fa-table"
                data={entries}
                columns={columns}
                getRowId={(row) => String(row.id)}
                sortable
                pagination
              />
            ),
          }
        : {
            title: 'Kayıtlar',
            icon: 'fas fa-table',
            content: (
              <Text c="dimmed" ta="center" py="lg" size="sm">
                <FaIcon icon="fas fa-info-circle" /> Bu iş için kayıt bulunamadı.
              </Text>
            ),
          },
    ];
  }
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={title}
      icon={icon}
      size={1140}
      loading={!entries}
      sections={sections}
    />
  );
}

export interface DepartmentModalProps {
  jobNo: string;
  onClose: () => void;
}

const startTime = (entry: MachiningJobEntry) => toDate(entry.start_time)?.getTime() ?? 0;

/** Legacy showMachiningDetails: the job's machining entries, oldest first. */
export function MachiningDetailsModal({ jobNo, onClose }: DepartmentModalProps) {
  const detail = useQuery(machiningJobEntriesQueryOptions({ job_no: jobNo }));

  useEffect(() => {
    if (!detail.isError) return;
    notify.error('Talaşlı imalat detayları yüklenirken bir hata oluştu.');
    onClose();
  }, [detail.isError, onClose]);

  const entries = useMemo(
    () =>
      detail.data
        ? [...(detail.data.entries ?? [])].sort((a, b) => startTime(a) - startTime(b))
        : undefined,
    [detail.data],
  );
  const summary = detail.data?.summary ?? {};
  const breakdown = summary.breakdown_by_type;

  return (
    <EntriesModal
      title={`${jobNo} - Talaşlı İmalat Detayları`}
      icon="fas fa-cog"
      entries={entries}
      columns={machiningEntryColumns}
      summary={[
        {
          label: 'Toplam Kayıt',
          value: summary.total_entries || entries?.length || 0,
          type: 'number',
          span: 3,
        },
        { label: 'Toplam Saat', render: saat(summary.total_hours), span: 3 },
        { label: 'Hafta İçi Saat', render: saat(breakdown?.weekday_work), span: 2 },
        { label: 'Mesai Saat', render: saat(breakdown?.after_hours), span: 2 },
        { label: 'Pazar Saat', render: saat(breakdown?.sunday), span: 2 },
      ]}
      onClose={onClose}
    />
  );
}

const entryDay = (entry: WeldingJobEntry) => toDate(entry.date)?.getTime() ?? Number.NaN;

/** Legacy showWeldingDetails: the job's welding entries (no date range), oldest first. */
export function WeldingDetailsModal({ jobNo, onClose }: DepartmentModalProps) {
  const detail = useQuery(weldingJobCostDetailQueryOptions({ job_no: jobNo }));

  useEffect(() => {
    if (!detail.isError) return;
    notify.error('Kaynaklı imalat detayları yüklenirken bir hata oluştu.');
    onClose();
  }, [detail.isError, onClose]);

  const entries = useMemo(
    () =>
      detail.data
        ? [...(detail.data.entries ?? [])].sort((a, b) => entryDay(a) - entryDay(b) || 0)
        : undefined,
    [detail.data],
  );
  const summary = detail.data?.summary ?? {};
  const breakdown = summary.breakdown_by_type;

  return (
    <EntriesModal
      title={`${jobNo} - Kaynaklı İmalat Detayları`}
      icon="fas fa-fire"
      entries={entries}
      columns={weldingEntryColumns}
      summary={[
        {
          label: 'Toplam Kayıt',
          value: summary.total_entries || entries?.length || 0,
          type: 'number',
          span: 3,
        },
        { label: 'Toplam Saat', render: saat(summary.total_hours), span: 3 },
        { label: 'Normal Saat', render: saat(breakdown?.regular), span: 2 },
        { label: 'Mesai Saat', render: saat(breakdown?.after_hours), span: 2 },
        { label: 'Tatil Saat', render: saat(breakdown?.holiday), span: 2 },
      ]}
      onClose={onClose}
    />
  );
}

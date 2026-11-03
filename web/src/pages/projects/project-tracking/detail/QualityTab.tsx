import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ncrsQueryOptions, type Ncr } from '@/api/quality-control/ncrs';
import { formatDateTime } from '@/lib/format';
import { DataTable, StatusBadge, type DataTableColumn, type StatusFamily } from '@/ui';
import css from './JobOrderDetail.module.css';
import { ErrorState, LoadingState } from './parts';

const STATUS: Record<string, [StatusFamily, string]> = {
  draft: ['grey', 'Taslak'],
  submitted: ['yellow', 'Gönderildi'],
  approved: ['green', 'Onaylandı'],
  rejected: ['red', 'Reddedildi'],
  closed: ['blue', 'Kapatıldı'],
};

const SEVERITY: Record<string, [StatusFamily, string]> = {
  minor: ['yellow', 'Minör'],
  major: ['orange', 'Majör'],
  critical: ['red', 'Kritik'],
};

function MappedBadge({ map, value }: { map: Record<string, [StatusFamily, string]>; value?: string }) {
  const known = value ? map[value] : undefined;
  return known ? (
    <StatusBadge color={known[0]}>{known[1]}</StatusBadge>
  ) : (
    <StatusBadge color="grey">{value || '-'}</StatusBadge>
  );
}

const PARAMS = { job_order: '', ordering: '-created_at', page: 1, page_size: 100 };

/** Kalite: the job's non-conformance reports (legacy loadNCRsTab, first 100). */
export function QualityTab({ jobNo }: { jobNo: string }) {
  const query = useQuery(ncrsQueryOptions({ ...PARAMS, job_order: jobNo }));

  const columns = useMemo<DataTableColumn<Ncr>[]>(
    () => [
      { key: 'ncr_number', header: 'NCR No', sortable: true, render: (r) => r.ncr_number || '-' },
      { key: 'title', header: 'Başlık', sortable: true, render: (r) => r.title || '-' },
      {
        key: 'status',
        header: 'Durum',
        sortable: true,
        render: (r) => <MappedBadge map={STATUS} value={r.status} />,
      },
      {
        key: 'severity',
        header: 'Önem Derecesi',
        sortable: true,
        render: (r) => <MappedBadge map={SEVERITY} value={r.severity} />,
      },
      { key: 'defect_type_display', header: 'Kusur Tipi', render: (r) => r.defect_type_display || '-' },
      {
        key: 'affected_quantity',
        header: 'Etkilenen Miktar',
        sortable: true,
        render: (r) => r.affected_quantity || '-',
      },
      {
        key: 'assigned_team',
        header: 'Atanan Takım',
        render: (r) => String(r.assigned_team_name || r.assigned_team || '-'),
      },
      {
        key: 'created_at',
        header: 'Oluşturulma Tarihi',
        sortable: true,
        render: (r) => (r.created_at ? formatDateTime(r.created_at) : '-'),
      },
    ],
    [],
  );

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState>Uygunsuzluk raporları yüklenirken hata oluştu.</ErrorState>;
  const rows = query.data.results;
  if (rows.length === 0) {
    return (
      <p className={css.state}>Bu iş emri için henüz uygunsuzluk raporu bulunmamaktadır.</p>
    );
  }

  return (
    <DataTable
      title="Uygunsuzluk Raporları"
      icon="fas fa-exclamation-triangle"
      data={rows}
      columns={columns}
      getRowId={(r) => String(r.id)}
      striped
      emptyMessage="Uygunsuzluk raporu bulunamadı"
      rowActions={() => [
        {
          key: 'view',
          label: 'Detay',
          icon: 'fas fa-eye',
          color: 'cyan',
          // The NCR page in a new tab, as legacy did.
          onClick: (r) => window.open(`/quality-control/ncrs/?ncr=${r.id}`, '_blank'),
        },
      ]}
    />
  );
}

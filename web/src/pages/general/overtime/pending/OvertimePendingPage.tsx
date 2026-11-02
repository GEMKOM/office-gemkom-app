import { Stack } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
  decidedByMeOvertimeQueryOptions,
  pendingOvertimeQueryOptions,
  type OvertimeRequest,
} from '@/api/general/overtime';
import { DataTable, PageHeader, useUrlFilters, type RowAction } from '@/ui';
import { approveOvertimeWithConfirm, RejectOvertimeModal } from '../shared/decisions';
import { OvertimeDetailModal } from '../shared/OvertimeDetailModal';
import { requestColumns, useInvalidateOvertime } from '../shared/shared';

// `request` is the legacy deep link (notification e-mails) that opens the
// details modal; the two table pages are kept in the URL too.
const URL_DEFAULTS = { request: '', page: '1', decided_page: '1' };
const PAGE_SIZE = 20;
const EMPTY_ROWS: OvertimeRequest[] = [];

const pendingColumns = requestColumns({ countEntries: true });
const decidedColumns = requestColumns({ countEntries: true, withCreatedAt: true });

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Every request in the pending list waits for this user, so a submitted one can be decided.
const canDecide = () => true;

/** Port of general/overtime/pending (pending.js + modals.js). */
export function OvertimePendingPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const invalidate = useInvalidateOvertime();
  const page = positiveInt(values.page, 1);
  const decidedPage = positiveInt(values.decided_page, 1);

  const pending = useQuery({
    ...pendingOvertimeQueryOptions({ page, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const decided = useQuery({
    ...decidedByMeOvertimeQueryOptions({ page: decidedPage, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const [rejecting, setRejecting] = useState<OvertimeRequest | null>(null);
  const openDetails = (row: OvertimeRequest) => apply({ request: String(row.id) });
  const closeDetails = useCallback(() => apply({ request: '' }), [apply]);

  const pendingActions = (row: OvertimeRequest): RowAction<OvertimeRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: openDetails,
    },
    {
      key: 'approve',
      label: 'Onayla',
      icon: 'fas fa-check',
      color: 'success',
      hidden: row.status !== 'submitted',
      onClick: (r) => void approveOvertimeWithConfirm(r, [], invalidate),
    },
    {
      key: 'reject',
      label: 'Reddet',
      icon: 'fas fa-times',
      color: 'danger',
      hidden: row.status !== 'submitted',
      onClick: (r) => setRejecting(r),
    },
  ];
  const decidedActions = (): RowAction<OvertimeRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: openDetails,
    },
  ];

  const pendingTotal = pending.data?.count ?? 0;

  return (
    <>
      <PageHeader
        title="Onay Bekleyen Mesai Talepleri"
        subtitle="Onayınızı bekleyen mesai taleplerinin yönetimi"
        icon="clock"
        backTo="/general/overtime"
        stats={[
          {
            id: 'pending-count',
            label: 'Onay Bekleyen',
            value: pending.isPending ? '–' : pendingTotal.toLocaleString('tr-TR'),
          },
        ]}
      />

      <Stack gap="lg">
        <DataTable
          title="Onay Bekleyen Mesai Talepleri"
          icon="fas fa-clock"
          data={pending.data?.results ?? EMPTY_ROWS}
          columns={pendingColumns}
          getRowId={(row) => String(row.id)}
          loading={pending.isFetching}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: pendingTotal,
            onPageChange: (next) => apply({ page: String(next) }),
          }}
          rowActions={pendingActions}
          emptyMessage="Onay bekleyen mesai talebi bulunamadı."
          onRefresh={() => void pending.refetch()}
        />

        <DataTable
          title="Onayladığım Mesai Talepleri"
          icon="fas fa-check-circle"
          data={decided.data?.results ?? EMPTY_ROWS}
          columns={decidedColumns}
          getRowId={(row) => String(row.id)}
          loading={decided.isFetching}
          pagination={{
            page: decidedPage,
            pageSize: PAGE_SIZE,
            total: decided.data?.count ?? 0,
            onPageChange: (next) => apply({ decided_page: String(next) }),
          }}
          rowActions={decidedActions}
          emptyMessage="Onayladığınız mesai talebi bulunamadı."
          onRefresh={() => void decided.refetch()}
        />
      </Stack>

      {values.request ? (
        <OvertimeDetailModal
          key={values.request}
          requestId={values.request}
          onClose={closeDetails}
          canDecide={canDecide}
        />
      ) : null}

      {rejecting ? (
        <RejectOvertimeModal
          request={rejecting}
          invalidate={invalidate}
          onClose={() => setRejecting(null)}
          onRejected={() => setRejecting(null)}
        />
      ) : null}
    </>
  );
}

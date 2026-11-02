import { Button, Loader, Modal, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
  leaveTypeLabel,
  myVacationSummaryQueryOptions,
  upcomingLeavesQueryOptions,
  useCancelVacationRequest,
  vacationRequestsQueryOptions,
  type VacationRequest,
  type VacationRequestsParams,
} from '@/api/general/vacation';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
  FaIcon,
  ModalBody,
  ModalHeader,
  modalClassNames,
  notify,
  PageHeader,
  Panel,
  useUrlFilters,
  type DataTableColumn,
  type RowAction,
} from '@/ui';
import {
  VacationRequestDetailModal,
  VacationStatusBadge,
  formatClock,
  isCompensatoryLeave,
  statusText,
} from '../shared/vacationParts';
import { AttendanceCalendar } from './AttendanceCalendar';
import { VacationRequestFormModal } from './VacationRequestFormModal';

// page and the open request live in the URL; request_id is the link the
// attendance calendar puts on a leave day.
const URL_DEFAULTS = { page: '1', request_id: '' };
const PAGE_SIZE = 20;
const EMPTY_ROWS: VacationRequest[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function dateCell(row: VacationRequest): string {
  if (isCompensatoryLeave(row.leave_type)) {
    return `${formatDate(row.start_date)}, ${formatClock(row.start_time)} - ${formatClock(row.end_time)}`;
  }
  return `${formatDate(row.start_date)} - ${formatDate(row.end_date)}`;
}

function durationCell(row: VacationRequest): string {
  if (isCompensatoryLeave(row.leave_type))
    return `${formatClock(row.start_time)} - ${formatClock(row.end_time)}`;
  return `${row.duration_days || 0} gün`;
}

// Sorting sorts the loaded page, as the legacy table did.
const columns: DataTableColumn<VacationRequest>[] = [
  {
    key: 'leave_type',
    header: 'İzin Türü',
    accessor: (row) => leaveTypeLabel(row),
    render: (row) => leaveTypeLabel(row),
  },
  { key: 'date_range', header: 'Tarih', accessor: (row) => row.start_date ?? '', render: dateCell },
  {
    key: 'duration_days',
    header: 'Süre',
    accessor: (row) => Number(row.duration_days) || 0,
    render: durationCell,
  },
  {
    key: 'status',
    header: 'Durum',
    accessor: (row) => statusText(row),
    render: (row) => <VacationStatusBadge request={row} />,
  },
  {
    key: 'created_at',
    header: 'Oluşturulma',
    accessor: (row) => row.created_at ?? '',
    render: (row) => formatDate(row.created_at),
  },
];

function SummaryPanel() {
  const summary = useQuery(myVacationSummaryQueryOptions());
  const upcoming = useQuery(upcomingLeavesQueryOptions());
  const fetching = summary.isFetching || upcoming.isFetching;
  const refresh = () => void Promise.all([summary.refetch(), upcoming.refetch()]);
  const annual = summary.data?.annual_leave ?? {};
  const error = summary.error ?? upcoming.error;

  let body;
  if (summary.isPending || upcoming.isPending) {
    body = (
      <Text size="sm" c="dimmed">
        <Loader size="xs" mr="xs" />
        Özet yükleniyor...
      </Text>
    );
  } else if (error) {
    body = (
      <Text size="sm" c="red.7">
        <FaIcon icon="fas fa-triangle-exclamation" style={{ marginRight: 6 }} />
        {error.message || 'İzin özeti yüklenemedi.'}
      </Text>
    );
  } else {
    const rows = upcoming.data?.results ?? [];
    const { from_date: from, to_date: to } = upcoming.data ?? { from_date: null, to_date: null };
    body = (
      <>
        {annual.last_credited || summary.data?.hire_date ? (
          <Text size="sm" c="dimmed" mb="sm">
            {[
              annual.last_credited ? `Son kredi: ${formatDate(annual.last_credited)}` : null,
              summary.data?.hire_date ? `İşe giriş: ${formatDate(summary.data.hire_date)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
        <Text fw={600} size="sm">
          Yaklaşan İzinler
        </Text>
        <Text size="xs" c="dimmed" mb="xs">
          {from && to ? `${formatDate(from)} - ${formatDate(to)}` : 'Önümüzdeki dönem'}
        </Text>
        {rows.length ? (
          <Table.ScrollContainer minWidth={360}>
            <Table verticalSpacing={4} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ad Soyad</Table.Th>
                  <Table.Th>Başlangıç</Table.Th>
                  <Table.Th>Bitiş</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((item, index) => (
                  <Table.Tr key={index}>
                    <Table.Td fw={600}>{item.full_name || '-'}</Table.Td>
                    <Table.Td>{formatDate(item.start_date)}</Table.Td>
                    <Table.Td>{formatDate(item.end_date)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Text size="sm" c="dimmed">
            Yaklaşan izin kaydı bulunamadı.
          </Text>
        )}
      </>
    );
  }

  return (
    <Panel
      title="İzin Özetim"
      icon="fas fa-chart-line"
      actions={
        <Button
          size="xs"
          variant="default"
          loading={fetching}
          onClick={refresh}
          leftSection={<FaIcon icon="fas fa-sync-alt" />}
        >
          Yenile
        </Button>
      }
    >
      {body}
    </Panel>
  );
}

/** Port of general/vacation/requests (requests.js). */
export function VacationRequestsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = positiveInt(values.page, 1);

  const params: VacationRequestsParams = {
    page,
    page_size: PAGE_SIZE,
    ordering: '-created_at',
    mine: 'true',
  };
  const list = useQuery(vacationRequestsQueryOptions(params));
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'İzin talepleri yüklenemedi' });
  }, [list.isError, list.error, list.errorUpdatedAt]);

  // The band repeats the summary figures; they share the panel's query.
  const summary = useQuery(myVacationSummaryQueryOptions());
  const annual = summary.data?.annual_leave ?? {};
  const figure = (value: string) => (summary.isPending || summary.isError ? '–' : value);

  const [creating, setCreating] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const openRequest = values.request_id;
  const closeDetail = useCallback(() => apply({ request_id: '' }), [apply]);

  const cancel = useCancelVacationRequest();
  const cancelRequest = async (request: VacationRequest) => {
    const approved = request.status === 'approved';
    const ok = await confirm({
      title: 'İzin Talebi İptali',
      icon: 'fas fa-ban',
      message: approved
        ? `#${request.id} numaralı izin için iptal talebi gönderilsin mi?`
        : `#${request.id} numaralı izin talebi iptal edilsin mi?`,
      details: (
        <Text size="sm" c="dimmed" component="div">
          <div>Tür: {leaveTypeLabel(request)}</div>
          <div>
            Tarih: {formatDate(request.start_date)} - {formatDate(request.end_date)}
          </div>
          <div>
            {approved
              ? 'Bu işlem doğrudan iptal etmez, İK onayına gönderir.'
              : 'Bu işlem talebi anında iptal eder.'}
          </div>
        </Text>
      ),
      confirmLabel: 'Evet, İptal Et',
      cancelLabel: 'Vazgeç',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync({ id: request.id, approved });
      notify.success(
        approved ? 'İptal talebi İK onayına gönderildi.' : 'İzin talebi iptal edildi.',
      );
    } catch (error) {
      notify.error(error, { fallback: 'İptal işlemi başarısız.' });
    }
  };

  const rowActions = (row: VacationRequest): RowAction<VacationRequest>[] => [
    {
      key: 'detail',
      label: 'Detay',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => apply({ request_id: String(row.id) }),
    },
    {
      key: 'cancel',
      label: 'İptal',
      icon: 'fas fa-ban',
      color: 'danger',
      hidden: !(row.status === 'submitted' || row.status === 'approved'),
      onClick: (r) => void cancelRequest(r),
    },
  ];

  const stats = [
    {
      id: 'remaining-annual-leave',
      label: 'Kalan Yıllık İzin',
      value: figure(`${annual.remaining_days ?? '0.0'} gün`),
    },
    {
      id: 'used-annual-leave',
      label: 'Kullanılan Yıllık İzin',
      value: figure(`${annual.used_days ?? '0.0'} gün`),
    },
    {
      id: 'years-of-service',
      label: 'Kıdem Süresi',
      value: figure(`${summary.data?.years_of_service ?? 0} yıl`),
    },
  ];

  return (
    <>
      <PageHeader
        title="İzin Taleplerim"
        subtitle="İzin talebi oluşturun, iş günü önizlemesini görün ve taleplerinizi takip edin"
        backTo="/general/vacation"
        stats={stats}
        actions={
          <>
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-calendar-alt" />}
              onClick={() => setCalendarOpen(true)}
            >
              Takvim
            </Button>
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
              Yeni İzin Talebi
            </Button>
          </>
        }
      />

      <SummaryPanel />

      <DataTable
        title="İzin Talepleri"
        icon="fas fa-list"
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sortable
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
        }}
        rowActions={rowActions}
        emptyMessage="İzin talebi bulunamadı."
        onRefresh={() => void list.refetch()}
      />

      {creating ? (
        <VacationRequestFormModal
          onClose={() => setCreating(false)}
          onCreated={() => apply({ page: '1' })}
        />
      ) : null}

      {openRequest ? (
        <VacationRequestDetailModal
          key={openRequest}
          requestId={openRequest}
          variant="mine"
          onClose={closeDetail}
        />
      ) : null}

      <Modal
        opened={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        size={1140}
        withCloseButton={false}
        classNames={modalClassNames}
      >
        <ModalHeader title="PDKS Takvimi" icon="fas fa-calendar-alt" />
        <ModalBody>
          {calendarOpen ? (
            <AttendanceCalendar
              onOpenRequest={(id) => {
                setCalendarOpen(false);
                apply({ request_id: id });
              }}
            />
          ) : null}
        </ModalBody>
      </Modal>
    </>
  );
}

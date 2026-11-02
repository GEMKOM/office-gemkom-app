import { Button, SimpleGrid, Text } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import {
  revisionRequestsQueryOptions,
  useApproveRevision,
  type RevisionRequestTask,
} from '@/api/design/revisionRequests';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  notify,
  PageHeader,
  useUrlFilters,
  type DetailSection,
  type RowAction,
} from '@/ui';
import { revisionRequestColumns } from './columns';
import { RejectRevisionModal } from './RejectRevisionModal';

const URL_DEFAULTS = { page: '1', page_size: '20' };
const EMPTY_ROWS: RevisionRequestTask[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Text size="sm" component="div">
      <Text span fw={600}>
        {label}:
      </Text>{' '}
      {children}
    </Text>
  );
}

function detailSections(task: RevisionRequestTask): DetailSection[] {
  const request = task.pending_revision_request;
  return [
    {
      title: 'Genel Bilgiler',
      icon: 'fas fa-info-circle',
      fields: [
        { label: 'Görev ID', value: `#${task.id}` },
        { label: 'İş Emri', value: task.job_order },
        { label: 'Müşteri', value: task.customer_name },
        { label: 'Görev Başlığı', value: task.title, span: 12 },
        { label: 'Açıklama', value: task.description, span: 12, hidden: !task.description },
      ],
    },
    {
      title: 'Çizim Yayını Bilgileri',
      icon: 'fas fa-file-alt',
      hidden: !request,
      fields: [
        { label: 'Revizyon Kodu', value: request?.revision_code },
        { label: 'Revizyon Numarası', value: request?.revision_number },
      ],
    },
    {
      title: 'Revizyon Talebi Bilgileri',
      icon: 'fas fa-edit',
      hidden: !request,
      fields: [
        { label: 'Talep Eden', value: request?.requested_by },
        { label: 'Talep Tarihi', value: request?.requested_at, type: 'datetime' },
        {
          label: 'Revizyon Nedeni',
          span: 12,
          render: (
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
              {request?.reason || '-'}
            </Text>
          ),
        },
      ],
    },
  ];
}

/** Port of design/revision-requests (revision-requests.js). */
export function RevisionRequestsPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);

  const list = useQuery({
    ...revisionRequestsQueryOptions({ page, page_size: pageSize }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) {
      notify.error(`Revizyon talepleri yüklenirken hata oluştu: ${list.error.message}`);
    }
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const [viewing, setViewing] = useState<RevisionRequestTask | null>(null);
  const [rejecting, setRejecting] = useState<RevisionRequestTask | null>(null);

  const approve = useApproveRevision();
  const approveRequest = async (task: RevisionRequestTask) => {
    const request = task.pending_revision_request;
    const ok = await confirm({
      title: 'Revizyon Talebi Onayı',
      icon: 'fas fa-check-circle',
      message: 'Bu revizyon talebini onaylamak istediğinizden emin misiniz?',
      details: (
        <SimpleGrid cols={2} spacing={4}>
          <Labelled label="İş Emri">{task.job_order || '-'}</Labelled>
          <Labelled label="Müşteri">{task.customer_name || '-'}</Labelled>
          <Labelled label="Görev">{task.title || '-'}</Labelled>
          {request ? <Labelled label="Revizyon">{request.revision_code || '-'}</Labelled> : null}
          {request?.requested_by ? (
            <Labelled label="Talep Eden">{request.requested_by}</Labelled>
          ) : null}
        </SimpleGrid>
      ),
      confirmLabel: 'Evet, Onayla',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      if (!request?.release_id) throw new Error('Revizyon talebi bilgisi bulunamadı');
      await approve.mutateAsync({ releaseId: request.release_id, topic_id: request.topic_id });
      notify.success('Revizyon talebi başarıyla onaylandı');
      setViewing(null);
    } catch (error) {
      console.error('Error approving revision:', error);
      notify.error(`Revizyon talebi onaylanırken hata oluştu: ${(error as Error).message}`);
    }
  };

  const rowActions = (): RowAction<RevisionRequestTask>[] => [
    { key: 'view', label: 'Detaylar', icon: 'fas fa-eye', color: 'info', onClick: setViewing },
    {
      key: 'approve',
      label: 'Onayla',
      icon: 'fas fa-check',
      color: 'success',
      disabled: approve.isPending,
      onClick: (r) => void approveRequest(r),
    },
    {
      key: 'reject',
      label: 'Reddet',
      icon: 'fas fa-times',
      color: 'danger',
      onClick: setRejecting,
    },
  ];

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({ queryKey: ['departmentTasks'], refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  return (
    <>
      <PageHeader
        title="Revizyon Talepleri"
        subtitle="Bekleyen revizyon taleplerini görüntüleyin, onaylayın veya reddedin"
        icon="edit"
        backTo="/design/"
        stats={[
          {
            id: 'pending-revision-requests-count',
            label: 'Bekleyen',
            value: list.isPending ? '–' : total.toLocaleString('tr-TR'),
          },
        ]}
      />

      <DataTable
        title="Bekleyen Revizyon Talepleri"
        data={rows}
        columns={revisionRequestColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        extraData={approve.isPending}
        emptyMessage="Bekleyen revizyon talebi bulunamadı"
        onRefresh={refresh}
      />

      {viewing ? (
        <DetailModal
          opened
          onClose={() => setViewing(null)}
          title="Revizyon Talebi Detayları"
          subtitle={[viewing.job_order, viewing.title].filter(Boolean).join(' · ') || undefined}
          icon="fas fa-file-alt"
          size="lg"
          sections={detailSections(viewing)}
          footerActions={
            <>
              <Button
                color="red"
                leftSection={<FaIcon icon="fas fa-times" />}
                onClick={() => setRejecting(viewing)}
              >
                Reddet
              </Button>
              <Button
                color="green"
                leftSection={<FaIcon icon="fas fa-check" />}
                loading={approve.isPending}
                onClick={() => void approveRequest(viewing)}
              >
                Onayla
              </Button>
            </>
          }
        />
      ) : null}

      {rejecting ? (
        <RejectRevisionModal
          task={rejecting}
          onClose={() => setRejecting(null)}
          onRejected={() => {
            setRejecting(null);
            setViewing(null);
          }}
        />
      ) : null}
    </>
  );
}

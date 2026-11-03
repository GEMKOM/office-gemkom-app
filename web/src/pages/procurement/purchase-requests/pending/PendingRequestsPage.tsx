import { Badge, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import {
  approvePurchaseRequest,
  invalidatePurchaseRequests,
  purchaseRequestAllFilesQueryOptions,
  purchaseRequestListQueryOptions,
  rejectPurchaseRequest,
  type PurchaseRequestDetail,
  type PurchaseRequestRow,
} from '@/api/procurement/purchaseRequests';
import { formatCurrency } from '@/lib/format';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FileAttachments,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  notify,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
  type RowAction,
  type SortDir,
} from '@/ui';
import { toAttachment } from '../shared/badges';
import { baseColumns, listOrdering } from '../shared/columns';
import { RequestDetailsModal } from '../shared/RequestDetailsModal';
import { useTalepDeepLink } from '../shared/useTalepDeepLink';
import { approvalInfo, userHasDecided } from './logic';

// Port of procurement/purchase-requests/pending/pending.js.

type TableState = { page: number; pageSize: number; sortBy: string | null; sortDir: SortDir };
const INITIAL: TableState = { page: 1, pageSize: 20, sortBy: null, sortDir: 'asc' };

const SUBCONTRACTING_ROW: CSSProperties = {
  backgroundColor: '#fff3cd',
  borderLeft: '4px solid #ffc107',
};

const ITEM_TYPE: Record<
  string,
  { color: 'yellow' | 'green' | 'grey'; icon: string; label: string }
> = {
  subcontracting: { color: 'yellow', icon: 'fas fa-hammer', label: 'DAŞ' },
  stock: { color: 'green', icon: 'fas fa-box', label: 'Malzeme' },
  expenditure: { color: 'grey', icon: 'fas fa-receipt', label: 'Gider' },
};

function useList(kind: 'pendingApproval' | 'approvedByMe', state: TableState) {
  const params = {
    ordering: listOrdering(state.sortBy, state.sortDir),
    page: state.page,
    page_size: state.pageSize,
  };
  return useQuery(purchaseRequestListQueryOptions(kind, params));
}

export function PendingRequestsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [pendingState, setPendingState] = useState(INITIAL);
  const [approvedState, setApprovedState] = useState(INITIAL);
  const pending = useList('pendingApproval', pendingState);
  const approved = useList('approvedByMe', approvedState);
  const deepLink = useTalepDeepLink((talep) => `Talep ${talep} bulunamadı`);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [allFiles, setAllFiles] = useState<{ id: number; number: string } | null>(null);

  const pendingRows = pending.data?.results;
  const approve = useCallback(
    async (id: number) => {
      const row = pendingRows?.find((r) => r.id === id);
      const ok = await confirm({
        title: 'Talep Onayı',
        icon: 'fas fa-check-circle',
        message: 'Bu talebi onaylamak istediğinizden emin misiniz?',
        details: row ? <ApproveDetails row={row} /> : undefined,
        confirmLabel: 'Evet, Onayla',
        cancelLabel: 'İptal',
      });
      if (!ok) return;
      try {
        await approvePurchaseRequest(id);
        notify.success('Talep başarıyla onaylandı');
        deepLink.close();
        await invalidatePurchaseRequests(queryClient);
      } catch (error) {
        notify.error(`Talep onaylanırken hata oluştu: ${(error as Error).message}`);
      }
    },
    [pendingRows, deepLink, queryClient],
  );

  const pendingColumns = useMemo<DataTableColumn<PurchaseRequestRow>[]>(
    () => [
      ...baseColumns({ truncateDescription: false }),
      {
        key: 'item_type',
        header: 'Tip',
        sortable: true,
        render: (row) => {
          const meta = row.item_type ? ITEM_TYPE[row.item_type] : undefined;
          const fileCount = row.total_files || row.files_count || 0;
          return (
            <Group gap={6} wrap="nowrap">
              {meta ? (
                <StatusBadge color={meta.color}>
                  <i className={meta.icon} style={{ marginRight: 4 }} />
                  {meta.label}
                </StatusBadge>
              ) : (
                <StatusBadge color="grey">-</StatusBadge>
              )}
              {fileCount > 0 ? (
                <Badge
                  component="button"
                  type="button"
                  color="cyan"
                  radius="xl"
                  style={{ cursor: 'pointer' }}
                  title="Tüm dosyaları görüntüle"
                  leftSection={<i className="fas fa-paperclip" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    notify.info('Dosyalar yükleniyor...');
                    setAllFiles({ id: row.id, number: row.request_number });
                  }}
                >
                  {fileCount}
                </Badge>
              ) : null}
            </Group>
          );
        },
      },
    ],
    [],
  );

  const approvedColumns = useMemo<DataTableColumn<PurchaseRequestRow>[]>(
    () => [
      ...baseColumns({ truncateDescription: false }),
      {
        key: 'approval',
        header: 'Onay Durumu',
        sortable: false,
        render: (row) => <ApprovalCell row={row} />,
      },
    ],
    [],
  );

  const view = useCallback((row: PurchaseRequestRow) => deepLink.open(row), [deepLink]);

  const pendingActions = useCallback(
    (row: PurchaseRequestRow): RowAction<PurchaseRequestRow>[] => [
      {
        key: 'view',
        label: 'Detayları Görüntüle',
        icon: 'fas fa-eye',
        color: 'primary',
        onClick: view,
      },
      {
        key: 'approve',
        label: 'Onayla',
        icon: 'fas fa-check',
        color: 'success',
        hidden: row.status !== 'submitted',
        onClick: (r) => void approve(r.id),
      },
      {
        key: 'reject',
        label: 'Reddet',
        icon: 'fas fa-times',
        color: 'danger',
        hidden: row.status !== 'submitted',
        onClick: (r) => setRejectId(r.id),
      },
    ],
    [view, approve],
  );
  const approvedActions = useCallback(
    (): RowAction<PurchaseRequestRow>[] => [
      {
        key: 'view',
        label: 'Detayları Görüntüle',
        icon: 'fas fa-eye',
        color: 'primary',
        onClick: view,
      },
    ],
    [view],
  );

  const footerActions = (request: PurchaseRequestDetail) =>
    request.status === 'submitted' && !userHasDecided(request, user?.id) ? (
      <>
        <Button
          color="red"
          miw={120}
          leftSection={<FaIcon icon="fas fa-times" />}
          onClick={() => setRejectId(request.id)}
        >
          Reddet
        </Button>
        <Button
          color="green"
          leftSection={<FaIcon icon="fas fa-check" />}
          onClick={() => void approve(request.id)}
        >
          Onayla
        </Button>
      </>
    ) : null;

  return (
    <>
      <PageHeader
        title="Onay Bekleyen Satın Alma Talepleri"
        subtitle="Onayınızı bekleyen taleplerin yönetimi ve karşılaştırması"
        icon="clock"
        backTo="/procurement/purchase-requests/"
      />
      <Stack gap="lg">
        <RequestTable
          title="Onay Bekleyen Talepler"
          icon="fas fa-clock"
          query={pending}
          state={pendingState}
          setState={setPendingState}
          columns={pendingColumns}
          rowActions={pendingActions}
          emptyMessage="Onayınızı bekleyen satın alma talebi bulunmamaktadır."
          errorPrefix="Onay bekleyen talepler yüklenirken hata oluştu"
          rowStyle={(row) => (row.item_type === 'subcontracting' ? SUBCONTRACTING_ROW : undefined)}
        />
        <RequestTable
          title="Onayladığınız Talepler"
          icon="fas fa-check-circle"
          query={approved}
          state={approvedState}
          setState={setApprovedState}
          columns={approvedColumns}
          rowActions={approvedActions}
          emptyMessage="Henüz onayladığınız satın alma talebi bulunmamaktadır."
          errorPrefix="Onayladığınız talepler yüklenirken hata oluştu"
        />
      </Stack>
      {deepLink.openId ? (
        <RequestDetailsModal
          key={deepLink.openId}
          requestId={deepLink.openId}
          onClose={deepLink.close}
          footerActions={footerActions}
          loadErrorPrefix="Talep detayları yüklenirken hata oluştu"
        />
      ) : null}
      {rejectId !== null ? (
        <RejectModal
          requestId={rejectId}
          onClose={() => setRejectId(null)}
          onRejected={async () => {
            setRejectId(null);
            deepLink.close();
            await invalidatePurchaseRequests(queryClient);
          }}
        />
      ) : null}
      {allFiles ? (
        <AllFilesModal
          id={allFiles.id}
          number={allFiles.number}
          onClose={() => setAllFiles(null)}
        />
      ) : null}
    </>
  );
}

function RequestTable({
  title,
  icon,
  query,
  state,
  setState,
  columns,
  rowActions,
  emptyMessage,
  errorPrefix,
  rowStyle,
}: {
  title: string;
  icon: string;
  query: ReturnType<typeof useList>;
  state: TableState;
  setState: (next: TableState) => void;
  columns: DataTableColumn<PurchaseRequestRow>[];
  rowActions: (row: PurchaseRequestRow) => RowAction<PurchaseRequestRow>[];
  emptyMessage: string;
  errorPrefix: string;
  rowStyle?: (row: PurchaseRequestRow) => CSSProperties | undefined;
}) {
  const rows = query.data?.results ?? EMPTY;
  return (
    <DataTable
      title={title}
      icon={icon}
      data={query.isError ? EMPTY : rows}
      columns={columns}
      getRowId={(row) => String(row.id)}
      loading={query.isFetching}
      sortable
      sort={{
        sortBy: state.sortBy,
        sortDir: state.sortDir,
        onSortChange: (sortBy, sortDir) => setState({ ...state, sortBy, sortDir, page: 1 }),
      }}
      pagination={{
        page: state.page,
        pageSize: state.pageSize,
        total: query.data?.count ?? 0,
        onPageChange: (page) => setState({ ...state, page }),
        onPageSizeChange: (pageSize) => setState({ ...state, pageSize, page: 1 }),
        pageSizeOptions: [10, 20, 50, 100],
      }}
      rowActions={rowActions}
      rowStyle={rowStyle}
      emptyMessage={
        query.isError ? (
          <Text c="red" size="sm">{`${errorPrefix}: ${(query.error as Error).message}`}</Text>
        ) : (
          emptyMessage
        )
      }
      onRefresh={() => void query.refetch()}
    />
  );
}

const EMPTY: PurchaseRequestRow[] = [];

function ApproveDetails({ row }: { row: PurchaseRequestRow }) {
  return (
    <Stack gap={2}>
      <Text size="sm">
        <strong>Talep No:</strong> {row.request_number || '-'}
      </Text>
      <Text size="sm">
        <strong>Talep Eden:</strong> {row.requestor_username || '-'}
      </Text>
      {row.title ? (
        <Text size="sm">
          <strong>Başlık:</strong> {row.title}
        </Text>
      ) : null}
      {row.total_amount_eur ? (
        <Text size="sm">
          <strong>Toplam Tutar:</strong> {formatCurrency(row.total_amount_eur, 'EUR')}
        </Text>
      ) : null}
    </Stack>
  );
}

function ApprovalCell({ row }: { row: PurchaseRequestRow }) {
  const info = approvalInfo(row);
  if (info.kind === 'none') return <span style={{ color: '#6c757d' }}>-</span>;
  if (info.kind === 'done') {
    return (
      <span style={{ color: '#198754' }}>
        <i className="fas fa-check-circle" style={{ marginRight: 4 }} />
        {info.label}
      </span>
    );
  }
  return (
    <div style={{ minWidth: 200, textAlign: 'left' }}>
      <div style={{ color: '#0d6efd', fontSize: '0.85rem', fontWeight: 600 }}>{info.stage}</div>
      <div style={{ fontSize: '0.8rem' }}>
        <i className="fas fa-users" style={{ marginRight: 4 }} />
        {`${info.remaining} onay bekleniyor`}
      </div>
      {info.names ? (
        <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
          <i className="fas fa-user-clock" style={{ marginRight: 4 }} />
          {info.names}
        </div>
      ) : null}
    </div>
  );
}

const REJECT_MAX = 500;

function RejectModal({
  requestId,
  onClose,
  onRejected,
}: {
  requestId: number;
  onClose: () => void;
  onRejected: () => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const length = comment.length;
  const counterColor = length > 450 ? '#dc3545' : length > 400 ? '#fd7e14' : '#6c757d';

  const submit = async () => {
    setBusy(true);
    try {
      await rejectPurchaseRequest(requestId, comment.trim());
      notify.success('Talep başarıyla reddedildi');
      await onRejected();
    } catch (error) {
      notify.error(`Talep reddedilirken hata oluştu: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      withCloseButton={false}
      classNames={modalClassNames}
      padding={0}
    >
      <ModalHeader title="Satın Alma Talebini Reddet" icon="fas fa-times-circle" tone="danger" />
      <ModalBody>
        <Stack gap="sm">
          <Text size="sm" c="orange.9">
            <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />
            <strong>Dikkat!</strong> Bu işlem geri alınamaz. Satın alma talebini reddetmek için bir
            gerekçe belirtmeniz önerilir.
          </Text>
          <Textarea
            label={
              <>
                <i className="fas fa-comment-alt" style={{ marginRight: 4 }} />
                Reddetme Gerekçesi{' '}
                <Text span size="xs" c="dimmed">
                  (İsteğe bağlı)
                </Text>
              </>
            }
            rows={4}
            maxLength={REJECT_MAX}
            placeholder="Satın alma talebini neden reddettiğinizi açıklayın..."
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
          />
          <Text size="xs" style={{ color: counterColor }}>
            {`${length}/${REJECT_MAX} karakter`}
          </Text>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" leftSection={<FaIcon icon="fas fa-times" />} onClick={onClose}>
          İptal
        </Button>
        <Button
          color="red"
          loading={busy}
          leftSection={<FaIcon icon="fas fa-times-circle" />}
          onClick={() => void submit()}
        >
          Reddet
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function AllFilesModal({
  id,
  number,
  onClose,
}: {
  id: number;
  number: string;
  onClose: () => void;
}) {
  const files = useQuery(purchaseRequestAllFilesQueryOptions(id));
  const data = files.data;
  const requestFiles = data?.request_files ?? [];
  const items = (data?.items ?? []).filter((i) => (i.files ?? []).length > 0);
  const none = !!data && requestFiles.length === 0 && items.length === 0;

  useEffect(() => {
    if (files.isError) {
      notify.error(`Dosyalar yüklenirken hata oluştu: ${(files.error as Error).message}`);
      onClose();
    }
    // Once per failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.isError]);

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Tüm Dosyalar - ${number || 'Talep'}`}
      icon="fas fa-paperclip"
      size="xl"
      loading={files.isPending}
      sections={[
        {
          title: 'Tüm Dosyalar',
          icon: 'fas fa-paperclip',
          content: !data ? null : none ? (
            <Stack align="center" p="lg" c="dimmed">
              <i className="fas fa-inbox fa-3x" />
              <Text>Bu talep için dosya bulunmamaktadır.</Text>
            </Stack>
          ) : (
            <Stack gap="md">
              <Text size="sm">
                <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
                <strong>Toplam {data.total_files || 0} dosya</strong> bulunmaktadır.
              </Text>
              {requestFiles.length > 0 ? (
                <div>
                  <Text fw={600} size="sm" mb={4}>
                    <i className="fas fa-file-alt" style={{ marginRight: 4 }} />
                    {`Talep Dosyaları (${requestFiles.length})`}
                  </Text>
                  <FileAttachments readOnly layout="grid" files={requestFiles.map(toAttachment)} />
                </div>
              ) : null}
              {items.map((item, i) => (
                <div key={i}>
                  <Text fw={600} size="sm" mb={4}>
                    <i className="fas fa-box" style={{ marginRight: 4 }} />
                    {`${item.item_name || item.item_code || 'Ürün'} - ${item.item_code || ''} (${(item.files ?? []).length} dosya)`}
                  </Text>
                  <FileAttachments
                    readOnly
                    layout="grid"
                    files={(item.files ?? []).map(toAttachment)}
                  />
                </div>
              ))}
            </Stack>
          ),
        },
      ]}
    />
  );
}

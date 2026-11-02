import { Button, Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  QUALITY_DOCUMENT_TYPE_CHOICES,
  qualityDocumentExpiryCountQueryOptions,
  qualityDocumentKeys,
  qualityDocumentsQueryOptions,
  useDeleteQualityDocument,
  type QualityDocument,
  type QualityDocumentsParams,
} from '@/api/quality-control/documents';
import {
  confirm,
  DataTable,
  errorMessage,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  StatusBadge,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { documentColumns } from './columns';
import { DocumentFormModal } from './DocumentFormModal';

const PAGE_SIZE = 20;

// expiry_status is the legacy deep link (?expiry_status=expiring from the hub).
const URL_DEFAULTS = {
  search: '',
  document_type: '',
  expiry_status: '',
  page: '1',
  ordering: '-created_at',
};

type FilterKeys = 'search' | 'document_type' | 'expiry_status';
type Filters = Record<FilterKeys, string>;
const EMPTY_FILTERS: Filters = { search: '', document_type: '', expiry_status: '' };
const EMPTY_ROWS: QualityDocument[] = [];

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'Başlık, evrak no, iş emri no...' },
  {
    type: 'select',
    key: 'document_type',
    label: 'Evrak Tipi',
    placeholder: 'Tümü',
    options: QUALITY_DOCUMENT_TYPE_CHOICES.map(({ value, label }) => ({ value, label })),
  },
  {
    type: 'select',
    key: 'expiry_status',
    label: 'Geçerlilik Durumu',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'expiring', label: 'Süresi Dolmak Üzere (30 gün)' },
      { value: 'expired', label: 'Süresi Dolmuş' },
      { value: 'valid', label: 'Geçerli' },
    ],
  },
];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Legacy loadExpiryBanner: counts across every active document, whatever the
 * table shows; each part sets the expiry filter when clicked.
 */
function ExpiryBanner({ onPick }: { onPick: (status: 'expiring' | 'expired') => void }) {
  const expiring = useQuery(qualityDocumentExpiryCountQueryOptions('expiring'));
  const expired = useQuery(qualityDocumentExpiryCountQueryOptions('expired'));
  const expiringCount = expiring.data ?? 0;
  const expiredCount = expired.data ?? 0;
  if (!expiringCount && !expiredCount) return null;

  return (
    <Paper
      withBorder
      radius="md"
      px="md"
      py="sm"
      role="status"
      style={{ borderLeft: '4px solid var(--mantine-color-orange-6)' }}
    >
      <Group gap="lg" wrap="wrap">
        <FaIcon
          icon="fas fa-exclamation-triangle"
          style={{ color: 'var(--mantine-color-orange-6)' }}
        />
        {expiringCount ? (
          <UnstyledButton onClick={() => onPick('expiring')}>
            <Group gap={6} wrap="nowrap">
              <StatusBadge color="orange">{expiringCount} evrak</StatusBadge>
              <Text size="sm">30 gün içinde süresi doluyor</Text>
            </Group>
          </UnstyledButton>
        ) : null}
        {expiredCount ? (
          <UnstyledButton onClick={() => onPick('expired')}>
            <Group gap={6} wrap="nowrap">
              <StatusBadge color="red">{expiredCount} evrak</StatusBadge>
              <Text size="sm">süresi dolmuş</Text>
            </Group>
          </UnstyledButton>
        ) : null}
      </Group>
    </Paper>
  );
}

/** Port of quality-control/documents (documents.js). */
export function DocumentsPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<Filters>(
    () => ({
      search: values.search,
      document_type: values.document_type,
      expiry_status: values.expiry_status,
    }),
    [values.search, values.document_type, values.expiry_status],
  );
  const page = positiveInt(values.page, 1);
  const sort = fromOrdering(values.ordering || '-created_at');
  const params: QualityDocumentsParams = {
    ...filters,
    ordering: toOrdering(sort.sortBy, sort.sortDir) ?? '-created_at',
    page,
    page_size: PAGE_SIZE,
  };
  const list = useQuery({
    ...qualityDocumentsQueryOptions(params),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (list.isError) notify.error(`Kalite evrakları yüklenemedi: ${errorMessage(list.error)}`);
  }, [list.isError, list.errorUpdatedAt, list.error]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<QualityDocument | null>(null);

  const remove = useDeleteQualityDocument();
  const removeDocument = async (row: QualityDocument) => {
    const ok = await confirm({
      title: 'Evrak Silme Onayı',
      icon: 'fas fa-trash',
      message: `"${row.title ?? ''}" evrağını silmek istediğinize emin misiniz?`,
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Evrak silindi.');
    } catch (error) {
      console.error(error);
      notify.error(`Evrak silinemedi: ${errorMessage(error)}`);
    }
  };

  const download = (row: QualityDocument) => {
    if (row.url) window.open(row.url, '_blank');
    else notify.warning('Bu evrağa ait dosya bulunamadı.');
  };

  const rowActions = (row: QualityDocument): RowAction<QualityDocument>[] => [
    {
      key: 'download',
      label: 'İndir',
      icon: 'fas fa-download',
      color: 'primary',
      onClick: () => download(row),
    },
    { key: 'edit', label: 'Düzenle', icon: 'fas fa-edit', onClick: () => setEditing(row) },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: () => void removeDocument(row),
    },
  ];

  // Legacy refresh: page 1, the list and the banner.
  const refresh = () => {
    if (page !== 1) apply({ page: '1' });
    void queryClient.invalidateQueries({ queryKey: qualityDocumentKeys.all });
  };

  return (
    <>
      <PageHeader
        title="Kalite Evrakları"
        subtitle="Kalite evraklarını görüntüleyin, yükleyin ve yönetin"
        icon="file-alt"
        backTo="/quality-control/"
        stats={[
          {
            id: 'documents-count',
            label: 'Toplam',
            value: list.isPending ? '–' : (list.data?.count ?? 0).toLocaleString('tr-TR'),
          },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Evrak
          </Button>
        }
      />

      <Stack gap="md">
        <ExpiryBanner onPick={(status) => apply({ expiry_status: status, page: '1' })} />

        <DataTable
          title="Kalite Evrakları"
          icon="fas fa-file-alt"
          filters={
            <FilterBar
              inline
              filters={filterConfig}
              values={filters}
              onApply={(next) => apply({ ...next, page: '1' })}
              onClear={() => apply({ ...EMPTY_FILTERS, page: '1' })}
            />
          }
          data={list.data?.results ?? EMPTY_ROWS}
          columns={documentColumns}
          getRowId={(row) => String(row.id)}
          loading={list.isFetching}
          sort={{
            sortBy: sort.sortBy,
            sortDir: sort.sortDir,
            onSortChange: (sortBy, sortDir) =>
              apply({ ordering: toOrdering(sortBy, sortDir) ?? '-created_at', page: '1' }),
          }}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: list.data?.count ?? 0,
            onPageChange: (next) => apply({ page: String(next) }),
          }}
          rowActions={rowActions}
          emptyMessage="Kayıtlı kalite evrağı bulunamadı."
          onRefresh={refresh}
        />
      </Stack>

      {creating ? (
        <DocumentFormModal
          onClose={() => setCreating(false)}
          onCreated={() => apply({ page: '1' })}
        />
      ) : null}
      {editing ? (
        <DocumentFormModal key={editing.id} document={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}

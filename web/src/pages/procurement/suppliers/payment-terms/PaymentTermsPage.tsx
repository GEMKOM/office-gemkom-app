import { Button, Stack, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  basisChoicesQueryOptions,
  paymentTermsQueryOptions,
  useDeletePaymentTerm,
  type BasisChoice,
  type PaymentTerm,
  type PaymentTermsParams,
} from '@/api/procurement/paymentTerms';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { legacyApiMessage, paymentTermColumns } from './columns';
import { PaymentTermFormModal } from './PaymentTermFormModal';

// Legacy kept its filters in memory; here they live in the URL under the
// request param names.
const URL_DEFAULTS = {
  name: '',
  code: '',
  is_custom: '',
  active: '',
  created_at__gte: '',
  page: '1',
  ordering: '-id',
};

/** Legacy itemsPerPage; the page had no size picker. */
const PAGE_SIZE = 20;

type FilterKeys = 'name' | 'code' | 'is_custom' | 'active' | 'created_at__gte';
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  {
    type: 'text',
    key: 'name',
    label: 'Ödeme Koşulu Adı',
    placeholder: 'Ödeme koşulu adı girin...',
  },
  { type: 'text', key: 'code', label: 'Kod', placeholder: 'Kod girin...' },
  {
    type: 'select',
    key: 'is_custom',
    label: 'Tür',
    placeholder: 'Tüm Türler',
    searchable: false,
    options: [
      { value: 'false', label: 'Standart' },
      { value: 'true', label: 'Özel' },
    ],
  },
  {
    type: 'select',
    key: 'active',
    label: 'Durum',
    placeholder: 'Tüm Durumlar',
    searchable: false,
    options: [
      { value: 'true', label: 'Aktif' },
      { value: 'false', label: 'Pasif' },
    ],
  },
  { type: 'date', key: 'created_at__gte', label: 'Oluşturulma Tarihi' },
];

const EMPTY_FILTERS: FilterState = {
  name: '',
  code: '',
  is_custom: '',
  active: '',
  created_at__gte: '',
};
const EMPTY_ROWS: PaymentTerm[] = [];
const EMPTY_CHOICES: BasisChoice[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of procurement/suppliers/payment-terms (payment-terms.js). */
export function PaymentTermsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(
    () => ({
      name: values.name,
      code: values.code,
      is_custom: values.is_custom,
      active: values.active,
      created_at__gte: values.created_at__gte,
    }),
    [values.name, values.code, values.is_custom, values.active, values.created_at__gte],
  );
  const page = positiveInt(values.page, 1);
  const sort = fromOrdering(values.ordering || '-id');
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  const params: PaymentTermsParams = { ...filters, ordering, page, page_size: PAGE_SIZE };
  const list = useQuery({ ...paymentTermsQueryOptions(params), placeholderData: keepPreviousData });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  const basis = useQuery(basisChoicesQueryOptions());
  const basisChoices = basis.data ?? EMPTY_CHOICES;
  const columns = useMemo(() => paymentTermColumns(basisChoices), [basisChoices]);

  useEffect(() => {
    if (!list.isError) return;
    notify.error(
      'Ödeme koşulları yüklenirken hata oluştu: ' +
        legacyApiMessage(list.error, 'Ödeme koşulları yüklenirken hata oluştu'),
    );
  }, [list.isError, list.error, list.errorUpdatedAt]);

  useEffect(() => {
    if (basis.isError) notify.error('Ödeme koşulları yüklenirken hata oluştu');
  }, [basis.isError, basis.errorUpdatedAt]);

  // Legacy counts active / inactive / custom on the loaded page.
  const stats = useMemo(
    () => ({
      active: rows.filter((pt) => pt.active).length,
      inactive: rows.filter((pt) => !pt.active).length,
      custom: rows.filter((pt) => pt.is_custom).length,
    }),
    [rows],
  );
  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));

  const [creating, setCreating] = useState(false);

  // ---- delete (custom payment terms only) ----
  const remove = useDeletePaymentTerm();
  const deletePaymentTerm = async (row: PaymentTerm) => {
    const ok = await confirm({
      title: 'Onay',
      icon: 'fas fa-exclamation-triangle',
      message: `"${row.name}" ödeme koşulunu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
      confirmLabel: 'Evet',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Ödeme koşulu başarıyla silindi');
    } catch (error) {
      notify.error(
        'Ödeme koşulu silinirken hata oluştu: ' +
          legacyApiMessage(error, 'Ödeme koşulu silinirken hata oluştu'),
      );
    }
  };

  const rowActions = (row: PaymentTerm): RowAction<PaymentTerm>[] => [
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      hidden: !row.is_custom,
      disabled: remove.isPending,
      onClick: (r) => void deletePaymentTerm(r),
    },
  ];

  return (
    <>
      <PageHeader
        title="Ödeme Koşulları"
        subtitle="Ödeme koşulları yönetimi ve takibi"
        icon="credit-card"
        backTo="/procurement/"
        stats={[
          // Legacy showed the loaded page's length here; the total is what the label says.
          { id: 'all-payment-terms-count', label: 'Tüm Ödeme Koşulları', value: figure(total) },
          { id: 'active-payment-terms-count', label: 'Aktif', value: figure(stats.active) },
          { id: 'inactive-payment-terms-count', label: 'Pasif', value: figure(stats.inactive) },
          { id: 'custom-payment-terms-count', label: 'Özel', value: figure(stats.custom) },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Ödeme Koşulu
          </Button>
        }
      />

      <DataTable
        title="Tüm Ödeme Koşulları"
        icon="fas fa-credit-card"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ ...EMPTY_FILTERS, page: '1' })}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? '-id', page: '1' }),
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
        }}
        rowActions={rowActions}
        extraData={remove.isPending}
        emptyMessage={
          <Stack gap={4} align="center">
            <Text fw={600}>Henüz ödeme koşulu bulunmuyor</Text>
            <Text size="sm" c="dimmed">
              Ödeme koşulu bulunmamaktadır.
            </Text>
          </Stack>
        }
        // Legacy Yenile reloads the current page.
        onRefresh={() => void list.refetch()}
        toolbar={
          <Button
            size="xs"
            variant="default"
            onClick={() => notify.info('Dışa aktarma özelliği yakında eklenecek')}
            leftSection={<FaIcon icon="fas fa-download" />}
          >
            Dışa Aktar
          </Button>
        }
      />

      {creating ? <PaymentTermFormModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}

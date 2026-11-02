import { Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  craneErrorText,
  craneMyPermissionsQueryOptions,
  craneRatesQueryOptions,
  craneTypesQueryOptions,
  type CraneRate,
  type CraneType,
} from '@/api/general/craneRequests';
import { formatDate } from '@/lib/format';
import {
  DataTable,
  DetailModal,
  notify,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
  type RowAction,
} from '@/ui';
import { formatMoney } from '../crane';
import { CraneRateFormModal } from './CraneRateFormModal';

const EMPTY_TYPES: CraneType[] = [];

function Money({ value, currency }: { value: unknown; currency: string | null | undefined }) {
  const text = formatMoney(value, currency || 'TRY');
  return text === '-' ? (
    <Text span c="dimmed" fz="sm">
      —
    </Text>
  ) : (
    <>{text}</>
  );
}

function priceColumn(key: keyof CraneRate & string, header: string): DataTableColumn<CraneType> {
  return {
    key,
    header,
    sortable: false,
    render: (row) => (
      <Money value={row.current_rate?.[key]} currency={row.current_rate?.currency} />
    ),
  };
}

const columns: DataTableColumn<CraneType>[] = [
  {
    key: 'category_label',
    header: 'Kategori',
    sortable: false,
    render: (row) => <StatusBadge color="blue">{row.category_label || '-'}</StatusBadge>,
  },
  {
    key: 'name',
    header: 'Ekipman',
    sortable: false,
    render: (row) => (
      <Text fz="sm" fw={600}>
        {row.name} {row.is_active ? null : <StatusBadge color="grey">Pasif</StatusBadge>}
      </Text>
    ),
  },
  priceColumn('price_up_to_3h', '3 Saate Kadar'),
  priceColumn('price_up_to_8h', '8 Saate Kadar'),
  priceColumn('price_per_day', 'Günlük'),
  priceColumn('transport_fee', 'Nakliye (G-D)'),
  priceColumn('rigger_fee', 'İlave Sapancı'),
  {
    key: 'effective_from',
    header: 'Geçerlilik Başlangıcı',
    sortable: false,
    render: (row) =>
      row.current_rate?.effective_from ? (
        <Text fz="sm" c="dimmed">
          {formatDate(row.current_rate.effective_from)}
        </Text>
      ) : (
        <Text span c="dimmed" fz="sm">
          —
        </Text>
      ),
  },
  {
    key: 'note',
    header: 'Not',
    sortable: false,
    render: (row) => (
      <Text fz="xs" c="dimmed">
        {row.current_rate?.note || ''}
      </Text>
    ),
  },
];

const dash = (value: unknown) => (value === null || value === undefined ? '—' : String(value));

function RateHistoryModal({ craneType, onClose }: { craneType: CraneType; onClose: () => void }) {
  const rates = useQuery(craneRatesQueryOptions(craneType.id));
  useEffect(() => {
    if (!rates.isError) return;
    notify.error(`Fiyat geçmişi yüklenirken hata oluştu: ${craneErrorText(rates.error)}`);
    onClose();
  }, [rates.isError, rates.error, onClose]);

  const rows = rates.data ?? [];
  return (
    <DetailModal
      opened
      onClose={onClose}
      title="Fiyat Geçmişi"
      icon="fas fa-history"
      size="lg"
      loading={rates.isPending}
      sections={[
        {
          title: `${craneType.name} — Fiyat Geçmişi`,
          icon: 'fas fa-history',
          content: (
            <Table.ScrollContainer minWidth={560}>
              <Table striped fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Geçerlilik</Table.Th>
                    <Table.Th>3 Saat</Table.Th>
                    <Table.Th>8 Saat</Table.Th>
                    <Table.Th>Günlük</Table.Th>
                    <Table.Th>Nakliye</Table.Th>
                    <Table.Th>Sapancı</Table.Th>
                    <Table.Th>Birim / Not</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={7} c="dimmed">
                        {rates.isPending ? '' : 'Kayıt yok'}
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    rows.map((rate, index) => (
                      <Table.Tr key={rate.id ?? index}>
                        <Table.Td>{formatDate(rate.effective_from)}</Table.Td>
                        <Table.Td>{dash(rate.price_up_to_3h)}</Table.Td>
                        <Table.Td>{dash(rate.price_up_to_8h)}</Table.Td>
                        <Table.Td>{dash(rate.price_per_day)}</Table.Td>
                        <Table.Td>{dash(rate.transport_fee)}</Table.Td>
                        <Table.Td>{dash(rate.rigger_fee)}</Table.Td>
                        <Table.Td>
                          {rate.currency} {rate.note ? `· ${rate.note}` : ''}
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ),
        },
      ]}
    />
  );
}

/** Port of general/crane-requests/prices (prices.js): Vinç / Platform Fiyat Listesi. */
export function CranePricesPage() {
  const permissions = useQuery(craneMyPermissionsQueryOptions());
  const canManagePrices = permissions.data?.can_manage_prices === true;
  // Legacy waits for the permissions (a failure means "no"), then lists the
  // inactive types too for price managers.
  const types = useQuery({
    ...craneTypesQueryOptions({ include_inactive: canManagePrices ? 'true' : '' }),
    enabled: !permissions.isPending,
  });
  const rows = types.data ?? EMPTY_TYPES;

  useEffect(() => {
    if (types.isError)
      notify.error(`Fiyat listesi yüklenirken hata oluştu: ${craneErrorText(types.error)}`);
  }, [types.isError, types.error, types.errorUpdatedAt]);

  const [newRateFor, setNewRateFor] = useState<CraneType | null>(null);
  const [historyFor, setHistoryFor] = useState<CraneType | null>(null);

  const rowActions = useMemo(
    () => (): RowAction<CraneType>[] => [
      {
        key: 'new-rate',
        label: 'Yeni Fiyat Gir',
        icon: 'fas fa-plus',
        color: 'success',
        hidden: !canManagePrices,
        onClick: (row) => setNewRateFor(row),
      },
      {
        key: 'history',
        label: 'Fiyat Geçmişi',
        icon: 'fas fa-history',
        color: 'secondary',
        onClick: (row) => setHistoryFor(row),
      },
    ],
    [canManagePrices],
  );

  return (
    <>
      <PageHeader
        title="Vinç / Platform Fiyat Listesi"
        subtitle="Kiralık vinç ve platformların güncel fiyatları (KDV hariç)"
        icon="fas fa-tags"
        backTo="/general/crane-requests"
        stats={[
          {
            id: 'crane-types-count',
            label: 'Ekipman',
            value: types.isPending ? '–' : rows.length.toLocaleString('tr-TR'),
          },
        ]}
      />

      <DataTable
        title="Fiyat Listesi"
        icon="fas fa-tags"
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={permissions.isPending || types.isFetching}
        rowActions={rowActions}
        extraData={canManagePrices}
        emptyMessage="Fiyat listesi boş."
        onRefresh={() => void types.refetch()}
      />

      {newRateFor ? (
        <CraneRateFormModal craneType={newRateFor} onClose={() => setNewRateFor(null)} />
      ) : null}
      {historyFor ? (
        <RateHistoryModal craneType={historyFor} onClose={() => setHistoryFor(null)} />
      ) : null}
    </>
  );
}

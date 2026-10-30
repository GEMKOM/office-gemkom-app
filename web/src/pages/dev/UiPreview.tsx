import {
  Badge,
  Button,
  Code,
  Container,
  Divider,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
} from '@/lib/format';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  FormModal,
  MenuCards,
  notify,
  PageHeader,
  SelectRemote,
  StatCards,
  toOrdering,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RemoteOption,
  type RowAction,
  type SortDir,
} from '@/ui';

// Dev-only page (/react-preview/ui): every shared component with fake data.

// ---------- fake data ----------

type OrderStatus = 'draft' | 'open' | 'approved' | 'cancelled';

interface Order {
  id: number;
  code: string;
  customer: string;
  status: OrderStatus;
  amount: number;
  weight_kg: number;
  created_at: string;
  urgent: boolean;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Taslak',
  open: 'Açık',
  approved: 'Onaylandı',
  cancelled: 'İptal',
};
const STATUS_COLORS: Record<OrderStatus, string> = {
  draft: 'gray',
  open: 'blue',
  approved: 'green',
  cancelled: 'red',
};
const CUSTOMERS = ['Arçelik', 'Tüpraş', 'Ford Otosan', 'Şişecam', 'Ereğli Demir Çelik', 'Vestel', 'Ülker', 'İçdaş'];
const STATUSES: OrderStatus[] = ['draft', 'open', 'approved', 'cancelled'];

function makeOrders(count: number): Order[] {
  // Deterministic, so sorting and paging look the same on every reload.
  let seed = 42;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const start = new Date(2026, 0, 1).getTime();
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    code: `SP-${String(i + 1).padStart(5, '0')}`,
    customer: CUSTOMERS[Math.floor(random() * CUSTOMERS.length)] ?? 'Arçelik',
    status: STATUSES[Math.floor(random() * STATUSES.length)] ?? 'draft',
    amount: Math.round(random() * 5_000_000) / 100,
    weight_kg: Math.round(random() * 250_000) / 10,
    created_at: new Date(start + Math.floor(random() * 300) * 86_400_000 + Math.floor(random() * 86_400_000)).toISOString(),
    urgent: random() > 0.8,
  }));
}

const ALL_ORDERS = makeOrders(2000);

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

interface OrderQuery {
  page: number;
  pageSize: number;
  ordering?: string;
  search: string;
  status: string[];
  urgent: boolean;
}

/** Stands in for a DRF list endpoint: ?page=&page_size=&ordering=&search=. */
async function fetchOrders(query: OrderQuery, signal: AbortSignal) {
  await delay(500, signal);
  const needle = query.search.toLocaleLowerCase('tr');
  let rows = ALL_ORDERS.filter(
    (order) =>
      (!needle ||
        order.code.toLocaleLowerCase('tr').includes(needle) ||
        order.customer.toLocaleLowerCase('tr').includes(needle)) &&
      (query.status.length === 0 || query.status.includes(order.status)) &&
      (!query.urgent || order.urgent),
  );
  if (query.ordering) {
    const desc = query.ordering.startsWith('-');
    const field = (desc ? query.ordering.slice(1) : query.ordering) as keyof Order;
    rows = [...rows].sort((a, b) => {
      const x = a[field];
      const y = b[field];
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'tr');
      return desc ? -cmp : cmp;
    });
  }
  const start = (query.page - 1) * query.pageSize;
  return { count: rows.length, results: rows.slice(start, start + query.pageSize) };
}

const USERS: RemoteOption[] = [
  'Ahmet Yılmaz',
  'Ayşe Kaya',
  'Mehmet Demir',
  'Fatma Çelik',
  'Mustafa Şahin',
  'Emine Yıldız',
  'Ali Öztürk',
  'Hatice Aydın',
  'Hüseyin Özdemir',
  'Zeynep Arslan',
].map((name, i) => ({ value: String(i + 1), label: name }));

async function searchUsers(query: string, signal: AbortSignal): Promise<RemoteOption[]> {
  await delay(400, signal);
  const needle = query.toLocaleLowerCase('tr');
  return USERS.filter((user) => user.label.toLocaleLowerCase('tr').includes(needle));
}

const EMPTY_ORDERS: Order[] = [];

// ---------- columns (module scope: stable, so rows can stay memoized) ----------

const orderColumns: DataTableColumn<Order>[] = [
  { key: 'code', header: 'Sipariş No', sortable: true, width: 120 },
  { key: 'customer', header: 'Müşteri', sortable: true },
  {
    key: 'status',
    header: 'Durum',
    render: (row) => (
      <Badge color={STATUS_COLORS[row.status]} variant="light">
        {STATUS_LABELS[row.status]}
      </Badge>
    ),
    exportValue: (row) => STATUS_LABELS[row.status],
  },
  {
    key: 'amount',
    header: 'Tutar',
    sortable: true,
    align: 'right',
    render: (row) => formatCurrency(row.amount, 'EUR'),
    exportFormat: '"€"#,##0.00',
  },
  {
    key: 'weight_kg',
    header: 'Ağırlık (kg)',
    sortable: true,
    align: 'right',
    render: (row) => formatNumber(row.weight_kg, 1),
  },
  {
    key: 'created_at',
    header: 'Oluşturulma',
    sortable: true,
    render: (row) => formatDateTime(row.created_at),
    exportValue: (row) => new Date(row.created_at),
  },
  {
    key: 'urgent',
    header: 'Acil',
    align: 'center',
    render: (row) => (row.urgent ? <FaIcon icon="fas fa-bolt" color="var(--mantine-color-orange-6)" /> : null),
  },
];

const orderFilters: FilterConfig<'search' | 'status' | 'created' | 'urgent'>[] = [
  { type: 'text', key: 'search', label: 'Ara', placeholder: 'Sipariş no veya müşteri', span: 3 },
  {
    type: 'multiselect',
    key: 'status',
    label: 'Durum',
    options: STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
    span: 3,
  },
  { type: 'dateRange', key: 'created', label: 'Oluşturulma' },
  { type: 'checkbox', key: 'urgent', label: 'Sadece acil' },
];

// ---------- sections ----------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="sm">
      <Divider label={<Title order={4}>{title}</Title>} labelPosition="left" />
      {children}
    </Stack>
  );
}

const orderSchema = z.object({
  customer: z.string().min(2, 'En az 2 karakter girin'),
  amount: z.number({ message: 'Tutar girin' }).positive('Tutar sıfırdan büyük olmalı'),
  status: z.enum(['draft', 'open', 'approved', 'cancelled']),
});
type OrderFormValues = z.infer<typeof orderSchema>;

function ServerTableDemo() {
  const filters = useUrlFilters({
    search: '',
    status: [] as string[],
    created: { start: '', end: '' },
    urgent: false,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<{ sortBy: string | null; sortDir: SortDir }>({
    sortBy: 'created_at',
    sortDir: 'desc',
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<Order | null>(null);
  const [editing, setEditing] = useState<Order | null>(null);

  const query: OrderQuery = {
    page,
    pageSize,
    ordering: toOrdering(sort.sortBy, sort.sortDir),
    search: filters.values.search,
    status: filters.values.status,
    urgent: filters.values.urgent,
  };
  const result = useQuery({
    queryKey: ['ui-preview-orders', query],
    queryFn: ({ signal }) => fetchOrders(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = result.data?.results ?? EMPTY_ORDERS;

  const form = useForm<OrderFormValues>({
    initialValues: { customer: '', amount: 0, status: 'draft' },
    validate: zod4Resolver(orderSchema),
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const openEdit = (order: Order | null) => {
    setEditing(order);
    setSaveError(null);
    if (order) form.setValues({ customer: order.customer, amount: order.amount, status: order.status });
  };

  const rowActions = (row: Order): RowAction<Order>[] => [
    { label: 'Görüntüle', icon: 'fas fa-eye', color: 'blue', onClick: setDetail },
    { label: 'Düzenle', icon: 'fas fa-edit', onClick: openEdit, disabled: row.status === 'cancelled' },
    {
      label: 'Onayla',
      icon: 'fas fa-check',
      color: 'green',
      hidden: row.status !== 'open',
      onClick: () => notify.success(`${row.code} onaylandı`),
    },
    {
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: async () => {
        if (await confirm({ message: `${row.code} silinsin mi?`, details: row.customer, danger: true })) {
          notify.success(`${row.code} silindi`);
        }
      },
    },
  ];

  return (
    <>
      <FilterBar
        filters={orderFilters}
        values={filters.values}
        onApply={(values) => {
          filters.apply(values);
          setPage(1);
        }}
        onClear={() => {
          filters.reset();
          setPage(1);
        }}
      />
      <Text size="xs" c="dimmed">
        URL'deki filtreler: <Code>{JSON.stringify(filters.values)}</Code>
      </Text>
      <DataTable
        title="Siparişler (sunucu modu)"
        icon="fas fa-server"
        data={rows}
        columns={orderColumns}
        getRowId={(row) => String(row.id)}
        loading={result.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) => {
            setSort({ sortBy, sortDir });
            setPage(1);
          },
        }}
        pagination={{
          page,
          pageSize,
          total: result.data?.count ?? 0,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
        rowActions={rowActions}
        onRowClick={setDetail}
        selection={{ selectedIds, onChange: setSelectedIds, isRowSelectable: (row) => row.status !== 'cancelled' }}
        exportable={{ fileName: 'siparisler', sheetName: 'Siparişler' }}
        onRefresh={() => void result.refetch()}
        toolbar={
          selectedIds.length > 0 ? (
            <Badge variant="light" size="lg">
              {selectedIds.length} seçili
            </Badge>
          ) : null
        }
      />

      <DetailModal
        opened={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.code ?? ''}
        icon="fas fa-file-invoice"
        onEdit={() => {
          openEdit(detail);
          setDetail(null);
        }}
        sections={[
          {
            title: 'Genel Bilgiler',
            icon: 'fas fa-info-circle',
            fields: [
              { label: 'Sipariş No', value: detail?.code, copyable: true },
              { label: 'Müşteri', value: detail?.customer },
              {
                label: 'Durum',
                value: detail ? STATUS_LABELS[detail.status] : null,
                type: 'badge',
                badgeColor: detail ? STATUS_COLORS[detail.status] : undefined,
              },
              { label: 'Acil', value: detail?.urgent, type: 'boolean' },
            ],
          },
          {
            title: 'Tutarlar',
            icon: 'fas fa-calculator',
            fields: [
              { label: 'Tutar', value: detail?.amount, type: 'currency', currency: 'EUR' },
              { label: 'Ağırlık (kg)', value: detail?.weight_kg, type: 'number' },
              { label: 'Oluşturulma', value: detail?.created_at, type: 'datetime' },
              { label: 'Not', value: null },
            ],
          },
          {
            title: 'Özel içerik',
            content: <Text size="sm">Özel bölümler istenen her şeyi gösterebilir.</Text>,
          },
        ]}
      />

      <FormModal
        opened={editing !== null}
        onClose={() => {
          setEditing(null);
          form.reset();
        }}
        title={`Düzenle: ${editing?.code ?? ''}`}
        icon="fas fa-edit"
        submitting={saving}
        error={saveError}
        onSubmit={form.onSubmit(async (values) => {
          setSaving(true);
          setSaveError(null);
          try {
            await delay(700);
            if (values.customer.toLocaleLowerCase('tr') === 'hata') {
              throw new Error('Sunucu kaydı reddetti (örnek hata)');
            }
            notify.success('Sipariş kaydedildi');
            setEditing(null);
            form.reset();
          } catch (error) {
            setSaveError(error);
          } finally {
            setSaving(false);
          }
        })}
      >
        <Stack gap="sm">
          <TextInput label="Müşteri" description="'hata' yazınca kayıt hata verir" {...form.getInputProps('customer')} />
          <NumberInput label="Tutar (€)" decimalSeparator="," thousandSeparator="." {...form.getInputProps('amount')} />
          <Select
            label="Durum"
            data={STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))}
            allowDeselect={false}
            {...form.getInputProps('status')}
          />
        </Stack>
      </FormModal>
    </>
  );
}

function VirtualTableDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <>
      <Group>
        <Switch label="loading (satırlar kalır)" checked={loading} onChange={(e) => setLoading(e.currentTarget.checked)} />
      </Group>
      <DataTable
        title={`${formatNumber(ALL_ORDERS.length)} satır, sanal liste`}
        icon="fas fa-stream"
        data={ALL_ORDERS}
        columns={orderColumns}
        getRowId={(row) => String(row.id)}
        sortable
        loading={loading}
        virtualize={{ height: 420 }}
        exportable={{ fileName: 'tum-siparisler' }}
      />
    </>
  );
}

const smallColumns: DataTableColumn<Order>[] = [
  { key: 'code', header: 'Sipariş No' },
  { key: 'customer', header: 'Müşteri' },
  { key: 'amount', header: 'Tutar', align: 'right', render: (row) => formatCurrency(row.amount, 'EUR') },
];
const SMALL_ORDERS = ALL_ORDERS.slice(0, 37);

function ClientTableDemo() {
  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }}>
      <DataTable
        title="İstemci sayfalama + footer"
        data={SMALL_ORDERS}
        columns={smallColumns}
        getRowId={(row) => String(row.id)}
        sortable
        pagination={{ pageSize: 10 }}
        stickyHeader
        footer={({ rows, allRows }) => (
          <Table.Tr>
            <Table.Th colSpan={2}>Sayfa toplamı / genel toplam</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>
              {formatCurrency(rows.reduce((sum, row) => sum + row.amount, 0), 'EUR')} /{' '}
              {formatCurrency(allRows.reduce((sum, row) => sum + row.amount, 0), 'EUR')}
            </Table.Th>
          </Table.Tr>
        )}
      />
      <Stack>
        <DataTable title="İlk yükleme (iskelet)" data={EMPTY_ORDERS} columns={smallColumns} getRowId={(row) => String(row.id)} loading />
        <DataTable title="Boş" data={EMPTY_ORDERS} columns={smallColumns} getRowId={(row) => String(row.id)} />
      </Stack>
    </SimpleGrid>
  );
}

function SelectRemoteDemo() {
  const [single, setSingle] = useState<string | null>('3');
  const [many, setMany] = useState<string[]>([]);
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <SelectRemote
        label="Sorumlu (tekli)"
        search={searchUsers}
        queryKey={['ui-preview-users']}
        initialOptions={[{ value: '3', label: 'Mehmet Demir' }]}
        value={single}
        onChange={(value) => setSingle(value)}
      />
      <SelectRemote
        multiple
        label="Katılımcılar (çoklu)"
        minSearchLength={1}
        search={searchUsers}
        queryKey={['ui-preview-users']}
        value={many}
        onChange={(values) => setMany(values)}
      />
      <Text size="xs" c="dimmed">
        Seçili: <Code>{JSON.stringify({ single, many })}</Code>
      </Text>
    </SimpleGrid>
  );
}

export function UiPreview() {
  const [statsLoading, setStatsLoading] = useState(false);
  const totals = useMemo(
    () => ({
      count: ALL_ORDERS.length,
      open: ALL_ORDERS.filter((order) => order.status === 'open').length,
      amount: ALL_ORDERS.reduce((sum, order) => sum + order.amount, 0),
      urgent: ALL_ORDERS.filter((order) => order.urgent).length,
    }),
    [],
  );

  return (
    <Container fluid p="md">
      <Stack gap="xl">
        <PageHeader
          title="UI bileşenleri"
          subtitle="Paylaşılan React bileşenleri, sahte verilerle"
          icon="fas fa-puzzle-piece"
          backTo="/react-preview"
          actions={
            <>
              <Button size="sm" leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => notify.info('Yeni Oluştur')}>
                Yeni Oluştur
              </Button>
              <Button
                size="sm"
                variant="default"
                leftSection={<FaIcon icon="fas fa-sync-alt" />}
                onClick={() => {
                  setStatsLoading(true);
                  setTimeout(() => setStatsLoading(false), 1000);
                }}
              >
                Yenile
              </Button>
            </>
          }
        />

        <Section title="StatCards">
          <StatCards
            loading={statsLoading}
            cards={[
              { title: 'Toplam Sipariş', value: formatNumber(totals.count), icon: 'fas fa-boxes', color: 'primary' },
              { title: 'Açık', value: formatNumber(totals.open), icon: 'fas fa-folder-open', color: 'info' },
              { title: 'Toplam Tutar', value: formatCurrency(totals.amount, 'EUR'), icon: 'fas fa-euro-sign', color: 'success' },
              {
                title: 'Acil',
                value: formatNumber(totals.urgent),
                icon: 'fas fa-bolt',
                color: 'warning',
                tooltip: 'Tıklanabilir kart',
                onClick: () => notify.warning('Acil siparişler'),
              },
            ]}
          />
        </Section>

        <Section title="FilterBar + DataTable (sunucu modu, URL filtreleri)">
          <ServerTableDemo />
        </Section>

        <Section title="DataTable: 2.000 satır, virtualize">
          <VirtualTableDemo />
        </Section>

        <Section title="DataTable: istemci modu, iskelet, boş">
          <ClientTableDemo />
        </Section>

        <Section title="SelectRemote">
          <SelectRemoteDemo />
        </Section>

        <Section title="confirm / notify">
          <Group>
            <Button
              variant="default"
              onClick={async () => notify.info(`Sonuç: ${String(await confirm('Devam edilsin mi?'))}`)}
            >
              confirm()
            </Button>
            <Button
              color="red"
              variant="light"
              onClick={async () =>
                notify.info(
                  `Sonuç: ${String(
                    await confirm({
                      title: 'Silme Onayı',
                      message: 'Bu kayıt kalıcı olarak silinecek.',
                      description: 'Bu işlem geri alınamaz.',
                      confirmLabel: 'Sil',
                      danger: true,
                    }),
                  )}`,
                )
              }
            >
              confirm({'{ danger: true }'})
            </Button>
            <Button color="green" variant="light" onClick={() => notify.success('Kaydedildi')}>
              success
            </Button>
            <Button color="blue" variant="light" onClick={() => notify.info('Bilgi mesajı')}>
              info
            </Button>
            <Button color="yellow" variant="light" onClick={() => notify.warning('Uyarı mesajı')}>
              warning
            </Button>
            <Button color="red" variant="light" onClick={() => notify.error(new Error('Error nesnesinin mesajı'))}>
              error(new Error)
            </Button>
          </Group>
        </Section>

        <Section title="format.ts">
          <Code block>
            {[
              `formatDate('2026-10-30')            → ${formatDate('2026-10-30')}`,
              `formatDateTime(new Date())          → ${formatDateTime(new Date())}`,
              `formatNumber(1234567.891)           → ${formatNumber(1234567.891)}`,
              `formatNumber('1234.5', 2)           → ${formatNumber('1234.5', 2)}`,
              `formatCurrency(1234.5)              → ${formatCurrency(1234.5)}`,
              `formatCurrency(1234.5, 'EUR')       → ${formatCurrency(1234.5, 'EUR')}`,
              `formatPercent(41.44)                → ${formatPercent(41.44)}`,
              `formatDate(null)                    → ${formatDate(null)}`,
            ].join('\n')}
          </Code>
        </Section>

        <Section title="MenuCards (hasRouteAccess ile süzülür)">
          <MenuCards
            title="Satın Alma"
            subtitle="Tedarik süreçleri"
            cards={[
              {
                title: 'Satın Alma Talepleri',
                description: 'Talepleri oluşturun ve takip edin',
                icon: 'fas fa-file-alt',
                iconColor: 'primary',
                link: '/procurement/purchase-requests/',
                features: [
                  { label: 'Yeni Talep', icon: 'fas fa-plus', link: '/procurement/purchase-requests/create/' },
                  { label: 'Bekleyenler', icon: 'fas fa-clock', link: '/procurement/purchase-requests/pending/' },
                ],
              },
              {
                title: 'Tedarikçiler',
                description: 'Tedarikçi listesi',
                icon: 'fas fa-truck',
                iconColor: 'success',
                link: '/procurement/suppliers/list/',
              },
              {
                title: 'Bilgi kartı',
                description: 'Bağlantısız kartlar her zaman görünür',
                icon: 'fas fa-info-circle',
                iconColor: 'info',
              },
            ]}
          />
        </Section>
      </Stack>
    </Container>
  );
}

import { Alert, Button, Grid, NumberInput, Table, Text, TextInput, Textarea } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  createDbsPayment,
  dbsPaymentsQueryOptions,
  dbsSuppliersQueryOptions,
  deleteDbsPayment,
  purchaseOrderKeys,
  type DbsPayment,
} from '@/api/procurement/purchaseOrders';
import type { Supplier } from '@/api/procurement/suppliers';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FormModal,
  notify,
  type DataTableColumn,
  type RowAction,
} from '@/ui';
import { FinanceHeader } from '../FinanceOperationsPage';
import classes from '../FinanceOperations.module.css';
import { CurrencyBadge, daysUntil, money, orDash, parseMoney, positiveAmount } from '../shared';

const EMPTY: Supplier[] = [];

function moneyCell(value: unknown, currency?: string | null) {
  const n = parseMoney(value);
  return Number.isNaN(n) ? '—' : <span className={classes.money}>{money(n, currency)}</span>;
}

/** Limit minus used; '—' without a limit. */
export function dbsAvailable(row: Supplier): number | null {
  const limit = parseMoney(row.dbs_limit);
  if (Number.isNaN(limit)) return null;
  const used = parseMoney(row.dbs_used);
  return limit - (Number.isNaN(used) ? 0 : used);
}

function ExpiryCell({ value }: { value?: string | null }) {
  if (!value) return <>—</>;
  const days = daysUntil(value);
  // Expired: bold red; within 30 days: red.
  const cls =
    days === null ? undefined : days < 0 ? classes.overdue : days <= 30 ? classes.late : undefined;
  return <span className={cls}>{formatDate(value)}</span>;
}

const columns: DataTableColumn<Supplier>[] = [
  { key: 'name', header: 'Tedarikçi', render: (r) => (r.name ? <strong>{r.name}</strong> : '—') },
  { key: 'dbs_bank', header: 'Banka', render: (r) => orDash(r.dbs_bank) },
  {
    key: 'dbs_currency',
    header: 'Para birimi',
    render: (r) => <CurrencyBadge currency={r.dbs_currency} />,
  },
  {
    key: 'dbs_limit',
    header: 'Limit',
    accessor: (r) => parseMoney(r.dbs_limit),
    render: (r) => moneyCell(r.dbs_limit, r.dbs_currency),
  },
  {
    key: 'dbs_used',
    header: 'Kullanılan',
    accessor: (r) => parseMoney(r.dbs_used),
    render: (r) => moneyCell(r.dbs_used, r.dbs_currency),
  },
  {
    key: '_available',
    header: 'Kullanılabilir',
    sortable: false,
    render: (r) => {
      const available = dbsAvailable(r);
      return available === null ? '—' : moneyCell(available, r.dbs_currency);
    },
  },
  {
    key: 'dbs_expiry_date',
    header: 'Vade',
    render: (r) => <ExpiryCell value={r.dbs_expiry_date} />,
  },
];

/** DBS Tedarikçileri: direct-debit limits, payments against them and their history. */
export function DbsTab() {
  const queryClient = useQueryClient();
  const list = useQuery(dbsSuppliersQueryOptions());
  const [paying, setPaying] = useState<Supplier | null>(null);
  const [history, setHistory] = useState<Supplier | null>(null);

  useEffect(() => {
    if (list.isError)
      notify.error(list.error, { fallback: 'DBS tedarikçileri yüklenirken hata oluştu.' });
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const rowActions = (row: Supplier): RowAction<Supplier>[] => [
    {
      key: 'pay',
      label: 'Öde',
      icon: 'fas fa-money-bill-wave',
      color: 'primary',
      onClick: () => setPaying(row),
    },
    { key: 'payments', label: 'Ödemeler', icon: 'fas fa-list', onClick: () => setHistory(row) },
  ];

  return (
    <>
      <FinanceHeader tab="dbs" />
      <DataTable
        title="DBS Tedarikçileri"
        icon="fas fa-university"
        data={list.data ?? EMPTY}
        columns={columns}
        getRowId={(r) => String(r.id)}
        sortable
        loading={list.isFetching}
        rowActions={rowActions}
        emptyMessage="DBS kaydı olan tedarikçi bulunmamaktadır."
        onRefresh={() =>
          void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.dbsSuppliers })
        }
      />
      {paying ? <DbsPayModal supplier={paying} onClose={() => setPaying(null)} /> : null}
      {history ? <DbsPaymentsModal supplier={history} onClose={() => setHistory(null)} /> : null}
    </>
  );
}

function DbsPayModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<string | number>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const typed = parseMoney(amount);
  const used = parseMoney(supplier.dbs_used);
  const over = Number.isFinite(typed) && Number.isFinite(used) && typed > used;

  const save = async () => {
    const value = positiveAmount(amount);
    if (value === null) {
      notify.error('Geçerli pozitif bir tutar girin.');
      return;
    }
    setSaving(true);
    try {
      const trimmed = note.trim();
      await createDbsPayment({
        supplier: supplier.id,
        amount: value.toFixed(2),
        ...(trimmed ? { note: trimmed } : {}),
      });
      notify.success('DBS ödemesi kaydedildi.');
      void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.dbsSuppliers });
      void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.dbsPayments(supplier.id) });
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Ödeme kaydedilirken hata oluştu.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="DBS Ödemesi"
      icon="fas fa-money-bill-wave"
      size="md"
      submitLabel="Ödemeyi Kaydet"
      submitting={saving}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Grid gap="sm">
        <Grid.Col span={12}>
          <TextInput
            label="Tedarikçi"
            value={supplier.name || `Tedarikçi #${supplier.id}`}
            readOnly
          />
        </Grid.Col>
        <Grid.Col span={8}>
          <NumberInput
            label="Tutar"
            withAsterisk
            min={0.01}
            step={0.01}
            decimalScale={2}
            decimalSeparator=","
            thousandSeparator="."
            placeholder="0,00"
            value={amount}
            onChange={setAmount}
          />
        </Grid.Col>
        <Grid.Col span={4}>
          <TextInput label="Para birimi" value={supplier.dbs_currency || 'TRY'} readOnly />
        </Grid.Col>
        {over ? (
          <Grid.Col span={12}>
            <Alert color="yellow" icon={<FaIcon icon="fas fa-exclamation-triangle" />} p="xs">
              Girilen tutar kullanılan krediden büyük. Sunucu fazla tutarı yok sayabilir; tutarı
              kontrol edin.
            </Alert>
          </Grid.Col>
        ) : null}
        <Grid.Col span={12}>
          <Textarea
            label="Not"
            placeholder="İsteğe bağlı"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}

function DbsPaymentsModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const queryClient = useQueryClient();
  const payments = useQuery(dbsPaymentsQueryOptions(supplier.id));

  const cancel = async (payment: DbsPayment) => {
    const currency = payment.currency || 'TRY';
    const amount = parseMoney(payment.amount);
    const ok = await confirm({
      message: `Bu işlem tedarikçinin kullanılan kredisine ${money(Number.isFinite(amount) ? amount : 0, currency)} geri ekler. Devam etmek istiyor musunuz?`,
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDbsPayment(payment.id);
      notify.success('Ödeme iptal edildi.');
      void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.dbsPayments(supplier.id) });
      void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.dbsSuppliers });
    } catch (error) {
      notify.error(error, { fallback: 'İptal sırasında hata oluştu.' });
    }
  };

  let content;
  if (payments.isPending) {
    content = (
      <Text ta="center" c="dimmed" py="lg">
        Yükleniyor…
      </Text>
    );
  } else if (payments.isError) {
    content = (
      <Alert color="red">
        {payments.error instanceof Error ? payments.error.message : 'Liste yüklenemedi.'}
      </Alert>
    );
  } else if (payments.data.length === 0) {
    content = (
      <Text ta="center" c="dimmed" py="lg">
        Kayıtlı ödeme yok.
      </Text>
    );
  } else {
    content = (
      <Table.ScrollContainer minWidth={500}>
        <Table striped verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tarih</Table.Th>
              <Table.Th>Tutar</Table.Th>
              <Table.Th>Ödeyen</Table.Th>
              <Table.Th>Not</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {payments.data.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>{formatDate(p.paid_at || p.created_at)}</Table.Td>
                <Table.Td>
                  <strong className={classes.money}>{money(p.amount, p.currency)}</strong>
                </Table.Td>
                <Table.Td>{orDash(p.paid_by_username)}</Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {orDash(p.note)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Button
                    size="compact-xs"
                    variant="outline"
                    color="red"
                    onClick={() => void cancel(p)}
                  >
                    İptal
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    );
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title="DBS Ödeme Geçmişi"
      subtitle={supplier.name || `Tedarikçi #${supplier.id}`}
      icon="fas fa-list"
      size="lg"
      sections={[{ content }]}
    />
  );
}

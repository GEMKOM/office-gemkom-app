import {
  Alert,
  Badge,
  Button,
  Grid,
  Select,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  cancelLoan,
  createLoan,
  financeErrorMessage,
  financeKeys,
  loanInstallmentsQueryOptions,
  loansQueryOptions,
  markLoanInstallmentPaid,
  type Loan,
  type LoanInstallment,
} from '@/api/finance/operations';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  FormModal,
  notify,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { CreateButton, FinanceHeader } from '../FinanceOperationsPage';
import classes from '../FinanceOperations.module.css';
import {
  AmountInput,
  CURRENCY_FILTER_OPTIONS,
  CURRENCY_OPTIONS,
  CurrencyBadge,
  money,
  orDash,
  parseMoney,
  positiveAmount,
  RECORD_STATUS_FILTER,
  RecordStatusBadge,
  todayIso,
} from '../shared';

const URL_DEFAULTS = { status: 'active', currency: '' };
type FilterKey = 'status' | 'currency';

const filterConfig: FilterConfig<FilterKey>[] = [
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: RECORD_STATUS_FILTER,
  },
  {
    type: 'select',
    key: 'currency',
    label: 'Para Birimi',
    placeholder: 'Tümü',
    searchable: false,
    options: CURRENCY_FILTER_OPTIONS,
  },
];

export function formatInterestRate(rate: unknown): string {
  const n = parseMoney(rate);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function installmentProgress(row: Loan): string {
  const installments = row.installments;
  if (!Array.isArray(installments) || installments.length === 0) return '—';
  return `${installments.filter((i) => i.is_paid).length} / ${installments.length} ödendi`;
}

const columns: DataTableColumn<Loan>[] = [
  { key: 'name', header: 'Kredi', render: (r) => (r.name ? <strong>{r.name}</strong> : '—') },
  {
    key: 'principal',
    header: 'Anapara',
    accessor: (r) => parseMoney(r.principal),
    render: (r) => <span className={classes.money}>{money(r.principal, r.currency)}</span>,
  },
  {
    key: 'interest_rate',
    header: 'Faiz',
    accessor: (r) => parseMoney(r.interest_rate),
    render: (r) => formatInterestRate(r.interest_rate),
  },
  { key: 'term_months', header: 'Vade (Ay)', render: (r) => orDash(r.term_months) },
  {
    key: 'currency',
    header: 'Para Birimi',
    render: (r) => <CurrencyBadge currency={r.currency} />,
  },
  {
    key: 'first_payment_date',
    header: 'İlk Ödeme',
    render: (r) => formatDate(r.first_payment_date),
  },
  {
    key: '_installment_progress',
    header: 'Taksitler',
    sortable: false,
    render: installmentProgress,
  },
  { key: 'status', header: 'Durum', render: (r) => <RecordStatusBadge status={r.status} /> },
  { key: 'created_by_username', header: 'Oluşturan', render: (r) => orDash(r.created_by_username) },
];

const EMPTY: Loan[] = [];

/** Krediler: bank loans and their instalment plans. */
export function LoansTab() {
  const queryClient = useQueryClient();
  const { values, apply, reset } = useUrlFilters(URL_DEFAULTS);
  // Currency is not a backend filter; it applies here.
  const list = useQuery(loansQueryOptions({ status: values.status || undefined }));
  const rows = useMemo(
    () => (list.data ?? EMPTY).filter((r) => !values.currency || r.currency === values.currency),
    [list.data, values.currency],
  );
  const [creating, setCreating] = useState(false);
  // The loan whose instalments are open; kept as a row so a new loan opens before the list refetches.
  const [openLoan, setOpenLoan] = useState<Loan | null>(null);
  const shownLoan = openLoan ? (list.data?.find((l) => l.id === openLoan.id) ?? openLoan) : null;

  useEffect(() => {
    if (list.isError)
      notify.error(financeErrorMessage(list.error, 'Krediler yüklenirken hata oluştu.'));
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const cancel = async (row: Loan) => {
    const label = row.name ? `"${row.name}"` : `#${row.id}`;
    const ok = await confirm({
      message: `${label} kredisini iptal etmek istediğinize emin misiniz?`,
      confirmLabel: 'İptal Et',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelLoan(row.id);
      notify.success('Kredi iptal edildi.');
      void queryClient.invalidateQueries({ queryKey: financeKeys.loansAll });
    } catch (error) {
      notify.error(financeErrorMessage(error, 'Kredi iptal edilirken hata oluştu.'));
    }
  };

  const rowActions = (row: Loan): RowAction<Loan>[] => [
    {
      key: 'installments',
      label: 'Taksitler',
      icon: 'fas fa-list-ol',
      color: 'primary',
      onClick: () => setOpenLoan(row),
    },
    {
      key: 'cancel',
      label: 'İptal Et',
      icon: 'fas fa-ban',
      color: 'danger',
      hidden: row.status !== 'active',
      onClick: (r) => void cancel(r),
    },
  ];

  return (
    <>
      <FinanceHeader
        tab="loans"
        actions={<CreateButton label="Yeni Kredi" onClick={() => setCreating(true)} />}
      />
      <DataTable
        title="Krediler"
        icon="fas fa-hand-holding-usd"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{ status: values.status, currency: values.currency }}
            onApply={apply}
            onClear={reset}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(r) => String(r.id)}
        sortable
        loading={list.isFetching}
        rowActions={rowActions}
        emptyMessage="Kayıtlı kredi bulunmamaktadır."
        onRefresh={() => void list.refetch()}
      />
      {creating ? (
        <LoanFormModal
          onClose={() => setCreating(false)}
          // Legacy opened the new loan's instalments right away.
          onCreated={(loan) => setOpenLoan(loan)}
        />
      ) : null}
      {shownLoan ? (
        <LoanInstallmentsModal loan={shownLoan} onClose={() => setOpenLoan(null)} />
      ) : null}
    </>
  );
}

function LoanInstallmentsModal({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const queryClient = useQueryClient();
  const installments = useQuery(loanInstallmentsQueryOptions(loan.id));
  const currency = loan.currency || 'TRY';
  const loanActive = (loan.status || 'active') === 'active';

  const markPaid = async (inst: LoanInstallment) => {
    const label = inst.sequence ? `${inst.sequence}. taksit` : 'Bu taksit';
    const ok = await confirm({
      message: `${label} ödendi olarak işaretlensin mi?`,
      confirmLabel: 'Ödendi İşaretle',
    });
    if (!ok) return;
    try {
      await markLoanInstallmentPaid(loan.id, inst.id);
      notify.success('Taksit ödendi olarak işaretlendi.');
      void queryClient.invalidateQueries({ queryKey: financeKeys.loanInstallments(loan.id) });
      void queryClient.invalidateQueries({ queryKey: financeKeys.loansAll });
    } catch (error) {
      notify.error(financeErrorMessage(error, 'Taksit işaretlenirken hata oluştu.'));
    }
  };

  let content;
  if (installments.isPending) {
    content = (
      <Text ta="center" c="dimmed" py="lg">
        Yükleniyor…
      </Text>
    );
  } else if (installments.isError) {
    content = (
      <Alert color="red">{financeErrorMessage(installments.error, 'Taksitler yüklenemedi.')}</Alert>
    );
  } else if (installments.data.length === 0) {
    content = (
      <Text ta="center" c="dimmed" py="lg">
        Taksit bulunamadı.
      </Text>
    );
  } else {
    const sorted = installments.data.slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    content = (
      <Table.ScrollContainer minWidth={760}>
        <Table striped verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th ta="center">#</Table.Th>
              <Table.Th>Vade</Table.Th>
              <Table.Th ta="right">Anapara</Table.Th>
              <Table.Th ta="right">Faiz</Table.Th>
              <Table.Th ta="right">Toplam</Table.Th>
              <Table.Th ta="center">Durum</Table.Th>
              <Table.Th>Ödeme tarihi</Table.Th>
              <Table.Th>Ödeyen</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((inst) => (
              <Table.Tr key={inst.id}>
                <Table.Td ta="center">{orDash(inst.sequence)}</Table.Td>
                <Table.Td>{formatDate(inst.due_date)}</Table.Td>
                <Table.Td ta="right" className={classes.money}>
                  {money(inst.principal_component, currency)}
                </Table.Td>
                <Table.Td ta="right" className={classes.money}>
                  {money(inst.interest_component, currency)}
                </Table.Td>
                <Table.Td ta="right" className={classes.money}>
                  <strong>{money(inst.total_payment, currency)}</strong>
                </Table.Td>
                <Table.Td ta="center">
                  <Badge size="sm" variant="light" color={inst.is_paid ? 'green' : 'yellow'}>
                    {inst.is_paid ? 'Ödendi' : 'Bekliyor'}
                  </Badge>
                </Table.Td>
                <Table.Td>{inst.paid_at ? formatDate(inst.paid_at) : '—'}</Table.Td>
                <Table.Td>{orDash(inst.paid_by_username)}</Table.Td>
                <Table.Td ta="center">
                  {inst.is_paid ? (
                    <Text c="green" span aria-label="Ödendi">
                      <FaIcon icon="fas fa-check-circle" />
                    </Text>
                  ) : loanActive ? (
                    <Button
                      size="compact-xs"
                      variant="outline"
                      color="green"
                      onClick={() => void markPaid(inst)}
                    >
                      Ödendi
                    </Button>
                  ) : (
                    '—'
                  )}
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
      title="Kredi Taksitleri"
      subtitle={loan.name || `Kredi #${loan.id}`}
      icon="fas fa-list-ol"
      size="xl"
      sections={[{ content }]}
    />
  );
}

interface LoanForm {
  name: string;
  principal: string | number;
  interest_rate: string | number;
  term_months: string | number;
  currency: string;
  first_payment_date: string;
  notes: string;
}

function LoanFormModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (loan: Loan) => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const form = useForm<LoanForm>({
    initialValues: {
      name: '',
      principal: '',
      interest_rate: '',
      term_months: 24,
      currency: 'TRY',
      first_payment_date: todayIso(),
      notes: '',
    },
    validate: {
      principal: (v) => (positiveAmount(v) === null ? 'Geçerli bir anapara girin.' : null),
      interest_rate: (v) => {
        const n = parseMoney(v);
        return Number.isFinite(n) && n >= 0 ? null : 'Geçerli bir faiz oranı girin.';
      },
      term_months: (v) => {
        const n = Number.parseInt(String(v), 10);
        return Number.isFinite(n) && n >= 1 ? null : 'Vade en az 1 ay olmalıdır.';
      },
      name: (v) => (v.trim() ? null : 'Kredi adı zorunludur.'),
      first_payment_date: (v) => (v ? null : 'İlk ödeme tarihi zorunludur.'),
    },
  });

  const save = async (values: LoanForm) => {
    setSaving(true);
    try {
      const created = await createLoan({
        name: values.name.trim(),
        principal: (positiveAmount(values.principal) ?? 0).toFixed(2),
        interest_rate: parseMoney(values.interest_rate).toFixed(2),
        term_months: Number.parseInt(String(values.term_months), 10),
        currency: values.currency || 'TRY',
        first_payment_date: values.first_payment_date,
        status: 'active',
        notes: values.notes.trim(),
      });
      notify.success('Kredi kaydedildi.');
      void queryClient.invalidateQueries({ queryKey: financeKeys.loansAll });
      onClose();
      if (created?.id) onCreated(created);
    } catch (error) {
      notify.error(financeErrorMessage(error, 'Kredi kaydedilirken hata oluştu.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Kredi"
      icon="fas fa-plus"
      size="lg"
      submitLabel="Kaydet"
      submitting={saving}
      onSubmit={form.onSubmit(save)}
    >
      <Grid gap="sm">
        <Grid.Col span={12}>
          <TextInput
            label="Kredi adı"
            withAsterisk
            placeholder="Örn. Garanti Bank — Ekipman Kredisi"
            {...form.getInputProps('name')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <AmountInput label="Anapara" {...form.getInputProps('principal')} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <AmountInput
            label="Yıllık faiz (%)"
            min={0}
            placeholder="42,50"
            {...form.getInputProps('interest_rate')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <AmountInput
            label="Vade (ay)"
            min={1}
            step={1}
            decimals={0}
            placeholder="24"
            {...form.getInputProps('term_months')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Para birimi"
            withAsterisk
            data={CURRENCY_OPTIONS}
            allowDeselect={false}
            {...form.getInputProps('currency')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            type="date"
            label="İlk ödeme tarihi"
            withAsterisk
            {...form.getInputProps('first_payment_date')}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <Textarea label="Notlar" rows={2} {...form.getInputProps('notes')} />
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}

import { Grid, Select, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  createTax,
  financeErrorMessage,
  financeKeys,
  markTaxPaid,
  taxesQueryOptions,
  type TaxEntry,
} from '@/api/finance/operations';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
  FilterBar,
  FormModal,
  notify,
  StatusBadge,
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
  daysUntil,
  money,
  optionLabel,
  orDash,
  parseMoney,
  positiveAmount,
  TAX_TYPE_OPTIONS,
  todayIso,
} from '../shared';

const URL_DEFAULTS = { is_paid: 'false', tax_type: '', currency: '' };
type FilterKey = 'is_paid' | 'tax_type' | 'currency';

const filterConfig: FilterConfig<FilterKey>[] = [
  {
    type: 'select',
    key: 'is_paid',
    label: 'Ödeme durumu',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'false', label: 'Ödenmedi' },
      { value: 'true', label: 'Ödendi' },
    ],
  },
  {
    type: 'select',
    key: 'tax_type',
    label: 'Vergi türü',
    placeholder: 'Tümü',
    searchable: false,
    options: TAX_TYPE_OPTIONS,
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

/** Unpaid: red once past due, yellow within a week (legacy formatTaxDueDateCell). */
function DueDateCell({ row }: { row: TaxEntry }) {
  if (!row.due_date) return <>—</>;
  const label = formatDate(row.due_date);
  if (row.is_paid) return <>{label}</>;
  const days = daysUntil(row.due_date);
  if (days === null) return <>{label}</>;
  if (days < 0) return <span className={classes.overdue}>{label}</span>;
  if (days <= 7) return <span className={classes.dueSoon}>{label}</span>;
  return <>{label}</>;
}

const columns: DataTableColumn<TaxEntry>[] = [
  { key: 'tax_type', header: 'Tür', render: (r) => optionLabel(TAX_TYPE_OPTIONS, r.tax_type) },
  {
    key: 'period_label',
    header: 'Dönem',
    render: (r) => (r.period_label ? <strong>{r.period_label}</strong> : '—'),
  },
  { key: 'description', header: 'Açıklama', render: (r) => orDash(r.description) },
  {
    key: 'amount',
    header: 'Tutar',
    accessor: (r) => parseMoney(r.amount),
    render: (r) => <span className={classes.money}>{money(r.amount, r.currency)}</span>,
  },
  {
    key: 'currency',
    header: 'Para Birimi',
    render: (r) => <CurrencyBadge currency={r.currency} />,
  },
  { key: 'due_date', header: 'Son ödeme', render: (r) => <DueDateCell row={r} /> },
  {
    key: 'is_paid',
    header: 'Durum',
    render: (r) =>
      r.is_paid ? (
        <StatusBadge color="green">Ödendi</StatusBadge>
      ) : (
        <StatusBadge color="yellow">Ödenmedi</StatusBadge>
      ),
  },
  {
    key: 'paid_by_username',
    header: 'Ödeyen',
    render: (r) => (r.is_paid ? orDash(r.paid_by_username) : '—'),
  },
  { key: 'created_by_username', header: 'Oluşturan', render: (r) => orDash(r.created_by_username) },
];

const EMPTY: TaxEntry[] = [];

/** Vergiler: tax liabilities and when they were paid. */
export function TaxesTab() {
  const queryClient = useQueryClient();
  const { values, apply, reset } = useUrlFilters(URL_DEFAULTS);
  // Currency is not a backend filter; it applies here.
  const list = useQuery(
    taxesQueryOptions({
      is_paid: values.is_paid || undefined,
      tax_type: values.tax_type || undefined,
    }),
  );
  const rows = useMemo(
    () => (list.data ?? EMPTY).filter((r) => !values.currency || r.currency === values.currency),
    [list.data, values.currency],
  );
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (list.isError)
      notify.error(financeErrorMessage(list.error, 'Vergi kayıtları yüklenirken hata oluştu.'));
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const markPaid = async (row: TaxEntry) => {
    const label = row.period_label ? `"${row.period_label}"` : `#${row.id}`;
    const ok = await confirm({
      message: `${label} vergi kaydı ödendi olarak işaretlensin mi?`,
      confirmLabel: 'Ödendi İşaretle',
    });
    if (!ok) return;
    try {
      await markTaxPaid(row.id);
      notify.success('Vergi ödendi olarak işaretlendi.');
      void queryClient.invalidateQueries({ queryKey: financeKeys.taxesAll });
    } catch (error) {
      notify.error(financeErrorMessage(error, 'Vergi işaretlenirken hata oluştu.'));
    }
  };

  const rowActions = (row: TaxEntry): RowAction<TaxEntry>[] => [
    {
      key: 'mark-paid',
      label: 'Ödendi İşaretle',
      icon: 'fas fa-check',
      color: 'success',
      hidden: Boolean(row.is_paid),
      onClick: (r) => void markPaid(r),
    },
  ];

  return (
    <>
      <FinanceHeader
        tab="taxes"
        actions={<CreateButton label="Yeni Vergi Kaydı" onClick={() => setCreating(true)} />}
      />
      <DataTable
        title="Vergi Kayıtları"
        icon="fas fa-file-invoice-dollar"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{
              is_paid: values.is_paid,
              tax_type: values.tax_type,
              currency: values.currency,
            }}
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
        emptyMessage="Kayıtlı vergi bulunmamaktadır."
        onRefresh={() => void list.refetch()}
      />
      {creating ? <TaxFormModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}

interface TaxForm {
  tax_type: string;
  currency: string;
  period_label: string;
  amount: string | number;
  due_date: string;
  description: string;
  notes: string;
}

function TaxFormModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const form = useForm<TaxForm>({
    initialValues: {
      tax_type: 'vat',
      currency: 'TRY',
      period_label: '',
      amount: '',
      due_date: todayIso(),
      description: '',
      notes: '',
    },
    validate: {
      amount: (v) => (positiveAmount(v) === null ? 'Geçerli pozitif bir tutar girin.' : null),
      period_label: (v) => (v.trim() ? null : 'Dönem etiketi zorunludur.'),
      due_date: (v) => (v ? null : 'Son ödeme tarihi zorunludur.'),
    },
  });

  const save = async (values: TaxForm) => {
    setSaving(true);
    try {
      await createTax({
        tax_type: values.tax_type,
        period_label: values.period_label.trim(),
        description: values.description.trim(),
        amount: (positiveAmount(values.amount) ?? 0).toFixed(2),
        currency: values.currency || 'TRY',
        due_date: values.due_date,
        notes: values.notes.trim(),
      });
      notify.success('Vergi kaydı oluşturuldu.');
      void queryClient.invalidateQueries({ queryKey: financeKeys.taxesAll });
      onClose();
    } catch (error) {
      notify.error(financeErrorMessage(error, 'Vergi kaydı oluşturulurken hata oluştu.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Vergi Kaydı"
      icon="fas fa-plus"
      size="lg"
      submitLabel="Kaydet"
      submitting={saving}
      onSubmit={form.onSubmit(save)}
    >
      <Grid gap="sm">
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Vergi türü"
            withAsterisk
            data={TAX_TYPE_OPTIONS}
            allowDeselect={false}
            {...form.getInputProps('tax_type')}
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
        <Grid.Col span={12}>
          <TextInput
            label="Dönem etiketi"
            withAsterisk
            placeholder="Örn. Nisan 2026 KDV"
            {...form.getInputProps('period_label')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <AmountInput label="Tutar" {...form.getInputProps('amount')} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            type="date"
            label="Son ödeme tarihi"
            withAsterisk
            {...form.getInputProps('due_date')}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <TextInput label="Açıklama" {...form.getInputProps('description')} />
        </Grid.Col>
        <Grid.Col span={12}>
          <Textarea label="Notlar" rows={2} {...form.getInputProps('notes')} />
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}

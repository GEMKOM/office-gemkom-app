import { Grid, Select, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  cancelExpense,
  createExpense,
  expensesQueryOptions,
  financeErrorMessage,
  financeKeys,
  type MonthlyExpense,
} from '@/api/finance/operations';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
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
  CURRENCY_FILTER_OPTIONS,
  CURRENCY_OPTIONS,
  CurrencyBadge,
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_RECURRENCE_OPTIONS,
  money,
  optionLabel,
  orDash,
  parseMoney,
  positiveAmount,
  RECORD_STATUS_FILTER,
  RecordStatusBadge,
  todayIso,
  AmountInput,
} from '../shared';

const URL_DEFAULTS = { status: 'active', category: '', recurrence: '', currency: '' };
type FilterKey = 'status' | 'category' | 'recurrence' | 'currency';

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
    key: 'category',
    label: 'Kategori',
    placeholder: 'Tümü',
    options: EXPENSE_CATEGORY_OPTIONS,
  },
  {
    type: 'select',
    key: 'recurrence',
    label: 'Tekrar',
    placeholder: 'Tümü',
    searchable: false,
    options: EXPENSE_RECURRENCE_OPTIONS,
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

const columns: DataTableColumn<MonthlyExpense>[] = [
  {
    key: 'category',
    header: 'Kategori',
    render: (r) => optionLabel(EXPENSE_CATEGORY_OPTIONS, r.category),
  },
  {
    key: 'description',
    header: 'Açıklama',
    render: (r) => (r.description ? <strong>{r.description}</strong> : '—'),
  },
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
  {
    key: 'recurrence',
    header: 'Tekrar',
    render: (r) => optionLabel(EXPENSE_RECURRENCE_OPTIONS, r.recurrence),
  },
  { key: 'start_date', header: 'Başlangıç', render: (r) => formatDate(r.start_date) },
  { key: 'end_date', header: 'Bitiş', render: (r) => (r.end_date ? formatDate(r.end_date) : '—') },
  { key: 'status', header: 'Durum', render: (r) => <RecordStatusBadge status={r.status} /> },
  { key: 'created_by_username', header: 'Oluşturan', render: (r) => orDash(r.created_by_username) },
];

const EMPTY: MonthlyExpense[] = [];

/** Aylık Giderler: recurring company expenses. */
export function ExpensesTab() {
  const queryClient = useQueryClient();
  const { values, apply, reset } = useUrlFilters(URL_DEFAULTS);
  // The backend filters status and category; recurrence and currency it ignores, so they apply here.
  const list = useQuery(
    expensesQueryOptions({
      status: values.status || undefined,
      category: values.category || undefined,
    }),
  );
  const rows = useMemo(
    () =>
      (list.data ?? EMPTY).filter(
        (r) =>
          (!values.recurrence || r.recurrence === values.recurrence) &&
          (!values.currency || r.currency === values.currency),
      ),
    [list.data, values.recurrence, values.currency],
  );
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (list.isError)
      notify.error(financeErrorMessage(list.error, 'Giderler yüklenirken hata oluştu.'));
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const cancel = async (row: MonthlyExpense) => {
    const label = row.description ? `"${row.description}"` : `#${row.id}`;
    const ok = await confirm({
      message: `${label} giderini iptal etmek istediğinize emin misiniz?`,
      confirmLabel: 'İptal Et',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelExpense(row.id);
      notify.success('Gider iptal edildi.');
      void queryClient.invalidateQueries({ queryKey: financeKeys.expensesAll });
    } catch (error) {
      notify.error(financeErrorMessage(error, 'Gider iptal edilirken hata oluştu.'));
    }
  };

  const rowActions = (row: MonthlyExpense): RowAction<MonthlyExpense>[] => [
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
        tab="expenses"
        actions={<CreateButton label="Yeni Gider" onClick={() => setCreating(true)} />}
      />
      <DataTable
        title="Aylık Giderler"
        icon="fas fa-calendar-alt"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{
              status: values.status,
              category: values.category,
              recurrence: values.recurrence,
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
        emptyMessage="Kayıtlı gider bulunmamaktadır."
        onRefresh={() => void list.refetch()}
      />
      {creating ? <ExpenseFormModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}

interface ExpenseForm {
  category: string;
  recurrence: string;
  description: string;
  amount: string | number;
  currency: string;
  start_date: string;
  end_date: string;
  notes: string;
}

function ExpenseFormModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const form = useForm<ExpenseForm>({
    initialValues: {
      category: 'catering',
      recurrence: 'monthly',
      description: '',
      amount: '',
      currency: 'TRY',
      start_date: todayIso(),
      end_date: '',
      notes: '',
    },
    validate: {
      description: (v) => (v.trim() ? null : 'Açıklama zorunludur.'),
      amount: (v) => (positiveAmount(v) === null ? 'Geçerli pozitif bir tutar girin.' : null),
      start_date: (v) => (v ? null : 'Başlangıç tarihi zorunludur.'),
    },
  });

  const save = async (values: ExpenseForm) => {
    setSaving(true);
    try {
      await createExpense({
        category: values.category,
        description: values.description.trim(),
        amount: (positiveAmount(values.amount) ?? 0).toFixed(2),
        currency: values.currency || 'TRY',
        recurrence: values.recurrence,
        start_date: values.start_date,
        end_date: values.end_date || null,
        status: 'active',
        notes: values.notes.trim(),
      });
      notify.success('Gider kaydedildi.');
      void queryClient.invalidateQueries({ queryKey: financeKeys.expensesAll });
      onClose();
    } catch (error) {
      notify.error(financeErrorMessage(error, 'Gider kaydedilirken hata oluştu.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Gider"
      icon="fas fa-plus"
      size="lg"
      submitLabel="Kaydet"
      submitting={saving}
      onSubmit={form.onSubmit(save)}
    >
      <Grid gap="sm">
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Kategori"
            withAsterisk
            data={EXPENSE_CATEGORY_OPTIONS}
            allowDeselect={false}
            {...form.getInputProps('category')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Tekrar"
            withAsterisk
            data={EXPENSE_RECURRENCE_OPTIONS}
            allowDeselect={false}
            {...form.getInputProps('recurrence')}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <TextInput
            label="Açıklama"
            withAsterisk
            placeholder="Örn. Yemekhane servisi"
            {...form.getInputProps('description')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <AmountInput label="Tutar" {...form.getInputProps('amount')} />
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
            label="Başlangıç tarihi"
            withAsterisk
            {...form.getInputProps('start_date')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            type="date"
            label="Bitiş tarihi"
            description="Boş bırakılırsa süresiz geçerlidir."
            {...form.getInputProps('end_date')}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <Textarea label="Notlar" rows={2} {...form.getInputProps('notes')} />
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}

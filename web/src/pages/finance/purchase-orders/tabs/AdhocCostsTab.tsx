import { Grid, Select, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  adhocCostsQueryOptions,
  createAdhocCost,
  deleteAdhocCost,
  financeErrorMessage,
  financeKeys,
  updateAdhocCost,
  type AdhocJobCost,
  type AdhocJobCostInput,
} from '@/api/finance/operations';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
  FilterBar,
  FormModal,
  notify,
  SelectRemote,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { CreateButton, FinanceHeader } from '../FinanceOperationsPage';
import classes from '../FinanceOperations.module.css';
import { jobOrderSeed, searchJobOrders } from '../jobOrderSearch';
import {
  ADHOC_COST_CATEGORY_OPTIONS,
  AmountInput,
  CURRENCY_OPTIONS,
  CurrencyBadge,
  money,
  optionLabel,
  orDash,
  parseMoney,
  positiveAmount,
  todayIso,
} from '../shared';

const URL_DEFAULTS = { job_order: '', category: '', currency: '' };
type FilterKey = 'job_order' | 'category' | 'currency';

const filterConfig: FilterConfig<FilterKey>[] = [
  { type: 'text', key: 'job_order', label: 'İş emri', placeholder: 'Örn. JOB-001' },
  {
    type: 'select',
    key: 'category',
    label: 'Kategori',
    placeholder: 'Tümü',
    searchable: false,
    options: ADHOC_COST_CATEGORY_OPTIONS,
  },
  {
    type: 'select',
    key: 'currency',
    label: 'Para Birimi',
    placeholder: 'Tümü',
    searchable: false,
    options: CURRENCY_OPTIONS,
  },
];

const columns: DataTableColumn<AdhocJobCost>[] = [
  {
    key: 'job_order',
    header: 'İş emri',
    render: (r) => (r.job_order ? <strong>{r.job_order}</strong> : '—'),
  },
  { key: 'description', header: 'Açıklama', render: (r) => orDash(r.description) },
  {
    key: 'category',
    header: 'Kategori',
    render: (r) => optionLabel(ADHOC_COST_CATEGORY_OPTIONS, r.category),
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
    key: 'cost_date',
    header: 'Gider tarihi',
    render: (r) => (r.cost_date ? formatDate(r.cost_date) : '—'),
  },
  {
    key: 'notes',
    header: 'Notlar',
    sortable: false,
    render: (r) => {
      if (!r.notes) return '—';
      return r.notes.length > 60 ? `${r.notes.slice(0, 60)}…` : r.notes;
    },
  },
];

const EMPTY: AdhocJobCost[] = [];

/** Ek Giderler: one-off costs booked against a job order. */
export function AdhocCostsTab() {
  const queryClient = useQueryClient();
  const { values, apply, reset } = useUrlFilters(URL_DEFAULTS);
  // Currency is not a backend filter; it applies here.
  const list = useQuery(
    adhocCostsQueryOptions({
      job_order: values.job_order.trim() || undefined,
      category: values.category || undefined,
    }),
  );
  const rows = useMemo(
    () => (list.data ?? EMPTY).filter((r) => !values.currency || r.currency === values.currency),
    [list.data, values.currency],
  );
  // null: closed; 'new': create; a row: edit.
  const [editing, setEditing] = useState<AdhocJobCost | 'new' | null>(null);

  useEffect(() => {
    if (list.isError)
      notify.error(financeErrorMessage(list.error, 'Ek giderler yüklenirken hata oluştu.'));
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const remove = async (row: AdhocJobCost) => {
    const label = row.description
      ? `"${row.description}"`
      : row.job_order
        ? row.job_order
        : `#${row.id}`;
    const ok = await confirm({
      message: `${label} ek gider kaydı silinsin mi? Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAdhocCost(row.id);
      notify.success('Ek gider silindi.');
      void queryClient.invalidateQueries({ queryKey: financeKeys.adhocCostsAll });
    } catch (error) {
      notify.error(financeErrorMessage(error, 'Ek gider silinirken hata oluştu.'));
    }
  };

  const rowActions = (): RowAction<AdhocJobCost>[] => [
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-pen',
      color: 'primary',
      onClick: (r) => setEditing(r),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void remove(r),
    },
  ];

  return (
    <>
      <FinanceHeader
        tab="adhoc-costs"
        actions={<CreateButton label="Yeni Ek Gider" onClick={() => setEditing('new')} />}
      />
      <DataTable
        title="Ek Giderler"
        icon="fas fa-briefcase"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{
              job_order: values.job_order,
              category: values.category,
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
        emptyMessage="Kayıtlı ek gider bulunmamaktadır."
        onRefresh={() => void list.refetch()}
      />
      {editing ? (
        <AdhocCostFormModal
          cost={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

interface AdhocForm {
  job_order: string;
  category: string;
  description: string;
  amount: string | number;
  currency: string;
  cost_date: string;
  notes: string;
}

function AdhocCostFormModal({ cost, onClose }: { cost: AdhocJobCost | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(cost);
  const form = useForm<AdhocForm>({
    initialValues: {
      job_order: cost?.job_order || '',
      category: cost?.category || 'other',
      description: cost?.description || '',
      amount: cost?.amount ?? '',
      currency: cost?.currency || 'TRY',
      cost_date: cost ? cost.cost_date || '' : todayIso(),
      notes: cost?.notes || '',
    },
    validate: {
      amount: (v) => (positiveAmount(v) === null ? 'Geçerli pozitif bir tutar girin.' : null),
      description: (v) => (v.trim() ? null : 'Açıklama zorunludur.'),
      cost_date: (v) => (v ? null : 'Gider tarihi zorunludur.'),
      category: (v) => (v ? null : 'Kategori seçin.'),
      // A new cost needs a job order; an edit may leave it as it was.
      job_order: (v) => (!isEdit && !v.trim() ? 'İş emri seçimi zorunludur.' : null),
    },
  });

  const save = async (values: AdhocForm) => {
    const payload: AdhocJobCostInput = {
      description: values.description.trim(),
      amount: (positiveAmount(values.amount) ?? 0).toFixed(2),
      currency: values.currency.trim() || 'TRY',
      cost_date: values.cost_date,
      category: values.category,
      notes: values.notes.trim(),
    };
    if (values.job_order.trim()) payload.job_order = values.job_order.trim();
    setSaving(true);
    try {
      if (cost) {
        await updateAdhocCost(cost.id, payload);
        notify.success('Ek gider güncellendi.');
      } else {
        await createAdhocCost(payload);
        notify.success('Ek gider kaydedildi.');
      }
      void queryClient.invalidateQueries({ queryKey: financeKeys.adhocCostsAll });
      onClose();
    } catch (error) {
      notify.error(
        financeErrorMessage(
          error,
          cost ? 'Ek gider güncellenirken hata oluştu.' : 'Ek gider kaydedilirken hata oluştu.',
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={isEdit ? 'Ek Gideri Düzenle' : 'Yeni Ek Gider'}
      icon={isEdit ? 'fas fa-pen' : 'fas fa-plus'}
      size="lg"
      submitLabel={isEdit ? 'Güncelle' : 'Kaydet'}
      submitting={saving}
      onSubmit={form.onSubmit(save)}
    >
      <Grid gap="sm">
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <SelectRemote
            label="İş emri"
            required
            placeholder="İş emri seçin"
            description="En az 2 karakter ile arayın."
            minSearchLength={2}
            queryKey={['finance-job-order-search']}
            search={searchJobOrders}
            initialOptions={jobOrderSeed(cost?.job_order)}
            value={form.values.job_order || null}
            onChange={(value) => form.setFieldValue('job_order', value ?? '')}
            error={form.errors.job_order}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Select
            label="Kategori"
            withAsterisk
            data={ADHOC_COST_CATEGORY_OPTIONS}
            allowDeselect={false}
            {...form.getInputProps('category')}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <TextInput
            label="Açıklama"
            withAsterisk
            placeholder="Örn. Nakliye ücreti"
            {...form.getInputProps('description')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <AmountInput label="Tutar" {...form.getInputProps('amount')} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <Select
            label="Para birimi"
            withAsterisk
            data={CURRENCY_OPTIONS}
            allowDeselect={false}
            {...form.getInputProps('currency')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <TextInput
            type="date"
            label="Gider tarihi"
            withAsterisk
            {...form.getInputProps('cost_date')}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <Textarea label="Notlar" rows={2} {...form.getInputProps('notes')} />
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}

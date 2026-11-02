import { Button, Checkbox, Grid, NumberInput, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  useDeleteShiftRule,
  useSaveShiftRule,
  useShiftRules,
  type ShiftRule,
  type ShiftRuleInput,
} from '@/api/human_resources/attendanceAdmin';
import {
  confirm,
  DataTable,
  FaIcon,
  FormModal,
  ModalSection,
  notify,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
  type RowAction,
} from '@/ui';

const EMPTY_ROWS: ShiftRule[] = [];

/** The API sends HH:MM:SS; the table and the time inputs use HH:MM. */
export function fmtTime(value: string | null | undefined): string {
  if (!value) return '-';
  const s = String(value);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

const columns: DataTableColumn<ShiftRule>[] = [
  { key: 'name', header: 'Ad', render: (row) => row.name || '-' },
  { key: 'expected_start', header: 'Başlangıç', render: (row) => fmtTime(row.expected_start) },
  { key: 'expected_end', header: 'Bitiş', render: (row) => fmtTime(row.expected_end) },
  {
    key: 'overtime_threshold_minutes',
    header: 'Eşik (dk)',
    render: (row) => row.overtime_threshold_minutes ?? '-',
  },
  {
    key: 'is_active',
    header: 'Aktif',
    render: (row) =>
      row.is_active === true ? (
        <StatusBadge color="green">Aktif</StatusBadge>
      ) : (
        <StatusBadge color="grey">Pasif</StatusBadge>
      ),
    exportValue: (row) => (row.is_active === true ? 'Aktif' : 'Pasif'),
  },
  {
    key: 'is_default',
    header: 'Varsayılan',
    render: (row) =>
      row.is_default === true ? (
        <StatusBadge color="blue">Varsayılan</StatusBadge>
      ) : (
        <StatusBadge color="grey">-</StatusBadge>
      ),
  },
  { key: 'assigned_user_count', header: 'Atanan', render: (row) => row.assigned_user_count ?? 0 },
];

const REQUIRED = 'Bu alan gereklidir';

const shiftRuleSchema = z.object({
  name: z.string().trim().min(1, REQUIRED),
  expected_start: z.string().min(1, REQUIRED),
  expected_end: z.string().min(1, REQUIRED),
  overtime_threshold_minutes: z.union([z.number(), z.literal('')]),
  is_active: z.boolean(),
  is_default: z.boolean(),
});

type ShiftRuleFormValues = z.infer<typeof shiftRuleSchema>;

function formValues(rule: ShiftRule | null): ShiftRuleFormValues {
  if (!rule) {
    // Legacy openCreate defaults.
    return {
      name: '',
      expected_start: '08:30',
      expected_end: '17:30',
      overtime_threshold_minutes: 15,
      is_active: true,
      is_default: false,
    };
  }
  return {
    name: rule.name || '',
    expected_start: rule.expected_start ? fmtTime(rule.expected_start) : '',
    expected_end: rule.expected_end ? fmtTime(rule.expected_end) : '',
    overtime_threshold_minutes: rule.overtime_threshold_minutes ?? 0,
    is_active: rule.is_active === true,
    is_default: rule.is_default === true,
  };
}

function ShiftRuleFormModal({ rule, onClose }: { rule: ShiftRule | null; onClose: () => void }) {
  const form = useForm<ShiftRuleFormValues>({
    initialValues: formValues(rule),
    validate: zod4Resolver(shiftRuleSchema),
  });
  const save = useSaveShiftRule();

  const submit = async (values: ShiftRuleFormValues) => {
    const data: ShiftRuleInput = {
      name: values.name,
      expected_start: values.expected_start,
      expected_end: values.expected_end,
      overtime_threshold_minutes:
        values.overtime_threshold_minutes === '' ? 0 : Number(values.overtime_threshold_minutes),
      is_active: values.is_active,
      is_default: values.is_default,
    };
    try {
      await save.mutateAsync({ id: rule?.id, data });
      notify.success(rule ? 'Kural güncellendi' : 'Kural oluşturuldu');
      onClose();
    } catch (error) {
      notify.error(`Kaydetme başarısız: ${(error as Error)?.message || String(error)}`);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={rule ? 'Vardiya Kuralı Düzenle' : 'Yeni Vardiya Kuralı'}
      subtitle={rule?.name || undefined}
      icon="fas fa-clock"
      submitLabel={rule ? 'Kaydet' : 'Oluştur'}
      submitting={save.isPending}
      onSubmit={form.onSubmit(submit)}
    >
      <ModalSection title="Kural">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <TextInput label="Ad" withAsterisk {...form.getInputProps('name')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              type="time"
              label="Başlangıç"
              withAsterisk
              {...form.getInputProps('expected_start')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              type="time"
              label="Bitiş"
              withAsterisk
              {...form.getInputProps('expected_end')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="Fazla Mesai Eşiği (dk)"
              min={0}
              step={1}
              allowDecimal={false}
              {...form.getInputProps('overtime_threshold_minutes')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Checkbox label="Aktif" {...form.getInputProps('is_active', { type: 'checkbox' })} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Checkbox
              label="Varsayılan"
              {...form.getInputProps('is_default', { type: 'checkbox' })}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

/** Port of human_resources/attendance/shift-rules (shift-rules.js). */
export function ShiftRulesPage() {
  const list = useShiftRules();
  const rows = list.data ?? EMPTY_ROWS;
  const save = useSaveShiftRule();
  const remove = useDeleteShiftRule();

  useEffect(() => {
    if (list.isError) {
      notify.error(`Vardiya kuralları yüklenemedi: ${list.error?.message || list.error}`);
    }
  }, [list.isError, list.error, list.errorUpdatedAt]);

  // undefined = closed, null = create.
  const [editing, setEditing] = useState<ShiftRule | null | undefined>(undefined);

  const setDefault = async (row: ShiftRule) => {
    try {
      await save.mutateAsync({ id: row.id, data: { is_default: true } });
      notify.success('Varsayılan kural güncellendi');
    } catch (error) {
      notify.error(`İşlem başarısız: ${(error as Error)?.message || String(error)}`);
    }
  };

  const confirmDelete = async (row: ShiftRule) => {
    const n = row.assigned_user_count ?? 0;
    const ok = await confirm({
      title: 'Sil',
      message: `"${row.name}" kuralını silmek istiyor musunuz?`,
      description:
        n > 0
          ? `${n} kullanıcı bu kurala atanmış. Silerseniz varsayılan kurala geçerler.`
          : undefined,
      icon: 'fas fa-trash',
      confirmLabel: 'Sil',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Kural silindi');
    } catch (error) {
      notify.error(`Silme başarısız: ${(error as Error)?.message || String(error)}`);
    }
  };

  const rowActions = (row: ShiftRule): RowAction<ShiftRule>[] => [
    {
      key: 'set_default',
      label: 'Varsayılan Yap',
      icon: 'fas fa-star',
      hidden: row.is_default === true,
      onClick: (r) => void setDefault(r),
    },
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: (r) => setEditing(r),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void confirmDelete(r),
    },
  ];

  return (
    <>
      <PageHeader
        title="Vardiya Kuralları"
        subtitle="Mesai başlangıç/bitiş saatlerini ve eşiklerini yönetin"
        backTo="/human_resources/attendance"
        stats={[
          { id: 'shift-rules-count', label: 'Kural', value: list.isPending ? '–' : rows.length },
          {
            id: 'shift-rules-active',
            label: 'Aktif',
            value: list.isPending ? '–' : rows.filter((r) => r.is_active === true).length,
          },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setEditing(null)}>
            Yeni Kural
          </Button>
        }
      />

      <DataTable
        title="Vardiya Kuralları"
        icon="fas fa-clock"
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        rowActions={rowActions}
        emptyMessage="Vardiya kuralı bulunamadı"
        onRefresh={() => void list.refetch()}
      />

      {editing !== undefined ? (
        <ShiftRuleFormModal
          key={editing?.id ?? 'new'}
          rule={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </>
  );
}

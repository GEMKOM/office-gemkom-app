import { Grid, Select, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo } from 'react';
import { z } from 'zod';
import type { JobOrderOption } from '@/api/reference/jobOrders';
import { userLabel, type UserOption } from '@/api/reference/users';
import {
  usePatchWeldingTimeEntry,
  weldingTimeEntryErrorMessage,
  type WeldingTimeEntry,
} from '@/api/welding/timeEntries';
import { FormModal, ModalSection, notify } from '@/ui';
import { OVERTIME_OPTIONS } from './bulkPaste';
import { employeeIdOf, employeeNames } from './columns';

const REQUIRED = 'Bu alan gereklidir';

export const timeEntrySchema = z.object({
  employee: z.string().min(1, REQUIRED),
  job_no: z.string().min(1, REQUIRED),
  date: z.string().min(1, REQUIRED),
  hours: z
    .string()
    .min(1, REQUIRED)
    .refine((v) => Number.parseFloat(v.replace(',', '.')) >= 0.01, 'Değer en az 0,01 olmalıdır'),
  overtime_type: z.string().min(1, REQUIRED),
  description: z.string(),
});

export type TimeEntryFormValues = z.infer<typeof timeEntrySchema>;

function formValues(row: WeldingTimeEntry): TimeEntryFormValues {
  return {
    employee: employeeIdOf(row),
    job_no: row.job_no || '',
    date: row.date ? String(row.date).slice(0, 10) : '',
    hours: row.hours === null || row.hours === undefined ? '' : String(row.hours),
    overtime_type: row.overtime_type || 'regular',
    description: row.description || '',
  };
}

export interface TimeEntryFormModalProps {
  entry: WeldingTimeEntry;
  users: readonly UserOption[];
  jobOrders: readonly JobOrderOption[];
  onClose: () => void;
}

/** Port of the "Zaman Kaydı Düzenle" EditModal. Mount it to open it. */
export function TimeEntryFormModal({ entry, users, jobOrders, onClose }: TimeEntryFormModalProps) {
  const form = useForm<TimeEntryFormValues>({
    initialValues: formValues(entry),
    validate: zod4Resolver(timeEntrySchema),
  });
  const patch = usePatchWeldingTimeEntry();

  const userData = useMemo(() => {
    const options = users.map((u) => ({ value: String(u.id), label: userLabel(u) }));
    // An entry of someone who has since left keeps its employee selectable.
    const current = employeeIdOf(entry);
    if (current && !options.some((o) => o.value === current)) {
      const { name, username } = employeeNames(entry);
      options.push({ value: current, label: name ? `${name} (${username})` : username });
    }
    return options;
  }, [users, entry]);

  const jobData = useMemo(
    () => jobOrders.map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` })),
    [jobOrders],
  );

  const save = async (values: TimeEntryFormValues) => {
    try {
      await patch.mutateAsync({
        id: entry.id,
        data: {
          employee: Number.parseInt(values.employee, 10),
          job_no: values.job_no,
          date: values.date,
          hours: Number.parseFloat(values.hours.replace(',', '.')),
          overtime_type: values.overtime_type || 'regular',
          description: values.description || '',
        },
      });
      notify.success('Zaman kaydı başarıyla güncellendi');
      onClose();
    } catch (error) {
      console.error('Error updating time entry:', error);
      notify.error(weldingTimeEntryErrorMessage(error, 'Zaman kaydı güncellenirken hata oluştu'));
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Zaman Kaydı Düzenle"
      icon="fas fa-edit"
      size="lg"
      submitting={patch.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Zaman Kaydı Bilgileri">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Çalışan"
              description="Çalışan seçin"
              placeholder="Çalışan seçin..."
              withAsterisk
              searchable
              data={userData}
              {...form.getInputProps('employee')}
              onChange={(value) => form.setFieldValue('employee', value ?? '')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="İş No"
              description="İş emri seçin"
              placeholder="İş emri seçin"
              withAsterisk
              searchable
              data={jobData}
              {...form.getInputProps('job_no')}
              onChange={(value) => form.setFieldValue('job_no', value ?? '')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              type="date"
              label="Tarih"
              description="Tarih seçin"
              withAsterisk
              {...form.getInputProps('date')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              type="number"
              label="Saat"
              description="Çalışılan saat"
              withAsterisk
              step="0.01"
              min="0.01"
              {...form.getInputProps('hours')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Mesai Tipi"
              description="Mesai tipi seçin"
              withAsterisk
              allowDeselect={false}
              data={OVERTIME_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              {...form.getInputProps('overtime_type')}
              onChange={(value) => form.setFieldValue('overtime_type', value ?? '')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Açıklama"
              description="İş açıklaması (opsiyonel)"
              rows={4}
              {...form.getInputProps('description')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

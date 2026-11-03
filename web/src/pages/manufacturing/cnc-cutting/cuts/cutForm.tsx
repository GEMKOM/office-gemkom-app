import { Grid, NumberInput, Select, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { useMemo } from 'react';
import { z } from 'zod';
import type { CncTask, CncTaskFile, CncTaskInput } from '@/api/manufacturing/cncTasks';
import { useJobOrderOptions } from '@/api/reference/jobOrders';
import { useMachines } from '@/api/reference/machines';
import type { AttachmentFile } from '@/ui';
import { plateSourceInput, type PlateSourceValue } from './PlateSource';

// The "Temel Bilgiler" fields the create and edit modals share.

export const cutSchema = z.object({
  name: z.string().refine((v) => v.trim() !== '', 'Kesim adı gerekli'),
  nesting_id: z.string().refine((v) => v.trim() !== '', 'Nesting ID gerekli'),
  dimensions: z.string(),
  machine_fk: z.string(),
  estimated_hours: z.union([z.number(), z.string()]),
  quantity: z.union([z.number(), z.string()]),
});

export type CutFormValues = z.infer<typeof cutSchema>;

export const EMPTY_CUT_FORM: CutFormValues = {
  name: '',
  nesting_id: '',
  dimensions: '',
  machine_fk: '',
  estimated_hours: '',
  quantity: '',
};

const numberOrBlank = (value: unknown): number | string => {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
};

export function cutFormValues(task: CncTask): CutFormValues {
  return {
    name: task.name || '',
    nesting_id: task.nesting_id || '',
    dimensions: task.dimensions || '',
    machine_fk:
      task.machine_fk !== null && task.machine_fk !== undefined ? String(task.machine_fk) : '',
    // Legacy showed '' for 0 / null.
    estimated_hours: task.estimated_hours ? numberOrBlank(task.estimated_hours) : '',
    quantity: task.quantity ? numberOrBlank(task.quantity) : '',
  };
}

const toNumber = (value: number | string, parse: (s: string) => number): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parse(String(value));
  return Number.isFinite(n) ? n : null;
};

export function cutInput(values: CutFormValues, plate: PlateSourceValue): CncTaskInput {
  return {
    name: values.name,
    nesting_id: values.nesting_id,
    dimensions: values.dimensions,
    machine_fk: values.machine_fk ? parseInt(values.machine_fk, 10) : null,
    estimated_hours: toNumber(values.estimated_hours, parseFloat),
    quantity: toNumber(values.quantity, (s) => parseInt(s, 10)),
    ...plateSourceInput(plate),
  };
}

export function useCuttingMachineOptions() {
  const machines = useMachines({ used_in: 'cutting' });
  return useMemo(
    () => (machines.data?.results ?? []).map((m) => ({ value: String(m.id), label: m.name })),
    [machines.data],
  );
}

/** `${job_no} - ${title}` choices; a value that is not in the list (pasted) stays selectable. */
export function useJobOrderChoices(extra: readonly string[] = []) {
  const jobOrders = useJobOrderOptions();
  const base = useMemo(
    () =>
      (jobOrders.data ?? []).map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` })),
    [jobOrders.data],
  );
  const extraKey = extra.join('\u0000');
  return useMemo(() => {
    const known = new Set(base.map((o) => o.value));
    const missing = [...new Set(extra)].filter((v) => v && !known.has(v));
    return missing.length ? [...base, ...missing.map((v) => ({ value: v, label: v }))] : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, extraKey]);
}

export function CutBasicFields({
  form,
  dimensionsHelp,
}: {
  form: UseFormReturnType<CutFormValues>;
  dimensionsHelp: string;
}) {
  const machineOptions = useCuttingMachineOptions();
  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <TextInput
          label="Kesim Adı"
          withAsterisk
          placeholder="Kesim adını girin"
          description="Kesimi tanımlayan açıklayıcı isim"
          data-autofocus
          {...form.getInputProps('name')}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <TextInput
          label="Nesting ID"
          withAsterisk
          placeholder="Nesting ID girin"
          description="Nesting dosyası ID'si"
          {...form.getInputProps('nesting_id')}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <TextInput
          label="Boyutlar"
          placeholder="1500x3000"
          description={dimensionsHelp}
          {...form.getInputProps('dimensions')}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <Select
          label="Makine"
          placeholder="Makine seçin..."
          description="Kesim makinesi seçin"
          data={machineOptions}
          searchable
          clearable
          {...form.getInputProps('machine_fk')}
          onChange={(value) => form.setFieldValue('machine_fk', value ?? '')}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <NumberInput
          label="Tahmini Süre (Saat)"
          placeholder="0.0"
          description="Kesim işleminin tahmini süresi saat cinsinden"
          step={0.1}
          min={0}
          {...form.getInputProps('estimated_hours')}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <NumberInput
          label="Adet"
          placeholder="1"
          description="Aynı kesim kaç kez yapılacak (varsayılan: 1)"
          step={1}
          min={1}
          allowDecimal={false}
          {...form.getInputProps('quantity')}
        />
      </Grid.Col>
    </Grid>
  );
}

const baseName = (file: Pick<CncTaskFile, 'file_name' | 'file_url'>) =>
  (file.file_name || file.file_url || 'Dosya').split('/').pop() || 'Dosya';

export function toAttachment(file: CncTaskFile): AttachmentFile {
  return {
    id: file.id,
    url: file.file_url,
    name: baseName(file),
    uploadedBy: file.uploaded_by_username ?? null,
    uploadedAt: file.uploaded_at ?? null,
  };
}

import { Grid, Select, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { useJobOrderOptions } from '@/api/reference/jobOrders';
import {
  createPaintInput,
  createStatementAdjustment,
  decideStatement,
  generateBulkStatements,
  paintInputQueryOptions,
  patchPaintInput,
  type PaintInput,
} from '@/api/subcontracting/statements';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { periodText, statementErrorMessage } from './statementShared';

const REQUIRED = 'Bu alan gereklidir';

const requiredNumber = (extra?: (n: number) => string | null) =>
  z.string().superRefine((value, ctx) => {
    if (value.trim() === '') {
      ctx.addIssue({ code: 'custom', message: REQUIRED });
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: 'custom', message: 'Geçerli bir sayı girin' });
      return;
    }
    const problem = extra?.(n);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

const range = (min: number, max?: number) => (n: number) => {
  if (n < min) return `En az ${min} olmalıdır`;
  if (max !== undefined && n > max) return `En fazla ${max} olmalıdır`;
  return null;
};

// ---- Yeni Hakediş Oluştur -----------------------------------------------------

const generateSchema = z.object({
  year: requiredNumber(range(2020, 2100)),
  month: requiredNumber(range(1, 12)),
});

/** Legacy showGenerateStatementModal: every subcontractor's statement for a period. */
export function GenerateStatementsModal({
  onClose,
  onGenerated,
}: {
  onClose: () => void;
  onGenerated: () => void;
}) {
  const now = new Date();
  const form = useForm({
    initialValues: { year: String(now.getFullYear()), month: String(now.getMonth() + 1) },
    validate: zod4Resolver(generateSchema),
  });
  const [submitting, setSubmitting] = useState(false);
  const save = async (values: { year: string; month: string }) => {
    setSubmitting(true);
    try {
      await generateBulkStatements({
        year: Number.parseInt(values.year, 10),
        month: Number.parseInt(values.month, 10),
      });
      notify.success('Hakedişler oluşturuldu');
      onGenerated();
      onClose();
    } catch (error) {
      notify.error(statementErrorMessage(error, 'Hakedişler oluşturulurken hata oluştu'));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Hakediş Oluştur"
      icon="fas fa-plus-circle"
      size="md"
      submitLabel="Hakediş Oluştur"
      onSubmit={form.onSubmit((values) => void save(values))}
      submitting={submitting}
    >
      <ModalSection title="Hakediş Bilgileri" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={6}>
            <TextInput
              label="Yıl"
              type="number"
              min={2020}
              max={2100}
              required
              leftSection={<FaIcon icon="fas fa-calendar" />}
              {...form.getInputProps('year')}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <TextInput
              label="Ay"
              type="number"
              min={1}
              max={12}
              required
              leftSection={<FaIcon icon="fas fa-calendar-alt" />}
              {...form.getInputProps('month')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

// ---- Aylık Boya Girişi ----------------------------------------------------------

const paintSchema = z.object({
  total_kg: requiredNumber(range(0)),
  total_cost: requiredNumber(range(0)),
});

/** Legacy showPaintInputModal: the period's paint kg and cost (one entry per month). */
export function PaintInputModal({
  year,
  month,
  onClose,
  onSaved,
}: {
  year: number;
  month: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  // A failed GET (404 for an empty month) leaves the form empty and usable.
  const query = useQuery({ ...paintInputQueryOptions(year, month), staleTime: 0 });
  const loading = query.isPending;
  const existing: PaintInput | null = query.data ?? null;
  const form = useForm({
    initialValues: { total_kg: '', total_cost: '' },
    validate: zod4Resolver(paintSchema),
  });
  // Fill the fields once the period's entry is in (legacy setFieldValue after the GET).
  const { initialize } = form;
  useEffect(() => {
    if (!existing) return;
    const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
    initialize({ total_kg: text(existing.total_kg), total_cost: text(existing.total_cost) });
  }, [existing, initialize]);
  const [submitting, setSubmitting] = useState(false);
  const save = async (values: { total_kg: string; total_cost: string }) => {
    const payload = {
      year,
      month,
      total_kg: Number.parseFloat(values.total_kg),
      total_cost: Number.parseFloat(values.total_cost),
    };
    setSubmitting(true);
    try {
      if (existing?.id) {
        await patchPaintInput(existing.id, payload);
        notify.success('Boya girişi güncellendi');
      } else {
        await createPaintInput(payload);
        notify.success('Boya girişi kaydedildi');
      }
      onSaved();
      onClose();
    } catch (error) {
      notify.error(statementErrorMessage(error, 'Boya girişi kaydedilirken hata oluştu'));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <FormModal
      opened
      onClose={onClose}
      title={`Aylık Boya Girişi - ${periodText(year, month)}`}
      icon="fas fa-fill-drip"
      size="md"
      onSubmit={form.onSubmit((values) => void save(values))}
      submitting={submitting}
      submitDisabled={loading}
    >
      <ModalSection title="Dönem" icon="fas fa-calendar">
        <Grid gap="sm">
          <Grid.Col span={6}>
            <TextInput
              label="Yıl"
              value={String(year)}
              readOnly
              required
              leftSection={<FaIcon icon="fas fa-calendar" />}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <TextInput
              label="Ay"
              value={String(month)}
              readOnly
              required
              leftSection={<FaIcon icon="fas fa-calendar-alt" />}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
      <ModalSection title="Boya Bilgileri" icon="fas fa-fill-drip">
        <Grid gap="sm">
          <Grid.Col span={6}>
            <TextInput
              label="Toplam (kg)"
              type="number"
              step={0.001}
              min={0}
              required
              disabled={loading}
              leftSection={<FaIcon icon="fas fa-weight-hanging" />}
              {...form.getInputProps('total_kg')}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <TextInput
              label="Toplam Maliyet"
              type="number"
              step={0.01}
              min={0}
              required
              disabled={loading}
              leftSection={<FaIcon icon="fas fa-money-bill-wave" />}
              {...form.getInputProps('total_cost')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

// ---- Düzeltme Ekle ------------------------------------------------------------

const adjustmentSchema = z.object({
  adjustment_type: z.string().min(1, REQUIRED),
  amount: requiredNumber(range(0)),
  reason: z.string().trim().min(1, REQUIRED),
  job_order: z.string().min(1, REQUIRED),
  weight_kg: z.string().refine((v) => {
    if (v.trim() === '') return true;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0;
  }, 'En az 0 olmalıdır'),
});
type AdjustmentValues = z.infer<typeof adjustmentSchema>;

/** Legacy showAddAdjustmentModal. */
export function AdjustmentFormModal({
  statementId,
  onClose,
  onSaved,
}: {
  statementId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<AdjustmentValues>({
    initialValues: { adjustment_type: '', amount: '', reason: '', job_order: '', weight_kg: '' },
    validate: zod4Resolver(adjustmentSchema),
  });
  // Every job order, completed ones too (legacy getJobOrderDropdown(true)).
  const jobs = useJobOrderOptions({ includeAll: true });
  const jobOptions = useMemo(
    () =>
      (jobs.data ?? [])
        .filter((job) => job.job_no)
        .map((job) => ({
          value: job.job_no,
          label: job.title ? `${job.job_no} - ${job.title}` : job.job_no,
        })),
    [jobs.data],
  );
  const [submitting, setSubmitting] = useState(false);

  const save = async (values: AdjustmentValues) => {
    const weight = values.weight_kg.trim() === '' ? 0 : Number.parseFloat(values.weight_kg);
    setSubmitting(true);
    try {
      await createStatementAdjustment(statementId, {
        adjustment_type: values.adjustment_type as 'addition' | 'deduction',
        amount: Number.parseFloat(values.amount),
        reason: values.reason,
        job_order: values.job_order,
        weight_kg: Number.isFinite(weight) ? weight : 0,
      });
      notify.success('Düzeltme eklendi');
      onSaved();
      onClose();
    } catch (error) {
      notify.error(statementErrorMessage(error, 'Düzeltme eklenirken hata oluştu'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Düzeltme Ekle"
      icon="fas fa-edit"
      size="md"
      submitLabel="Düzeltme Ekle"
      onSubmit={form.onSubmit((values) => void save(values))}
      submitting={submitting}
    >
      <ModalSection title="Düzeltme Bilgileri" icon="fas fa-edit">
        <Grid gap="sm">
          <Grid.Col span={6}>
            <Select
              label="Tür"
              placeholder="Tür seçin..."
              required
              data={[
                { value: 'addition', label: 'Ek Ödeme' },
                { value: 'deduction', label: 'Kesinti' },
              ]}
              leftSection={<FaIcon icon="fas fa-tag" />}
              {...form.getInputProps('adjustment_type')}
              onChange={(value) => form.setFieldValue('adjustment_type', value ?? '')}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <TextInput
              label="Tutar"
              type="number"
              step={0.01}
              min={0}
              required
              leftSection={<FaIcon icon="fas fa-money-bill-wave" />}
              {...form.getInputProps('amount')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea label="Neden" required rows={3} {...form.getInputProps('reason')} />
          </Grid.Col>
          <Grid.Col span={12}>
            <Select
              label="İş Emri"
              placeholder="İş emri seçin..."
              required
              searchable
              data={jobOptions}
              nothingFoundMessage="Sonuç bulunamadı"
              leftSection={<FaIcon icon="fas fa-file-invoice" />}
              {...form.getInputProps('job_order')}
              onChange={(value) => form.setFieldValue('job_order', value ?? '')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              label="Ağırlık (kg) (Opsiyonel)"
              type="number"
              step={0.01}
              min={0}
              leftSection={<FaIcon icon="fas fa-weight-hanging" />}
              description={
                <Text span size="xs" c="red.8">
                  <FaIcon icon="fas fa-exclamation-triangle" /> Uyarı: Bu değer toplam imalat
                  tonajına dahil edilir.
                </Text>
              }
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              {...form.getInputProps('weight_kg')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

// ---- Hakediş Kararı -----------------------------------------------------------

/** Legacy showDecideModal: the comment is required to reject. */
export function DecideStatementModal({
  statementId,
  approve,
  onClose,
  onDecided,
}: {
  statementId: number;
  approve: boolean;
  onClose: () => void;
  onDecided: () => void;
}) {
  const form = useForm({
    initialValues: { comment: '' },
    validate: { comment: (v) => (!approve && v.trim() === '' ? REQUIRED : null) },
  });
  const [submitting, setSubmitting] = useState(false);
  const save = async ({ comment }: { comment: string }) => {
    setSubmitting(true);
    try {
      await decideStatement(statementId, { approve, comment: comment || '' });
      notify.success(approve ? 'Hakediş onaylandı' : 'Hakediş reddedildi');
      onDecided();
    } catch (error) {
      notify.error(statementErrorMessage(error, 'Karar verilirken hata oluştu'));
      setSubmitting(false);
    }
  };
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Hakediş Kararı"
      icon="fas fa-gavel"
      size="md"
      submitLabel="Karar Ver"
      onSubmit={form.onSubmit((values) => void save(values))}
      submitting={submitting}
    >
      <ModalSection
        title={approve ? 'Onay' : 'Red'}
        icon={approve ? 'fas fa-check-circle' : 'fas fa-times-circle'}
      >
        <Textarea
          label="Yorum"
          required={!approve}
          rows={3}
          description={approve ? 'Onay yorumu (opsiyonel)' : 'Red nedeni (zorunlu)'}
          inputWrapperOrder={['label', 'input', 'description', 'error']}
          {...form.getInputProps('comment')}
        />
      </ModalSection>
    </FormModal>
  );
}

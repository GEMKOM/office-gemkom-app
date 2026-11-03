import { ActionIcon, Button, Grid, Select, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createExpectedReceipt,
  createReceiptInstallment,
  expectedReceiptQueryOptions,
  financeErrorMessage,
  financeKeys,
  markOfferInstallmentReceived,
  updateExpectedReceipt,
  updateReceiptInstallment,
  type InflowRow,
} from '@/api/finance/operations';
import { FaIcon, FormModal, ModalSection, notify, SelectRemote } from '@/ui';
import classes from '../FinanceOperations.module.css';
import { jobOrderSeed, searchJobOrders } from '../jobOrderSearch';
import {
  AmountInput,
  CURRENCY_OPTIONS,
  money,
  parseMoney,
  positiveAmount,
  todayIso,
} from '../shared';
import { validateDrafts, type DraftInstallment } from './inflow';

const emptyDraft = (sequence: number): DraftInstallment => ({
  sequence,
  label: '',
  amount: '',
  due_date: todayIso(),
  notes: '',
});

interface ReceiptForm {
  title: string;
  customer_name: string;
  reference_no: string;
  total_amount: string | number;
  currency: string;
  job_order: string;
  description: string;
  notes: string;
}

/**
 * New expected receipt with its instalments (create), or the receipt's own
 * fields (edit). Legacy expectedReceiptFormModal.
 */
export function ReceiptFormModal({ row, onClose }: { row: InflowRow | null; onClose: () => void }) {
  const receiptId = row?.receipt_id ?? null;
  // Edit fills from the receipt itself; the tracker row only carries the instalment's notes.
  const receipt = useQuery({
    ...expectedReceiptQueryOptions(receiptId ?? 0),
    enabled: receiptId !== null,
  });
  if (receiptId !== null && receipt.isPending) return null;
  const source = receipt.data;
  return (
    <ReceiptForm
      row={row}
      initial={
        row
          ? {
              title: source?.title ?? row.title ?? '',
              customer_name: source?.customer_name ?? row.customer_name ?? '',
              reference_no: source?.reference_no ?? row.reference_no ?? '',
              total_amount: '',
              currency: row.currency || 'EUR',
              job_order: source?.job_no ?? row.job_no ?? '',
              description: '',
              notes: source ? (source.notes ?? '') : (row.notes ?? ''),
            }
          : {
              title: '',
              customer_name: '',
              reference_no: '',
              total_amount: '',
              currency: 'EUR',
              job_order: '',
              description: '',
              notes: '',
            }
      }
      onClose={onClose}
    />
  );
}

function ReceiptForm({
  row,
  initial,
  onClose,
}: {
  row: InflowRow | null;
  initial: ReceiptForm;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(row);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<DraftInstallment[]>(() => [emptyDraft(1)]);
  const form = useForm<ReceiptForm>({
    initialValues: initial,
    validate: {
      title: (v) => (v.trim() ? null : 'Başlık zorunludur.'),
      customer_name: (v) => (v.trim() ? null : 'Müşteri adı zorunludur.'),
      total_amount: (v) =>
        !isEdit && positiveAmount(v) === null ? 'Geçerli pozitif bir tutar girin.' : null,
    },
  });

  const setDraft = (index: number, patch: Partial<DraftInstallment>) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  const addDraft = () =>
    setDrafts((prev) => [
      ...prev,
      emptyDraft(prev.reduce((max, r) => Math.max(max, Number(r.sequence) || 0), 0) + 1),
    ]);
  const removeDraft = (index: number) => {
    if (drafts.length <= 1) {
      notify.error('En az bir taksit satırı olmalıdır.');
      return;
    }
    setDrafts((prev) =>
      prev.filter((_, i) => i !== index).map((d, i) => ({ ...d, sequence: i + 1 })),
    );
  };

  const currency = form.values.currency || 'TRY';
  const draftSum = drafts.reduce((sum, d) => sum + (parseMoney(d.amount) || 0), 0);
  const total = parseMoney(form.values.total_amount);

  const save = async (values: ReceiptForm) => {
    const jobOrder = values.job_order.trim() || null;
    setSaving(true);
    try {
      if (row?.receipt_id) {
        await updateExpectedReceipt(row.receipt_id, {
          title: values.title.trim(),
          customer_name: values.customer_name.trim(),
          reference_no: values.reference_no.trim(),
          job_order: jobOrder,
          notes: values.notes.trim(),
        });
        notify.success('Tahsilat kaydı güncellendi.');
      } else {
        const check = validateDrafts(drafts);
        if (!check.ok) {
          notify.error(check.message);
          return;
        }
        const created = await createExpectedReceipt({
          title: values.title.trim(),
          description: values.description.trim(),
          reference_no: values.reference_no.trim(),
          customer_name: values.customer_name.trim(),
          job_order: jobOrder,
          total_amount: (positiveAmount(values.total_amount) ?? 0).toFixed(2),
          currency: values.currency.trim() || 'EUR',
          status: 'expected',
          notes: values.notes.trim(),
        });
        if (!created?.id) throw new Error('Tahsilat oluşturuldu ancak kayıt kimliği alınamadı.');
        for (const payload of check.payloads) {
          await createReceiptInstallment(created.id, payload);
        }
        notify.success(`Tahsilat ve ${check.payloads.length} taksit kaydedildi.`);
      }
      void queryClient.invalidateQueries({ queryKey: financeKeys.inflow });
      onClose();
    } catch (error) {
      notify.error(
        financeErrorMessage(
          error,
          isEdit
            ? 'Tahsilat kaydı güncellenirken hata oluştu.'
            : 'Tahsilat kaydı oluşturulurken hata oluştu.',
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
      title={isEdit ? 'Tahsilat Kaydını Düzenle' : 'Yeni Beklenen Tahsilat'}
      icon={isEdit ? 'fas fa-edit' : 'fas fa-plus'}
      size={isEdit ? 'lg' : 'xl'}
      submitLabel={isEdit ? 'Güncelle' : 'Kaydet'}
      submitting={saving}
      onSubmit={form.onSubmit(save)}
    >
      <Grid gap="sm">
        <Grid.Col span={12}>
          <TextInput
            label="Başlık"
            withAsterisk
            placeholder="Örn. Petkim Retention Release"
            {...form.getInputProps('title')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput label="Müşteri" withAsterisk {...form.getInputProps('customer_name')} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput label="Referans no" {...form.getInputProps('reference_no')} />
        </Grid.Col>
        {!isEdit ? (
          <>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <AmountInput
                label="Toplam tutar"
                placeholder=""
                {...form.getInputProps('total_amount')}
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
          </>
        ) : null}
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <SelectRemote
            label="İş emri"
            placeholder="İş emri seçin (opsiyonel)"
            description="Boş bırakılabilir. En az 2 karakter ile arayın."
            minSearchLength={2}
            queryKey={['finance-job-order-search']}
            search={searchJobOrders}
            initialOptions={jobOrderSeed(initial.job_order, row?.job_title)}
            value={form.values.job_order || null}
            onChange={(value) => form.setFieldValue('job_order', value ?? '')}
          />
        </Grid.Col>
        {!isEdit ? (
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Açıklama" {...form.getInputProps('description')} />
          </Grid.Col>
        ) : null}
        <Grid.Col span={12}>
          <Textarea label="Notlar" rows={2} {...form.getInputProps('notes')} />
        </Grid.Col>
      </Grid>

      {!isEdit ? (
        <ModalSection title="Taksitler" icon="fas fa-list-ol">
          <Text size="xs" c="dimmed" mb="xs">
            Para birimi üst kayıttan alınır. Toplam tutar bilgilendirme amaçlıdır; taksit toplamı
            ile eşleşmek zorunda değildir.
          </Text>
          <Text size="sm" mb="xs">
            Taksit toplamı: <strong>{money(draftSum, currency)}</strong>
            {Number.isFinite(total) && total > 0 && Math.abs(draftSum - total) > 0.009 ? (
              <Text span c="yellow.8" ml={4}>
                (Üst kayıt toplamı: {money(total, currency)})
              </Text>
            ) : null}
          </Text>
          {drafts.map((draft, index) => (
            <div key={index} className={classes.instRow} data-testid="draft-installment">
              <AmountInput
                label="#"
                required={false}
                min={1}
                step={1}
                decimals={0}
                placeholder=""
                value={draft.sequence}
                onChange={(value) => setDraft(index, { sequence: value })}
              />
              <TextInput
                label="Etiket"
                placeholder="Örn. Avans"
                value={draft.label}
                onChange={(event) => setDraft(index, { label: event.currentTarget.value })}
              />
              <AmountInput
                label="Tutar"
                required={false}
                placeholder=""
                value={draft.amount}
                onChange={(value) => setDraft(index, { amount: value })}
              />
              <TextInput
                type="date"
                label="Vade"
                value={draft.due_date}
                onChange={(event) => setDraft(index, { due_date: event.currentTarget.value })}
              />
              <TextInput
                label="Not"
                value={draft.notes}
                onChange={(event) => setDraft(index, { notes: event.currentTarget.value })}
              />
              <ActionIcon
                variant="outline"
                color="red"
                size="lg"
                aria-label="Satırı kaldır"
                disabled={drafts.length <= 1}
                onClick={() => removeDraft(index)}
              >
                <FaIcon icon="fas fa-trash" />
              </ActionIcon>
            </div>
          ))}
          <Button
            size="xs"
            variant="outline"
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={addDraft}
          >
            Taksit satırı ekle
          </Button>
        </ModalSection>
      ) : null}
    </FormModal>
  );
}

interface InstallmentForm {
  sequence: string | number;
  label: string;
  amount: string | number;
  due_date: string;
  notes: string;
}

/**
 * Taksit Ekle / Taksiti Düzenle on an expected receipt. `siblings` are the
 * receipt's other rows, for the next sequence number.
 */
export function InstallmentFormModal({
  row,
  mode,
  siblings,
  onClose,
}: {
  row: InflowRow;
  mode: 'add' | 'edit';
  siblings: readonly InflowRow[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const nextSequence = siblings.reduce((max, r) => Math.max(max, Number(r.sequence) || 0), 0) + 1;
  const form = useForm<InstallmentForm>({
    initialValues:
      mode === 'edit'
        ? {
            sequence: row.sequence ?? '',
            label: row.label || '',
            amount: row.amount ?? '',
            due_date: row.due_date || '',
            notes: row.notes || '',
          }
        : { sequence: nextSequence, label: '', amount: '', due_date: todayIso(), notes: '' },
    validate: {
      sequence: (v) => {
        const n = Number.parseInt(String(v), 10);
        return Number.isFinite(n) && n >= 1 ? null : 'Geçerli bir sıra numarası girin.';
      },
      amount: (v) => (positiveAmount(v) === null ? 'Geçerli pozitif bir tutar girin.' : null),
      label: (v) => (v.trim() ? null : 'Etiket zorunludur.'),
      due_date: (v) => (mode === 'add' && !v ? 'Yeni taksit için vade tarihi zorunludur.' : null),
    },
  });

  const save = async (values: InstallmentForm) => {
    if (!row.receipt_id) return;
    const payload = {
      sequence: Number.parseInt(String(values.sequence), 10),
      label: values.label.trim(),
      amount: (positiveAmount(values.amount) ?? 0).toFixed(2),
      due_date: values.due_date || null,
      notes: values.notes.trim(),
    };
    setSaving(true);
    try {
      if (mode === 'edit' && row.installment_id) {
        await updateReceiptInstallment(row.receipt_id, row.installment_id, payload);
        notify.success('Taksit güncellendi.');
      } else {
        await createReceiptInstallment(row.receipt_id, payload);
        notify.success('Taksit eklendi.');
      }
      void queryClient.invalidateQueries({ queryKey: financeKeys.inflow });
      onClose();
    } catch (error) {
      notify.error(financeErrorMessage(error, 'Taksit kaydedilirken hata oluştu.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={mode === 'edit' ? 'Taksiti Düzenle' : 'Taksit Ekle'}
      subtitle={row.title ?? undefined}
      icon={mode === 'edit' ? 'fas fa-pen' : 'fas fa-plus'}
      size="md"
      submitLabel="Kaydet"
      submitting={saving}
      onSubmit={form.onSubmit(save)}
    >
      <Grid gap="sm">
        <Grid.Col span={4}>
          <AmountInput
            label="Sıra"
            min={1}
            step={1}
            decimals={0}
            placeholder=""
            {...form.getInputProps('sequence')}
          />
        </Grid.Col>
        <Grid.Col span={8}>
          <TextInput
            label="Etiket"
            withAsterisk
            placeholder="Örn. Avans"
            {...form.getInputProps('label')}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <AmountInput label="Tutar" placeholder="" {...form.getInputProps('amount')} />
        </Grid.Col>
        <Grid.Col span={6}>
          <TextInput
            type="date"
            label="Vade tarihi"
            withAsterisk={mode === 'add'}
            {...form.getInputProps('due_date')}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <Textarea label="Notlar" rows={2} {...form.getInputProps('notes')} />
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}

/** Tahsil edildi on a sales-offer instalment, with optional notes (legacy inflowOfferNotesModal). */
export function OfferReceivedModal({ row, onClose }: { row: InflowRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(row.notes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!row.offer_id || row.sequence === null || row.sequence === undefined) return;
    setSaving(true);
    try {
      await markOfferInstallmentReceived(row.offer_id, row.sequence, notes.trim());
      notify.success('Taksit tahsil edildi olarak işaretlendi.');
      void queryClient.invalidateQueries({ queryKey: financeKeys.inflow });
      onClose();
    } catch (error) {
      notify.error(financeErrorMessage(error, 'Taksit işaretlenirken hata oluştu.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Tahsil edildi işaretle"
      subtitle={[row.label, row.title].filter(Boolean).join(' · ') || undefined}
      icon="fas fa-check"
      size="md"
      submitLabel="Tahsil Edildi"
      submitting={saving}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Textarea
        label="Notlar"
        placeholder="Opsiyonel"
        rows={3}
        value={notes}
        onChange={(event) => setNotes(event.currentTarget.value)}
      />
    </FormModal>
  );
}

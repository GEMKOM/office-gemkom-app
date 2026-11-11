import {
  ActionIcon,
  Anchor,
  Checkbox,
  Grid,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, type ReactNode } from 'react';
import {
  addPaymentListItems,
  bulkMarkSchedulesPaid,
  cancelPaymentList,
  createPaymentList,
  deleteAttachment,
  getPaymentLists,
  listPoAttachments,
  markPaymentListItemPaid,
  paymentListKeys,
  splitSchedule,
  updatePaymentList,
  uploadPoAttachment,
  type PaymentList,
  type PaymentListInput,
  type PoolRow,
} from '@/api/procurement/paymentLists';
import { confirm, FaIcon, FileDropInput, FormModal, notify } from '@/ui';
import {
  currencyBreakdown,
  fmtDate,
  fmtEur,
  fmtMoney,
  num,
  sumEur,
  todayIso,
} from './format';
import classes from './PaymentLists.module.css';

// Port of modals.js: one FormModal per legacy EditModal, mounted while open so
// every open starts from fresh values.

const REQUIRED = 'Bu alan gereklidir';

/** Legacy EditModal number check: a filled number field must parse and respect min/max. */
function numberError(value: string, { min, max, required = false }: { min?: number; max?: number; required?: boolean }) {
  if (value.trim() === '') return required ? REQUIRED : null;
  const n = Number.parseFloat(value);
  if (Number.isNaN(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    return 'Geçerli bir değer girin';
  }
  return null;
}

const decimalText = (value: unknown) => (num(value as string) !== null ? String(num(value as string)) : '');

/** Lists, the pool and the picker refetch after any change (legacy reloaded the view). */
export function useInvalidatePayments() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === paymentListKeys.all[0] ||
          (q.queryKey[0] === paymentListKeys.poolAll[0] && q.queryKey[1] === 'list'),
      }),
    [queryClient],
  );
}

// ---- list header (create / edit) ---------------------------------------------------

interface ListFormProps {
  mode: 'create' | 'edit';
  list?: PaymentList | null;
  carryOverFrom?: PaymentList | null;
  onSaved?: (list: PaymentList) => void;
  onClose: () => void;
}

export function ListFormModal({ mode, list, carryOverFrom, onSaved, onClose }: ListFormProps) {
  const isEdit = mode === 'edit';
  const invalidate = useInvalidatePayments();
  const today = todayIso();
  const form = useForm({
    initialValues: {
      title: isEdit ? (list?.title ?? '') : `${fmtDate(today)} Ödeme Listesi`,
      list_date: isEdit ? (list?.list_date ?? '') : today,
      budget_eur: isEdit ? decimalText(list?.budget_eur) : '',
      notes: isEdit ? list?.notes || '' : '',
      carry_over_from: carryOverFrom ? String(carryOverFrom.id) : '',
    },
    validate: {
      title: (v) => (v.trim() ? null : REQUIRED),
      list_date: (v) => (v ? null : REQUIRED),
      budget_eur: (v) => numberError(v, { min: 0 }),
    },
  });
  const [submitting, setSubmitting] = useState(false);

  const candidates = useQuery({
    queryKey: ['paymentLists', 'carryCandidates'],
    queryFn: ({ signal }) =>
      getPaymentLists({ status: 'completed,cancelled', page_size: 20, ordering: '-list_date' }, signal),
    enabled: !isEdit,
    retry: false,
  });
  const carryOptions = (candidates.data?.results ?? []).map((l) => ({
    value: String(l.id),
    label: `${l.title} (${l.status_label || l.status}, ${fmtDate(l.list_date)})`,
  }));
  if (carryOverFrom && !carryOptions.some((o) => o.value === String(carryOverFrom.id))) {
    carryOptions.unshift({
      value: String(carryOverFrom.id),
      label: `${carryOverFrom.title} (${carryOverFrom.status_label || carryOverFrom.status}, ${fmtDate(carryOverFrom.list_date)})`,
    });
  }

  const save = async (values: typeof form.values) => {
    const payload: PaymentListInput = {
      title: values.title.trim(),
      list_date: values.list_date,
      budget_eur: values.budget_eur === '' ? null : values.budget_eur,
      notes: values.notes || '',
    };
    setSubmitting(true);
    try {
      let saved: PaymentList;
      if (isEdit && list) {
        saved = await updatePaymentList(list.id, payload);
      } else {
        if (values.carry_over_from) payload.carry_over_from = Number(values.carry_over_from);
        saved = await createPaymentList(payload);
      }
      onClose();
      notify.success(isEdit ? 'Liste güncellendi' : 'Liste oluşturuldu');
      void invalidate();
      onSaved?.(saved);
    } catch (error) {
      notify.error(error, { fallback: 'Liste kaydedilemedi' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={isEdit ? 'Listeyi Düzenle' : 'Yeni Ödeme Listesi'}
      icon="fas fa-list-check"
      size="lg"
      submitLabel={isEdit ? 'Kaydet' : 'Oluştur'}
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <Grid gap="sm">
        <Grid.Col span={{ base: 12, sm: 8 }}>
          <TextInput label="Başlık" withAsterisk {...form.getInputProps('title')} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <TextInput label="Tarih" type="date" withAsterisk {...form.getInputProps('list_date')} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <TextInput
            label="Bütçe (EUR)"
            type="number"
            step="0.01"
            min={0}
            description="Bu hafta ödenebilecek toplam (EUR). Boş bırakılabilir."
            {...form.getInputProps('budget_eur')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 8 }}>
          <Textarea label="Not" rows={2} {...form.getInputProps('notes')} />
        </Grid.Col>
        {!isEdit ? (
          <Grid.Col span={12}>
            <Select
              label="Önceki listenin ödenmemiş kalemlerini aktar"
              placeholder="Aktarma yok"
              data={carryOptions}
              clearable
              rightSection={candidates.isFetching ? <Loader size="xs" /> : undefined}
              description="Seçilen tamamlanmış/iptal listede ödenmeden kalan kalemler yeni listeye kopyalanır."
              value={form.values.carry_over_from || null}
              onChange={(v) => form.setFieldValue('carry_over_from', v ?? '')}
            />
          </Grid.Col>
        ) : null}
      </Grid>
    </FormModal>
  );
}

// ---- budget / manual FX ----------------------------------------------------------------

export function BudgetModal({ list, onClose }: { list: PaymentList; onClose: () => void }) {
  const invalidate = useInvalidatePayments();
  const form = useForm({
    initialValues: { budget_eur: decimalText(list.budget_eur) },
    validate: { budget_eur: (v) => numberError(v, { min: 0 }) },
  });
  const [submitting, setSubmitting] = useState(false);
  const save = async (values: typeof form.values) => {
    setSubmitting(true);
    try {
      await updatePaymentList(list.id, { budget_eur: values.budget_eur === '' ? null : values.budget_eur });
      onClose();
      notify.success('Bütçe güncellendi');
      void invalidate();
    } catch (error) {
      notify.error(error, { fallback: 'Bütçe güncellenemedi' });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Bütçeyi Düzenle"
      icon="fas fa-sack-dollar"
      size="sm"
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <TextInput label="Bütçe (EUR)" type="number" step="0.01" min={0} {...form.getInputProps('budget_eur')} />
    </FormModal>
  );
}

export function ManualFxModal({ list, onClose }: { list: PaymentList; onClose: () => void }) {
  const invalidate = useInvalidatePayments();
  const fx = list.fx ?? {};
  const form = useForm({
    initialValues: { eur_try: decimalText(fx.eur_try), usd_try: decimalText(fx.usd_try) },
    validate: {
      eur_try: (v) => numberError(v, { min: 0.0001, required: true }),
      usd_try: (v) => numberError(v, { min: 0.0001 }),
    },
  });
  const [submitting, setSubmitting] = useState(false);
  const save = async (values: typeof form.values) => {
    setSubmitting(true);
    try {
      await updatePaymentList(list.id, { fx_manual: { eur_try: values.eur_try, usd_try: values.usd_try || null } });
      onClose();
      notify.success('Kur kaydedildi, EUR tutarları yeniden hesaplandı');
      void invalidate();
    } catch (error) {
      notify.error(error, { fallback: 'Kur kaydedilemedi' });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Kur Gir (manuel)"
      icon="fas fa-coins"
      size="sm"
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <Stack gap="sm">
        <TextInput label="1 € = … TL" type="number" step="0.0001" min={0.0001} withAsterisk {...form.getInputProps('eur_try')} />
        <TextInput label="1 $ = … TL" type="number" step="0.0001" min={0.0001} {...form.getInputProps('usd_try')} />
      </Stack>
    </FormModal>
  );
}

// ---- mark paid (single) / bulk ----------------------------------------------------------

function ReadOnly({ label, value }: { label: string; value: ReactNode }) {
  return <TextInput label={label} value={String(value ?? '')} readOnly />;
}

interface MarkPaidProps {
  row: PoolRow;
  mode: 'pool' | 'item';
  listId?: number;
  itemId?: number;
  onClose: () => void;
}

export function MarkPaidModal({ row, mode, listId, itemId, onClose }: MarkPaidProps) {
  const invalidate = useInvalidatePayments();
  const form = useForm({
    initialValues: { paid_at: todayIso(), paid_with_tax: true },
    validate: { paid_at: (v) => (v ? null : REQUIRED) },
  });
  const [submitting, setSubmitting] = useState(false);
  const label = `${row.supplier?.name || ''} · PO-${row.po?.id} · ${row.schedule_sequence ?? row.sequence}/${row.schedule_count} ${row.label || row.basis_label || ''}`.trim();
  const amount = form.values.paid_with_tax
    ? fmtMoney(row.gross_amount, row.currency)
    : fmtMoney(row.net_amount, row.currency);

  const save = async (values: typeof form.values) => {
    const payload = { paid_with_tax: !!values.paid_with_tax, paid_at: values.paid_at || todayIso() };
    setSubmitting(true);
    try {
      if (mode === 'item' && listId !== undefined && itemId !== undefined) {
        await markPaymentListItemPaid(listId, itemId, payload);
      } else {
        const result = await bulkMarkSchedulesPaid({ schedule_ids: [row.schedule_id], ...payload });
        const r = (result.results ?? [])[0];
        if (!r || !r.ok) throw new Error(r?.detail || 'Ödeme işaretlenemedi');
      }
      onClose();
      notify.success('Ödeme işaretlendi');
      void invalidate();
    } catch (error) {
      notify.error(error, { fallback: 'Ödeme işaretlenemedi' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Ödeme İşaretle"
      icon="fas fa-check-circle"
      size="lg"
      submitLabel="Ödeme İşaretle"
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <Grid gap="sm">
        <Grid.Col span={12}>
          <ReadOnly label="Ödeme planı" value={label} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <ReadOnly label="Ödeme tutarı" value={amount} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <ReadOnly label="Vade tarihi" value={fmtDate(row.due_date)} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput label="Ödeme tarihi" type="date" withAsterisk {...form.getInputProps('paid_at')} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }} pt={32}>
          <Checkbox
            label="KDV dahil ödendi"
            description="Son taksit KDV dahil ödenmelidir."
            {...form.getInputProps('paid_with_tax', { type: 'checkbox' })}
          />
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}

export function BulkPaidModal({ rows, onDone, onClose }: { rows: PoolRow[]; onDone?: () => void; onClose: () => void }) {
  const invalidate = useInvalidatePayments();
  const form = useForm({
    initialValues: { paid_at: todayIso(), paid_with_tax: true, dry_run: false },
    validate: { paid_at: (v) => (v ? null : REQUIRED) },
  });
  const [submitting, setSubmitting] = useState(false);

  const save = async (values: typeof form.values) => {
    setSubmitting(true);
    try {
      const result = await bulkMarkSchedulesPaid({
        schedule_ids: rows.map((r) => r.schedule_id),
        paid_at: values.paid_at || todayIso(),
        paid_with_tax: !!values.paid_with_tax,
        dry_run: !!values.dry_run,
      });
      const failures = (result.results ?? []).filter((r) => !r.ok);
      const summary = `${result.dry_run ? '[Deneme] ' : ''}${result.paid} işaretlendi, ${result.skipped} atlandı`;
      if (failures.length) {
        const lines = failures.slice(0, 8).map((f) => `PO-${f.po_id ?? '?'} taksit #${f.schedule_id}: ${f.detail}`);
        notify.warning(
          <>
            {summary}
            {lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            {failures.length > 8 ? <div>…</div> : null}
          </>,
        );
      } else {
        notify.success(summary);
      }
      if (!result.dry_run) {
        onClose();
        void invalidate();
        onDone?.();
      }
    } catch (error) {
      notify.error(error, { fallback: 'Toplu işaretleme başarısız' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Toplu Ödeme İşaretle"
      icon="fas fa-check-double"
      size="lg"
      submitLabel={`${rows.length} taksiti ödendi işaretle`}
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <div className={classes.note} style={{ marginBottom: 12 }}>
        Aynı siparişin taksitleri sıra ile işlenir; kuralı bozan satırlar atlanır ve nedeniyle listelenir.
      </div>
      <Grid gap="sm">
        <Grid.Col span={12}>
          <ReadOnly
            label="Seçim"
            value={`${rows.length} taksit · ${currencyBreakdown(rows)} · ≈ ${fmtEur(sumEur(rows))}`}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <TextInput
            label="Ödeme tarihi"
            type="date"
            withAsterisk
            description="Geçmiş ödemeler için gerçek ödeme tarihini girin."
            {...form.getInputProps('paid_at')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }} pt={32}>
          <Checkbox label="KDV dahil ödendi" {...form.getInputProps('paid_with_tax', { type: 'checkbox' })} />
        </Grid.Col>
        <Grid.Col span={12}>
          <Checkbox
            label="Önce dene (kayıt yapma, sadece sonucu göster)"
            {...form.getInputProps('dry_run', { type: 'checkbox' })}
          />
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}

// ---- split -------------------------------------------------------------------------------

export function SplitModal({ row, onClose }: { row: PoolRow; onClose: () => void }) {
  const invalidate = useInvalidatePayments();
  const total = num(row.net_amount) || 0;
  const form = useForm({
    initialValues: { mode: 'amount', value: '' },
    validate: { value: (v) => numberError(v, { min: 0.01, required: true }) },
  });
  const [submitting, setSubmitting] = useState(false);

  const v = num(form.values.value);
  let preview: ReactNode;
  if (v === null || v <= 0) {
    preview = 'Bu ödeme: — · Kalan: —';
  } else {
    const first = form.values.mode === 'percentage' ? (total * v) / 100 : v;
    preview =
      first >= total ? (
        <span className={classes.danger}>Bölünen tutar taksit tutarından küçük olmalı.</span>
      ) : (
        <>
          Bu ödeme: <strong>{fmtMoney(first, row.currency)}</strong> · Kalan (yeni taksit):{' '}
          <strong>{fmtMoney(total - first, row.currency)}</strong> <span className={classes.sub}>(KDV hariç)</span>
        </>
      );
  }

  const save = async (values: typeof form.values) => {
    const payload: { schedule_id: number; amount?: string; percentage?: string } = { schedule_id: row.schedule_id };
    if (values.mode === 'percentage') payload.percentage = values.value;
    else payload.amount = values.value;
    setSubmitting(true);
    try {
      await splitSchedule(row.po.id, payload);
      onClose();
      notify.success('Taksit bölündü');
      void invalidate();
    } catch (error) {
      notify.error(error, { fallback: 'Taksit bölünemedi' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Taksiti Böl"
      icon="fas fa-scissors"
      size="md"
      submitLabel="Böl"
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <Grid gap="sm">
        <Grid.Col span={12}>
          <ReadOnly
            label="Taksit (KDV hariç)"
            value={`${fmtMoney(row.net_amount, row.currency)} · ${row.label || row.basis_label || ''}`}
          />
        </Grid.Col>
        <Grid.Col span={5}>
          <Select
            label="Bölme şekli"
            allowDeselect={false}
            data={[
              { value: 'amount', label: 'Tutar' },
              { value: 'percentage', label: 'Yüzde (%)' },
            ]}
            {...form.getInputProps('mode')}
          />
        </Grid.Col>
        <Grid.Col span={7}>
          <TextInput
            label="Şimdi ödenecek kısım"
            type="number"
            step="0.01"
            min={0.01}
            withAsterisk
            {...form.getInputProps('value')}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <div className={classes.note} data-testid="split-preview">
            {preview}
          </div>
        </Grid.Col>
      </Grid>
    </FormModal>
  );
}

// ---- exclude / decide / cancel (reason modals) ------------------------------------------------

interface ReasonModalProps {
  title: string;
  icon: string;
  saveText: string;
  label: string;
  required: boolean;
  help: string;
  /** Rejects to keep the modal open. */
  onSave: (reason: string) => Promise<unknown>;
  onClose: () => void;
}

export function ReasonModal({ title, icon, saveText, label, required, help, onSave, onClose }: ReasonModalProps) {
  const form = useForm({
    initialValues: { reason: '' },
    validate: { reason: (v) => (required && !v.trim() ? REQUIRED : null) },
  });
  const [submitting, setSubmitting] = useState(false);
  const save = async (values: typeof form.values) => {
    setSubmitting(true);
    try {
      await onSave(values.reason.trim());
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'İşlem başarısız' });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <FormModal
      opened
      onClose={onClose}
      title={title}
      icon={icon}
      size="md"
      submitLabel={saveText}
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <Textarea label={label} rows={3} withAsterisk={required} description={help} {...form.getInputProps('reason')} />
    </FormModal>
  );
}

export function ExcludeModal({ row, onSave, onClose }: { row: PoolRow; onSave: (reason: string) => Promise<unknown>; onClose: () => void }) {
  return (
    <ReasonModal
      title={`Listeden çıkar: ${row.supplier?.name || ''}`}
      icon="fas fa-ban"
      saveText="Çıkar"
      label="Gerekçe"
      required
      help="Satır listede üstü çizili olarak kalır; gerekçe listeyi hazırlayana görünür."
      onSave={onSave}
      onClose={onClose}
    />
  );
}

export function DecideModal({ approve, onSave, onClose }: { approve: boolean; onSave: (comment: string) => Promise<unknown>; onClose: () => void }) {
  return (
    <ReasonModal
      title={approve ? 'Listeyi Onayla' : 'Listeyi Reddet'}
      icon={approve ? 'fas fa-check-circle' : 'fas fa-times-circle'}
      saveText={approve ? 'Onayla' : 'Reddet'}
      label="Yorum"
      required={!approve}
      help={approve ? 'Onay yorumu (opsiyonel)' : 'Red gerekçesi (zorunlu)'}
      onSave={onSave}
      onClose={onClose}
    />
  );
}

export function CancelListModal({ list, onDone, onClose }: { list: PaymentList; onDone?: () => void; onClose: () => void }) {
  const invalidate = useInvalidatePayments();
  return (
    <ReasonModal
      title={`Listeyi iptal et: ${list.title}`}
      icon="fas fa-ban"
      saveText="İptal Et"
      label="Gerekçe"
      required={false}
      help="Listedeki kalemler havuza geri döner."
      onSave={async (reason) => {
        await cancelPaymentList(list.id, reason);
        notify.success('Liste iptal edildi');
        void invalidate();
        onDone?.();
      }}
      onClose={onClose}
    />
  );
}

// ---- proformas ---------------------------------------------------------------------------------

export function ProformaModal({ row, onClose }: { row: PoolRow; onClose: () => void }) {
  const po = row.po;
  const invalidate = useInvalidatePayments();
  const queryClient = useQueryClient();
  const files = useQuery({
    queryKey: paymentListKeys.attachments(po.id),
    queryFn: ({ signal }) => listPoAttachments(po.id, signal),
    staleTime: 0,
    retry: false,
  });
  const [picked, setPicked] = useState<File[]>([]);
  const [description, setDescription] = useState('proforma');
  const [submitting, setSubmitting] = useState(false);
  const [changed, setChanged] = useState(false);

  const close = () => {
    // A delete counts as a change even without an upload (legacy onCancel).
    if (changed) void invalidate();
    onClose();
  };

  const remove = async (file: { id: number; file_name?: string | null }) => {
    const ok = await confirm({ title: 'Dosyayı sil', message: `${file.file_name} silinsin mi?`, confirmLabel: 'Sil', danger: true });
    if (!ok) return;
    try {
      await deleteAttachment(file.id);
      setChanged(true);
      await queryClient.invalidateQueries({ queryKey: paymentListKeys.attachments(po.id) });
    } catch (error) {
      notify.error(error, { fallback: 'Dosya silinemedi' });
    }
  };

  const upload = async () => {
    if (!picked.length) {
      notify.warning('Lütfen dosya seçin.');
      return;
    }
    setSubmitting(true);
    try {
      for (const f of picked) {
        await uploadPoAttachment(po.id, f, description.trim() || 'proforma');
      }
      onClose();
      notify.success(`${picked.length} dosya yüklendi`);
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: paymentListKeys.attachments(po.id) });
    } catch (error) {
      notify.error(error, { fallback: 'Dosya yüklenemedi' });
    } finally {
      setSubmitting(false);
    }
  };

  const list = files.data ?? [];
  return (
    <FormModal
      opened
      onClose={close}
      title={`Proforma · PO-${po.id} · ${row.supplier?.name || ''}`}
      icon="fas fa-paperclip"
      size="lg"
      submitLabel="Yükle"
      submitIcon="fas fa-upload"
      submitting={submitting}
      onSubmit={() => void upload()}
    >
      <Stack gap="sm">
        {files.isPending ? (
          <Loader size="sm" />
        ) : files.isError ? (
          <Text size="sm" c="dimmed">
            {files.error instanceof Error ? files.error.message : 'Dosyalar yüklenemedi'}
          </Text>
        ) : list.length === 0 ? (
          <Text size="sm" c="dimmed">
            Bu siparişte henüz proforma yok.
          </Text>
        ) : (
          <div>
            <Text size="sm" fw={600} mb={4}>
              Mevcut dosyalar
            </Text>
            <Stack gap={4}>
              {list.map((f) => (
                <Group key={f.id} gap="xs" wrap="nowrap" justify="space-between">
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    <FaIcon icon="fas fa-file" />
                    <Anchor href={f.file_url ?? undefined} target="_blank" rel="noopener noreferrer" size="sm" lineClamp={1}>
                      {f.file_name || f.file_url}
                    </Anchor>
                  </Group>
                  <Tooltip label="Sil" withArrow>
                    <ActionIcon variant="subtle" color="red" aria-label={`${f.file_name} sil`} onClick={() => void remove(f)}>
                      <FaIcon icon="fas fa-trash" />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ))}
            </Stack>
          </div>
        )}
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <FileDropInput
              label="Dosya(lar)"
              multiple
              clearable
              accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx"
              description="Proforma veya sipariş belgeleri (birden fazla seçilebilir)."
              value={picked}
              onChange={(value) => setPicked(value ?? [])}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput label="Açıklama" value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
          </Grid.Col>
        </Grid>
      </Stack>
    </FormModal>
  );
}

// ---- add selected pool rows to a list ---------------------------------------------------------------

const NEW_LIST = '__new__';

interface AddToListProps {
  rows: PoolRow[];
  onDone?: () => void;
  /** "+ Yeni liste oluştur": the list form takes over. */
  onCreateNew: (scheduleIds: number[]) => void;
  onClose: () => void;
}

export function AddToListModal({ rows, onDone, onCreateNew, onClose }: AddToListProps) {
  const invalidate = useInvalidatePayments();
  const eligible = rows.filter((r) => !r.open_list);
  const skipped = rows.length - eligible.length;
  const ids = eligible.map((r) => r.schedule_id);

  const targets = useQuery({
    queryKey: ['paymentLists', 'addTargets'],
    queryFn: ({ signal }) => getPaymentLists({ status: 'draft,rejected', page_size: 50, ordering: '-list_date' }, signal),
    retry: false,
  });
  const options = (targets.data?.results ?? []).map((l) => ({ value: String(l.id), label: `${l.title} (${l.status_label || l.status})` }));
  options.push({ value: NEW_LIST, label: '+ Yeni liste oluştur' });

  const [picked, setPicked] = useState('');
  // Default: the newest open list, or a new one when there is none (once the lists are in).
  const target = picked || (targets.isFetched ? options[0]!.value : '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!target) {
      setError(REQUIRED);
      return;
    }
    if (target === NEW_LIST) {
      onClose();
      onCreateNew(ids);
      return;
    }
    setSubmitting(true);
    try {
      await addPaymentListItems(Number(target), ids);
      onClose();
      notify.success(`${ids.length} kalem listeye eklendi`);
      void invalidate();
      onDone?.();
    } catch (err) {
      notify.error(err, { fallback: 'Kalemler eklenemedi' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Listeye Ekle"
      icon="fas fa-list-check"
      size="md"
      submitLabel="Ekle"
      submitting={submitting}
      onSubmit={() => void save()}
    >
      <div className={classes.note} style={{ marginBottom: 12 }}>
        {eligible.length} kalem · ≈ {fmtEur(sumEur(eligible))}
        {skipped ? (
          <div style={{ color: 'var(--gk-muted)' }}>{skipped} kalem zaten bir listede, atlanacak.</div>
        ) : null}
      </div>
      <Select
        label="Hedef liste"
        withAsterisk
        placeholder="Seçiniz"
        data={options}
        allowDeselect={false}
        value={target || null}
        error={error}
        rightSection={targets.isFetching ? <Loader size="xs" /> : undefined}
        onChange={(v) => {
          setPicked(v ?? '');
          setError(null);
        }}
      />
    </FormModal>
  );
}

// ---- host --------------------------------------------------------------------------------------------

export type ModalRequest =
  | { kind: 'listForm'; mode: 'create' | 'edit'; list?: PaymentList; carryOverFrom?: PaymentList; onSaved?: (list: PaymentList) => void }
  | { kind: 'budget'; list: PaymentList }
  | { kind: 'fx'; list: PaymentList }
  | { kind: 'markPaid'; row: PoolRow; mode: 'pool' | 'item'; listId?: number; itemId?: number }
  | { kind: 'bulkPaid'; rows: PoolRow[]; onDone?: () => void }
  | { kind: 'split'; row: PoolRow }
  | { kind: 'exclude'; row: PoolRow; onSave: (reason: string) => Promise<unknown> }
  | { kind: 'decide'; approve: boolean; onSave: (comment: string) => Promise<unknown> }
  | { kind: 'cancel'; list: PaymentList; onDone?: () => void }
  | { kind: 'proforma'; row: PoolRow }
  | { kind: 'addToList'; rows: PoolRow[]; onDone?: () => void };

export type OpenModal = (request: ModalRequest) => void;

/** The page's modal slot (legacy initModals): one modal at a time. */
export function usePaymentModals(): [ReactNode, OpenModal] {
  const [request, setRequest] = useState<ModalRequest | null>(null);
  const invalidate = useInvalidatePayments();
  const open = useCallback<OpenModal>((next) => {
    if (next.kind === 'addToList' && !next.rows.some((r) => !r.open_list)) {
      notify.warning('Seçilen kalemlerin tümü zaten bir listede.');
      return;
    }
    setRequest(next);
  }, []);
  const close = () => setRequest(null);

  let node: ReactNode = null;
  if (request) {
    switch (request.kind) {
      case 'listForm':
        node = (
          <ListFormModal
            mode={request.mode}
            list={request.list}
            carryOverFrom={request.carryOverFrom}
            onSaved={request.onSaved}
            onClose={close}
          />
        );
        break;
      case 'budget':
        node = <BudgetModal list={request.list} onClose={close} />;
        break;
      case 'fx':
        node = <ManualFxModal list={request.list} onClose={close} />;
        break;
      case 'markPaid':
        node = (
          <MarkPaidModal row={request.row} mode={request.mode} listId={request.listId} itemId={request.itemId} onClose={close} />
        );
        break;
      case 'bulkPaid':
        node = <BulkPaidModal rows={request.rows} onDone={request.onDone} onClose={close} />;
        break;
      case 'split':
        node = <SplitModal row={request.row} onClose={close} />;
        break;
      case 'exclude':
        node = <ExcludeModal row={request.row} onSave={request.onSave} onClose={close} />;
        break;
      case 'decide':
        node = <DecideModal approve={request.approve} onSave={request.onSave} onClose={close} />;
        break;
      case 'cancel':
        node = <CancelListModal list={request.list} onDone={request.onDone} onClose={close} />;
        break;
      case 'proforma':
        node = <ProformaModal row={request.row} onClose={close} />;
        break;
      case 'addToList': {
        const onDone = request.onDone;
        node = (
          <AddToListModal
            rows={request.rows}
            onDone={onDone}
            onClose={close}
            onCreateNew={(ids) =>
              setRequest({
                kind: 'listForm',
                mode: 'create',
                onSaved: async (list) => {
                  try {
                    await addPaymentListItems(list.id, ids);
                    notify.success(`${ids.length} kalem "${list.title}" listesine eklendi`);
                    void invalidate();
                    onDone?.();
                  } catch (error) {
                    notify.error(error, { fallback: 'Kalemler eklenemedi' });
                  }
                },
              })
            }
          />
        );
        break;
      }
    }
  }
  return [node, open];
}

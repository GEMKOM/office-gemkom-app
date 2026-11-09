import { Checkbox, Grid, Select, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  paymentTermOptionsQueryOptions,
  supplierApiErrorMessage,
  useCreateSupplier,
  useUpdateSupplier,
  type Supplier,
  type SupplierInput,
} from '@/api/procurement/suppliers';
import { countryOptions } from '@/lib/countries';
import { FormModal, ModalSection, notify } from '@/ui';

// The legacy EditModal shows 'Bu alan gereklidir' under any invalid field.
const REQUIRED = 'Bu alan gereklidir';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAX_ID_TR = 'Türkiye için VKN 10, TCKN 11 haneli olmalıdır';

/** Spaces and dashes come along when a tax id is pasted from an invoice. */
export function normalizeTaxId(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export const CURRENCY_OPTIONS = [
  { value: 'TRY', label: 'TRY — Türk Lirası' },
  { value: 'USD', label: 'USD — Amerikan Doları' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — İngiliz Sterlini' },
];

// Field checks of the legacy EditModal: required fields, the e-mail pattern
// and the tax rate's max of 100 (its min of 0 was dropped by `min || null`;
// handleSupplierModalSave catches negatives with a notification instead).
export const supplierSchema = z
  .object({
    code: z.string(),
    name: z.string().min(1, REQUIRED),
    contact_person: z.string(),
    phone: z.string(),
    email: z
      .string()
      .refine((v) => v === '' || EMAIL_RE.test(v), 'Geçerli bir e-posta adresi girin'),
    is_active: z.boolean(),
    address: z.string(),
    bank_info: z.string(),
    default_currency: z.string(),
    default_payment_terms: z.string(),
    default_tax_rate: z
      .string()
      .min(1, REQUIRED)
      .refine((v) => {
        const n = parseFloat(v);
        return !Number.isNaN(n) && n <= 100;
      }, REQUIRED),
    has_dbs: z.boolean(),
    dbs_bank: z.string(),
    dbs_limit: z.string().refine((v) => v === '' || !Number.isNaN(parseFloat(v)), REQUIRED),
    dbs_used: z.string(),
    dbs_currency: z.string(),
    dbs_agreement_no: z.string(),
    dbs_expiry_date: z.string(),
    dbs_details: z.string(),
    tax_id: z.string(),
    tax_office: z.string(),
    country: z.string(),
  })
  // Same rule as the backend: only Turkish tax ids have a fixed shape.
  .refine(
    (v) => {
      const id = normalizeTaxId(v.tax_id);
      return v.country !== 'TR' || id === '' || /^(\d{10}|\d{11})$/.test(id);
    },
    { message: TAX_ID_TR, path: ['tax_id'] },
  );

export type SupplierFormValues = z.infer<typeof supplierSchema>;

function toDateInputValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function paymentTermId(ref: Supplier['default_payment_terms']): string {
  if (ref === null || ref === undefined || ref === '') return '';
  if (typeof ref === 'object') return String(ref.id);
  return String(ref);
}

/** openSupplierFormForCreate / openSupplierFormForEdit defaults. */
export function supplierFormValues(supplier?: Supplier | null): SupplierFormValues {
  if (!supplier) {
    return {
      code: '',
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      is_active: true,
      address: '',
      bank_info: '',
      default_currency: 'TRY',
      default_payment_terms: '',
      default_tax_rate: '20',
      has_dbs: false,
      dbs_bank: '',
      dbs_limit: '',
      dbs_used: '0',
      dbs_currency: 'TRY',
      dbs_agreement_no: '',
      dbs_expiry_date: '',
      dbs_details: '',
      tax_id: '',
      tax_office: '',
      country: 'TR',
    };
  }
  return {
    code: supplier.code || '',
    name: supplier.name || '',
    contact_person: supplier.contact_person || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    is_active: supplier.is_active !== false,
    address: supplier.address || '',
    bank_info: supplier.bank_info || '',
    default_currency: supplier.default_currency || 'TRY',
    default_payment_terms: paymentTermId(supplier.default_payment_terms),
    default_tax_rate:
      supplier.default_tax_rate !== null && supplier.default_tax_rate !== undefined
        ? String(supplier.default_tax_rate)
        : '20',
    has_dbs: !!supplier.has_dbs,
    dbs_bank: supplier.dbs_bank || '',
    dbs_limit:
      supplier.dbs_limit !== null && supplier.dbs_limit !== undefined
        ? String(supplier.dbs_limit)
        : '',
    dbs_used:
      supplier.dbs_used !== null && supplier.dbs_used !== undefined
        ? String(supplier.dbs_used)
        : '0',
    dbs_currency: supplier.dbs_currency || 'TRY',
    dbs_agreement_no: supplier.dbs_agreement_no || '',
    dbs_expiry_date: toDateInputValue(supplier.dbs_expiry_date),
    dbs_details: supplier.dbs_details || '',
    tax_id: supplier.tax_id || '',
    tax_office: supplier.tax_office || '',
    country: supplier.country || '',
  };
}

/**
 * handleSupplierModalSave's checks and body. Returns the notification text
 * when a check fails.
 */
export function supplierPayload(
  values: SupplierFormValues,
): { error: string } | { data: SupplierInput } {
  const taxRate = parseFloat(values.default_tax_rate);
  if (values.default_tax_rate === '' || Number.isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
    return { error: 'Geçerli bir vergi oranı giriniz (0–100 arası)' };
  }
  const hasDbs = values.has_dbs;
  if (hasDbs && values.dbs_limit !== '') {
    const lim = parseFloat(values.dbs_limit);
    if (Number.isNaN(lim) || lim < 0)
      return { error: 'Geçerli bir DBS limiti giriniz (0 veya daha büyük)' };
  }
  const name = values.name.trim();
  if (!name) return { error: 'Tedarikçi adı zorunludur' };

  return {
    data: {
      code: values.code.trim(),
      name,
      contact_person: values.contact_person.trim(),
      phone: values.phone.trim(),
      email: values.email.trim(),
      address: values.address.trim(),
      bank_info: values.bank_info.trim(),
      default_currency: values.default_currency || 'TRY',
      default_payment_terms: values.default_payment_terms
        ? Number(values.default_payment_terms)
        : null,
      default_tax_rate: taxRate,
      tax_id: normalizeTaxId(values.tax_id),
      tax_office: values.tax_office.trim(),
      country: values.country,
      is_active: values.is_active,
      has_dbs: hasDbs,
      dbs_bank: hasDbs ? values.dbs_bank.trim() : '',
      dbs_limit: hasDbs && values.dbs_limit !== '' ? parseFloat(values.dbs_limit) : null,
      dbs_currency: hasDbs ? values.dbs_currency || 'TRY' : 'TRY',
      dbs_agreement_no: hasDbs ? values.dbs_agreement_no.trim() : '',
      dbs_expiry_date: hasDbs && values.dbs_expiry_date ? values.dbs_expiry_date : null,
      dbs_details: hasDbs ? values.dbs_details.trim() : '',
    },
  };
}

export interface SupplierFormModalProps {
  /** Without a supplier the modal creates one. */
  supplier?: Supplier | null;
  onClose: () => void;
}

/** Port of initSupplierFormModal + handleSupplierModalSave. Mount it to open it. */
export function SupplierFormModal({ supplier, onClose }: SupplierFormModalProps) {
  const editing = Boolean(supplier);
  const form = useForm<SupplierFormValues>({
    initialValues: supplierFormValues(supplier),
    validate: zod4Resolver(supplierSchema),
  });
  // Legacy loads the terms once; a failure leaves the dropdown empty.
  const terms = useQuery(paymentTermOptionsQueryOptions());
  const paymentTermData = (terms.data ?? []).map((pt) => ({
    value: String(pt.id),
    label: pt.name,
  }));
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const submitting = create.isPending || update.isPending;

  const save = async (values: SupplierFormValues) => {
    const built = supplierPayload(values);
    if ('error' in built) {
      notify.error(built.error);
      return;
    }
    try {
      if (supplier) {
        await update.mutateAsync({ id: supplier.id, data: built.data });
        notify.success('Tedarikçi başarıyla güncellendi');
      } else {
        await create.mutateAsync(built.data);
        notify.success('Tedarikçi başarıyla oluşturuldu');
      }
      onClose();
    } catch (error) {
      const message = supplierApiErrorMessage(
        error,
        supplier ? 'Tedarikçi güncellenirken hata oluştu' : 'Tedarikçi oluşturulurken hata oluştu',
      );
      notify.error(`Tedarikçi kaydedilirken hata oluştu: ${message}`);
    }
  };

  const half = { base: 12, sm: 6 };
  const turkish = form.values.country === 'TR';

  return (
    <FormModal
      opened
      onClose={onClose}
      title={editing ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'}
      subtitle={supplier ? [supplier.code, supplier.name].filter(Boolean).join(' · ') : undefined}
      icon={editing ? 'fas fa-edit' : 'fas fa-plus'}
      size="xl"
      submitting={submitting}
      submitLabel={editing ? 'Güncelle' : 'Kaydet'}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Temel Bilgiler" icon="fas fa-id-card">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="Kod"
              placeholder="Opsiyonel"
              description="Tedarikçi kodu (opsiyonel)"
              {...form.getInputProps('code')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput
              label="Tedarikçi Adı"
              placeholder="Firma unvanı"
              withAsterisk
              {...form.getInputProps('name')}
            />
          </Grid.Col>
          <Grid.Col span={half}>
            <TextInput label="İletişim Kişisi" {...form.getInputProps('contact_person')} />
          </Grid.Col>
          <Grid.Col span={half}>
            <TextInput label="Telefon" {...form.getInputProps('phone')} />
          </Grid.Col>
          <Grid.Col span={half}>
            <TextInput label="E-posta" type="email" {...form.getInputProps('email')} />
          </Grid.Col>
          <Grid.Col span={half} pt="lg">
            <Checkbox
              label="Aktif kayıt"
              description="Pasif tedarikçiler listelerde pasif olarak görünür"
              {...form.getInputProps('is_active', { type: 'checkbox' })}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea label="Adres" rows={2} {...form.getInputProps('address')} />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Banka / IBAN bilgisi"
              description="Ödeme için banka hesabı, IBAN vb."
              rows={2}
              {...form.getInputProps('bank_info')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Vergi Bilgileri" icon="fas fa-file-invoice">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Select
              label="Ülke"
              placeholder="Seçiniz..."
              data={countryOptions()}
              searchable
              nothingFoundMessage="Ülke bulunamadı"
              value={form.values.country || null}
              onChange={(value) => form.setFieldValue('country', value ?? '')}
              error={form.errors.country}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label={turkish ? 'VKN / TCKN' : 'Vergi numarası'}
              description={
                turkish ? 'VKN 10, TCKN 11 hane; e-fatura eşleştirmesinde kullanılır' : undefined
              }
              inputMode={turkish ? 'numeric' : undefined}
              {...form.getInputProps('tax_id')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput label="Vergi dairesi" {...form.getInputProps('tax_office')} />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Para Birimi ve Ödeme" icon="fas fa-coins">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Select
              label="Varsayılan para birimi"
              placeholder="Seçiniz..."
              data={CURRENCY_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps('default_currency')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 5 }}>
            <Select
              label="Varsayılan ödeme koşulları"
              placeholder="Ödeme koşulu seçin..."
              data={paymentTermData}
              clearable
              value={form.values.default_payment_terms || null}
              onChange={(value) => form.setFieldValue('default_payment_terms', value ?? '')}
              error={form.errors.default_payment_terms}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 3 }}>
            <TextInput
              label="Varsayılan vergi oranı (%)"
              description="0–100 arası yüzde"
              type="number"
              min={0}
              max={100}
              step={0.01}
              withAsterisk
              {...form.getInputProps('default_tax_rate')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="DBS (Doğrudan Borçlanma Sistemi)" icon="fas fa-landmark">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <Checkbox
              label="DBS kullanıyor"
              description="İşaretliyse aşağıdaki DBS alanları kullanılır"
              {...form.getInputProps('has_dbs', { type: 'checkbox' })}
            />
          </Grid.Col>
          <Grid.Col span={half}>
            <TextInput
              label="DBS bankası"
              placeholder="Örn: İşbank, Garanti..."
              {...form.getInputProps('dbs_bank')}
            />
          </Grid.Col>
          <Grid.Col span={half}>
            <TextInput
              label="DBS limiti"
              description="Onaylı DBS limit tutarı"
              placeholder="0"
              type="number"
              min={0}
              step={0.01}
              {...form.getInputProps('dbs_limit')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput
              label="Kullanılan DBS"
              description="Sunucu tarafından güncellenir (salt okunur)"
              type="number"
              readOnly
              {...form.getInputProps('dbs_used')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Select
              label="DBS para birimi"
              placeholder="Seçiniz..."
              data={CURRENCY_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps('dbs_currency')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput label="Sözleşme no" {...form.getInputProps('dbs_agreement_no')} />
          </Grid.Col>
          <Grid.Col span={half}>
            <TextInput
              label="Limit bitiş tarihi"
              type="date"
              {...form.getInputProps('dbs_expiry_date')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea label="DBS notları" rows={2} {...form.getInputProps('dbs_details')} />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

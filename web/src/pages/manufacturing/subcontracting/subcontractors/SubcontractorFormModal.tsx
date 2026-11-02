import { Checkbox, Grid, Select, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { CUSTOMER_CURRENCY_OPTIONS, isApiError } from '@/api';
import {
  useCreateSubcontractor,
  useUpdateSubcontractor,
  type Subcontractor,
  type SubcontractorInput,
} from '@/api/subcontracting/subcontractors';
import { FormModal, ModalSection, notify } from '@/ui';

const REQUIRED = 'Bu alan gereklidir';
// Same check as the legacy EditModal (email fields, only when filled in).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const subcontractorSchema = z.object({
  name: z.string().trim().min(1, REQUIRED),
  short_name: z.string(),
  contact_person: z.string(),
  phone: z.string(),
  email: z.string().refine((v) => v === '' || EMAIL_RE.test(v), 'Geçerli bir e-posta adresi girin'),
  default_currency: z.string(),
  address: z.string(),
  tax_id: z.string(),
  tax_office: z.string(),
  bank_info: z.string(),
  agreement_details: z.string(),
  is_active: z.boolean(),
});

export type SubcontractorFormValues = z.infer<typeof subcontractorSchema>;

export function subcontractorFormValues(
  subcontractor?: Subcontractor | null,
): SubcontractorFormValues {
  return {
    name: subcontractor?.name || '',
    short_name: subcontractor?.short_name || '',
    contact_person: subcontractor?.contact_person || '',
    phone: subcontractor?.phone || '',
    email: subcontractor?.email || '',
    default_currency: subcontractor?.default_currency || 'TRY',
    address: subcontractor?.address || '',
    tax_id: subcontractor?.tax_id || '',
    tax_office: subcontractor?.tax_office || '',
    bank_info: subcontractor?.bank_info || '',
    agreement_details: subcontractor?.agreement_details || '',
    is_active: subcontractor?.is_active !== undefined ? subcontractor.is_active : true,
  };
}

/**
 * Legacy create/updateSubcontractor errors: detail, else message, else every
 * field message joined with ', ', else the fallback.
 */
export function subcontractorErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.data && typeof error.data === 'object') {
    const body = error.data as Record<string, unknown>;
    if (typeof body.detail === 'string' && body.detail) return body.detail;
    if (typeof body.message === 'string' && body.message) return body.message;
    const messages = Object.values(body)
      .flat(Infinity)
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map(String);
    return messages.join(', ') || fallback;
  }
  return fallback;
}

const currencyData = CUSTOMER_CURRENCY_OPTIONS.map(({ value, label }) => ({ value, label }));

export interface SubcontractorFormModalProps {
  /** Without a subcontractor the modal creates one. */
  subcontractor?: Subcontractor | null;
  onClose: () => void;
}

/**
 * Port of the create and edit EditModals in subcontractors.js (same fields,
 * sections and payload). Mount it when it should open.
 */
export function SubcontractorFormModal({ subcontractor, onClose }: SubcontractorFormModalProps) {
  const form = useForm<SubcontractorFormValues>({
    initialValues: subcontractorFormValues(subcontractor),
    validate: zod4Resolver(subcontractorSchema),
  });
  const create = useCreateSubcontractor();
  const update = useUpdateSubcontractor();
  const submitting = create.isPending || update.isPending;

  const save = async (values: SubcontractorFormValues) => {
    const data: SubcontractorInput = values;
    try {
      if (subcontractor) await update.mutateAsync({ id: subcontractor.id, data });
      else await create.mutateAsync(data);
      notify.success(
        subcontractor ? 'Taşeron başarıyla güncellendi' : 'Taşeron başarıyla oluşturuldu',
      );
      onClose();
    } catch (error) {
      notify.error(
        subcontractorErrorMessage(
          error,
          subcontractor
            ? 'Taşeron güncellenirken hata oluştu'
            : 'Taşeron oluşturulurken hata oluştu',
        ),
      );
    }
  };

  const text = (
    field: keyof SubcontractorFormValues,
    label: string,
    extra: { required?: boolean; type?: string } = {},
  ) => (
    <TextInput
      label={label}
      withAsterisk={extra.required}
      type={extra.type}
      {...form.getInputProps(field)}
    />
  );

  return (
    <FormModal
      opened
      onClose={onClose}
      title={subcontractor ? 'Taşeron Düzenle' : 'Yeni Taşeron Oluştur'}
      subtitle={subcontractor ? subcontractor.name : undefined}
      icon={subcontractor ? 'fas fa-edit' : 'fas fa-plus-circle'}
      size={720}
      submitting={submitting}
      submitLabel={subcontractor ? 'Değişiklikleri Kaydet' : 'Taşeron Oluştur'}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Temel Bilgiler">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {text('name', 'Firma Adı', { required: true })}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>{text('short_name', 'Kısa Ad')}</Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {text('contact_person', 'İletişim Kişisi')}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>{text('phone', 'Telefon')}</Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {text('email', 'E-posta', { type: 'email' })}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Varsayılan Para Birimi"
              data={currencyData}
              allowDeselect={false}
              {...form.getInputProps('default_currency')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Adres ve Vergi Bilgileri">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <Textarea label="Adres" rows={2} {...form.getInputProps('address')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>{text('tax_id', 'Vergi No')}</Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>{text('tax_office', 'Vergi Dairesi')}</Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Banka ve Sözleşme Bilgileri">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <Textarea label="Banka Bilgisi" rows={2} {...form.getInputProps('bank_info')} />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Sözleşme Detayları"
              rows={3}
              {...form.getInputProps('agreement_details')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Durum">
        <Checkbox label="Aktif" {...form.getInputProps('is_active', { type: 'checkbox' })} />
      </ModalSection>
    </FormModal>
  );
}

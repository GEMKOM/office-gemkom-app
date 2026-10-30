import { Checkbox, Grid, Select, Stack, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  CUSTOMER_CURRENCY_OPTIONS,
  isApiError,
  useCreateCustomer,
  usePatchCustomer,
  type Customer,
  type CustomerInput,
} from '@/api';
import { FormModal, ModalSection, notify } from '@/ui';

const REQUIRED = 'Bu alan gereklidir';
// Same check as the legacy EditModal (email fields, only when filled in).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const customerSchema = z.object({
  code: z.string().min(1, REQUIRED),
  name: z.string().min(1, REQUIRED),
  short_name: z.string(),
  default_currency: z.string(),
  contact_person: z.string(),
  phone: z.string(),
  email: z.string().refine((v) => v === '' || EMAIL_RE.test(v), 'Geçerli bir e-posta adresi girin'),
  address: z.string(),
  tax_id: z.string(),
  tax_office: z.string(),
  is_active: z.boolean(),
  notes: z.string(),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;

export function customerFormValues(customer?: Customer | null): CustomerFormValues {
  return {
    code: customer?.code || '',
    name: customer?.name || '',
    short_name: customer?.short_name || '',
    default_currency: customer?.default_currency || 'TRY',
    contact_person: customer?.contact_person || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    tax_id: customer?.tax_id || '',
    tax_office: customer?.tax_office || '',
    is_active: customer ? customer.is_active !== false : true,
    notes: customer?.notes || '',
  };
}

/**
 * Legacy parseCustomerApiError: a DRF field-error body becomes all its
 * messages joined with ', '; anything else gives the fallback.
 */
export function customerErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.data && typeof error.data === 'object') {
    const messages = Object.values(error.data as Record<string, unknown>)
      .flat(Infinity)
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map(String);
    return messages.join(', ') || fallback;
  }
  return fallback;
}

const currencyData = CUSTOMER_CURRENCY_OPTIONS.map(({ value, label }) => ({ value, label }));

export interface CustomerFormModalProps {
  /** Without a customer the modal creates one. */
  customer?: Customer | null;
  onClose: () => void;
  onSaved?: (customer: Customer) => void;
}

/**
 * Port of the create modal in customerList.js and of customerEditModal.js.
 * Mount it when it should open, so the form starts from `customer` each time.
 */
export function CustomerFormModal({ customer, onClose, onSaved }: CustomerFormModalProps) {
  const editing = Boolean(customer);
  const form = useForm<CustomerFormValues>({
    initialValues: customerFormValues(customer),
    validate: zod4Resolver(customerSchema),
  });
  const create = useCreateCustomer();
  const patch = usePatchCustomer();
  const submitting = create.isPending || patch.isPending;

  const save = async (values: CustomerFormValues) => {
    const data: CustomerInput = values;
    try {
      const saved = customer
        ? await patch.mutateAsync({ id: customer.id, data })
        : await create.mutateAsync(data);
      if (!saved?.id) throw new Error(customer ? 'Müşteri güncellenemedi' : 'Müşteri oluşturulamadı');
      notify.success(customer ? 'Müşteri başarıyla güncellendi' : 'Müşteri başarıyla oluşturuldu');
      onSaved?.(saved);
      onClose();
    } catch (error) {
      notify.error(
        customerErrorMessage(
          error,
          customer ? 'Müşteri güncellenirken hata oluştu' : 'Müşteri oluşturulurken hata oluştu',
        ),
      );
    }
  };

  const text = (
    field: keyof CustomerFormValues,
    label: string,
    placeholder: string,
    description?: string,
    extra: { required?: boolean; type?: string } = {},
  ) => (
    <TextInput
      label={label}
      placeholder={placeholder}
      description={description}
      withAsterisk={extra.required}
      type={extra.type}
      {...form.getInputProps(field)}
    />
  );

  return (
    <FormModal
      opened
      onClose={onClose}
      title={editing ? 'Müşteri Düzenle' : 'Yeni Müşteri Oluştur'}
      subtitle={
        customer
          ? [customer.code, customer.name].filter(Boolean).join(' · ')
          : 'Kod ve firma adı zorunlu; diğer bilgiler sonradan da eklenebilir'
      }
      icon={editing ? 'fas fa-user-edit' : 'fas fa-user-plus'}
      size={720}
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Temel Bilgiler">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {text('code', 'Müşteri Kodu', 'Müşteri kodunu girin', 'Benzersiz müşteri kodu', { required: true })}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {text('name', 'Firma Adı', 'Firma adını girin', 'Tam firma adı', { required: true })}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>{text('short_name', 'Kısa Ad', 'Kısa gösterim adı')}</Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Para Birimi"
              placeholder="Para birimi seçin..."
              data={currencyData}
              allowDeselect={false}
              {...form.getInputProps('default_currency')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="İletişim Bilgileri">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            {text('contact_person', 'İletişim Kişisi', 'İletişim kişisi adı')}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>{text('phone', 'Telefon', 'Telefon numarası')}</Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            {text('email', 'E-posta', 'E-posta adresi', undefined, { type: 'email' })}
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea label="Adres" placeholder="Tam adres" rows={2} {...form.getInputProps('address')} />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Vergi Bilgileri">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {text('tax_id', 'Vergi Numarası', 'Vergi kimlik numarası')}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {text('tax_office', 'Vergi Dairesi', 'Bağlı olduğu vergi dairesi')}
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Durum ve Notlar">
        <Stack gap="md">
          <Checkbox
            label="Aktif"
            description="Pasif müşteriler listede varsayılan olarak gizlenir"
            {...form.getInputProps('is_active', { type: 'checkbox' })}
          />
          <Textarea label="Notlar" placeholder="İç notlar" rows={3} {...form.getInputProps('notes')} />
        </Stack>
      </ModalSection>
    </FormModal>
  );
}

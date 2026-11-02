import { Grid, Select, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import dayjs from 'dayjs';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { craneErrorText, useCreateCraneRate, type CraneType } from '@/api/general/craneRequests';
import { FormModal, ModalSection, notify } from '@/ui';
import { CURRENCY_OPTIONS } from '../crane';

const price = z
  .string()
  .refine(
    (v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0),
    'Geçerli bir değer girin',
  );

export const rateSchema = z
  .object({
    effective_from: z.string().min(1, 'Geçerlilik tarihi zorunludur'),
    currency: z.string(),
    price_up_to_3h: price,
    price_up_to_8h: price,
    price_per_day: price,
    transport_fee: price,
    rigger_fee: price,
    note: z.string(),
  })
  .refine((v) => v.price_up_to_3h !== '' || v.price_up_to_8h !== '' || v.price_per_day !== '', {
    message: 'En az bir fiyat girmelisiniz',
    path: ['price_up_to_3h'],
  });

type RateFormValues = z.infer<typeof rateSchema>;

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const orNull = (value: string) => (value === '' ? null : value);

export interface CraneRateFormModalProps {
  craneType: CraneType;
  onClose: () => void;
}

/** Port of showNewRateModal in prices.js: a new effective-dated price row. */
export function CraneRateFormModal({ craneType, onClose }: CraneRateFormModalProps) {
  const rate = craneType.current_rate ?? {};
  const form = useForm<RateFormValues>({
    initialValues: {
      effective_from: dayjs().format('YYYY-MM-DD'),
      currency: rate.currency || 'TRY',
      price_up_to_3h: str(rate.price_up_to_3h),
      price_up_to_8h: str(rate.price_up_to_8h),
      price_per_day: str(rate.price_per_day),
      transport_fee: str(rate.transport_fee),
      rigger_fee: str(rate.rigger_fee),
      note: '',
    },
    validate: zod4Resolver(rateSchema),
  });
  const create = useCreateCraneRate();

  const save = async (v: RateFormValues) => {
    try {
      await create.mutateAsync({
        crane_type: craneType.id,
        effective_from: v.effective_from,
        currency: v.currency || 'TRY',
        price_up_to_3h: orNull(v.price_up_to_3h),
        price_up_to_8h: orNull(v.price_up_to_8h),
        price_per_day: orNull(v.price_per_day),
        transport_fee: orNull(v.transport_fee),
        rigger_fee: orNull(v.rigger_fee),
        note: v.note || '',
      });
      notify.success('Yeni fiyat kaydedildi');
      onClose();
    } catch (error) {
      notify.error(`Fiyat kaydedilirken hata oluştu: ${craneErrorText(error)}`);
    }
  };

  const money = (field: keyof RateFormValues, label: string, description?: string) => (
    <TextInput
      type="number"
      min={0}
      step={0.01}
      label={label}
      description={description}
      {...form.getInputProps(field)}
    />
  );

  return (
    <FormModal
      opened
      onClose={onClose}
      title={`Yeni Fiyat — ${craneType.name}`}
      icon="fas fa-tags"
      size="md"
      submitting={create.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Fiyat Bilgileri" icon="fas fa-tags">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              type="date"
              label="Geçerlilik Başlangıcı"
              withAsterisk
              description="Bu tarihten itibaren geçerli olur; eski kayıtlar tarihçede kalır"
              {...form.getInputProps('effective_from')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Para Birimi"
              allowDeselect={false}
              data={CURRENCY_OPTIONS}
              {...form.getInputProps('currency')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {money('price_up_to_3h', '3 Saate Kadar', 'Boş bırakılırsa bu seçenek sunulmaz')}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>{money('price_up_to_8h', '8 Saate Kadar')}</Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {money('price_per_day', 'Günlük Fiyat', 'Platformlar için')}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {money('transport_fee', 'Nakliye (gidiş-dönüş)')}
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {money('rigger_fee', 'İlave Sapancı Ücreti', 'Vinçler için')}
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              label="Not"
              description="Örn: 2026 teklif yenilemesi"
              {...form.getInputProps('note')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

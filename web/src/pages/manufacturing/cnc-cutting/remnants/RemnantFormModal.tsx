import { Grid, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  useCreateRemnantPlate,
  useUpdateRemnantPlate,
  type RemnantPlate,
  type RemnantPlateInput,
} from '@/api/manufacturing/remnants';
import { FormModal, ModalSection, notify } from '@/ui';

const isPositive = (v: string) =>
  v.trim() !== '' && !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0;

// Legacy messages (remnants.js save callbacks).
export const remnantSchema = z.object({
  thickness_mm: z.string().refine(isPositive, 'Kalınlık geçerli bir sayı olmalıdır'),
  thickness_mm_2: z
    .string()
    .refine((v) => v.trim() === '' || isPositive(v), 'Kalınlık 2 geçerli bir sayı olmalıdır'),
  dimensions: z.string().refine((v) => v.trim() !== '', 'Boyutlar gereklidir'),
  quantity: z.string().refine((v) => {
    const n = parseInt(v, 10);
    return !Number.isNaN(n) && n >= 1;
  }, 'Adet geçerli bir sayı olmalıdır'),
  material: z.string().refine((v) => v.trim() !== '', 'Malzeme gereklidir'),
  heat_number: z.string(),
});

export type RemnantFormValues = z.infer<typeof remnantSchema>;

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));

export function remnantFormValues(remnant?: RemnantPlate | null): RemnantFormValues {
  return {
    thickness_mm: text(remnant?.thickness_mm),
    thickness_mm_2: text(remnant?.thickness_mm_2),
    dimensions: text(remnant?.dimensions),
    quantity: text(remnant?.quantity),
    material: text(remnant?.material),
    heat_number: text(remnant?.heat_number),
  };
}

/**
 * The request body as legacy built it: thickness to two decimals, text
 * trimmed. On create, empty optional fields are left out; on edit they are
 * sent as null so they can be cleared.
 */
export function remnantInput(values: RemnantFormValues, editing: boolean): RemnantPlateInput {
  const data: RemnantPlateInput = {
    thickness_mm: parseFloat(values.thickness_mm).toFixed(2),
    dimensions: values.dimensions.trim(),
    quantity: parseInt(values.quantity, 10),
    material: values.material.trim(),
  };
  const thickness2 = values.thickness_mm_2.trim();
  const heat = values.heat_number.trim();
  if (thickness2) data.thickness_mm_2 = parseFloat(thickness2).toFixed(2);
  else if (editing) data.thickness_mm_2 = null;
  if (heat) data.heat_number = heat;
  else if (editing) data.heat_number = null;
  return data;
}

export interface RemnantFormModalProps {
  /** Without a remnant the modal creates one. */
  remnant?: RemnantPlate | null;
  onClose: () => void;
}

/** Port of showCreateRemnantModal / showEditRemnantModal in remnants.js. */
export function RemnantFormModal({ remnant, onClose }: RemnantFormModalProps) {
  const editing = Boolean(remnant);
  const form = useForm<RemnantFormValues>({
    initialValues: remnantFormValues(remnant),
    validate: zod4Resolver(remnantSchema),
  });
  const create = useCreateRemnantPlate();
  const update = useUpdateRemnantPlate();

  const save = async (values: RemnantFormValues) => {
    const data = remnantInput(values, editing);
    try {
      if (remnant) {
        await update.mutateAsync({ id: remnant.id, data });
        notify.success('Fire plaka başarıyla güncellendi');
      } else {
        await create.mutateAsync(data);
        notify.success('Fire plaka başarıyla oluşturuldu');
      }
      onClose();
    } catch (error) {
      console.error('Error saving remnant plate:', error);
      notify.error(
        editing ? 'Plaka güncellenirken hata oluştu' : 'Plaka oluşturulurken hata oluştu',
      );
    }
  };

  const field = (
    key: keyof RemnantFormValues,
    label: string,
    placeholder: string,
    description: string,
    extra: { required?: boolean; type?: 'number'; step?: string; min?: string } = {},
  ) => (
    <Grid.Col span={{ base: 12, sm: 6 }}>
      <TextInput
        label={label}
        placeholder={placeholder}
        description={description}
        withAsterisk={extra.required}
        type={extra.type}
        step={extra.step}
        min={extra.min}
        {...form.getInputProps(key)}
      />
    </Grid.Col>
  );

  return (
    <FormModal
      opened
      onClose={onClose}
      title={editing ? 'Fire Plaka Düzenle' : 'Yeni Fire Plaka Ekle'}
      subtitle={remnant ? `ID: ${remnant.id}` : undefined}
      icon={editing ? 'fas fa-edit' : 'fas fa-plus-circle'}
      size="md"
      submitLabel={editing ? 'Değişiklikleri Kaydet' : 'Plaka Oluştur'}
      submitting={create.isPending || update.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Plaka Bilgileri" icon="fas fa-info-circle">
        <Grid gap="sm">
          {field('thickness_mm', 'Kalınlık (mm)', '10.00', 'Plaka kalınlığı milimetre cinsinden', {
            required: true,
            type: 'number',
            step: '0.01',
            min: '0.01',
          })}
          {field(
            'thickness_mm_2',
            'Kalınlık 2 (mm)',
            '8.00',
            'İkinci kalınlık değeri (opsiyonel)',
            {
              type: 'number',
              step: '0.01',
              min: '0.01',
            },
          )}
          {field('dimensions', 'Boyutlar', '1200x800', 'Plaka boyutları (örn: 1200x800)', {
            required: true,
          })}
          {field('quantity', 'Adet', '1', 'Plaka adedi', {
            required: true,
            type: 'number',
            step: '1',
            min: '1',
          })}
          {field('material', 'Malzeme', 'S235JR', 'Malzeme türü', { required: true })}
          {field('heat_number', 'Heat Number', 'Heat number', 'Heat number (opsiyonel)')}
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

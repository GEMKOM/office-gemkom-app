import { Grid, Select, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  ITEM_TYPE_CHOICES,
  itemErrorMessage,
  UNIT_CHOICES,
  useUpdateItem,
  type Item,
  type ItemInput,
} from '@/api/procurement/items';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';

// The legacy EditModal shows this one message under any invalid field.
const REQUIRED = 'Bu alan gereklidir';

export const itemSchema = z.object({
  code: z.string().min(1, REQUIRED),
  name: z.string().min(1, REQUIRED),
  unit: z.string(),
  item_type: z.string().min(1, REQUIRED),
  // Number field: optional, but when filled it has to parse (legacy isFieldValid).
  stock_quantity: z
    .string()
    .refine((v) => v === '' || !Number.isNaN(Number.parseFloat(v)), REQUIRED),
});

export type ItemFormValues = z.infer<typeof itemSchema>;

/** The values legacy editItem filled the form with. */
export function itemFormValues(item: Item): ItemFormValues {
  // The API may send the unit upper-case; the choices are lower-case.
  const unit = item.unit ? item.unit.toLowerCase() : '';
  return {
    code: item.code || '',
    name: item.name || '',
    unit,
    item_type: item.item_type || 'stock',
    stock_quantity: String(item.stock_quantity || 0),
  };
}

const unitData = UNIT_CHOICES.map(({ value, label }) => ({ value, label }));
const typeData = ITEM_TYPE_CHOICES.map(({ value, label }) => ({ value, label }));

export interface ItemFormModalProps {
  item: Item;
  onClose: () => void;
}

/** Port of the edit modal in planning/inventory/cards/cards.js (editItem). */
export function ItemFormModal({ item, onClose }: ItemFormModalProps) {
  const form = useForm<ItemFormValues>({
    initialValues: itemFormValues(item),
    validate: zod4Resolver(itemSchema),
  });
  const update = useUpdateItem();

  const save = async (values: ItemFormValues) => {
    const data: ItemInput = values;
    try {
      await update.mutateAsync({ id: item.id, data });
      notify.success('Stok kartı başarıyla güncellendi');
      onClose();
    } catch (error) {
      console.error('Error updating item:', error);
      notify.error(
        `Stok kartı güncellenirken hata oluştu: ${itemErrorMessage(error, 'Malzeme güncellenirken hata oluştu')}`,
      );
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Stok Kartı Düzenle"
      subtitle={[item.code, item.name].filter(Boolean).join(' · ')}
      icon="fas fa-edit"
      size="lg"
      submitting={update.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Ürün Kodu"
              placeholder="Ürün kodunu girin"
              withAsterisk
              leftSection={<FaIcon icon="fas fa-barcode" />}
              {...form.getInputProps('code')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Ürün Adı"
              placeholder="Ürün adını girin"
              withAsterisk
              leftSection={<FaIcon icon="fas fa-box" />}
              {...form.getInputProps('name')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Birim"
              placeholder="Birim seçin..."
              data={unitData}
              allowDeselect={false}
              leftSection={<FaIcon icon="fas fa-ruler" />}
              {...form.getInputProps('unit')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Ürün Tipi"
              placeholder="Ürün tipi seçin..."
              withAsterisk
              data={typeData}
              allowDeselect={false}
              leftSection={<FaIcon icon="fas fa-tags" />}
              {...form.getInputProps('item_type')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Stok Miktarı"
              placeholder="Stok miktarını girin"
              type="number"
              step="0.01"
              leftSection={<FaIcon icon="fas fa-cubes" />}
              {...form.getInputProps('stock_quantity')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

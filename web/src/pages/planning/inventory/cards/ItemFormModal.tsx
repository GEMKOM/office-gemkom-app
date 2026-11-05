import { Grid, Select, Switch, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo } from 'react';
import { z } from 'zod';
import {
  ITEM_TYPE_CHOICES,
  itemCategoriesQueryOptions,
  itemErrorMessage,
  UNIT_CHOICES,
  useCreateItem,
  useUpdateItem,
  type Item,
  type ItemCategory,
  type ItemInput,
} from '@/api/procurement/items';
import { isApiError } from '@/api/client';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';

// The legacy EditModal shows this one message under any invalid field.
const REQUIRED = 'Bu alan gereklidir';
const NUMBER = 'Geçerli bir sayı girin';

const optionalNumber = z
  .string()
  .refine((v) => v.trim() === '' || !Number.isNaN(Number.parseFloat(v)), NUMBER);

export const itemSchema = z.object({
  code: z.string().trim().min(1, REQUIRED),
  name: z.string().trim().min(1, REQUIRED),
  unit: z.string().min(1, REQUIRED),
  item_type: z.string().min(1, REQUIRED),
  category: z.string(),
  is_active: z.boolean(),
  min_stock: optionalNumber,
  // Number field: optional, but when filled it has to parse (legacy isFieldValid).
  stock_quantity: optionalNumber,
});

export type ItemFormValues = z.infer<typeof itemSchema>;

/** The form for an existing card, or for a new one (optionally prefilled). */
export function itemFormValues(item?: Partial<Item>): ItemFormValues {
  // The API may send the unit upper-case; the choices are lower-case.
  const unit = item?.unit ? item.unit.toLowerCase() : 'adet';
  return {
    code: item?.code || '',
    name: item?.name || '',
    unit,
    item_type: item?.item_type || 'stock',
    category: item?.category ? String(item.category) : '',
    is_active: item?.is_active ?? true,
    min_stock:
      item?.min_stock === null || item?.min_stock === undefined ? '' : String(item.min_stock),
    stock_quantity: String(item?.stock_quantity || 0),
  };
}

export function itemInput(values: ItemFormValues, editing: boolean): ItemInput {
  const data: ItemInput = {
    code: values.code.trim(),
    name: values.name.trim(),
    unit: values.unit,
    item_type: values.item_type,
    category: values.category ? Number(values.category) : null,
    is_active: values.is_active,
    min_stock: values.min_stock.trim() === '' ? null : values.min_stock.trim(),
  };
  // Stock is not typed on a new card; the stock system will own it.
  if (editing) data.stock_quantity = values.stock_quantity;
  return data;
}

/** The backend's field errors, e.g. a code that already exists. */
function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error) || !error.data || typeof error.data !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(error.data as Record<string, unknown>)) {
    const message = Array.isArray(value) ? value.join(' ') : typeof value === 'string' ? value : '';
    if (message) out[key] = message;
  }
  return out;
}

const unitData = UNIT_CHOICES.map(({ value, label }) => ({ value, label }));
const typeData = ITEM_TYPE_CHOICES.map(({ value, label }) => ({ value, label }));

function categoryData(categories: ItemCategory[]) {
  return categories.map((c) => ({
    value: String(c.id),
    label: `${c.code} — ${c.name}`,
  }));
}

export interface ItemFormModalProps {
  /** The card to edit; without it the modal opens a new card. */
  item?: Item;
  /** Prefill for a new card (e.g. the name a department request asked for). */
  initial?: Partial<Item>;
  onClose: () => void;
  /** Called with the saved card (create and edit). */
  onSaved?: (item: Item) => void;
}

/** Stock card create / edit (port of the edit modal in cards.js, plus create). */
export function ItemFormModal({ item, initial, onClose, onSaved }: ItemFormModalProps) {
  const editing = Boolean(item);
  const form = useForm<ItemFormValues>({
    initialValues: itemFormValues(item ?? initial),
    validate: zod4Resolver(itemSchema),
  });
  const update = useUpdateItem();
  const create = useCreateItem();
  const categories = useQuery(itemCategoriesQueryOptions());
  const categoryOptions = useMemo(() => categoryData(categories.data ?? []), [categories.data]);

  const pickCategory = (value: string | null) => {
    form.setFieldValue('category', value ?? '');
    const category = categories.data?.find((c) => String(c.id) === value);
    // A new card takes the family's usual unit until someone picks another.
    if (!editing && category?.default_unit && !form.isDirty('unit')) {
      form.setFieldValue('unit', category.default_unit);
    }
  };

  const save = async (values: ItemFormValues) => {
    const data = itemInput(values, editing);
    try {
      const saved = item
        ? await update.mutateAsync({ id: item.id, data })
        : await create.mutateAsync(data);
      notify.success(editing ? 'Stok kartı başarıyla güncellendi' : 'Stok kartı açıldı');
      onSaved?.(saved);
      onClose();
    } catch (error) {
      const errors = fieldErrors(error);
      if (Object.keys(errors).length > 0) form.setErrors(errors);
      notify.error(
        `Stok kartı ${editing ? 'güncellenirken' : 'açılırken'} hata oluştu: ${
          errors.code ?? itemErrorMessage(error, 'Malzeme kaydedilirken hata oluştu')
        }`,
      );
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={editing ? 'Stok Kartı Düzenle' : 'Yeni Stok Kartı'}
      subtitle={item ? [item.code, item.name].filter(Boolean).join(' · ') : undefined}
      icon={editing ? 'fas fa-edit' : 'fas fa-plus-circle'}
      size="lg"
      submitting={update.isPending || create.isPending}
      submitLabel={editing ? 'Kaydet' : 'Kartı Aç'}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Ürün Kodu"
              placeholder="Örn. 0018 0012 0040 000 001"
              description={editing ? undefined : 'Mikro kod yapısında, benzersiz'}
              withAsterisk
              leftSection={<FaIcon icon="fas fa-barcode" />}
              {...form.getInputProps('code')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Ürün Adı"
              placeholder="Örn. CİVATA M12x40 DIN 933 8.8"
              description={editing ? undefined : 'Tür + ölçü + standart + kalite + kaplama'}
              withAsterisk
              leftSection={<FaIcon icon="fas fa-box" />}
              {...form.getInputProps('name')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Select
              label="Aile"
              placeholder={categories.isPending ? 'Yükleniyor…' : 'Aile seçin (ör. 0018 Civata)'}
              searchable
              clearable
              limit={50}
              data={categoryOptions}
              leftSection={<FaIcon icon="fas fa-sitemap" />}
              {...form.getInputProps('category')}
              onChange={pickCategory}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Birim"
              placeholder="Birim seçin..."
              withAsterisk
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
              label="Minimum Stok"
              placeholder="Boş bırakılabilir"
              type="number"
              step="0.01"
              leftSection={<FaIcon icon="fas fa-arrow-down-short-wide" />}
              {...form.getInputProps('min_stock')}
            />
          </Grid.Col>
          {editing ? (
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
          ) : null}
          <Grid.Col span={12}>
            <Switch
              label="Aktif"
              description="Pasif kartlar eski satırlarda kalır, aramada en sonda listelenir"
              {...form.getInputProps('is_active', { type: 'checkbox' })}
            />
          </Grid.Col>
          {item?.mikro_code ? (
            <Grid.Col span={12}>
              <Text size="sm" c="dimmed">
                <FaIcon icon="fas fa-link" /> Mikro kodu: <strong>{item.mikro_code}</strong> (kod
                içe aktarımda düzeltildi; muhasebe Mikro&apos;da bu kodla bulur)
              </Text>
            </Grid.Col>
          ) : null}
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

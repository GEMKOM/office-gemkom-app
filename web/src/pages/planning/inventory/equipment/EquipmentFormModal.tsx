import { Grid, NumberInput, Select, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  useCreateEquipmentItem,
  usePatchEquipmentItem,
  type EquipmentItem,
  type EquipmentItemInput,
} from '@/api/equipment/equipment';
import { FormModal, ModalSection, notify } from '@/ui';

const REQUIRED = 'Bu alan gereklidir';

export const equipmentSchema = z.object({
  code: z.string(),
  name: z.string().min(1, REQUIRED),
  asset_type: z.string(),
  category: z.string(),
  location: z.string(),
  quantity: z.union([z.number(), z.string()]),
  is_active: z.enum(['true', 'false']),
  extra_json: z.string(),
});

export type EquipmentFormValues = z.infer<typeof equipmentSchema>;

export function equipmentFormValues(item?: EquipmentItem | null): EquipmentFormValues {
  return {
    code: item?.code || '',
    name: item?.name || '',
    asset_type: item?.asset_type || '',
    category: item?.category || '',
    location: item?.location || '',
    quantity: item?.quantity ?? '',
    // Legacy: a new item starts Aktif; an edit shows the item's state.
    is_active: !item || item.is_active ? 'true' : 'false',
    // The JSON box always starts empty, also when editing.
    extra_json: '',
  };
}

/**
 * Legacy buildPayloadFromForm: blanks become null, quantity is sent only
 * when it is a number, and a JSON object in "Ek Alanlar" is merged over the
 * rest (invalid JSON is ignored, as before).
 */
export function buildEquipmentPayload(values: EquipmentFormValues): EquipmentItemInput {
  const base: EquipmentItemInput = {
    code: values.code || null,
    name: values.name,
    asset_type: values.asset_type || null,
    category: values.category || null,
    location: values.location || null,
    is_active: values.is_active === 'true',
  };

  if (values.quantity !== '') {
    const n = Number(values.quantity);
    if (!Number.isNaN(n)) base.quantity = n;
  }

  if (values.extra_json) {
    try {
      const extra: unknown = JSON.parse(values.extra_json);
      if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
        return { ...base, ...(extra as Record<string, unknown>) };
      }
    } catch {
      // ignore invalid extra_json
    }
  }
  return base;
}

const STATUS_OPTIONS = [
  { value: 'true', label: 'Aktif' },
  { value: 'false', label: 'Pasif' },
];

export interface EquipmentFormModalProps {
  /** Without an item the modal creates one. */
  item?: EquipmentItem | null;
  onClose: () => void;
}

/**
 * Port of the create and edit EditModals in equipmentList.js. Mount it when
 * it should open, so the form starts from `item` each time.
 */
export function EquipmentFormModal({ item, onClose }: EquipmentFormModalProps) {
  const editing = Boolean(item);
  const form = useForm<EquipmentFormValues>({
    initialValues: equipmentFormValues(item),
    validate: zod4Resolver(equipmentSchema),
  });
  const create = useCreateEquipmentItem();
  const patch = usePatchEquipmentItem();
  const submitting = create.isPending || patch.isPending;

  const save = async (values: EquipmentFormValues) => {
    const data = buildEquipmentPayload(values);
    try {
      if (item) await patch.mutateAsync({ id: item.id, data });
      else await create.mutateAsync(data);
      onClose();
    } catch (error) {
      // Legacy only logged the failure and left the modal open.
      console.error(item ? 'Error updating equipment:' : 'Error creating equipment:', error);
      notify.error(error, {
        fallback: item
          ? 'Ekipman güncellenirken hata oluştu'
          : 'Ekipman oluşturulurken hata oluştu',
      });
    }
  };

  // The create form shows example placeholders; the edit form does not (legacy).
  const hint = (text: string) => (editing ? undefined : text);

  return (
    <FormModal
      opened
      onClose={onClose}
      title={editing ? 'Ekipman Düzenle' : 'Yeni Ekipman Oluştur'}
      subtitle={item ? [item.code, item.name].filter(Boolean).join(' · ') || undefined : undefined}
      icon={editing ? 'fas fa-edit' : 'fas fa-plus-circle'}
      size="lg"
      submitLabel={editing ? 'Kaydet' : 'Oluştur'}
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Kod"
              placeholder={hint('Örn: CALIPER-01')}
              {...form.getInputProps('code')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Ad"
              placeholder={hint('Ekipman adı')}
              withAsterisk
              {...form.getInputProps('name')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Tip"
              placeholder={hint('Örn: instrument')}
              {...form.getInputProps('asset_type')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Kategori"
              placeholder={hint('Örn: Measuring')}
              {...form.getInputProps('category')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Lokasyon"
              placeholder={hint('Örn: Ambar')}
              {...form.getInputProps('location')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <NumberInput
              label="Adet"
              placeholder={hint('Örn: 1')}
              {...form.getInputProps('quantity')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Durum"
              data={STATUS_OPTIONS}
              allowDeselect={false}
              searchable={false}
              {...form.getInputProps('is_active')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Gelişmiş (Opsiyonel)" icon="fas fa-code">
        <Textarea
          label="Ek Alanlar (JSON)"
          placeholder={editing ? '{"serial":"123"}' : '{"serial":"123","notes":"..."}'}
          description={
            editing
              ? 'Bu alan doldurulursa PATCH payloadına eklenir.'
              : 'Backend alanları değişebileceği için ek payload alanlarını JSON olarak girebilirsiniz.'
          }
          rows={4}
          inputWrapperOrder={['label', 'input', 'description', 'error']}
          {...form.getInputProps('extra_json')}
        />
      </ModalSection>
    </FormModal>
  );
}

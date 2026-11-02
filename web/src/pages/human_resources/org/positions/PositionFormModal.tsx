import { Checkbox, Grid, Select, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  DEPARTMENT_CODES,
  POSITION_LEVELS,
  useSavePosition,
  type Position,
  type PositionInput,
} from '@/api/human_resources/organization';
import { confirm, FormModal, ModalSection, notify } from '@/ui';

const positionSchema = z.object({
  title: z.string().trim().min(1, 'Pozisyon başlığı zorunludur.'),
  level: z.string().refine((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 6;
  }, 'Pozisyon seviyesi 1 ile 6 arasında olmalıdır.'),
  parent: z.string().nullable(),
  department_code: z.string().nullable(),
  is_active: z.boolean(),
});

type PositionFormValues = z.infer<typeof positionSchema>;

const levelData = POSITION_LEVELS.map((l) => ({ value: String(l), label: `Seviye ${l}` }));
const departmentData = DEPARTMENT_CODES.map(({ value, label }) => ({ value, label }));

export interface PositionFormModalProps {
  /** Without a position the modal creates one. */
  position?: Position | null;
  /** Every position, for the parent picker and the level check. */
  positions: Position[];
  onClose: () => void;
  /** The saved position's id; the page shows its detail. */
  onSaved: (id: number) => void;
}

/** The create / edit modal of positions.js (buildPositionFormFields + savePosition). */
export function PositionFormModal({
  position,
  positions,
  onClose,
  onSaved,
}: PositionFormModalProps) {
  const form = useForm<PositionFormValues>({
    initialValues: {
      title: position?.title || '',
      level: position ? String(position.level || 5) : '5',
      parent: position?.parent ? String(position.parent) : null,
      department_code: position?.department_code || null,
      is_active: position ? position.is_active !== false : true,
    },
    validate: zod4Resolver(positionSchema),
  });
  const save = useSavePosition();

  const parentData = positions
    .filter((p) => p.id !== position?.id)
    .map((p) => ({ value: String(p.id), label: `${p.title} (L${p.level})` }));

  const submit = async (values: PositionFormValues) => {
    const level = Number(values.level);
    const parent = values.parent ? Number(values.parent) : null;
    const parentLevel = parent ? (positions.find((p) => p.id === parent)?.level ?? null) : null;
    if (parentLevel && level < Number(parentLevel)) {
      const accepted = await confirm({
        title: 'Uyarı',
        icon: 'fas fa-exclamation-triangle',
        message: `Uyarı: Çocuk seviye (${level}), parent seviyesinden (${parentLevel}) düşük. Bu olağandışı bir hiyerarşi. Yine de kaydedilsin mi?`,
        confirmLabel: 'Kaydet',
      });
      if (!accepted) return;
    }

    const data: PositionInput = {
      title: values.title.trim(),
      level,
      parent,
      department_code: values.department_code ?? '',
      is_active: values.is_active,
    };
    try {
      const saved = await save.mutateAsync({ id: position?.id, data });
      notify.success(position ? 'Pozisyon güncellendi.' : 'Pozisyon oluşturuldu.');
      const id = saved?.id ?? position?.id;
      if (id) onSaved(id);
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Pozisyon kaydedilemedi.' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={position ? 'Pozisyon Düzenle' : 'Yeni Pozisyon'}
      subtitle={position?.title}
      icon="fas fa-sitemap"
      submitting={save.isPending}
      onSubmit={form.onSubmit(submit)}
    >
      <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput label="Başlık" withAsterisk {...form.getInputProps('title')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Select
              label="Seviye"
              withAsterisk
              data={levelData}
              allowDeselect={false}
              {...form.getInputProps('level')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Hiyerarşi" icon="fas fa-sitemap">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {/* Cleared = no parent ("Yok (en üst seviye)" in legacy). */}
            <Select
              label="Bağlı Olduğu Pozisyon"
              placeholder="Yok (en üst seviye)"
              data={parentData}
              searchable
              clearable
              nothingFoundMessage="Sonuç bulunamadı"
              {...form.getInputProps('parent')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Departman"
              placeholder="Seçiniz"
              data={departmentData}
              searchable
              clearable
              nothingFoundMessage="Sonuç bulunamadı"
              {...form.getInputProps('department_code')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Durum" icon="fas fa-toggle-on">
        <Checkbox label="Aktif" {...form.getInputProps('is_active', { type: 'checkbox' })} />
      </ModalSection>
    </FormModal>
  );
}

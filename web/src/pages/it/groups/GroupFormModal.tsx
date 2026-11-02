import { Checkbox, MultiSelect, Stack, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  positionLabel,
  useCreateOrganizationGroup,
  usePatchOrganizationGroup,
  type GroupPosition,
  type OrganizationGroup,
} from '@/api/it/organizationGroups';
import { FormModal, ModalSection, notify } from '@/ui';

export const groupSchema = z.object({
  name: z.string().refine((v) => v.trim() !== '', 'Grup adı zorunludur.'),
  description: z.string(),
  is_active: z.boolean(),
  position_ids: z.array(z.string()),
});

export type GroupFormValues = z.infer<typeof groupSchema>;

export interface GroupFormModalProps {
  /** Without a group the modal creates one. */
  group?: OrganizationGroup | null;
  positions: GroupPosition[];
  onClose: () => void;
  /** The saved group's id, so the page can show its detail. */
  onSaved: (id: number | null) => void;
}

/** Port of buildGroupFormFields + saveGroup in groups.js. */
export function GroupFormModal({ group, positions, onClose, onSaved }: GroupFormModalProps) {
  const form = useForm<GroupFormValues>({
    initialValues: {
      name: group?.name || '',
      description: group?.description || '',
      is_active: group ? group.is_active !== false : true,
      position_ids: [],
    },
    validate: zod4Resolver(groupSchema),
  });
  const create = useCreateOrganizationGroup();
  const patch = usePatchOrganizationGroup();

  const positionOptions = positions
    .filter((p) => p.is_active !== false)
    .map((p) => ({ value: String(p.id), label: positionLabel(p) }));

  const save = async (values: GroupFormValues) => {
    const name = values.name.trim();
    const description = values.description.trim();
    try {
      if (group) {
        await patch.mutateAsync({ id: group.id, data: { name, description, is_active: values.is_active } });
        notify.success('Grup güncellendi.');
        onSaved(group.id);
      } else {
        const positionIds = values.position_ids.map(Number).filter(Boolean);
        const saved = await create.mutateAsync({
          name,
          description: description || undefined,
          // Legacy dropped the checkbox on create; the new group now keeps it.
          is_active: values.is_active,
          position_ids: positionIds.length ? positionIds : undefined,
        });
        notify.success('Grup oluşturuldu.');
        onSaved(saved?.id ?? null);
      }
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Grup kaydedilemedi.' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={group ? 'Grup Düzenle' : 'Yeni Grup'}
      subtitle={group?.name}
      icon="fas fa-object-group"
      size="lg"
      submitting={create.isPending || patch.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
        <Stack gap="sm">
          <TextInput label="Grup adı" withAsterisk {...form.getInputProps('name')} />
          <Textarea label="Açıklama" rows={3} {...form.getInputProps('description')} />
        </Stack>
      </ModalSection>
      <ModalSection title="Durum" icon="fas fa-toggle-on">
        <Checkbox label="Aktif" {...form.getInputProps('is_active', { type: 'checkbox' })} />
      </ModalSection>
      {group ? null : (
        <ModalSection title="Pozisyonlar" icon="fas fa-id-badge">
          <MultiSelect
            label="Başlangıç pozisyonları (isteğe bağlı)"
            placeholder="Pozisyon seçin..."
            data={positionOptions}
            searchable
            clearable
            nothingFoundMessage="Sonuç bulunamadı"
            {...form.getInputProps('position_ids')}
          />
        </ModalSection>
      )}
    </FormModal>
  );
}

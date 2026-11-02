import { Checkbox, Grid, MultiSelect, Select, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo } from 'react';
import { z } from 'zod';
import { userLabel, type UserOption } from '@/api/reference/users';
import {
  useCreateWeldingTeam,
  usePatchWeldingTeam,
  weldingTeamErrorMessage,
  type WeldingTeam,
  type WeldingTeamInput,
} from '@/api/welding/teams';
import { FormModal, ModalSection, notify } from '@/ui';
import { foremanId, knownTeamUsers, memberIds, normalizeId, normalizeIdArray } from './teamFields';

export const weldingTeamSchema = z.object({
  // Legacy buildSavePayload trims the name and refuses an empty one.
  name: z.string().refine((v) => v.trim() !== '', 'Ekip adı zorunludur'),
  foreman: z.string().nullable(),
  members: z.array(z.string()),
  is_active: z.boolean(),
});

export type WeldingTeamFormValues = z.infer<typeof weldingTeamSchema>;

export function weldingTeamFormValues(team?: WeldingTeam | null): WeldingTeamFormValues {
  const foreman = team ? foremanId(team) : null;
  return {
    name: team?.name || '',
    foreman: foreman !== null ? String(foreman) : null,
    members: memberIds(team).map(String),
    is_active: team?.is_active !== undefined ? Boolean(team.is_active) : true,
  };
}

/** Legacy buildSavePayload. */
export function weldingTeamPayload(values: WeldingTeamFormValues): WeldingTeamInput {
  return {
    name: values.name.trim(),
    foreman: normalizeId(values.foreman),
    members: normalizeIdArray(values.members),
    is_active: values.is_active,
  };
}

export interface WeldingTeamFormModalProps {
  /** Without a team the modal creates one. */
  team?: WeldingTeam | null;
  users: readonly UserOption[];
  onClose: () => void;
  onSaved?: (team: WeldingTeam) => void;
}

/**
 * Port of the create / edit EditModals in teams.js. Mount it when it should
 * open, so the form starts from `team` each time.
 */
export function WeldingTeamFormModal({ team, users, onClose, onSaved }: WeldingTeamFormModalProps) {
  const form = useForm<WeldingTeamFormValues>({
    initialValues: weldingTeamFormValues(team),
    validate: zod4Resolver(weldingTeamSchema),
  });
  const create = useCreateWeldingTeam();
  const patch = usePatchWeldingTeam();
  const submitting = create.isPending || patch.isPending;

  // The picker lists active users only; a current foreman or member who is
  // not among them keeps an option (named from the team row) so a save does
  // not silently drop them.
  const userOptions = useMemo(() => {
    const options = users.map((user) => ({ value: String(user.id), label: userLabel(user) }));
    const listed = new Set(options.map((o) => o.value));
    for (const [id, name] of knownTeamUsers(team)) {
      if (!listed.has(String(id))) {
        options.push({ value: String(id), label: name || `Kullanıcı #${id}` });
        listed.add(String(id));
      }
    }
    for (const id of [team ? foremanId(team) : null, ...memberIds(team)]) {
      if (id !== null && !listed.has(String(id))) {
        options.push({ value: String(id), label: `Kullanıcı #${id}` });
        listed.add(String(id));
      }
    }
    return options;
  }, [users, team]);

  const save = async (values: WeldingTeamFormValues) => {
    const data = weldingTeamPayload(values);
    try {
      const saved = team
        ? await patch.mutateAsync({ id: team.id, data })
        : await create.mutateAsync(data);
      notify.success(team ? 'Ekip başarıyla güncellendi' : 'Ekip başarıyla oluşturuldu');
      onSaved?.(saved);
      onClose();
    } catch (error) {
      console.error(team ? 'Error updating team:' : 'Error creating team:', error);
      notify.error(
        weldingTeamErrorMessage(
          error,
          team ? 'Ekip güncellenirken hata oluştu' : 'Ekip oluşturulurken hata oluştu',
        ),
      );
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={team ? 'Ekibi Düzenle' : 'Yeni Ekip Oluştur'}
      subtitle={team ? team.name : undefined}
      icon={team ? 'fas fa-edit' : 'fas fa-plus-circle'}
      submitLabel={team ? 'Değişiklikleri Kaydet' : 'Ekip Oluştur'}
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Ekip Bilgileri">
        <TextInput label="Ekip Adı" withAsterisk {...form.getInputProps('name')} />
      </ModalSection>

      <ModalSection title="Atamalar">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Ustabaşı"
              placeholder="Ustabaşı seçilmedi"
              data={userOptions}
              searchable
              clearable
              nothingFoundMessage="Sonuç bulunamadı"
              {...form.getInputProps('foreman')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <MultiSelect
              label="Üyeler"
              placeholder="Üye seçin"
              data={userOptions}
              searchable
              clearable
              nothingFoundMessage="Sonuç bulunamadı"
              {...form.getInputProps('members')}
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

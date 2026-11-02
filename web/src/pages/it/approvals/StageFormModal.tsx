import { Grid, Select, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { useSaveStage, type ApprovalStage, type StageInput, type UserGroupOption } from '@/api/it/approvalPolicies';
import { FormModal, ModalSection, notify } from '@/ui';

const NAME_AND_ORDER = 'Ad ve sıra gereklidir.';

export const stageSchema = z.object({
  name: z.string().refine((v) => v.trim() !== '', NAME_AND_ORDER),
  order: z.string().refine((v) => Number.isFinite(Number.parseInt(v, 10)), NAME_AND_ORDER),
  required_approvals: z.string(),
  resolver_type: z.enum(['none', 'climb', 'department']),
  climb_levels: z.string(),
  role_user_group: z.string(),
  approver_users: z.string(),
});

export type StageFormValues = z.infer<typeof stageSchema>;

/** "12, 34, x" -> [12, 34] (legacy parseUserIds). */
export function parseUserIds(raw: string): number[] {
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

/** Port of the payload ensureStageEditModal's save callback built. */
export function stagePayload(values: StageFormValues): StageInput {
  const group = Number.parseInt(values.role_user_group, 10);
  return {
    name: values.name.trim(),
    order: Number.parseInt(values.order, 10),
    required_approvals: Number.parseInt(values.required_approvals, 10) || 1,
    approver_users: parseUserIds(values.approver_users),
    climb_levels: values.resolver_type === 'climb' ? Number.parseInt(values.climb_levels, 10) || 1 : null,
    role_user_group: values.resolver_type === 'department' && Number.isFinite(group) ? group : null,
  };
}

function resolverTypeOf(stage: ApprovalStage | null | undefined): StageFormValues['resolver_type'] {
  if (stage?.climb_levels != null) return 'climb';
  if (stage?.role_user_group != null || stage?.role_user_group_name) return 'department';
  return 'none';
}

const RESOLVER_OPTIONS = [
  { value: 'none', label: 'Sabit kullanıcılar' },
  { value: 'climb', label: 'Kademeye göre (yukarı tırman)' },
  { value: 'department', label: 'Kullanıcı grubu rolü' },
];

export interface StageFormModalProps {
  policyId: number;
  /** Without a stage the modal adds one. */
  stage?: ApprovalStage | null;
  groups: UserGroupOption[];
  onClose: () => void;
}

/** Port of openStageModal (the EditModal version). */
export function StageFormModal({ policyId, stage, groups, onClose }: StageFormModalProps) {
  const save = useSaveStage();
  const selectedGroup = stage?.role_user_group != null ? String(stage.role_user_group) : '';
  const form = useForm<StageFormValues>({
    initialValues: {
      name: stage?.name ?? '',
      order: stage?.order != null ? String(stage.order) : '',
      required_approvals: String(stage?.required_approvals ?? 1),
      resolver_type: resolverTypeOf(stage),
      climb_levels: String(stage?.climb_levels ?? 1),
      role_user_group: selectedGroup,
      approver_users: Array.isArray(stage?.approver_users) ? stage.approver_users.join(', ') : '',
    },
    validate: zod4Resolver(stageSchema),
  });

  const groupOptions = groups.map((g) => ({ value: String(g.id), label: g.display_name || g.name || `#${g.id}` }));
  // A group the list no longer has keeps its name from the stage.
  if (selectedGroup && !groupOptions.some((o) => o.value === selectedGroup)) {
    groupOptions.push({ value: selectedGroup, label: stage?.role_user_group_name || `#${selectedGroup}` });
  }

  const resolver = form.values.resolver_type;

  const submit = async (values: StageFormValues) => {
    try {
      await save.mutateAsync({ policyId, stageId: stage?.id ?? null, data: stagePayload(values) });
      notify.success(stage ? 'Aşama güncellendi.' : 'Aşama eklendi.');
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Kayıt başarısız.' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={stage ? 'Aşamayı Düzenle' : 'Aşama Ekle'}
      subtitle={stage?.name}
      icon="fas fa-list-ol"
      size="lg"
      submitting={save.isPending}
      onSubmit={form.onSubmit(submit)}
    >
      <ModalSection title="Aşama" icon="fas fa-list-ol">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput label="Ad" withAsterisk {...form.getInputProps('name')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput label="Sıra" type="number" min={1} withAsterisk {...form.getInputProps('order')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Gerekli Onay Sayısı"
              type="number"
              min={1}
              {...form.getInputProps('required_approvals')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Onaylayıcı Çözümü"
              data={RESOLVER_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps('resolver_type')}
            />
          </Grid.Col>
          {resolver === 'climb' ? (
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label="Kaç kademe yukarı?" type="number" min={1} {...form.getInputProps('climb_levels')} />
            </Grid.Col>
          ) : null}
          {resolver === 'department' ? (
            <Grid.Col span={12}>
              <Select
                label="Kullanıcı Grubu"
                placeholder="Seçiniz..."
                data={groupOptions}
                searchable
                clearable
                nothingFoundMessage="Sonuç bulunamadı"
                {...form.getInputProps('role_user_group')}
                onChange={(value) => form.setFieldValue('role_user_group', value ?? '')}
              />
            </Grid.Col>
          ) : null}
          {resolver === 'none' ? (
            <Grid.Col span={12}>
              <Textarea
                label="Sabit Onaylayıcı Kullanıcı ID’leri"
                placeholder="örn: 12, 34, 56"
                description="Virgülle ayrılmış kullanıcı ID listesi."
                rows={2}
                {...form.getInputProps('approver_users')}
              />
            </Grid.Col>
          ) : null}
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

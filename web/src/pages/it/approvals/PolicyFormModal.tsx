import { Checkbox, Grid, Select, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  useApprovalSubjectTypes,
  useSavePolicy,
  type ApprovalPolicy,
  type PolicyInput,
} from '@/api/it/approvalPolicies';
import { FormModal, ModalSection, notify } from '@/ui';
import { PURCHASE_REQUEST } from './approvalsMeta';

const REQUIRED = 'Bu alan gereklidir';

export const policySchema = z.object({
  subject_type: z.string().min(1, REQUIRED),
  name: z.string().refine((v) => v.trim() !== '', 'Ad gereklidir.'),
  min_amount_eur: z.string(),
  max_amount_eur: z.string(),
  selection_priority: z.string(),
  is_active: z.boolean(),
});

export type PolicyFormValues = z.infer<typeof policySchema>;

const asText = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/** Port of the payload openPolicyModal's save callback built. */
export function policyPayload(values: PolicyFormValues): PolicyInput {
  const subjectType = values.subject_type.trim();
  const purchase = subjectType === PURCHASE_REQUEST;
  const min = values.min_amount_eur.trim();
  const max = values.max_amount_eur.trim();
  return {
    name: values.name.trim(),
    subject_type: subjectType || null,
    is_active: values.is_active,
    selection_priority: Number.parseInt(values.selection_priority, 10) || 100,
    min_amount_eur: purchase && min !== '' ? Number(min) : null,
    max_amount_eur: purchase && max !== '' ? Number(max) : null,
  };
}

export interface PolicyFormModalProps {
  /** Without a policy the modal creates one. */
  policy?: ApprovalPolicy | null;
  onClose: () => void;
}

export function PolicyFormModal({ policy, onClose }: PolicyFormModalProps) {
  const subjectTypes = useApprovalSubjectTypes();
  const save = useSavePolicy();
  const form = useForm<PolicyFormValues>({
    initialValues: {
      subject_type: policy?.subject_type ? String(policy.subject_type) : '',
      name: policy?.name || '',
      min_amount_eur: asText(policy?.min_amount_eur),
      max_amount_eur: asText(policy?.max_amount_eur),
      selection_priority: asText(policy?.selection_priority ?? 100),
      is_active: policy?.is_active !== false,
    },
    validate: zod4Resolver(policySchema),
  });

  const options = (subjectTypes.data ?? [])
    .map((x) => ({ value: asText(x.value), label: asText(x.label) }))
    .filter((x) => x.value && x.label);
  const showBounds = form.values.subject_type === PURCHASE_REQUEST;

  const submit = async (values: PolicyFormValues) => {
    try {
      await save.mutateAsync({ id: policy?.id ?? null, data: policyPayload(values) });
      notify.success(policy ? 'Politika güncellendi.' : 'Politika oluşturuldu.');
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Kayıt başarısız.' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={policy ? 'Politikayı Düzenle' : 'Yeni Politika'}
      subtitle={policy?.name}
      icon="fas fa-layer-group"
      size="lg"
      submitting={save.isPending}
      onSubmit={form.onSubmit(submit)}
    >
      <ModalSection title="Politika" icon="fas fa-layer-group">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <Select
              label="Konu Türü"
              placeholder="Seçiniz..."
              data={options}
              searchable
              withAsterisk
              allowDeselect={false}
              nothingFoundMessage="Sonuç bulunamadı"
              {...form.getInputProps('subject_type')}
              onChange={(value) => {
                form.setFieldValue('subject_type', value ?? '');
                // Bounds belong to purchase requests only; legacy emptied them on switch.
                if (value !== PURCHASE_REQUEST) {
                  form.setFieldValue('min_amount_eur', '');
                  form.setFieldValue('max_amount_eur', '');
                }
              }}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput label="Ad" withAsterisk {...form.getInputProps('name')} />
          </Grid.Col>
          {showBounds ? (
            <>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput
                  label="Min. Tutar (€)"
                  type="number"
                  min={0}
                  step={0.01}
                  {...form.getInputProps('min_amount_eur')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput
                  label="Maks. Tutar (€)"
                  type="number"
                  min={0}
                  step={0.01}
                  {...form.getInputProps('max_amount_eur')}
                />
              </Grid.Col>
            </>
          ) : null}
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Seçim Önceliği"
              type="number"
              min={1}
              description="Düşük sayı daha yüksek öncelik demektir (1, 100’den önce gelir)."
              {...form.getInputProps('selection_priority')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Checkbox label="Aktif (kullanımda)" {...form.getInputProps('is_active', { type: 'checkbox' })} />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

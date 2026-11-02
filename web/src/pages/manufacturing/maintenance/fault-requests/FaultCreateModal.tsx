import { Checkbox, Grid, Select, Stack, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  machineDropdownQueryOptions,
  useCreateMaintenanceRequest,
  type MaintenanceRequestInput,
} from '@/api/maintenance/faults';
import { errorMessage, FaIcon, FormModal, ModalSection, notify } from '@/ui';

// Legacy handleCreateFaultSubmit checks, in its order and with its messages.
export const faultRequestSchema = z
  .object({
    use_custom_equipment: z.boolean(),
    machine: z.string(),
    asset_name: z.string(),
    location: z.string(),
    description: z.string(),
    type: z.string(),
    is_breaking: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.description.trim())
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'Açıklama zorunludur' });
    if (!v.type) ctx.addIssue({ code: 'custom', path: ['type'], message: 'Tür seçimi zorunludur' });
    if (!v.use_custom_equipment) {
      if (!v.machine) {
        ctx.addIssue({
          code: 'custom',
          path: ['machine'],
          message: 'Kayıtlı ekipman seçimi zorunludur',
        });
      }
    } else {
      if (!v.asset_name.trim())
        ctx.addIssue({ code: 'custom', path: ['asset_name'], message: 'Ekipman adı zorunludur' });
      if (!v.location.trim())
        ctx.addIssue({ code: 'custom', path: ['location'], message: 'Konum bilgisi zorunludur' });
    }
  });

export type FaultRequestFormValues = z.infer<typeof faultRequestSchema>;

const INITIAL: FaultRequestFormValues = {
  use_custom_equipment: false,
  machine: '',
  asset_name: '',
  location: '',
  description: '',
  type: '',
  is_breaking: false,
};

const TYPE_OPTIONS = [
  { value: 'fault', label: 'Arıza' },
  { value: 'maintenance', label: 'Bakım' },
];

/** The POST body legacy built: a machine id, or the typed-in asset and location. */
export function faultRequestPayload(values: FaultRequestFormValues): MaintenanceRequestInput {
  const data: MaintenanceRequestInput = {
    description: values.description.trim(),
    is_maintenance: values.type === 'maintenance',
    is_breaking: values.type !== 'maintenance' && values.is_breaking,
  };
  if (values.use_custom_equipment) {
    data.asset_name = values.asset_name.trim();
    data.location = values.location.trim();
  } else {
    data.machine = Number.parseInt(values.machine, 10);
  }
  return data;
}

/**
 * Port of the create modal in list.js. Mount it when it opens, so it starts
 * empty each time (legacy resetCreateFaultFormState).
 */
export function FaultCreateModal({ onClose }: { onClose: () => void }) {
  const form = useForm<FaultRequestFormValues>({
    initialValues: INITIAL,
    validate: zod4Resolver(faultRequestSchema),
  });
  const machines = useQuery(machineDropdownQueryOptions());
  const machineData = (machines.data ?? []).map((m) => ({ value: String(m.id), label: m.name }));
  const create = useCreateMaintenanceRequest();
  const custom = form.values.use_custom_equipment;
  // "Makine durdu" only applies to a fault (legacy toggleBreakingCheckbox).
  const showBreaking = form.values.type !== 'maintenance';

  const save = async (values: FaultRequestFormValues) => {
    try {
      await create.mutateAsync(faultRequestPayload(values));
      notify.success('Arıza talebi başarıyla oluşturuldu');
      onClose();
    } catch (error) {
      notify.error(`Arıza talebi oluşturulurken hata oluştu: ${errorMessage(error)}`);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Arıza Talebi"
      icon="fas fa-exclamation-triangle"
      size="lg"
      submitLabel="Gönder"
      submitIcon="fas fa-paper-plane"
      submitting={create.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Ekipman Seçimi">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <Checkbox
              label="Özel Ekipman Bilgisi Gir"
              description="Kayıtlı olmayan ekipman için özel bilgi girmek istiyorsanız işaretleyin"
              {...form.getInputProps('use_custom_equipment', { type: 'checkbox' })}
              onChange={(event) => {
                // Legacy toggleCustomEquipmentFields empties the fields it hides.
                const checked = event.currentTarget.checked;
                form.setValues(
                  checked
                    ? { use_custom_equipment: true, machine: '' }
                    : { use_custom_equipment: false, asset_name: '', location: '' },
                );
                form.clearErrors();
              }}
            />
          </Grid.Col>
          {custom ? (
            <>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput
                  label="Ekipman Adı"
                  placeholder="Ekipman adını girin..."
                  withAsterisk
                  leftSection={<FaIcon icon="fas fa-tag" />}
                  {...form.getInputProps('asset_name')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput
                  label="Konum"
                  placeholder="Ekipman konumunu girin..."
                  withAsterisk
                  leftSection={<FaIcon icon="fas fa-map-marker-alt" />}
                  {...form.getInputProps('location')}
                />
              </Grid.Col>
            </>
          ) : (
            <Grid.Col span={12}>
              <Select
                label="Kayıtlı Ekipman"
                placeholder="Ekipman seçin..."
                withAsterisk
                searchable
                nothingFoundMessage="Ekipman bulunamadı"
                data={machineData}
                leftSection={<FaIcon icon="fas fa-cog" />}
                {...form.getInputProps('machine')}
                onChange={(value) => form.setFieldValue('machine', value ?? '')}
              />
            </Grid.Col>
          )}
        </Grid>
      </ModalSection>

      <ModalSection title="Arıza Bilgileri">
        <Stack gap="sm">
          <Textarea
            label="Açıklama"
            placeholder="Arıza veya bakım detaylarını açıklayın"
            withAsterisk
            rows={4}
            {...form.getInputProps('description')}
          />
          <Select
            label="Tür"
            placeholder="Tür seçin..."
            withAsterisk
            data={TYPE_OPTIONS}
            allowDeselect={false}
            leftSection={<FaIcon icon="fas fa-tools" />}
            {...form.getInputProps('type')}
            onChange={(value) => {
              form.setFieldValue('type', value ?? '');
              if (value === 'maintenance') form.setFieldValue('is_breaking', false);
            }}
          />
          {showBreaking ? (
            <Checkbox
              label="Makine durdu"
              description="Ekipman arıza nedeniyle çalışmıyorsa işaretleyin"
              {...form.getInputProps('is_breaking', { type: 'checkbox' })}
            />
          ) : null}
        </Stack>
      </ModalSection>
    </FormModal>
  );
}

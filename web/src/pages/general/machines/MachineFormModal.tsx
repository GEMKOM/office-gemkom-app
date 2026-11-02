import { Grid, MultiSelect, Select, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo } from 'react';
import { z } from 'zod';
import {
  machineTypesQueryOptions,
  machineUsedInQueryOptions,
  useCreateMachine,
  useUpdateMachine,
  type MachineInput,
  type MachineRecord,
} from '@/api/general/machines';
import { usersQueryOptions } from '@/api/reference/users';
import { FormModal, ModalSection, notify } from '@/ui';
import { assignedUserId, assignedUserName } from './machineUsers';

const REQUIRED = 'Bu alan gereklidir';

function parseProperties(text: string): Record<string, unknown> | null {
  if (!text.trim()) return {};
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const machineSchema = z.object({
  name: z.string().trim().min(1, REQUIRED),
  code: z.string(),
  machine_type: z.string().min(1, REQUIRED),
  assigned_users: z.array(z.string()),
  used_in: z.string().min(1, REQUIRED),
  is_active: z.enum(['true', 'false']),
  // Legacy dropped the save silently on bad JSON; say why instead.
  properties: z
    .string()
    .refine((v) => parseProperties(v) !== null, 'Geçerli bir JSON nesnesi girin'),
});

export type MachineFormValues = z.infer<typeof machineSchema>;

export function machineFormValues(machine?: MachineRecord | null): MachineFormValues {
  return {
    name: machine?.name || '',
    code: machine?.code || '',
    machine_type:
      machine?.machine_type || (machine?.type_id != null ? String(machine.type_id) : ''),
    assigned_users: (machine?.assigned_users ?? []).map((u) => String(assignedUserId(u))),
    used_in: machine?.used_in || '',
    is_active: !machine || machine.is_active ? 'true' : 'false',
    properties:
      machine?.properties && typeof machine.properties === 'object'
        ? JSON.stringify(machine.properties, null, 2)
        : '',
  };
}

/** The body saveMachine / updateMachine built from the form. */
export function machinePayload(values: MachineFormValues): MachineInput {
  return {
    name: values.name,
    code: values.code || null,
    machine_type: values.machine_type,
    used_in: values.used_in,
    is_active: values.is_active === 'true',
    assigned_users: values.assigned_users.map(Number),
    properties: parseProperties(values.properties) ?? {},
  };
}

const STATUS_DATA = [
  { value: 'true', label: 'Aktif' },
  { value: 'false', label: 'Pasif' },
];

export interface MachineFormModalProps {
  /** Without a machine the modal creates one. */
  machine?: MachineRecord | null;
  onClose: () => void;
  onSaved?: () => void;
}

/** Port of the create/edit EditModals in machineList.js. Mount it to open it. */
export function MachineFormModal({ machine, onClose, onSaved }: MachineFormModalProps) {
  const form = useForm<MachineFormValues>({
    initialValues: machineFormValues(machine),
    validate: zod4Resolver(machineSchema),
  });
  const types = useQuery(machineTypesQueryOptions());
  const usedIn = useQuery(machineUsedInQueryOptions());
  const users = useQuery(usersQueryOptions());
  const create = useCreateMachine();
  const update = useUpdateMachine();

  const userData = useMemo(() => {
    const options = new Map<string, string>();
    for (const user of users.data ?? []) {
      options.set(
        String(user.id),
        `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
      );
    }
    // Keep users already on the machine even when the active-user list lacks them.
    for (const user of machine?.assigned_users ?? []) {
      const id = String(assignedUserId(user));
      if (!options.has(id)) options.set(id, assignedUserName(user, users.data ?? []));
    }
    return [...options].map(([value, label]) => ({ value, label }));
  }, [users.data, machine]);

  const save = async (values: MachineFormValues) => {
    const data = machinePayload(values);
    try {
      if (machine) await update.mutateAsync({ id: machine.id, data });
      else await create.mutateAsync(data);
      notify.success(machine ? 'Makine başarıyla güncellendi' : 'Makine başarıyla oluşturuldu');
      onSaved?.();
      onClose();
    } catch (error) {
      notify.error(error, {
        fallback: machine
          ? 'Makine güncellenirken hata oluştu'
          : 'Makine oluşturulurken hata oluştu',
      });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={machine ? 'Makine Düzenle' : 'Yeni Makine Oluştur'}
      subtitle={machine ? [machine.code, machine.name].filter(Boolean).join(' · ') : undefined}
      icon={machine ? 'fas fa-edit' : 'fas fa-plus-circle'}
      size="lg"
      submitLabel={machine ? 'Değişiklikleri Kaydet' : 'Makine Oluştur'}
      submitting={create.isPending || update.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Makine Adı"
              placeholder="Makine adını girin"
              description="Makinenin tanımlayıcı adı"
              withAsterisk
              {...form.getInputProps('name')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Makine Kodu"
              placeholder="Makine kodunu girin"
              description="Opsiyonel, benzersiz makine kodu"
              {...form.getInputProps('code')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Makine Tipi"
              placeholder="Makine tipi seçin..."
              description="Makinenin kategorisi"
              data={types.data ?? []}
              withAsterisk
              {...form.getInputProps('machine_type')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <MultiSelect
              label="Atanan Kullanıcılar"
              placeholder="Kullanıcı seçin..."
              description="Bu makineden sorumlu kullanıcılar"
              data={userData}
              searchable
              {...form.getInputProps('assigned_users')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Kullanım Alanı"
              placeholder="Kullanım alanı seçin..."
              description="Makinenin kullanıldığı alan"
              data={usedIn.data ?? []}
              withAsterisk
              {...form.getInputProps('used_in')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Durum"
              description="Makinenin mevcut durumu"
              data={STATUS_DATA}
              allowDeselect={false}
              {...form.getInputProps('is_active')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Özellikler" icon="fas fa-list">
        <Textarea
          label="Makine Özellikleri"
          placeholder='Özellikleri JSON formatında girin (örn: {"kapasite": "1000", "güç": "5kW"})'
          description="Makine özelliklerini JSON formatında girin"
          rows={4}
          styles={{ input: { fontFamily: 'var(--gk-font-mono)' } }}
          {...form.getInputProps('properties')}
        />
      </ModalSection>
    </FormModal>
  );
}

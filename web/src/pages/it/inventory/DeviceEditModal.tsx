import { ActionIcon, Button, Grid, Group, MultiSelect, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { randomId } from '@mantine/hooks';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo } from 'react';
import { z } from 'zod';
import {
  useMachineTypes,
  useUpdateItDevice,
  type ItDevice,
  type ItDeviceUpdate,
} from '@/api/it/inventory';
import { useUsers, type UserOption } from '@/api/reference/users';
import { FaIcon, FormModal, ModalSection, errorMessage, notify } from '@/ui';
import { deviceUserName, propertyEntries } from './columns';

const REQUIRED = 'Bu alan gereklidir';

const USED_IN_OPTIONS = [{ value: 'it', label: 'Bilgi İşlem' }];
const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Pasif' },
];

// Required set = legacy EditModal (name, machine_type, used_in).
export const deviceSchema = z.object({
  name: z.string({ error: REQUIRED }).min(1, REQUIRED),
  code: z.string(),
  machine_type: z.string({ error: REQUIRED }).min(1, REQUIRED),
  assigned_users: z.array(z.string()),
  used_in: z.string({ error: REQUIRED }).min(1, REQUIRED),
  is_active: z.string(),
  properties: z.array(z.object({ id: z.string(), key: z.string(), value: z.string() })),
});

export type DeviceFormValues = z.infer<typeof deviceSchema>;
type PropertyRow = DeviceFormValues['properties'][number];

const propertyRow = (key = '', value = ''): PropertyRow => ({ id: randomId(), key, value });

export function deviceFormValues(device: ItDevice): DeviceFormValues {
  const entries = propertyEntries(device);
  return {
    name: device.name || '',
    code: device.code || '',
    machine_type: device.machine_type || '',
    assigned_users: (device.assigned_users ?? []).map((user) => String(user.id)),
    used_in: device.used_in || 'it',
    is_active: device.is_active ? 'active' : 'inactive',
    // One empty row when the device has none (legacy).
    properties: entries.length
      ? entries.map(([key, value]) => propertyRow(key, String(value)))
      : [propertyRow()],
  };
}

/**
 * Legacy collectPropertiesFromForm: rows without a key are dropped; 'true' /
 * 'false' become booleans and numeric text becomes a number.
 */
export function collectProperties(rows: PropertyRow[]): ItDeviceUpdate['properties'] {
  const props: ItDeviceUpdate['properties'] = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key) continue;
    if (value === 'true') props[key] = true;
    else if (value === 'false') props[key] = false;
    else if (value !== '' && !Number.isNaN(Number(value))) props[key] = Number(value);
    else props[key] = value;
  }
  return props;
}

/** Legacy updateDevice body. */
export function deviceUpdateBody(values: DeviceFormValues): ItDeviceUpdate {
  return {
    name: values.name,
    code: values.code || null,
    machine_type: values.machine_type,
    used_in: values.used_in,
    is_active: values.is_active === 'active',
    assigned_users: values.assigned_users.map((id) => Number.parseInt(id, 10)),
    properties: collectProperties(values.properties),
  };
}

/** Legacy picker label: "Ad Soyad" when both are set, else the username. */
function userOptionLabel(user: Pick<UserOption, 'username' | 'first_name' | 'last_name'>): string {
  return user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username;
}

export interface DeviceEditModalProps {
  device: ItDevice;
  onClose: () => void;
}

/** Port of legacy editDevice / updateDevice. Mount it to open it. */
export function DeviceEditModal({ device, onClose }: DeviceEditModalProps) {
  const form = useForm<DeviceFormValues>({
    initialValues: deviceFormValues(device),
    validate: zod4Resolver(deviceSchema),
  });
  const types = useMachineTypes();
  const users = useUsers({ is_active: true });
  const update = useUpdateItDevice();

  const typeData = types.data ?? [];
  const userData = useMemo(() => {
    const options = (users.data ?? []).map((user) => ({ value: String(user.id), label: userOptionLabel(user) }));
    // Keep users already on the device selectable even when they are not in
    // the active list, so saving does not silently drop them.
    const known = new Set(options.map((o) => o.value));
    for (const user of device.assigned_users ?? []) {
      if (!known.has(String(user.id))) options.push({ value: String(user.id), label: deviceUserName(user) });
    }
    return options;
  }, [users.data, device.assigned_users]);

  const save = async (values: DeviceFormValues) => {
    try {
      await update.mutateAsync({ id: device.id, data: deviceUpdateBody(values) });
      notify.success('Cihaz başarıyla güncellendi');
      onClose();
    } catch (error) {
      notify.error(`Cihaz güncellenirken hata oluştu: ${errorMessage(error, 'Bilinmeyen hata')}`);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Cihaz Düzenle"
      subtitle={[device.code, device.name].filter(Boolean).join(' · ')}
      icon="fas fa-edit"
      size="lg"
      submitting={update.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Cihaz Adı"
              placeholder="Cihaz adını girin"
              withAsterisk
              {...form.getInputProps('name')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Cihaz Kodu" placeholder="Cihaz kodunu girin" {...form.getInputProps('code')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Cihaz Tipi"
              placeholder="Cihaz tipi seçin..."
              withAsterisk
              data={typeData}
              searchable
              allowDeselect={false}
              nothingFoundMessage="Sonuç bulunamadı"
              {...form.getInputProps('machine_type')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <MultiSelect
              label="Atanan Kullanıcılar"
              placeholder="Kullanıcı seçin..."
              data={userData}
              searchable
              clearable
              nothingFoundMessage="Sonuç bulunamadı"
              {...form.getInputProps('assigned_users')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Kullanım Alanı"
              placeholder="Kullanım alanı seçin..."
              withAsterisk
              data={USED_IN_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps('used_in')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Durum"
              placeholder="Durum seçin..."
              data={STATUS_OPTIONS}
              allowDeselect={false}
              {...form.getInputProps('is_active')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Özellikler" icon="fas fa-list">
        <Stack gap="xs">
          {form.values.properties.map((row, index) => (
            <Group key={row.id} gap="xs" wrap="nowrap" align="center">
              <TextInput
                style={{ flex: 1 }}
                size="xs"
                placeholder="Özellik adı"
                aria-label={`Özellik adı ${index + 1}`}
                {...form.getInputProps(`properties.${index}.key`)}
              />
              <TextInput
                style={{ flex: 1 }}
                size="xs"
                placeholder="Değer"
                aria-label={`Değer ${index + 1}`}
                {...form.getInputProps(`properties.${index}.value`)}
              />
              <ActionIcon
                variant="light"
                color="red"
                aria-label="Özelliği kaldır"
                onClick={() => form.removeListItem('properties', index)}
              >
                <FaIcon icon="fas fa-trash" />
              </ActionIcon>
            </Group>
          ))}
          <Group>
            <Button
              size="xs"
              variant="light"
              color="green"
              leftSection={<FaIcon icon="fas fa-plus" />}
              onClick={() => form.insertListItem('properties', propertyRow())}
            >
              Özellik Ekle
            </Button>
          </Group>
        </Stack>
      </ModalSection>
    </FormModal>
  );
}

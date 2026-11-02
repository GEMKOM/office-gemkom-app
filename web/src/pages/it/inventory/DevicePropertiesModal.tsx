import { Text } from '@mantine/core';
import type { ItDevice } from '@/api/it/inventory';
import { DetailModal, type DetailSection } from '@/ui';
import { propertyEntries } from './columns';

export interface DevicePropertiesModalProps {
  device: ItDevice;
  onClose: () => void;
}

/** Port of legacy showDeviceProperties: every property as a copyable field. */
export function DevicePropertiesModal({ device, onClose }: DevicePropertiesModalProps) {
  const entries = propertyEntries(device);
  const sections: DetailSection[] =
    entries.length === 0
      ? [
          {
            title: 'Özellikler',
            icon: 'fas fa-list',
            content: (
              <Text c="dimmed" ta="center" py="md" size="sm">
                Bu cihaz için tanımlanmış özellik bulunamadı.
              </Text>
            ),
          },
        ]
      : [
          {
            title: 'Cihaz Özellikleri',
            icon: 'fas fa-list',
            fields: entries.map(([key, value]) => ({
              label: key,
              value,
              type: typeof value === 'boolean' ? 'boolean' : 'text',
              span: 6,
              copyable: true,
            })),
          },
        ];

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Cihaz Özellikleri - ${device.name || 'Bilinmeyen Cihaz'}`}
      icon="fas fa-list"
      size="lg"
      sections={sections}
    />
  );
}

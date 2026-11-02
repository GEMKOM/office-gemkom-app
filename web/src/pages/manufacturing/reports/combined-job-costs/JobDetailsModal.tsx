import { Button, Group, Text } from '@mantine/core';
import { DetailModal, FaIcon, type DetailSection } from '@/ui';
import { hours, machiningHours, weldingHours, type CombinedJobCostRow } from './columns';

export interface JobDetailsModalProps {
  row: CombinedJobCostRow;
  onClose: () => void;
  onShowMachining: () => void;
  onShowWelding: () => void;
}

function department(
  title: string,
  icon: string,
  total: number | null,
  empty: string,
  onShow: () => void,
): DetailSection {
  // Both departments always show, even without data (legacy).
  if (total === null) {
    return {
      title,
      icon,
      content: (
        <Text c="dimmed" ta="center" py="sm" size="sm">
          {empty}
        </Text>
      ),
    };
  }
  return {
    title,
    icon,
    fields: [{ label: 'Toplam Saat', render: hours(total), span: 12 }],
    content: (
      <Group justify="center" mt="sm">
        <Button variant="light" leftSection={<FaIcon icon="fas fa-table" />} onClick={onShow}>
          Detayları Görüntüle
        </Button>
      </Group>
    ),
  };
}

/** Legacy showJobDetails: built from the loaded row, no request of its own. */
export function JobDetailsModal({
  row,
  onClose,
  onShowMachining,
  onShowWelding,
}: JobDetailsModalProps) {
  const sections: DetailSection[] = [
    {
      title: 'Özet',
      icon: 'fas fa-chart-pie',
      fields: [{ label: 'Toplam Saat', render: hours(row.combined_total_hours), span: 12 }],
    },
    department(
      'Talaşlı İmalat Departmanı',
      'fas fa-cog',
      machiningHours(row.raw),
      'Bu iş için talaşlı imalat verisi bulunmamaktadır.',
      onShowMachining,
    ),
    department(
      'Kaynaklı İmalat Departmanı',
      'fas fa-fire',
      weldingHours(row.raw),
      'Bu iş için kaynaklı imalat verisi bulunmamaktadır.',
      onShowWelding,
    ),
  ];

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${row.job_no} - İş Maliyeti Detayları`}
      icon="fas fa-calculator"
      size="lg"
      sections={sections}
    />
  );
}

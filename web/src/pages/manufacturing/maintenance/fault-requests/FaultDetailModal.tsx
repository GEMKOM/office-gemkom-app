import type { MachineFault } from '@/api/maintenance/faults';
import { DetailModal, type DetailSection } from '@/ui';
import { faultTypeLabel } from '../shared';
import { faultStatusLabel, openDuration } from './columns';

/** Legacy showFaultDetails: "asset - location" here, not the table's em dash. */
function machineDisplay(fault: MachineFault): string {
  if (fault.machine_name) return fault.machine_name;
  if (fault.asset_name && fault.location) return `${fault.asset_name} - ${fault.location}`;
  return fault.asset_name || '-';
}

/** Legacy buildOpenDurationText: long units, "(hâlâ açık)" while unresolved. */
function openDurationText(fault: MachineFault): string {
  if (!fault.reported_at) return '-';
  const label = openDuration(fault, true);
  return fault.resolved_at ? label : `${label} (hâlâ açık)`;
}

function sections(fault: MachineFault): DetailSection[] {
  return [
    {
      title: 'Genel Bilgiler',
      icon: 'fas fa-info-circle',
      fields: [
        { label: 'ID', value: fault.id, span: 3 },
        { label: 'Durum', value: faultStatusLabel(fault), span: 4 },
        { label: 'Tür', value: faultTypeLabel(fault), span: 5 },
      ],
    },
    {
      title: 'Ekipman',
      icon: 'fas fa-cogs',
      fields: [{ label: 'Ekipman', value: machineDisplay(fault), span: 12 }],
    },
    {
      title: 'Açıklamalar',
      icon: 'fas fa-align-left',
      fields: [
        { label: 'Açıklama', value: fault.description || '-', span: 12 },
        {
          label: 'Çözüm Açıklaması',
          value: fault.resolution_description,
          span: 12,
          hidden: !fault.resolution_description,
        },
      ],
    },
    {
      title: 'Zaman & Kullanıcı',
      icon: 'fas fa-user-clock',
      fields: [
        {
          label: 'Bildiren',
          value: fault.reported_by_full_name || fault.reported_by_username || '-',
        },
        { label: 'Bildirilme Tarihi', value: fault.reported_at, type: 'datetime' },
        { label: 'Çözen', value: fault.resolved_by_full_name || fault.resolved_by_username || '-' },
        { label: 'Çözüm Tarihi', value: fault.resolved_at, type: 'datetime' },
        { label: 'Açık Süre', value: openDurationText(fault), span: 12 },
      ],
    },
  ];
}

/** Port of the view modal in list.js (showFaultDetails). */
export function FaultDetailModal({ fault, onClose }: { fault: MachineFault; onClose: () => void }) {
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Arıza Talebi #${fault.id}`}
      icon="fas fa-eye"
      size="lg"
      sections={sections(fault)}
    />
  );
}

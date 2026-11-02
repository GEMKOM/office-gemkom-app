import { Text } from '@mantine/core';
import type { MachineFault } from '@/api/maintenance/faults';
import { formatDate, toDate } from '@/lib/format';
import { FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { faultTypeLabel, FaultTypeBadge } from '../shared';

/** Ekipman column: the machine, else the typed-in asset with its location. */
export function equipmentName(fault: MachineFault): string {
  const machine = fault.machine_name?.trim();
  if (machine) return machine;
  if (!fault.asset_name) return '-';
  return fault.location ? `${fault.asset_name} — ${fault.location}` : fault.asset_name;
}

/** Legacy getStatusBadge text. */
export function faultStatusLabel(fault: MachineFault): string {
  if (fault.resolved_at) return 'Çözüldü';
  if (fault.is_breaking) return 'Makine Duruşta';
  return 'Bekleyen';
}

export function reporterName(fault: MachineFault): string {
  return fault.reported_by_full_name || fault.reported_by_username || 'Bilinmiyor';
}

export function resolverName(fault: MachineFault): string {
  return fault.resolved_by_full_name || fault.resolved_by_username || '';
}

function openSeconds(fault: MachineFault): number | null {
  const start = toDate(fault.reported_at);
  if (!start) return null;
  const end = fault.resolved_at ? toDate(fault.resolved_at) : null;
  return Math.floor(((end ?? new Date()).getTime() - start.getTime()) / 1000);
}

/** Legacy formatOpenDuration / buildOpenDurationText units: short (2g 3s 5d) or long (2 gün 3 saat 5 dakika). */
export function openDuration(fault: MachineFault, long = false): string {
  const total = openSeconds(fault);
  if (total === null) return '-';
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(long ? `${d} gün` : `${d}g`);
  if (h) parts.push(long ? `${h} saat` : `${h}s`);
  if (m || parts.length === 0) parts.push(long ? `${m} dakika` : `${m}d`);
  return parts.join(' ');
}

function OpenDuration({ fault }: { fault: MachineFault }) {
  const total = openSeconds(fault);
  if (total === null) return <>-</>;
  const text = openDuration(fault);
  if (fault.resolved_at) {
    return (
      <Text span size="sm" c="dimmed" title="Açıkken geçen süre">
        {text}
      </Text>
    );
  }
  // Still open: coloured by how long it has waited (legacy thresholds).
  const hours = total / 3600;
  const color = hours > 24 ? 'red.7' : hours > 8 ? 'orange.7' : 'green.7';
  return (
    <Text span size="sm" fw={600} c={color} title="Hâlâ açık" style={{ whiteSpace: 'nowrap' }}>
      {text}{' '}
      <FaIcon icon="fas fa-circle" style={{ fontSize: '0.45rem', verticalAlign: 'middle' }} />
    </Text>
  );
}

function StatusCell({ fault }: { fault: MachineFault }) {
  const color = fault.resolved_at ? 'green' : fault.is_breaking ? 'red' : 'yellow';
  return <StatusBadge color={color}>{faultStatusLabel(fault)}</StatusBadge>;
}

// Legacy table: day, short month, year and time ("12 Oca 2026 14:05").
const DATE_TIME: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

// Module scope so DataTable rows stay memoized. Legacy marked these sortable
// but never handled the sort (no onSort), so the headers did nothing; the
// endpoint's ordering support is unknown, so they are left unsortable.
export const faultColumns: DataTableColumn<MachineFault>[] = [
  {
    key: 'id',
    header: 'ID',
    render: (row) => <span className={uiClasses.code}>{row.id || '-'}</span>,
  },
  {
    key: 'machine_name',
    header: 'Ekipman',
    render: (row) => equipmentName(row),
    exportValue: (row) => equipmentName(row),
  },
  {
    key: 'description',
    header: 'Açıklama',
    render: (row) => {
      const text = row.description?.trim();
      if (!text) return '-';
      return <span title={text}>{text.length > 80 ? `${text.slice(0, 80)}…` : text}</span>;
    },
    exportValue: (row) => row.description || '',
  },
  {
    key: 'status',
    header: 'Durum',
    render: (row) => <StatusCell fault={row} />,
    exportValue: (row) => faultStatusLabel(row),
  },
  {
    key: 'is_breaking',
    header: 'Tür',
    render: (row) => <FaultTypeBadge fault={row} />,
    exportValue: (row) => faultTypeLabel(row),
  },
  {
    key: 'reported_by_full_name',
    header: 'Bildiren',
    render: (row) => reporterName(row),
    exportValue: (row) => reporterName(row),
  },
  {
    key: 'reported_at',
    header: 'Bildirilme',
    render: (row) => formatDate(row.reported_at, DATE_TIME),
    exportValue: (row) => toDate(row.reported_at),
  },
  {
    key: 'open_duration_seconds',
    header: 'Açık Süre',
    render: (row) => <OpenDuration fault={row} />,
    exportValue: (row) => openDuration(row),
  },
  {
    key: 'resolved_by_full_name',
    header: 'Çözen',
    render: (row) => resolverName(row) || '-',
    exportValue: (row) => resolverName(row),
  },
  {
    key: 'resolved_at',
    header: 'Çözüm Tarihi',
    render: (row) => formatDate(row.resolved_at, DATE_TIME),
    exportValue: (row) => toDate(row.resolved_at),
  },
];

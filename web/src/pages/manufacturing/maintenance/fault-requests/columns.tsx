import { Stack, Text, Tooltip } from '@mantine/core';
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

const nowrap = { whiteSpace: 'nowrap' } as const;

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
      <Text span size="sm" c="dimmed" title="Açıkken geçen süre" style={nowrap}>
        {text}
      </Text>
    );
  }
  // Still open: coloured by how long it has waited (legacy thresholds).
  const hours = total / 3600;
  const color = hours > 24 ? 'red.7' : hours > 8 ? 'orange.7' : 'green.7';
  return (
    <Text span size="sm" fw={600} c={color} title="Hâlâ açık" style={nowrap}>
      {text}{' '}
      <FaIcon icon="fas fa-circle" style={{ fontSize: '0.45rem', verticalAlign: 'middle' }} />
    </Text>
  );
}

export function FaultStatusBadge({ fault }: { fault: MachineFault }) {
  const color = fault.resolved_at ? 'green' : fault.is_breaking ? 'red' : 'yellow';
  return <StatusBadge color={color}>{faultStatusLabel(fault)}</StatusBadge>;
}

// Short so the table fits: "30.10.26 11:05".
const DATE_TIME: Intl.DateTimeFormatOptions = {
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
};

/** One line cut to `width`; the whole text on hover when it may not fit. */
function Clipped({ text, width }: { text: string; width: number }) {
  // About 7px a character at the table's font size.
  const long = text.length * 7 > width;
  return (
    <Tooltip label={text} multiline maw={360} openDelay={250} disabled={!long} withinPortal>
      <Text span size="sm" display="block" maw={width} truncate="end">
        {text}
      </Text>
    </Tooltip>
  );
}

/** A person with the time under it, small and muted. */
function PersonAt({ name, at }: { name: string; at: string | null | undefined }) {
  if (!name && !at) return <>-</>;
  return (
    <Stack gap={0}>
      <Clipped text={name || '-'} width={130} />
      {at ? (
        <Text span size="xs" c="dimmed" style={nowrap}>
          {formatDate(at, DATE_TIME)}
        </Text>
      ) : null}
    </Stack>
  );
}

// Module scope so DataTable rows stay memoized. Legacy marked these sortable
// but never handled the sort (no onSort), so the headers did nothing; the
// endpoint's ordering support is unknown, so they are left unsortable.
export const faultColumns: DataTableColumn<MachineFault>[] = [
  {
    key: 'id',
    header: 'ID',
    width: 56,
    render: (row) => <span className={uiClasses.code}>{row.id || '-'}</span>,
  },
  {
    key: 'machine_name',
    header: 'Ekipman',
    render: (row) => <Clipped text={equipmentName(row)} width={170} />,
    exportValue: (row) => equipmentName(row),
  },
  {
    key: 'description',
    header: 'Açıklama',
    render: (row) => {
      const text = row.description?.trim();
      return text ? <Clipped text={text} width={280} /> : '-';
    },
    exportValue: (row) => row.description || '',
  },
  {
    key: 'status',
    header: 'Durum',
    render: (row) => <FaultStatusBadge fault={row} />,
    exportValue: (row) => faultStatusLabel(row),
  },
  {
    key: 'is_breaking',
    header: 'Tür',
    render: (row) => <FaultTypeBadge fault={row} />,
    exportValue: (row) => faultTypeLabel(row),
  },
  // Who and when share a cell on screen; the export keeps them apart.
  {
    key: 'reported_by_full_name',
    header: 'Bildiren',
    render: (row) => <PersonAt name={reporterName(row)} at={row.reported_at} />,
    exportValue: (row) => reporterName(row),
  },
  {
    key: 'reported_at',
    header: 'Bildirilme',
    exportOnly: true,
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
    render: (row) => <PersonAt name={resolverName(row)} at={row.resolved_at} />,
    exportValue: (row) => resolverName(row),
  },
  {
    key: 'resolved_at',
    header: 'Çözüm Tarihi',
    exportOnly: true,
    exportValue: (row) => toDate(row.resolved_at),
  },
];

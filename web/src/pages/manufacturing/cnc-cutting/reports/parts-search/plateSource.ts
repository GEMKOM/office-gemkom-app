import type { CncPartSearchRow } from '@/api/manufacturing/cncParts';
import type { StatusFamily } from '@/ui';

/**
 * Combined "N mm MATERIAL" text from the part's cut fields. Derived materials
 * already start with "N mm ..."; don't prepend twice.
 */
export function plateInfoText(row: CncPartSearchRow): string {
  const material = (row.material || '').trim();
  const raw = row.thickness_mm;
  const thickness =
    raw !== null && raw !== undefined && raw !== '' ? parseFloat(String(raw)) : null;
  if (material && /^\s*\d+([.,]\d+)?\s*mm/i.test(material)) return material;
  const parts: string[] = [];
  if (thickness) parts.push(`${thickness} mm`);
  if (material) parts.push(material);
  return parts.join(' ');
}

export interface PlateSource {
  name: string;
  badge?: { label: string; color: StatusFamily };
  tooltip?: string;
}

/** The plate source cell (same as the cuts table): name plus delivery state. */
export function plateSource(row: CncPartSearchRow): PlateSource {
  if (row.planning_request_item) {
    const delivered = row.plate_item_is_delivered === true;
    const partial = !delivered && Number(row.plate_item_delivered_quantity || 0) > 0;
    const name = row.plate_item_name || plateInfoText(row) || row.plate_item_code || '-';
    const badge: PlateSource['badge'] = delivered
      ? { label: 'Teslim', color: 'green' }
      : partial
        ? { label: 'Kısmi Teslim', color: 'purple' }
        : { label: 'Malzeme Bekliyor', color: 'orange' };
    const tooltip = partial
      ? `Kısmi teslim: ${row.plate_item_delivered_quantity} / ${row.plate_item_quantity} alındı`
      : `${name}${row.plate_item_code ? ` (${row.plate_item_code})` : ''}`;
    return { name, badge, tooltip };
  }
  if (row.has_remnant_plate) {
    return {
      name: plateInfoText(row),
      badge: { label: 'Fire Plaka', color: 'grey' },
      tooltip: 'Fire plaka kullanılıyor',
    };
  }
  return { name: plateInfoText(row) || '-' };
}

/** Plain-text plate source for the export. */
export function plateSourceText(row: CncPartSearchRow): string {
  const source = plateSource(row);
  if (!source.badge) return source.name;
  if (row.has_remnant_plate && !row.planning_request_item) {
    return source.name ? `${source.name} (Fire Plaka)` : 'Fire Plaka';
  }
  return `${source.name} (${source.badge.label})`;
}

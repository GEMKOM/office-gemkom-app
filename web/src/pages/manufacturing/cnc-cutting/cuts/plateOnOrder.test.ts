import { describe, expect, it } from 'vitest';
import { plateSource, plateSourceText } from '../reports/parts-search/plateSource';
import { EMPTY_PLATE_SOURCE, isOrderedLine, lineSizeText, plateSourceInput } from './PlateSource';
import type { PlanningItem } from '@/api/planning/planningItems';

describe('Talep Edilen Sac', () => {
  const sized = {
    id: 42,
    piece_count: 5,
    piece_width_mm: '1500.0',
    piece_length_mm: '3000.0',
  } as PlanningItem;

  it('knows a sized plate line from an old one', () => {
    expect(isOrderedLine(sized)).toBe(true);
    expect(isOrderedLine({ id: 1 } as PlanningItem)).toBe(false);
    // The cut payload's own flag wins (a line delivered outside Mal kabul is not one).
    expect(isOrderedLine({ ...sized, ordered_line: false })).toBe(false);
    expect(isOrderedLine(null)).toBe(false);
    expect(lineSizeText(sized)).toMatch(/1\.?500 × 3\.?000 mm/);
  });

  it('sends only the line: the backend reserves its sheets', () => {
    const input = plateSourceInput({ ...EMPTY_PLATE_SOURCE, planningItem: sized });
    expect(input).toMatchObject({ planning_request_item_id: 42, selected_piece_id: null });
    expect(input.quantity_used).toBeNull();
  });

  it('shows Sac bekleniyor on Kesimler while sheets are on order', () => {
    const row = {
      planning_request_item: 42,
      plate_item_name: '10 mm ST 37-2 SAC',
      plate_item_is_delivered: false,
      sheets_waiting: 2,
    };
    const source = plateSource(row);
    expect(source.badge).toEqual({ label: 'Sac bekleniyor', color: 'orange' });
    expect(source.tooltip).toContain('2 sac');
    expect(plateSourceText(row)).toBe('10 mm ST 37-2 SAC (Sac bekleniyor)');
    expect(plateSource({ ...row, sheets_waiting: 0 }).badge?.label).toBe('Malzeme Bekliyor');
  });
});

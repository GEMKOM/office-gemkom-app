import { describe, expect, it } from 'vitest';
import type { PlanningItem } from '@/api/planning/planningItems';
import { canPull, isPlateLine, plateCutText } from './columns';

const plate = (extra: Partial<PlanningItem> = {}) =>
  ({
    id: 1,
    item_material_class: 'plate',
    quantity_available_to_pull: '2826.00',
    cnc_cuts_count: 3,
    cnc_cuts_done: 2,
    piece_count: 4,
    ...extra,
  }) as PlanningItem;

describe('plate lines in Malzeme Takibi', () => {
  it('are never pulled, whatever was delivered', () => {
    expect(isPlateLine(plate())).toBe(true);
    expect(canPull(plate())).toBe(false);
    const bolt = {
      id: 2,
      item_material_class: 'normal',
      quantity_available_to_pull: '5',
    } as PlanningItem;
    expect(canPull(bolt)).toBe(true);
  });

  it('say how many sheets are cut instead', () => {
    expect(plateCutText(plate())).toBe('CNC kesime gider · kesilen 2 / 4 levha');
    // An older line without a size: out of the sheets its cuts planned.
    expect(plateCutText(plate({ piece_count: null }))).toBe(
      'CNC kesime gider · kesilen 2 / 3 levha',
    );
    expect(plateCutText(plate({ piece_count: null, cnc_cuts_count: 0, cnc_cuts_done: 0 }))).toBe(
      'CNC kesime gider · kesim planlanmadı',
    );
  });
});

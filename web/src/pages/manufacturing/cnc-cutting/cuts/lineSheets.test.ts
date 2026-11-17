import { describe, expect, it } from 'vitest';
import { consumedInputs } from './FinishCutModal';
import { EMPTY_PLATE_SOURCE, plateSourceInput, type PieceChoice } from './PlateSource';
import type { PlanningItem } from '@/api/planning/planningItems';

describe("a cut on a plate line and the line's received sheets", () => {
  it('sends the line and its lot together', () => {
    const lot = {
      id: 7,
      item_code: 'S',
      width_mm: '1500',
      length_mm: '3000',
      available: 3,
    } as PieceChoice;
    const line = { id: 42 } as PlanningItem;
    const input = plateSourceInput({
      ...EMPTY_PLATE_SOURCE,
      planningItem: line,
      piece: lot,
      quantityUsed: 2,
    });
    expect(input).toMatchObject({
      selected_piece_id: 7,
      planning_request_item_id: 42,
      quantity_used: 2,
    });
  });

  it('turns the sheets picked at finish into consumed rows', () => {
    expect(consumedInputs({ 7: 2, 9: 0 })).toEqual([{ piece: 7, quantity: 2 }]);
    expect(consumedInputs({})).toEqual([]);
  });
});

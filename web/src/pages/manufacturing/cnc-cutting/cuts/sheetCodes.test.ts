import { describe, expect, it } from 'vitest';
import type { CncTask, ProcessResult } from '@/api/manufacturing/cncTasks';
import { remnantSheets } from './FinishCutModal';
import {
  EMPTY_PLATE_SOURCE,
  plateSourceFromTask,
  plateSourceInput,
  samePlateSource,
  sheetsText,
  withSheets,
  type PieceChoice,
} from './PlateSource';

// Every plate sheet is a row of its own with a code (S26-…): a cut is cut
// from the sheets picked by code, one each, and its Adet is their count.

const sheet = (id: number, code: string | null, heat = ''): PieceChoice =>
  ({
    id,
    code,
    item: 5,
    item_code: '0100-10',
    item_name: '10 mm S235',
    width_mm: '1500',
    length_mm: '3000',
    heat_number: heat,
    warehouse_code: 'HAMMADDE',
    job_no: '',
    unit_kg: '353.25',
    available: 1,
  }) as PieceChoice;

describe('a cut on coded sheets', () => {
  it('sends the picked sheets by id; the Adet is their count', () => {
    const value = withSheets(EMPTY_PLATE_SOURCE, [sheet(7, 'S26-00007'), sheet(9, 'S26-00009')]);
    expect(value.quantityUsed).toBe(2);
    expect(plateSourceInput(value)).toMatchObject({
      selected_piece_id: 7,
      selected_piece_ids: [7, 9],
      quantity_used: 2,
    });
  });

  it('an old uncoded lot still goes as one lot and an Adet', () => {
    const input = plateSourceInput({
      ...EMPTY_PLATE_SOURCE,
      piece: sheet(3, null),
      quantityUsed: 3,
    });
    expect(input).toMatchObject({ selected_piece_id: 3, quantity_used: 3 });
    expect(input).not.toHaveProperty('selected_piece_ids');
  });

  it('reads a saved cut back as its sheets, and a new pick differs', () => {
    const task = {
      piece_reservations: [
        {
          id: 1,
          piece: 7,
          quantity: 1,
          available_quantity: 1,
          piece_details: sheet(7, 'S26-00007'),
        },
        {
          id: 2,
          piece: 9,
          quantity: 1,
          available_quantity: 1,
          piece_details: sheet(9, 'S26-00009'),
        },
      ],
    } as unknown as CncTask;
    const opened = plateSourceFromTask(task);
    expect(opened.sheets?.map((s) => s.id)).toEqual([7, 9]);
    expect(opened.quantityUsed).toBe(2);
    expect(samePlateSource(opened, withSheets(opened, opened.sheets ?? []))).toBe(true);
    expect(samePlateSource(opened, withSheets(opened, [sheet(7, 'S26-00007')]))).toBe(false);
  });

  it('writes the sheets per card and size with their codes', () => {
    const rows = [sheet(7, 'S26-00007'), sheet(9, 'S26-00009')].map((s) => ({
      quantity: 1,
      piece_details: s,
    }));
    expect(sheetsText(rows)).toBe('S26-00007, S26-00009 · 0100-10 · 1500 × 3000 mm');
    expect(sheetsText([{ quantity: 3, piece_details: sheet(3, null) }])).toBe(
      '0100-10 · 1500 × 3000 mm × 3',
    );
  });

  it("lists a finished cut's remnant sheets with their new codes and heat nos", () => {
    const booked = {
      remnants: [
        {
          item: 5,
          item_code: '0100-10',
          item_name: '10 mm S235',
          width_mm: '600',
          length_mm: '1200',
          quantity: 2,
          heat_number: '',
          kept: true,
          unit_kg: null,
          total_kg: null,
          sheets: [
            { id: 40, code: 'S26-00040', heat_number: 'H1' },
            { id: 41, code: 'S26-00041', heat_number: 'H2' },
          ],
        },
      ],
    } as unknown as ProcessResult;
    expect(remnantSheets(booked)).toEqual([
      expect.objectContaining({ code: 'S26-00040', heat_number: 'H1', width_mm: '600' }),
      expect.objectContaining({ code: 'S26-00041', heat_number: 'H2', item_code: '0100-10' }),
    ]);
    expect(remnantSheets(undefined)).toEqual([]);
  });

  it('reads sheets and remnants by their shape', () => {
    const circle = { ...sheet(7, 'S26-00007'), width_mm: '600', length_mm: '600', shape: 'circle' };
    const box = { ...sheet(8, 'S26-00008'), width_mm: '600', length_mm: '600' };
    expect(
      sheetsText([
        { quantity: 1, piece_details: circle as PieceChoice },
        { quantity: 1, piece_details: box },
      ]),
    ).toBe('S26-00007 · 0100-10 · Ø 600 mm · S26-00008 · 0100-10 · 600 × 600 mm');
    const booked = {
      remnants: [
        {
          item: 5,
          item_code: '0100-10',
          width_mm: '800',
          length_mm: '900',
          shape: 'irregular',
          area_m2: '0.4500',
          quantity: 1,
          heat_number: '',
          kept: true,
          unit_kg: null,
          total_kg: null,
          sheets: [{ id: 42, code: 'S26-00042', heat_number: '' }],
        },
      ],
    } as unknown as ProcessResult;
    expect(remnantSheets(booked)).toEqual([
      expect.objectContaining({ code: 'S26-00042', shape: 'irregular', area_m2: '0.4500' }),
    ]);
  });
});

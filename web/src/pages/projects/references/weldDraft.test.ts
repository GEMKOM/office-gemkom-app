import type { WeldScheduleVersion } from '@/api/projects/references';
import { draftFromSchedule, draftPayload, draftTotals, inputText, newJoint, parseInput, rowMetres } from './weldDraft';

const WS: WeldScheduleVersion = {
  version: 3,
  unit_mass_kg: 1250.5,
  mass_basis: 'BOM',
  mass_by_material_kg: [{ material: 'carbon_steel', kg: 1200 }, { material: 'copper', kg: 50.5 }],
  pieces_to_cut_per_unit: 40,
  bends_per_unit: 2,
  joints: [
    { joint_id: 'J1', material: 'carbon_steel', process: 'MAG', count_per_unit: 2, length_m_each: 1.5, total_m_per_unit: 3 },
    { joint_id: 'J2', material: 'copper', process: 'TIG_copper', count_per_unit: 4, length_m_each: 0.25, total_m_per_unit: 1 },
  ],
  design_features: ['Flanş'],
  totals: { joints_total: 6, weld_m_total: 4 },
} as unknown as WeldScheduleVersion;

describe('weld-list draft', () => {
  it('numbers become comma text; mass by material from the list form', () => {
    const d = draftFromSchedule(WS);
    expect(d.base_version).toBe(3);
    expect(d.unit_mass_kg).toBe('1250,5');
    expect(d.mass_by_material).toEqual({ carbon_steel: '1200', stainless: '', copper: '50,5', copper_to_steel: '', other: '' });
    expect(d.pieces_per_unit).toBe('40');
    expect(d.joints[0]!.length_m_each).toBe('1,5');
    expect(d.joints[0]!.total_m_per_unit).toBe(3);
  });

  it('parseInput reads a decimal comma and refuses anything else', () => {
    expect(parseInput('1,5')).toBe(1.5);
    expect(parseInput(' 2 ')).toBe(2);
    expect(parseInput('')).toBeNaN();
    expect(parseInput('1.2.3')).toBeNaN();
    expect(inputText(null)).toBe('');
  });

  it('a stored total holds until count or length is touched', () => {
    const d = draftFromSchedule(WS);
    expect(rowMetres(d.joints[0]!)).toBe(3);
    expect(rowMetres({ ...d.joints[0]!, count_per_unit: '3', total_m_per_unit: null })).toBe(4.5);
    expect(rowMetres({ ...d.joints[0]!, count_per_unit: 'x', total_m_per_unit: null })).toBeNaN();
  });

  it('payload: parsed numbers, empty mass dropped, the backend keys for errors', () => {
    const d = draftFromSchedule(WS);
    d.note = '  kep sayısı 7→9 ';
    const ok = draftPayload(d);
    expect(ok.errors).toEqual({});
    expect(ok.payload.unit_mass_kg).toBe(1250.5);
    expect(ok.payload.mass_by_material).toEqual({ carbon_steel: 1200, copper: 50.5 });
    expect(ok.payload.joints[1]!.count_per_unit).toBe(4);
    expect(ok.payload.joints[1]!.length_m_each).toBe(0.25);
    expect(ok.payload.note).toBe('kep sayısı 7→9');

    d.joints[0] = { ...d.joints[0]!, count_per_unit: '2,5' };
    d.pieces_per_unit = '-1';
    d.mass_by_material = { ...d.mass_by_material, other: 'abc' };
    const bad = draftPayload(d);
    expect(bad.errors).toEqual({
      'joints.0.count_per_unit': 'Tam sayı olmalı.',
      pieces_per_unit: 'Tam sayı olmalı.',
      'mass_by_material.other': 'Sayı olmalı.',
    });
  });

  it('totals count only valid rows and split metres by material', () => {
    const d = draftFromSchedule(WS);
    expect(draftTotals(d)).toEqual({ joints: 6, metres: 4, byMaterial: { carbon_steel: 3, copper: 1 }, bad: false });
    d.joints.push({ ...newJoint(d.joints.at(-1)), count_per_unit: '' });
    const t = draftTotals(d);
    expect(t.bad).toBe(true);
    expect(t.joints).toBe(6);
  });

  it('a new row takes the last row material and process', () => {
    const j = newJoint(draftFromSchedule(WS).joints.at(-1));
    expect(j).toMatchObject({ material: 'copper', process: 'TIG_copper', count_per_unit: '1', length_m_each: '0', evidence: 'Elle eklendi' });
  });
});

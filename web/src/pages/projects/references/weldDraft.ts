import type { WeldScheduleEdit, WeldScheduleVersion } from '@/api/projects/references';

// The Düzenle draft of a job's weld list (references.js startWeldEdit /
// draftPayload / rowMetres / updateWeldTotals), without the DOM. Numbers stay
// as typed text (decimal comma allowed) until the payload is built.

/** Codes of the extraction schema (estimator weld_extraction.JointSchema); the backend refuses anything else. */
export const JOINT_MATERIAL_CODES = ['carbon_steel', 'stainless', 'copper', 'copper_to_steel'];
export const MASS_MATERIAL_CODES = ['carbon_steel', 'stainless', 'copper', 'copper_to_steel', 'other'];

/** A joint of the draft: the WeldJoint fields, with count and length as typed text. */
export interface DraftJoint {
  joint_id?: string;
  sub_id?: string | null;
  description?: string;
  source?: string | null;
  joint_type?: string;
  material?: string;
  size?: string;
  process?: string;
  ndt?: string | null;
  count_per_unit: string;
  length_m_each: string;
  /** The stored total until count or length is touched, then null (count × length). */
  total_m_per_unit: number | null;
  weld_detail?: string;
  evidence?: string;
  [key: string]: unknown;
}

export interface WeldDraft {
  base_version?: number;
  part_name: string;
  unit_mass_kg: string;
  mass_basis: string;
  mass_by_material: Record<string, string>;
  pieces_per_unit: string;
  bends_per_unit: string;
  joints: DraftJoint[];
  design_features: string[];
  processes: string[];
  open_questions: string[];
  note: string;
}

export type DraftErrors = Record<string, string>;

const INT_RE = /^\d+$/;

/** 1.5 → "1,5"; empty for null. */
export function inputText(v: unknown): string {
  return v == null ? '' : String(v).replace('.', ',');
}

/** "1,5" → 1.5; NaN for anything that is not a plain number. */
export function parseInput(text: unknown): number {
  const t = String(text ?? '').trim().replace(',', '.');
  if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
}

function massDict(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      (value as { material?: string; kg?: unknown }[]).filter((x) => x && x.material).map((x) => [x.material!, x.kg]),
    );
  }
  return { ...((value as Record<string, unknown>) || {}) };
}

/** The draft of a weld-list version (legacy startWeldEdit). */
export function draftFromSchedule(ws: WeldScheduleVersion): WeldDraft {
  const w = ws as WeldScheduleVersion & Record<string, unknown>;
  const mass = massDict(w.mass_by_material_kg ?? w.mass_by_material);
  return {
    base_version: ws.version,
    part_name: String(w.part_name ?? ''),
    unit_mass_kg: inputText(w.unit_mass_kg),
    mass_basis: String(w.mass_basis ?? ''),
    mass_by_material: Object.fromEntries(MASS_MATERIAL_CODES.map((m) => [m, mass[m] ? inputText(mass[m]) : ''])),
    pieces_per_unit: inputText(w.pieces_to_cut_per_unit ?? w.pieces_per_unit ?? 0),
    bends_per_unit: inputText(w.bends_per_unit ?? 0),
    joints: (ws.joints ?? []).map((j) => ({
      ...j,
      count_per_unit: inputText(j.count_per_unit),
      length_m_each: inputText(j.length_m_each),
      total_m_per_unit: j.total_m_per_unit ?? null,
    })),
    design_features: [...((w.design_features as string[]) ?? [])],
    processes: [...((w.processes as string[]) ?? [])],
    open_questions: [...((w.open_questions as string[]) ?? [])],
    note: '',
  };
}

/** A new row (legacy add-row): material and process of the last row. */
export function newJoint(last: DraftJoint | undefined): DraftJoint {
  return {
    joint_id: '',
    description: '',
    joint_type: 'plate_fillet',
    material: last?.material || 'carbon_steel',
    size: '',
    weld_detail: '',
    process: last?.process || 'MAG',
    position: '',
    count_per_unit: '1',
    length_m_each: '0',
    total_m_per_unit: null,
    preheat_c: null,
    ndt: '',
    evidence: 'Elle eklendi',
  };
}

/** {payload, errors}: numbers parsed; `errors` uses the backend's keys (joints.<i>.<field>). */
export function draftPayload(d: WeldDraft): { payload: WeldScheduleEdit; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const number = (text: unknown, key: string, integer = false): number | null => {
    const t = String(text ?? '').trim();
    if (integer ? !INT_RE.test(t) : Number.isNaN(parseInput(t))) {
      errors[key] = integer ? 'Tam sayı olmalı.' : 'Sayı olmalı.';
      return null;
    }
    const v = integer ? Number(t) : parseInput(t);
    if (v < 0) {
      errors[key] = 'Negatif olamaz.';
      return null;
    }
    return v;
  };
  const joints = d.joints.map((j, i) => ({
    ...j,
    count_per_unit: number(j.count_per_unit, `joints.${i}.count_per_unit`, true),
    length_m_each: number(j.length_m_each, `joints.${i}.length_m_each`),
  }));
  const mass: Record<string, number> = {};
  Object.entries(d.mass_by_material).forEach(([m, text]) => {
    if (String(text ?? '').trim() === '') return;
    const v = number(text, `mass_by_material.${m}`);
    if (v) mass[m] = v;
  });
  const payload: WeldScheduleEdit = {
    base_version: d.base_version,
    part_name: d.part_name,
    unit_mass_kg: number(d.unit_mass_kg, 'unit_mass_kg'),
    mass_basis: d.mass_basis,
    mass_by_material: mass,
    pieces_per_unit: number(d.pieces_per_unit, 'pieces_per_unit', true),
    bends_per_unit: number(d.bends_per_unit, 'bends_per_unit', true),
    joints: joints as WeldScheduleEdit['joints'],
    design_features: d.design_features,
    processes: d.processes,
    open_questions: d.open_questions,
    note: d.note.trim(),
  };
  return { payload, errors };
}

/** Metres of one row: the stored total until count or length is touched, then count × length. */
export function rowMetres(j: DraftJoint): number {
  if (j.total_m_per_unit != null) return Number(j.total_m_per_unit) || 0;
  const t = String(j.count_per_unit ?? '').trim();
  const count = INT_RE.test(t) ? Number(t) : NaN;
  const length = parseInput(j.length_m_each);
  return Number.isNaN(count) || Number.isNaN(length) ? NaN : count * length;
}

/** Joints, metres and metres per material of the valid rows; `bad` when a row could not be counted. */
export function draftTotals(d: WeldDraft) {
  const byMaterial: Record<string, number> = {};
  let joints = 0;
  let metres = 0;
  let bad = false;
  d.joints.forEach((j) => {
    const m = rowMetres(j);
    const t = String(j.count_per_unit ?? '').trim();
    if (Number.isNaN(m) || !INT_RE.test(t)) {
      bad = true;
      return;
    }
    joints += Number(t);
    metres += m;
    const mat = String(j.material ?? '');
    byMaterial[mat] = (byMaterial[mat] || 0) + m;
  });
  return { joints, metres, byMaterial, bad };
}

// Default welding stages (Montaj, Kaynak ve Taşlama) for "Varsayılan aşamaları
// oluştur". The bulk-save payload already carries these objects; the server
// must not also be asked to create_default_stages.

import type { StageVM } from './types';

export const DEFAULT_STAGE_TITLES = ['Montaj', 'Kaynak ve Taşlama'];

interface SubtaskSeed {
  status?: string;
  progress?: number | null;
  duration_wd?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

/**
 * Build the two default stages.
 *
 * Dates/duration copy the assignment subtask when it has a schedule, so
 * creating stages after planning the block row cannot drop that window on save
 * (buildPayload sends stages and omits subtask_schedule once any stage exists).
 */
export function defaultStagesFrom(
  subtask: SubtaskSeed | null | undefined,
  nextCid: () => string,
): StageVM[] {
  const seed = Number(subtask?.progress || 0);
  return DEFAULT_STAGE_TITLES.map((title) => ({
    cid: nextCid(),
    id: null,
    title,
    is_default: true,
    weight: 10,
    status: seed > 0 ? 'in_progress' : 'pending',
    progress: seed,
    duration_wd: subtask?.duration_wd ?? null,
    start_date: subtask?.start_date || null,
    end_date: subtask?.end_date || null,
    note: '',
    deleted: false,
  }));
}
